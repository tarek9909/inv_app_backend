const { Op, fn, col, literal } = require('sequelize');
const { Item, Driver, Location, LocationCommissionRule, LocationMonthlyTarget, DriverLocationAssignment, DriverUserLink, User, Role, StockRequest, StockRequestItem, StockRequestItemConfirmation, Payment, PurchaseOrder, StockMovement, Setting } = require('../models');
const HttpError = require('../utils/httpError');
const { attachAvailability } = require('./stockService');

const dashboard = async () => ({
  total_items: await Item.count(),
  low_stock_items: await Item.count({ where: { [Op.and]: [literal('current_stock <= minimum_stock')] } }),
  active_drivers: await Driver.count({ where: { status: 'active' } }),
  pending_stock_requests: await StockRequest.count({ where: { request_status: 'pending' } }),
  unpaid_requests: await StockRequest.count({ where: { payment_status: { [Op.in]: ['pending', 'partially_paid'] } } })
});

const inventorySummary = async (query = {}) => {
  const where = {};
  if (query.item_id) where.id = query.item_id;
  if (query.category_id) where.category_id = query.category_id;
  if (query.status) where.status = query.status;
  const rows = await Item.findAll({
    where,
  attributes: ['id', 'name', 'sku', 'unit', 'current_stock', 'minimum_stock', 'purchase_price', 'selling_price', 'status'],
  order: [['name', 'ASC']]
  });
  return attachAvailability(rows);
};

const driverBalances = async (query = {}) => Driver.findAll({
  where: query.driver_id ? { id: query.driver_id } : {},
  attributes: [
    'id',
    'full_name',
    'phone',
    'monthly_salary',
    'status',
    [literal(`COALESCE(SUM(CASE
      WHEN stock_requests.request_status != 'cancelled' AND stock_requests.request_type = 'stock_out' THEN stock_requests.remaining_amount
      WHEN stock_requests.request_status = 'completed' AND stock_requests.request_type = 'stock_return' THEN -stock_requests.total_amount
      ELSE 0
    END), 0)`), 'balance']
  ],
  include: [{ model: StockRequest, as: 'stock_requests', attributes: [] }],
  group: ['drivers.id'],
  order: [['full_name', 'ASC']]
});

const paymentSummary = async (query = {}) => {
  const where = {};
  if (query.start_date || query.end_date) {
    where.payment_date = {};
    if (query.start_date) where.payment_date[Op.gte] = new Date(query.start_date);
    if (query.end_date) where.payment_date[Op.lte] = new Date(`${query.end_date}T23:59:59.999Z`);
  }
  if (query.driver_id) where.driver_id = query.driver_id;
  return Payment.findAll({
  where,
  attributes: [
    [fn('DATE', col('payment_date')), 'date'],
    [fn('SUM', col('amount')), 'amount'],
    [fn('SUM', col('amount')), 'total_amount']
  ],
  group: [fn('DATE', col('payment_date'))],
  order: [[fn('DATE', col('payment_date')), 'DESC']]
  });
};

const missingPayments = async ({ month } = {}) => {
  const bounds = monthBounds(month);
  const rows = await StockRequest.findAll({
    where: {
      request_status: 'completed',
      request_type: 'stock_out',
      payment_status: { [Op.in]: ['pending', 'partially_paid'] },
      remaining_amount: { [Op.gt]: 0 },
      completed_at: { [Op.gte]: bounds.start, [Op.lt]: bounds.end }
    },
    include: [{ model: Driver, as: 'driver' }],
    order: [['completed_at', 'DESC'], ['id', 'DESC']]
  });

  const totalMissing = rows.reduce((sum, request) => sum + Number(request.remaining_amount || 0), 0);
  return {
    period: bounds.value,
    total_missing: totalMissing,
    rows: rows.map((request) => ({
      id: request.id,
      request_number: request.request_number,
      driver_id: request.driver_id,
      driver_name: request.driver?.full_name || `Driver #${request.driver_id}`,
      completed_at: request.completed_at,
      payment_status: request.payment_status,
      total_amount: Number(request.total_amount || 0),
      paid_amount: Number(request.paid_amount || 0),
      remaining_amount: Number(request.remaining_amount || 0)
    }))
  };
};

