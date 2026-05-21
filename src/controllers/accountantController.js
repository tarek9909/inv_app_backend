const { Op, literal } = require('sequelize');
const { sequelize, Driver, Location, LocationCommissionRule, LocationMonthlyTarget, DriverLocationAssignment, StockRequest, Payment, User } = require('../models');
const { list, findOrFail } = require('../services/crudService');
const stockRequestService = require('../services/stockRequestService');
const paymentService = require('../services/paymentService');
const reportService = require('../services/reportService');
const { loadUserWithRole, withRoleInclude, normalizeUserRole } = require('../services/userService');
const { logAction } = require('../services/auditService');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/responses');
const HttpError = require('../utils/httpError');

const includeDriver = [
  { model: User, as: 'user', include: withRoleInclude() },
  { model: Location, as: 'current_location' }
];

const assertDriverRoleUser = async (userId, transaction) => {
  if (!userId) return;
  const user = await loadUserWithRole(userId, { transaction });
  if (!user || user.status !== 'active' || user.role?.code !== 'driver') {
    throw new HttpError(400, 'Linked login account must be an active user with the driver role');
  }
};

const assertUserNotLinkedToOtherDriver = async (userId, driverId, transaction) => {
  if (!userId) return;
  const existing = await Driver.findOne({
    where: {
      user_id: userId,
      ...(driverId ? { id: { [Op.ne]: driverId } } : {})
    },
    transaction
  });
  if (existing) throw new HttpError(409, 'This login account is already linked to another driver');
};

const setDriverLocation = async ({ driver, locationId, req, transaction }) => {
  const nextLocationId = locationId ? Number(locationId) : null;
  const currentLocationId = driver.current_location_id ? Number(driver.current_location_id) : null;
  if (nextLocationId === currentLocationId) return;

  if (nextLocationId) {
    const location = await Location.findByPk(nextLocationId, { transaction });
    if (!location || location.status !== 'active') throw new HttpError(400, 'Location is not active');
  }

  const now = new Date();
  await DriverLocationAssignment.update(
    { assigned_until: now, updated_at: now },
    { where: { driver_id: driver.id, assigned_until: null }, transaction }
  );

  if (nextLocationId) {
    await DriverLocationAssignment.create({
      driver_id: driver.id,
      location_id: nextLocationId,
      assigned_from: now,
      assigned_by: req.user.id
    }, { transaction });
  }

  await driver.update({ current_location_id: nextLocationId, updated_by: req.user.id }, { transaction });
};

const attachDriverValues = (driver) => {
  if (driver.user) normalizeUserRole(driver.user);
  driver.setDataValue('user_id', driver.user_id || null);
  driver.setDataValue('location_id', driver.current_location_id || null);
  return driver;
};

exports.listDrivers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search = '' } = req.query;
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const offset = (safePage - 1) * safeLimit;
  const where = search ? {
    [Op.or]: [
      { full_name: { [Op.like]: `%${search}%` } },
      { phone: { [Op.like]: `%${search}%` } },
      { id_number: { [Op.like]: `%${search}%` } },
      { vehicle_plate_number: { [Op.like]: `%${search}%` } },
      { '$current_location.name$': { [Op.like]: `%${search}%` } }
    ]
  } : {};
  const queryOptions = {
    where,
    include: includeDriver,
    order: [['id', 'DESC']],
    limit: req.query.exact_count === 'true' ? safeLimit : safeLimit + 1,
    offset,
    distinct: true,
    subQuery: false
  };
  if (req.query.exact_count === 'true') {
    const result = await Driver.findAndCountAll(queryOptions);
    result.rows.forEach(attachDriverValues);
    ok(res, 'Drivers loaded', result.rows, { total: result.count, page: safePage, limit: safeLimit, pages: Math.ceil(result.count / safeLimit) || 1 });
    return;
  }
  const rows = await Driver.findAll(queryOptions);
  const hasNext = rows.length > safeLimit;
  const pageRows = hasNext ? rows.slice(0, safeLimit) : rows;
  pageRows.forEach(attachDriverValues);
  ok(res, 'Drivers loaded', pageRows, { total: offset + pageRows.length + (hasNext ? 1 : 0), page: safePage, limit: safeLimit, pages: hasNext ? safePage + 1 : safePage });
});