const purchaseSummary = async (query = {}) => PurchaseOrder.findAll({
  where: query.status ? { status: query.status } : {},
  attributes: ['status', [fn('COUNT', col('id')), 'count'], [fn('SUM', col('total_amount')), 'amount'], [fn('SUM', col('total_amount')), 'total_amount']],
  group: ['status']
});

const stockMovementReport = async (query = {}) => {
  const where = {};
  if (query.item_id) where.item_id = query.item_id;
  if (query.status) where.movement_type = query.status;
  if (query.start_date || query.end_date) {
    where.created_at = {};
    if (query.start_date) where.created_at[Op.gte] = new Date(query.start_date);
    if (query.end_date) where.created_at[Op.lte] = new Date(`${query.end_date}T23:59:59.999Z`);
  }
  return StockMovement.findAll({ where, include: [{ model: Item, as: 'item' }], order: [['created_at', 'DESC']] });
};

const datedRequestWhere = (query = {}) => {
  const where = {};
  if (query.driver_id) where.driver_id = query.driver_id;
  if (query.status) where.request_status = query.status;
  if (query.start_date || query.end_date) {
    where.request_date = {};
    if (query.start_date) where.request_date[Op.gte] = query.start_date;
    if (query.end_date) where.request_date[Op.lte] = query.end_date;
  }
  return where;
};

const driverStatement = async (driverId, query = {}) => {
  const driver = await Driver.findByPk(driverId);
  if (!driver) throw new HttpError(404, 'Driver not found');
  const requestWhere = { ...datedRequestWhere(query), driver_id: driverId, request_status: { [Op.ne]: 'cancelled' } };
  if (query.status) requestWhere.request_status = query.status;
  const paymentWhere = { driver_id: driverId };
  if (query.start_date || query.end_date) {
    paymentWhere.payment_date = {};
    if (query.start_date) paymentWhere.payment_date[Op.gte] = new Date(query.start_date);
    if (query.end_date) paymentWhere.payment_date[Op.lte] = new Date(`${query.end_date}T23:59:59.999Z`);
  }
  const [requests, payments] = await Promise.all([
    StockRequest.findAll({ where: requestWhere, include: [{ model: StockRequestItem, as: 'items', include: [{ model: Item, as: 'item' }] }], order: [['request_date', 'ASC'], ['id', 'ASC']] }),
    Payment.findAll({ where: paymentWhere, include: [{ model: StockRequest, as: 'stock_request' }], order: [['payment_date', 'ASC'], ['id', 'ASC']] })
  ]);

  const entries = [
    ...requests.map((request) => {
      const amount = toNumber(request.total_amount);
      return {
        date: request.completed_at || request.request_date,
        type: request.request_type,
        reference: request.request_number,
        debit: request.request_type === 'stock_out' ? amount : 0,
        credit: request.request_type === 'stock_return' && request.request_status === 'completed' ? amount : 0,
        status: request.request_status,
        entity_id: request.id
      };
    }),
    ...payments.map((payment) => ({
      date: payment.payment_date,
      type: 'payment',
      reference: payment.payment_number,
      debit: 0,
      credit: toNumber(payment.amount),
      status: payment.payment_method,
      entity_id: payment.id
    }))
  ].sort((a, b) => new Date(a.date) - new Date(b.date) || String(a.reference).localeCompare(String(b.reference)));

  let running = 0;
  entries.forEach((entry) => {
    running += toNumber(entry.debit) - toNumber(entry.credit);
    entry.running_balance = running;
  });

  const stockOutReceivables = requests.filter((request) => request.request_type === 'stock_out').reduce((sum, request) => sum + toNumber(request.total_amount), 0);
  const returnCredits = requests.filter((request) => request.request_type === 'stock_return' && request.request_status === 'completed').reduce((sum, request) => sum + toNumber(request.total_amount), 0);
  const paymentTotal = payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0);
  return {
    driver,
    summary: {
      stock_out_receivables: stockOutReceivables,
      stock_return_credits: returnCredits,
      payments: paymentTotal,
      net_balance: stockOutReceivables - returnCredits - paymentTotal
    },
    rows: entries
  };
};