exports.createDriver = asyncHandler(async (req, res) => {
  const driver = await sequelize.transaction(async (transaction) => {
    const { user_id, location_id, ...payload } = req.body;
    await assertDriverRoleUser(user_id, transaction);
    await assertUserNotLinkedToOtherDriver(user_id, null, transaction);
    const createdDriver = await Driver.create({ ...payload, user_id: user_id || null, created_by: req.user.id }, { transaction });
    await setDriverLocation({ driver: createdDriver, locationId: location_id, req, transaction });
    await logAction({ req, action: 'create', module: 'drivers', recordId: createdDriver.id, newData: req.body, transaction });
    return Driver.findByPk(createdDriver.id, { include: includeDriver, transaction });
  });
  created(res, 'Driver created', attachDriverValues(driver));
});

exports.updateDriver = asyncHandler(async (req, res) => {
  const updated = await sequelize.transaction(async (transaction) => {
    const driver = await findOrFail(Driver, req.params.id, { name: 'Driver' });
    const { user_id, location_id, ...payload } = req.body;
    const oldData = driver.toJSON();
    const driverPayload = { ...payload, updated_by: req.user.id };
    if (Object.prototype.hasOwnProperty.call(req.body, 'user_id')) {
      await assertDriverRoleUser(user_id, transaction);
      await assertUserNotLinkedToOtherDriver(user_id, driver.id, transaction);
      driverPayload.user_id = user_id || null;
    }
    await driver.update(driverPayload, { transaction });
    if (Object.prototype.hasOwnProperty.call(req.body, 'location_id')) {
      await setDriverLocation({ driver, locationId: location_id, req, transaction });
    }
    await logAction({ req, action: 'update', module: 'drivers', recordId: driver.id, oldData, newData: req.body, transaction });
    return Driver.findByPk(driver.id, { include: includeDriver, transaction });
  });
  ok(res, 'Driver updated', attachDriverValues(updated));
});

exports.updateDriverStatus = asyncHandler(async (req, res) => {
  const driver = await findOrFail(Driver, req.params.id, { name: 'Driver' });
  const oldData = driver.toJSON();
  await driver.update({ status: req.body.status, updated_by: req.user.id });
  await logAction({ req, action: 'status', module: 'drivers', recordId: driver.id, oldData, newData: driver.toJSON() });
  ok(res, 'Driver status updated', driver);
});

exports.driverBalance = asyncHandler(async (req, res) => {
  const driver = await findOrFail(Driver, req.params.id, { name: 'Driver' });
  const stockOutBalance = await StockRequest.sum('remaining_amount', {
    where: { driver_id: driver.id, request_type: 'stock_out', request_status: { [Op.ne]: 'cancelled' } }
  });
  const returnCredit = await StockRequest.sum('total_amount', {
    where: { driver_id: driver.id, request_type: 'stock_return', request_status: 'completed' }
  });
  ok(res, 'Driver balance loaded', { driver, balance: Number(stockOutBalance || 0) - Number(returnCredit || 0) });
});

exports.driverStatement = asyncHandler(async (req, res) => {
  ok(res, 'Driver statement loaded', await reportService.driverStatement(req.params.id, req.query));
});

exports.listLocations = asyncHandler(async (req, res) => {
  const { rows, meta } = await list(Location, req.query, { searchFields: ['name', 'description'] });
  ok(res, 'Locations loaded', rows, meta);
});

exports.createLocation = asyncHandler(async (req, res) => {
  const location = await Location.create({ ...req.body, created_by: req.user.id });
  await logAction({ req, action: 'create', module: 'locations', recordId: location.id, newData: location.toJSON() });
  created(res, 'Location created', location);
});

exports.updateLocation = asyncHandler(async (req, res) => {
  const location = await findOrFail(Location, req.params.id, { name: 'Location' });
  const oldData = location.toJSON();
  await location.update({ ...req.body, updated_at: new Date() });
  await logAction({ req, action: 'update', module: 'locations', recordId: location.id, oldData, newData: location.toJSON() });
  ok(res, 'Location updated', location);
});

exports.updateLocationStatus = asyncHandler(async (req, res) => {
  const location = await findOrFail(Location, req.params.id, { name: 'Location' });
  const oldData = location.toJSON();
  await location.update({ status: req.body.status, updated_at: new Date() });
  await logAction({ req, action: 'status', module: 'locations', recordId: location.id, oldData, newData: location.toJSON() });
  ok(res, 'Location status updated', location);
});

exports.driverLocationHistory = asyncHandler(async (req, res) => {
  const driver = await findOrFail(Driver, req.params.id, { name: 'Driver' });
  const rows = await DriverLocationAssignment.findAll({
    where: { driver_id: driver.id },
    include: [
      { model: Location, as: 'location' },
      { model: User, as: 'assigner' }
    ],
    order: [['assigned_from', 'DESC'], ['id', 'DESC']]
  });
  ok(res, 'Driver location history loaded', rows, { total: rows.length });
});