const driverStatements = async (query = {}) => {
  const drivers = await Driver.findAll({ where: query.driver_id ? { id: query.driver_id } : {}, order: [['full_name', 'ASC']] });
  const rows = [];
  for (const driver of drivers) {
    const statement = await driverStatement(driver.id, query);
    rows.push({ driver_id: driver.id, driver_name: driver.full_name, ...statement.summary });
  }
  return rows;
};

const driverAging = async (query = {}) => {
  const requests = await StockRequest.findAll({
    where: {
      ...datedRequestWhere(query),
      request_type: 'stock_out',
      request_status: { [Op.ne]: 'cancelled' },
      remaining_amount: { [Op.gt]: 0 }
    },
    include: [{ model: Driver, as: 'driver' }],
    order: [['request_date', 'ASC']]
  });
  const buckets = new Map();
  const today = new Date();
  requests.forEach((request) => {
    const driverId = Number(request.driver_id);
    const row = buckets.get(driverId) || {
      driver_id: driverId,
      driver_name: request.driver?.full_name || `Driver #${driverId}`,
      current: 0,
      overdue_1_7: 0,
      overdue_8_30: 0,
      overdue_31_plus: 0,
      total: 0
    };
    const age = Math.floor((today - new Date(request.request_date)) / (24 * 60 * 60 * 1000));
    const amount = toNumber(request.remaining_amount);
    if (age <= 0) row.current += amount;
    else if (age <= 7) row.overdue_1_7 += amount;
    else if (age <= 30) row.overdue_8_30 += amount;
    else row.overdue_31_plus += amount;
    row.total += amount;
    buckets.set(driverId, row);
  });
  return Array.from(buckets.values()).sort((a, b) => b.total - a.total);
};

const toNumber = (value) => Number(value || 0);

const monthBounds = (month) => {
  const value = month || new Date().toISOString().slice(0, 7);
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new HttpError(400, 'Month must be in YYYY-MM format');
  }
  const [year, monthNumber] = value.split('-').map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1));
  return { value, start, end, startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
};

const isRuleEffective = (rule, date) => {
  const effectiveFrom = rule.effective_from ? String(rule.effective_from) : null;
  const effectiveUntil = rule.effective_until ? String(rule.effective_until) : null;
  return (!effectiveFrom || effectiveFrom <= date) && (!effectiveUntil || effectiveUntil >= date);
};

const chooseRule = (rules, date) => rules
  .filter((rule) => rule.status === 'active' && isRuleEffective(rule, date))
  .sort((a, b) => String(b.effective_from || '').localeCompare(String(a.effective_from || '')) || Number(b.id) - Number(a.id))[0] || null;