exports.listCommissionRules = asyncHandler(async (req, res) => {
  const { rows, meta } = await list(LocationCommissionRule, req.query, {
    include: [{ model: Location, as: 'location' }],
    searchFields: ['status']
  });
  ok(res, 'Commission rules loaded', rows, meta);
});

exports.createCommissionRule = asyncHandler(async (req, res) => {
  const location = await Location.findByPk(req.body.location_id);
  if (!location || location.status !== 'active') throw new HttpError(400, 'Location is not active');
  const rule = await LocationCommissionRule.create({ ...req.body, created_by: req.user.id });
  await logAction({ req, action: 'create', module: 'commission_rules', recordId: rule.id, newData: rule.toJSON() });
  created(res, 'Commission rule created', await LocationCommissionRule.findByPk(rule.id, { include: [{ model: Location, as: 'location' }] }));
});

exports.updateCommissionRule = asyncHandler(async (req, res) => {
  const rule = await findOrFail(LocationCommissionRule, req.params.id, { name: 'Commission rule' });
  if (req.body.location_id) {
    const location = await Location.findByPk(req.body.location_id);
    if (!location || location.status !== 'active') throw new HttpError(400, 'Location is not active');
  }
  const oldData = rule.toJSON();
  await rule.update({ ...req.body, updated_at: new Date() });
  await logAction({ req, action: 'update', module: 'commission_rules', recordId: rule.id, oldData, newData: rule.toJSON() });
  ok(res, 'Commission rule updated', await LocationCommissionRule.findByPk(rule.id, { include: [{ model: Location, as: 'location' }] }));
});

exports.updateCommissionRuleStatus = asyncHandler(async (req, res) => {
  const rule = await findOrFail(LocationCommissionRule, req.params.id, { name: 'Commission rule' });
  const oldData = rule.toJSON();
  await rule.update({ status: req.body.status, updated_at: new Date() });
  await logAction({ req, action: 'status', module: 'commission_rules', recordId: rule.id, oldData, newData: rule.toJSON() });
  ok(res, 'Commission rule status updated', await LocationCommissionRule.findByPk(rule.id, { include: [{ model: Location, as: 'location' }] }));
});

exports.listMonthlyTargets = asyncHandler(async (req, res) => {
  const { rows, meta } = await list(LocationMonthlyTarget, req.query, {
    include: [{ model: Location, as: 'location' }],
    searchFields: ['target_month', 'target_mode', 'status']
  });
  ok(res, 'Monthly targets loaded', rows, meta);
});

exports.createMonthlyTarget = asyncHandler(async (req, res) => {
  const location = await Location.findByPk(req.body.location_id);
  if (!location || location.status !== 'active') throw new HttpError(400, 'Location is not active');
  const existing = await LocationMonthlyTarget.findOne({ where: { location_id: req.body.location_id, target_month: req.body.target_month } });
  if (existing) throw new HttpError(409, 'This location already has a target for that month');
  const target = await LocationMonthlyTarget.create({ ...req.body, created_by: req.user.id });
  await logAction({ req, action: 'create', module: 'monthly_targets', recordId: target.id, newData: target.toJSON() });
  created(res, 'Monthly target created', await LocationMonthlyTarget.findByPk(target.id, { include: [{ model: Location, as: 'location' }] }));
});

exports.updateMonthlyTarget = asyncHandler(async (req, res) => {
  const target = await findOrFail(LocationMonthlyTarget, req.params.id, { name: 'Monthly target' });
  if (req.body.location_id) {
    const location = await Location.findByPk(req.body.location_id);
    if (!location || location.status !== 'active') throw new HttpError(400, 'Location is not active');
  }
  const nextLocationId = req.body.location_id || target.location_id;
  const nextMonth = req.body.target_month || target.target_month;
  if (Number(nextLocationId) !== Number(target.location_id) || nextMonth !== target.target_month) {
    const duplicate = await LocationMonthlyTarget.findOne({ where: { id: { [Op.ne]: target.id }, location_id: nextLocationId, target_month: nextMonth } });
    if (duplicate) throw new HttpError(409, 'This location already has a target for that month');
  }
  const oldData = target.toJSON();
  await target.update({ ...req.body, updated_at: new Date() });
  await logAction({ req, action: 'update', module: 'monthly_targets', recordId: target.id, oldData, newData: target.toJSON() });
  ok(res, 'Monthly target updated', await LocationMonthlyTarget.findByPk(target.id, { include: [{ model: Location, as: 'location' }] }));
});