const commissionSummary = async ({ month } = {}) => {
  const settingsRows = await Setting.findAll({ where: { setting_key: { [Op.in]: ['commissions_enabled', 'commission_period', 'commission_source_status'] } } });
  const settings = Object.fromEntries(settingsRows.map((row) => [row.setting_key, row.setting_value || '']));
  const bounds = monthBounds(month);
  if (settings.commissions_enabled !== 'true') {
    return { enabled: false, period: bounds.value, rows: [] };
  }

  const requests = await StockRequest.findAll({
    where: {
      request_status: settings.commission_source_status || 'completed',
      completed_at: { [Op.gte]: bounds.start, [Op.lt]: bounds.end },
      commission_location_id: { [Op.ne]: null }
    },
    include: [
      { model: Driver, as: 'driver' },
      { model: Location, as: 'commission_location' }
    ],
    order: [['completed_at', 'ASC']]
  });

  const rules = await LocationCommissionRule.findAll({
    include: [{ model: Location, as: 'location' }],
    order: [['location_id', 'ASC'], ['effective_from', 'DESC'], ['id', 'DESC']]
  });
  const rulesByLocation = rules.reduce((acc, rule) => {
    const key = Number(rule.location_id);
    acc[key] = acc[key] || [];
    acc[key].push(rule);
    return acc;
  }, {});

  const groups = new Map();
  requests.forEach((request) => {
    const completedDate = request.completed_at ? new Date(request.completed_at).toISOString().slice(0, 10) : bounds.startDate;
    const rule = chooseRule(rulesByLocation[Number(request.commission_location_id)] || [], completedDate);
    if (!rule) return;
    const key = `${request.driver_id}:${request.commission_location_id}:${rule.id}`;
    const current = groups.get(key) || {
      driver_id: request.driver_id,
      driver_name: request.driver?.full_name || `Driver #${request.driver_id}`,
      location_id: request.commission_location_id,
      location_name: request.commission_location?.name || `Location #${request.commission_location_id}`,
      rule_id: rule.id,
      base_commission_percent: Number(rule.base_commission_percent || 0),
      target_amount: Number(rule.target_amount || 0),
      target_bonus_percent: Number(rule.target_bonus_percent || 0),
      sales_total: 0,
      order_count: 0
    };
    current.sales_total += Number(request.total_amount || 0);
    current.order_count += 1;
    groups.set(key, current);
  });

  const rows = Array.from(groups.values()).map((row) => {
    const target_reached = row.target_amount > 0 && row.sales_total >= row.target_amount;
    const base_commission = row.sales_total * (row.base_commission_percent / 100);
    const bonus_commission = target_reached ? row.sales_total * (row.target_bonus_percent / 100) : 0;
    return {
      ...row,
      target_reached,
      target_progress_percent: row.target_amount > 0 ? Math.min((row.sales_total / row.target_amount) * 100, 100) : 100,
      base_commission,
      bonus_commission,
      total_commission: base_commission + bonus_commission
    };
  }).sort((a, b) => b.total_commission - a.total_commission);

  return { enabled: true, period: bounds.value, source_status: settings.commission_source_status || 'completed', rows };
};

const getHistoricalMembers = async (bounds) => {
  const assignments = await DriverLocationAssignment.findAll({
    where: {
      assigned_from: { [Op.lt]: bounds.end },
      [Op.or]: [
        { assigned_until: null },
        { assigned_until: { [Op.gte]: bounds.start } }
      ]
    },
    include: [
      { model: Driver, as: 'driver', where: { status: 'active' } },
      { model: Location, as: 'location' }
    ],
    order: [['location_id', 'ASC'], ['driver_id', 'ASC'], ['assigned_from', 'ASC']]
  });

  const byLocation = new Map();
  assignments.forEach((assignment) => {
    const locationId = Number(assignment.location_id);
    const driverId = Number(assignment.driver_id);
    if (!byLocation.has(locationId)) byLocation.set(locationId, new Map());
    const drivers = byLocation.get(locationId);
    if (!drivers.has(driverId)) {
      drivers.set(driverId, {
        driver_id: driverId,
        driver_name: assignment.driver?.full_name || `Driver #${driverId}`,
        location_id: locationId,
        location_name: assignment.location?.name || `Location #${locationId}`
      });
    }
  });
  return byLocation;
};

const targetKpis = async ({ month } = {}) => {
  const bounds = monthBounds(month);
  const targets = await LocationMonthlyTarget.findAll({
    where: { target_month: bounds.value, status: 'active' },
    include: [{ model: Location, as: 'location' }],
    order: [['location_id', 'ASC']]
  });

  const membersByLocation = await getHistoricalMembers(bounds);
  const salesRows = await StockRequest.findAll({
    where: {
      request_status: 'completed',
      completed_at: { [Op.gte]: bounds.start, [Op.lt]: bounds.end },
      commission_location_id: { [Op.ne]: null }
    },
    include: [{ model: Driver, as: 'driver' }]
  });

  const driverSales = new Map();
  const locationSales = new Map();
  salesRows.forEach((request) => {
    const locationId = Number(request.commission_location_id);
    const driverId = Number(request.driver_id);
    const amount = Number(request.total_amount || 0);
    driverSales.set(`${locationId}:${driverId}`, (driverSales.get(`${locationId}:${driverId}`) || 0) + amount);
    locationSales.set(locationId, (locationSales.get(locationId) || 0) + amount);
  });

  const locationRows = [];
  const driverRows = [];

  targets.forEach((target) => {
    const locationId = Number(target.location_id);
    const members = Array.from((membersByLocation.get(locationId) || new Map()).values());
    const driverCount = members.length;
    const targetAmount = Number(target.target_amount || 0);
    const locationTarget = target.target_mode === 'per_driver' ? targetAmount * driverCount : targetAmount;
    const perDriverTarget = target.target_mode === 'per_driver' ? targetAmount : driverCount > 0 ? locationTarget / driverCount : 0;
    const salesTotal = locationSales.get(locationId) || 0;
    const progress = locationTarget > 0 ? (salesTotal / locationTarget) * 100 : 100;

    locationRows.push({
      location_id: locationId,
      location_name: target.location?.name || `Location #${locationId}`,
      target_month: target.target_month,
      target_mode: target.target_mode,
      driver_count: driverCount,
      target_amount: locationTarget,
      sales_total: salesTotal,
      progress_percent: progress,
      variance_amount: salesTotal - locationTarget,
      target_reached: locationTarget > 0 ? salesTotal >= locationTarget : salesTotal > 0
    });

    members.forEach((member) => {
      const sales = driverSales.get(`${locationId}:${member.driver_id}`) || 0;
      driverRows.push({
        ...member,
        target_month: target.target_month,
        target_mode: target.target_mode,
        target_amount: perDriverTarget,
        sales_total: sales,
        progress_percent: perDriverTarget > 0 ? (sales / perDriverTarget) * 100 : 100,
        variance_amount: sales - perDriverTarget,
        target_reached: perDriverTarget > 0 ? sales >= perDriverTarget : sales > 0
      });
    });
  });

  return {
    period: bounds.value,
    locationRows: locationRows.sort((a, b) => b.progress_percent - a.progress_percent),
    driverRows: driverRows.sort((a, b) => b.progress_percent - a.progress_percent)
  };
};

const performanceLabel = ({ targetAmount, salesTotal, progressPercent }) => {
  if (targetAmount <= 0) return salesTotal > 0 ? 'active_no_target' : 'no_target';
  if (progressPercent >= 100) return 'target_reached';
  if (progressPercent >= 75) return 'on_track';
  return 'behind';
};

const receiptStatusForRequest = (request) => {
  if (!request.driver_received_at) return 'receipt_pending';
  const items = request.items || [];
  if (!items.length) return 'receipt_submitted';
  const confirmedCount = items.filter((line) => Boolean(line.confirmation?.confirmed)).length;
  if (confirmedCount === items.length) return 'receipt_submitted';
  if (confirmedCount === 0) return 'receipt_not_confirmed';
  return 'receipt_partial';
};