exports.updateMonthlyTargetStatus = asyncHandler(async (req, res) => {
  const target = await findOrFail(LocationMonthlyTarget, req.params.id, { name: 'Monthly target' });
  const oldData = target.toJSON();
  await target.update({ status: req.body.status, updated_at: new Date() });
  await logAction({ req, action: 'status', module: 'monthly_targets', recordId: target.id, oldData, newData: target.toJSON() });
  ok(res, 'Monthly target status updated', await LocationMonthlyTarget.findByPk(target.id, { include: [{ model: Location, as: 'location' }] }));
});

exports.listStockRequests = asyncHandler(async (req, res) => {
  const itemCountSql = '(SELECT COUNT(*) FROM stock_request_items sri WHERE sri.stock_request_id = stock_requests.id)';
  const confirmedCountSql = '(SELECT COUNT(*) FROM stock_request_items sri JOIN stock_request_item_confirmations src ON src.stock_request_item_id = sri.id WHERE sri.stock_request_id = stock_requests.id AND src.confirmed = 1 AND src.confirmed_quantity >= sri.quantity)';
  const { rows, meta } = await list(StockRequest, req.query, {
    include: stockRequestService.includeStockRequestList,
    attributes: { include: [[literal(itemCountSql), 'item_count'], [literal(confirmedCountSql), 'confirmed_count']] },
    searchFields: ['request_number', 'request_status', 'payment_status']
  });
  rows.forEach(stockRequestService.withReceiptStatus);
  ok(res, 'Stock requests loaded', rows, meta);
});

exports.getStockRequest = asyncHandler(async (req, res) => {
  const request = await findOrFail(StockRequest, req.params.id, { name: 'Stock request', include: stockRequestService.includeStockRequest });
  ok(res, 'Stock request loaded', stockRequestService.withReceiptStatus(request));
});

exports.createStockRequest = asyncHandler(async (req, res) => {
  const request = await stockRequestService.createStockRequest(req.body, req);
  created(res, 'Stock request created', request);
});

exports.updateStockRequest = asyncHandler(async (req, res) => {
  const request = await findOrFail(StockRequest, req.params.id, { name: 'Stock request' });
  const oldData = request.toJSON();
  await request.update(req.body);
  await logAction({ req, action: 'update', module: 'stock_requests', recordId: request.id, oldData, newData: request.toJSON() });
  ok(res, 'Stock request updated', request);
});

exports.completeStockRequest = asyncHandler(async (req, res) => {
  const request = await stockRequestService.completeStockRequest(req.params.id, req, req.body);
  ok(res, 'Stock request completed', request);
});

exports.acceptStockRequest = asyncHandler(async (req, res) => {
  const request = await stockRequestService.acceptStockRequest(req.params.id, req);
  ok(res, 'Stock request accepted', request);
});

exports.cancelStockRequest = asyncHandler(async (req, res) => {
  const request = await stockRequestService.cancelStockRequest(req.params.id, req);
  ok(res, 'Stock request cancelled', request);
});

exports.printStockRequest = asyncHandler(async (req, res) => {
  const result = await stockRequestService.recordStockRequestPrint(req.params.id, req.body || {}, req);
  ok(res, 'Stock request print recorded', result);
});

exports.listPayments = asyncHandler(async (req, res) => {
  const { rows, meta } = await list(Payment, req.query, { include: paymentService.includePayment, searchFields: ['payment_number', 'payment_method'] });
  ok(res, 'Payments loaded', rows, meta);
});

exports.createPayment = asyncHandler(async (req, res) => {
  const payment = await paymentService.createPayment(req.body, req);
  created(res, 'Payment created', payment);
});

exports.deleteDriver = asyncHandler(async (req, res) => {
  const driver = await findOrFail(Driver, req.params.id, { name: 'Driver' });
  const stockRequests = await StockRequest.count({ where: { driver_id: driver.id } });
  const payments = await Payment.count({ where: { driver_id: driver.id } });
  if (stockRequests > 0 || payments > 0) {
    throw new HttpError(409, 'Driver has related records and cannot be permanently deleted');
  }
  const oldData = driver.toJSON();
  await driver.destroy();
  await logAction({ req, action: 'delete', module: 'drivers', recordId: driver.id, oldData });
  ok(res, 'Driver permanently deleted');
});