const driverPayroll = async ({ month } = {}) => {
  const bounds = monthBounds(month);
  const payoutDate = new Date(bounds.end.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [drivers, commissions, kpis] = await Promise.all([
    Driver.findAll({
      where: { status: 'active' },
      include: [{ model: Location, as: 'current_location' }],
      order: [['full_name', 'ASC']]
    }),
    commissionSummary({ month: bounds.value }),
    targetKpis({ month: bounds.value })
  ]);

  const commissionByDriver = new Map();
  (commissions.rows || []).forEach((row) => {
    const driverId = Number(row.driver_id);
    const current = commissionByDriver.get(driverId) || {
      sales_total: 0,
      order_count: 0,
      base_commission: 0,
      bonus_commission: 0,
      total_commission: 0,
      locations: new Set()
    };
    current.sales_total += Number(row.sales_total || 0);
    current.order_count += Number(row.order_count || 0);
    current.base_commission += Number(row.base_commission || 0);
    current.bonus_commission += Number(row.bonus_commission || 0);
    current.total_commission += Number(row.total_commission || 0);
    if (row.location_name) current.locations.add(row.location_name);
    commissionByDriver.set(driverId, current);
  });

  const kpiByDriver = new Map();
  (kpis.driverRows || []).forEach((row) => {
    const driverId = Number(row.driver_id);
    const current = kpiByDriver.get(driverId) || {
      target_amount: 0,
      sales_total: 0,
      variance_amount: 0,
      locations: new Set()
    };
    current.target_amount += Number(row.target_amount || 0);
    current.sales_total += Number(row.sales_total || 0);
    current.variance_amount += Number(row.variance_amount || 0);
    if (row.location_name) current.locations.add(row.location_name);
    kpiByDriver.set(driverId, current);
  });

  const rows = drivers.map((driver) => {
    const driverId = Number(driver.id);
    const salary = Number(driver.monthly_salary || 0);
    const commission = commissionByDriver.get(driverId) || {};
    const kpi = kpiByDriver.get(driverId) || {};
    const targetAmount = Number(kpi.target_amount || 0);
    const salesTotal = Number(kpi.sales_total || commission.sales_total || 0);
    const progressPercent = targetAmount > 0 ? (salesTotal / targetAmount) * 100 : (salesTotal > 0 ? 100 : 0);
    const totalCommission = Number(commission.total_commission || 0);
    const locations = new Set([
      ...Array.from(kpi.locations || []),
      ...Array.from(commission.locations || [])
    ]);

    return {
      driver_id: driver.id,
      driver_name: driver.full_name,
      phone: driver.phone,
      current_location_id: driver.current_location_id,
      current_location_name: driver.current_location?.name || null,
      performance_locations: Array.from(locations),
      period: bounds.value,
      payout_date: payoutDate,
      salary,
      sales_total: salesTotal,
      order_count: Number(commission.order_count || 0),
      target_amount: targetAmount,
      progress_percent: progressPercent,
      variance_amount: targetAmount > 0 ? salesTotal - targetAmount : Number(kpi.variance_amount || 0),
      target_reached: targetAmount > 0 ? salesTotal >= targetAmount : salesTotal > 0,
      performance: performanceLabel({ targetAmount, salesTotal, progressPercent }),
      base_commission: Number(commission.base_commission || 0),
      bonus_commission: Number(commission.bonus_commission || 0),
      total_commission: totalCommission,
      total_pay: salary + totalCommission
    };
  });

  return {
    period: bounds.value,
    payout_date: payoutDate,
    commissions_enabled: commissions.enabled !== false,
    rows
  };
};

const buildDriverReportRow = ({ driver, requests, payments, payrollRow, kpiRows, commissionRows, includeDetail = false, locationHistory = [] }) => {
  const completedRequests = requests.filter((request) => request.request_status === 'completed');
  const stockOutTotal = completedRequests
    .filter((request) => request.request_type === 'stock_out')
    .reduce((sum, request) => sum + toNumber(request.total_amount), 0);
  const returnTotal = completedRequests
    .filter((request) => request.request_type === 'stock_return')
    .reduce((sum, request) => sum + toNumber(request.total_amount), 0);
  const paidInPeriod = payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0);
  const remainingOpen = requests
    .filter((request) => request.request_status !== 'cancelled' && request.request_type === 'stock_out')
    .reduce((sum, request) => sum + toNumber(request.remaining_amount), 0);
  const statusCounts = requests.reduce((counts, request) => {
    counts[request.request_status] = (counts[request.request_status] || 0) + 1;
    return counts;
  }, {});
  const paymentCounts = requests.reduce((counts, request) => {
    counts[request.payment_status] = (counts[request.payment_status] || 0) + 1;
    return counts;
  }, {});
  const targetAmount = kpiRows.reduce((sum, row) => sum + toNumber(row.target_amount), 0);
  const kpiSales = kpiRows.reduce((sum, row) => sum + toNumber(row.sales_total), 0);
  const progressPercent = targetAmount > 0 ? (kpiSales / targetAmount) * 100 : (kpiSales > 0 ? 100 : 0);
  const baseCommission = commissionRows.reduce((sum, row) => sum + toNumber(row.base_commission), 0);
  const bonusCommission = commissionRows.reduce((sum, row) => sum + toNumber(row.bonus_commission), 0);
  const totalCommission = commissionRows.reduce((sum, row) => sum + toNumber(row.total_commission), 0);
  const salary = toNumber(driver.monthly_salary);

  const report = {
    driver: {
      id: driver.id,
      full_name: driver.full_name,
      phone: driver.phone,
      address: driver.address,
      id_number: driver.id_number,
      vehicle_type: driver.vehicle_type,
      vehicle_plate_number: driver.vehicle_plate_number,
      monthly_salary: salary,
      status: driver.status,
      current_location: driver.current_location || null,
      linked_user: driver.user_link?.user ? {
        id: driver.user_link.user.id,
        full_name: driver.user_link.user.full_name,
        email: driver.user_link.user.email,
        status: driver.user_link.user.status,
        role: driver.user_link.user.role
      } : null
    },
    summary: {
      request_count: requests.length,
      completed_count: completedRequests.length,
      stock_out_total: stockOutTotal,
      return_total: returnTotal,
      net_sales: stockOutTotal - returnTotal,
      paid_in_period: paidInPeriod,
      remaining_open: remainingOpen,
      missing_payments: requests
        .filter((request) => request.request_type === 'stock_out' && request.request_status === 'completed' && ['pending', 'partially_paid'].includes(request.payment_status))
        .reduce((sum, request) => sum + toNumber(request.remaining_amount), 0),
      status_counts: statusCounts,
      payment_counts: paymentCounts
    },
    kpi: {
      target_amount: targetAmount,
      sales_total: kpiSales,
      progress_percent: progressPercent,
      variance_amount: kpiSales - targetAmount,
      target_reached: targetAmount > 0 ? kpiSales >= targetAmount : kpiSales > 0,
      performance: performanceLabel({ targetAmount, salesTotal: kpiSales, progressPercent }),
      rows: kpiRows
    },
    commission: {
      base_commission: baseCommission,
      bonus_commission: bonusCommission,
      total_commission: totalCommission,
      rows: commissionRows
    },
    payroll: payrollRow || {
      salary,
      total_commission: totalCommission,
      total_pay: salary + totalCommission
    }
  };

  if (!includeDetail) return report;

  return {
    ...report,
    requests: requests.map((request) => ({
      id: request.id,
      request_number: request.request_number,
      request_date: request.request_date,
      request_type: request.request_type,
      request_status: request.request_status,
      payment_status: request.payment_status,
      receipt_status: receiptStatusForRequest(request),
      commission_location: request.commission_location || null,
      subtotal: toNumber(request.subtotal),
      discount_amount: toNumber(request.discount_amount),
      total_amount: toNumber(request.total_amount),
      paid_amount: toNumber(request.paid_amount),
      remaining_amount: toNumber(request.remaining_amount),
      approved_at: request.approved_at,
      completed_at: request.completed_at,
      driver_invoice_viewed_at: request.driver_invoice_viewed_at,
      driver_received_at: request.driver_received_at,
      driver_receipt_notes: request.driver_receipt_notes,
      notes: request.notes,
      items: (request.items || []).map((line) => ({
        id: line.id,
        item_id: line.item_id,
        item_name: line.item?.name || `Item #${line.item_id}`,
        sku: line.item?.sku || '',
        quantity: toNumber(line.quantity),
        base_quantity: toNumber(line.base_quantity || line.quantity),
        unit_price: toNumber(line.unit_price),
        total_price: toNumber(line.quantity) * toNumber(line.unit_price),
        confirmed: Boolean(line.confirmation?.confirmed),
        confirmed_quantity: toNumber(line.confirmation?.confirmed_quantity),
        notes: line.notes
      }))
    })),
    payments: payments.map((payment) => ({
      id: payment.id,
      payment_number: payment.payment_number,
      stock_request_id: payment.stock_request_id,
      request_number: payment.stock_request?.request_number || '',
      amount: toNumber(payment.amount),
      payment_method: payment.payment_method,
      payment_date: payment.payment_date,
      notes: payment.notes
    })),
    location_history: locationHistory.map((assignment) => ({
      id: assignment.id,
      location: assignment.location || null,
      assigned_from: assignment.assigned_from,
      assigned_until: assignment.assigned_until,
      assigned_by: assignment.assigner || null
    }))
  };
};

const driverDetailData = async ({ month, driverId, includeDetail = false }) => {
  const bounds = monthBounds(month);
  const driverWhere = driverId ? { id: driverId } : {};
  const drivers = await Driver.findAll({
    where: driverWhere,
    include: [
      { model: Location, as: 'current_location' },
      { model: DriverUserLink, as: 'user_link', include: [{ model: User, as: 'user', include: [{ model: Role, as: 'role' }] }] }
    ],
    order: [['full_name', 'ASC']]
  });
  if (driverId && !drivers.length) throw new HttpError(404, 'Driver not found');

  const driverIds = drivers.map((driver) => driver.id);
  if (!driverIds.length) return { period: bounds.value, rows: [] };

  const [requests, payments, payroll, kpis, commissions, locationHistory] = await Promise.all([
    StockRequest.findAll({
      where: {
        driver_id: { [Op.in]: driverIds },
        [Op.or]: [
          { request_date: { [Op.gte]: bounds.startDate, [Op.lt]: bounds.endDate } },
          { completed_at: { [Op.gte]: bounds.start, [Op.lt]: bounds.end } }
        ]
      },
      include: [
        { model: Location, as: 'commission_location' },
        { model: StockRequestItem, as: 'items', include: [{ model: Item, as: 'item' }, { model: StockRequestItemConfirmation, as: 'confirmation' }] }
      ],
      order: [['request_date', 'DESC'], ['id', 'DESC']]
    }),
    Payment.findAll({
      where: {
        driver_id: { [Op.in]: driverIds },
        payment_date: { [Op.gte]: bounds.start, [Op.lt]: bounds.end }
      },
      include: [{ model: StockRequest, as: 'stock_request' }],
      order: [['payment_date', 'DESC'], ['id', 'DESC']]
    }),
    driverPayroll({ month: bounds.value }),
    targetKpis({ month: bounds.value }),
    commissionSummary({ month: bounds.value }),
    includeDetail ? DriverLocationAssignment.findAll({
      where: { driver_id: { [Op.in]: driverIds } },
      include: [{ model: Location, as: 'location' }, { model: User, as: 'assigner' }],
      order: [['assigned_from', 'DESC'], ['id', 'DESC']]
    }) : Promise.resolve([])
  ]);

  const requestsByDriver = groupByDriver(requests);
  const paymentsByDriver = groupByDriver(payments);
  const payrollByDriver = new Map((payroll.rows || []).map((row) => [Number(row.driver_id), row]));
  const kpiRowsByDriver = groupByDriver(kpis.driverRows || []);
  const commissionRowsByDriver = groupByDriver(commissions.rows || []);
  const historyByDriver = groupByDriver(locationHistory);
  const rows = drivers.map((driver) => buildDriverReportRow({
    driver,
    requests: requestsByDriver.get(Number(driver.id)) || [],
    payments: paymentsByDriver.get(Number(driver.id)) || [],
    payrollRow: payrollByDriver.get(Number(driver.id)),
    kpiRows: kpiRowsByDriver.get(Number(driver.id)) || [],
    commissionRows: commissionRowsByDriver.get(Number(driver.id)) || [],
    includeDetail,
    locationHistory: historyByDriver.get(Number(driver.id)) || []
  }));

  return {
    period: bounds.value,
    payout_date: payroll.payout_date,
    rows,
    report: driverId ? rows[0] : null
  };
};

const groupByDriver = (rows) => rows.reduce((groups, row) => {
  const driverId = Number(row.driver_id);
  groups.set(driverId, [...(groups.get(driverId) || []), row]);
  return groups;
}, new Map());

const driverDetailReports = (query = {}) => driverDetailData({ month: query.month, includeDetail: false });
const driverDetailReport = (driverId, query = {}) => driverDetailData({ month: query.month, driverId, includeDetail: true });

module.exports = {
  dashboard,
  inventorySummary,
  driverBalances,
  paymentSummary,
  missingPayments,
  purchaseSummary,
  stockMovementReport,
  commissionSummary,
  targetKpis,
  driverPayroll,
  driverDetailReports,
  driverDetailReport,
  driverStatement,
  driverStatements,
  driverAging
};
