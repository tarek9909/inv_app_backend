const { Op, fn, col, literal } = require('sequelize');
const { sequelize, Item, Driver, Location, LocationCommissionRule, LocationMonthlyTarget, DriverLocationAssignment, User, StockRequest, StockRequestItem, StockRequestItemConfirmation, Payment, PurchaseOrder, StockMovement, Setting } = require('../models');
const HttpError = require('../utils/httpError');
const { attachAvailability } = require('./stockService');
const { dashboardCache, settingsCache, reportCache } = require('../utils/cache');
const { withRoleInclude, normalizeUserRole } = require('./userService');

// ─── Utilities ────────────────────────────────────────────────────────────────
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

const groupByDriver = (rows) => rows.reduce((groups, row) => {
  const driverId = Number(row.driver_id);
  groups.set(driverId, [...(groups.get(driverId) || []), row]);
  return groups;
}, new Map());

const performanceLabel = ({ targetAmount, salesTotal, progressPercent }) => {
  if (targetAmount <= 0) return salesTotal > 0 ? 'active_no_target' : 'no_target';
  if (progressPercent >= 100) return 'target_reached';
  if (progressPercent >= 75) return 'on_track';
  return 'behind';
};

// ─── Cached Settings Loader ──────────────────────────────────────────────────
const getCommissionSettings = async () => settingsCache.getOrSet('commission_settings', async () => {
  const rows = await Setting.findAll({ where: { setting_key: { [Op.in]: ['commissions_enabled', 'commission_period', 'commission_source_status'] } } });
  return Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value || '']));
});

// ─── Dashboard (optimized: parallel queries) ─────────────────────────────────
const dashboard = async () => dashboardCache.getOrSet('dashboard', async () => {
  const [[itemStats], [requestStats], activeDrivers] = await Promise.all([
    sequelize.query(
      `SELECT COUNT(*) as total_items, SUM(current_stock <= minimum_stock AND status = 'active') as low_stock_items FROM items`,
      { type: sequelize.QueryTypes.SELECT, plain: true }
    ).then((r) => [r]),
    sequelize.query(
      `SELECT SUM(request_status = 'pending') as pending_stock_requests, SUM(payment_status IN ('pending','partially_paid') AND request_status != 'cancelled') as unpaid_requests FROM stock_requests`,
      { type: sequelize.QueryTypes.SELECT, plain: true }
    ).then((r) => [r]),
    Driver.count({ where: { status: 'active' } })
  ]);
  return {
    total_items: Number(itemStats.total_items || 0),
    low_stock_items: Number(itemStats.low_stock_items || 0),
    active_drivers: activeDrivers,
    pending_stock_requests: Number(requestStats.pending_stock_requests || 0),
    unpaid_requests: Number(requestStats.unpaid_requests || 0)
  };
});

// ─── Inventory Summary (with limit) ──────────────────────────────────────────
const inventorySummary = async (query = {}) => {
  const where = {};
  if (query.item_id) where.id = query.item_id;
  if (query.category_id) where.category_id = query.category_id;
  if (query.status) where.status = query.status;
  const rows = await Item.findAll({
    where,
    attributes: ['id', 'name', 'sku', 'unit', 'current_stock', 'minimum_stock', 'purchase_price', 'selling_price', 'status'],
    order: [['name', 'ASC']],
    limit: 1000
  });
  return attachAvailability(rows);
};

// ─── Driver Balances ─────────────────────────────────────────────────────────
const driverBalances = async (query = {}) => Driver.findAll({
  where: query.driver_id ? { id: query.driver_id } : {},
  attributes: [
    'id', 'full_name', 'phone', 'monthly_salary', 'status',
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

// ─── Payment Summary ─────────────────────────────────────────────────────────
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
    attributes: [[fn('DATE', col('payment_date')), 'date'], [fn('SUM', col('amount')), 'amount'], [fn('SUM', col('amount')), 'total_amount']],
    group: [fn('DATE', col('payment_date'))],
    order: [[fn('DATE', col('payment_date')), 'DESC']],
    limit: 365
  });
};

// ─── Missing Payments (with limit) ───────────────────────────────────────────
const missingPayments = async ({ month } = {}) => {
  const bounds = monthBounds(month);
  const rows = await StockRequest.findAll({
    where: {
      request_status: 'completed', request_type: 'stock_out',
      payment_status: { [Op.in]: ['pending', 'partially_paid'] },
      remaining_amount: { [Op.gt]: 0 },
      completed_at: { [Op.gte]: bounds.start, [Op.lt]: bounds.end }
    },
    include: [{ model: Driver, as: 'driver', attributes: ['id', 'full_name'] }],
    order: [['completed_at', 'DESC'], ['id', 'DESC']],
    limit: 500
  });
  const totalMissing = rows.reduce((sum, r) => sum + Number(r.remaining_amount || 0), 0);
  return {
    period: bounds.value, total_missing: totalMissing,
    rows: rows.map((r) => ({ id: r.id, request_number: r.request_number, driver_id: r.driver_id, driver_name: r.driver?.full_name || `Driver #${r.driver_id}`, completed_at: r.completed_at, payment_status: r.payment_status, total_amount: toNumber(r.total_amount), paid_amount: toNumber(r.paid_amount), remaining_amount: toNumber(r.remaining_amount) }))
  };
};

// ─── Purchase Summary ────────────────────────────────────────────────────────
const purchaseSummary = async (query = {}) => PurchaseOrder.findAll({
  where: query.status ? { status: query.status } : {},
  attributes: ['status', [fn('COUNT', col('id')), 'count'], [fn('SUM', col('total_amount')), 'amount'], [fn('SUM', col('total_amount')), 'total_amount']],
  group: ['status']
});

// ─── Stock Movement Report (with limit) ──────────────────────────────────────
const stockMovementReport = async (query = {}) => {
  const where = {};
  if (query.item_id) where.item_id = query.item_id;
  if (query.status) where.movement_type = query.status;
  if (query.start_date || query.end_date) {
    where.created_at = {};
    if (query.start_date) where.created_at[Op.gte] = new Date(query.start_date);
    if (query.end_date) where.created_at[Op.lte] = new Date(`${query.end_date}T23:59:59.999Z`);
  }
  return StockMovement.findAll({
    where,
    include: [{ model: Item, as: 'item', attributes: ['id', 'name', 'sku', 'unit'] }],
    order: [['created_at', 'DESC']],
    limit: 500
  });
};

// ─── Driver Statement ────────────────────────────────────────────────────────
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
  const driver = await Driver.findByPk(driverId, { attributes: ['id', 'full_name', 'phone', 'status'] });
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
    StockRequest.findAll({ where: requestWhere, attributes: ['id', 'request_number', 'request_date', 'request_type', 'request_status', 'total_amount', 'completed_at'], order: [['request_date', 'ASC'], ['id', 'ASC']] }),
    Payment.findAll({ where: paymentWhere, attributes: ['id', 'payment_number', 'payment_date', 'payment_method', 'amount'], order: [['payment_date', 'ASC'], ['id', 'ASC']] })
  ]);
  const entries = [
    ...requests.map((r) => ({ date: r.completed_at || r.request_date, type: r.request_type, reference: r.request_number, debit: r.request_type === 'stock_out' ? toNumber(r.total_amount) : 0, credit: r.request_type === 'stock_return' && r.request_status === 'completed' ? toNumber(r.total_amount) : 0, status: r.request_status, entity_id: r.id })),
    ...payments.map((p) => ({ date: p.payment_date, type: 'payment', reference: p.payment_number, debit: 0, credit: toNumber(p.amount), status: p.payment_method, entity_id: p.id }))
  ].sort((a, b) => new Date(a.date) - new Date(b.date) || String(a.reference).localeCompare(String(b.reference)));
  let running = 0;
  entries.forEach((e) => { running += e.debit - e.credit; e.running_balance = running; });
  const stockOutReceivables = requests.filter((r) => r.request_type === 'stock_out').reduce((s, r) => s + toNumber(r.total_amount), 0);
  const returnCredits = requests.filter((r) => r.request_type === 'stock_return' && r.request_status === 'completed').reduce((s, r) => s + toNumber(r.total_amount), 0);
  const paymentTotal = payments.reduce((s, p) => s + toNumber(p.amount), 0);
  return { driver, summary: { stock_out_receivables: stockOutReceivables, stock_return_credits: returnCredits, payments: paymentTotal, net_balance: stockOutReceivables - returnCredits - paymentTotal }, rows: entries };
};

// ─── Driver Statements (bulk - eliminates N+1) ───────────────────────────────
const driverStatements = async (query = {}) => {
  const drivers = await Driver.findAll({ where: query.driver_id ? { id: query.driver_id } : {}, attributes: ['id', 'full_name'], order: [['full_name', 'ASC']] });
  if (!drivers.length) return [];
  const driverIds = drivers.map((d) => d.id);
  const requestWhere = { driver_id: { [Op.in]: driverIds }, request_status: { [Op.ne]: 'cancelled' } };
  if (query.start_date || query.end_date) { requestWhere.request_date = {}; if (query.start_date) requestWhere.request_date[Op.gte] = query.start_date; if (query.end_date) requestWhere.request_date[Op.lte] = query.end_date; }
  const paymentWhere = { driver_id: { [Op.in]: driverIds } };
  if (query.start_date || query.end_date) { paymentWhere.payment_date = {}; if (query.start_date) paymentWhere.payment_date[Op.gte] = new Date(query.start_date); if (query.end_date) paymentWhere.payment_date[Op.lte] = new Date(`${query.end_date}T23:59:59.999Z`); }
  const [requests, payments] = await Promise.all([
    StockRequest.findAll({ where: requestWhere, attributes: ['id', 'driver_id', 'request_type', 'request_status', 'total_amount'] }),
    Payment.findAll({ where: paymentWhere, attributes: ['id', 'driver_id', 'amount'] })
  ]);
  const reqByDriver = groupByDriver(requests);
  const payByDriver = groupByDriver(payments);
  return drivers.map((driver) => {
    const dReqs = reqByDriver.get(Number(driver.id)) || [];
    const dPays = payByDriver.get(Number(driver.id)) || [];
    const stockOut = dReqs.filter((r) => r.request_type === 'stock_out').reduce((s, r) => s + toNumber(r.total_amount), 0);
    const returns = dReqs.filter((r) => r.request_type === 'stock_return' && r.request_status === 'completed').reduce((s, r) => s + toNumber(r.total_amount), 0);
    const paid = dPays.reduce((s, p) => s + toNumber(p.amount), 0);
    return { driver_id: driver.id, driver_name: driver.full_name, stock_out_receivables: stockOut, stock_return_credits: returns, payments: paid, net_balance: stockOut - returns - paid };
  });
};

// ─── Driver Aging (with limit) ───────────────────────────────────────────────
const driverAging = async (query = {}) => {
  const requests = await StockRequest.findAll({
    where: { ...datedRequestWhere(query), request_type: 'stock_out', request_status: { [Op.ne]: 'cancelled' }, remaining_amount: { [Op.gt]: 0 } },
    include: [{ model: Driver, as: 'driver', attributes: ['id', 'full_name'] }],
    attributes: ['id', 'driver_id', 'request_date', 'remaining_amount'],
    order: [['request_date', 'ASC']],
    limit: 2000
  });
  const buckets = new Map();
  const today = new Date();
  requests.forEach((r) => {
    const driverId = Number(r.driver_id);
    const row = buckets.get(driverId) || { driver_id: driverId, driver_name: r.driver?.full_name || `Driver #${driverId}`, current: 0, overdue_1_7: 0, overdue_8_30: 0, overdue_31_plus: 0, total: 0 };
    const age = Math.floor((today - new Date(r.request_date)) / 86400000);
    const amount = toNumber(r.remaining_amount);
    if (age <= 0) row.current += amount; else if (age <= 7) row.overdue_1_7 += amount; else if (age <= 30) row.overdue_8_30 += amount; else row.overdue_31_plus += amount;
    row.total += amount;
    buckets.set(driverId, row);
  });
  return Array.from(buckets.values()).sort((a, b) => b.total - a.total);
};

// ─── Commission helpers ──────────────────────────────────────────────────────
const isRuleEffective = (rule, date) => {
  const from = rule.effective_from ? String(rule.effective_from) : null;
  const until = rule.effective_until ? String(rule.effective_until) : null;
  return (!from || from <= date) && (!until || until >= date);
};
const chooseRule = (rules, date) => rules.filter((r) => r.status === 'active' && isRuleEffective(r, date)).sort((a, b) => String(b.effective_from || '').localeCompare(String(a.effective_from || '')) || Number(b.id) - Number(a.id))[0] || null;

// ─── Shared data loader for commission + KPI (eliminates duplicate queries) ──
const loadMonthlyReportData = async (bounds) => {
  const cacheKey = `monthly_data:${bounds.value}`;
  const cached = reportCache.get(cacheKey);
  if (cached) return cached;

  const [settings, completedRequests, rules, targets, membersByLocation] = await Promise.all([
    getCommissionSettings(),
    StockRequest.findAll({
      where: { request_status: 'completed', completed_at: { [Op.gte]: bounds.start, [Op.lt]: bounds.end }, commission_location_id: { [Op.ne]: null } },
      include: [{ model: Driver, as: 'driver', attributes: ['id', 'full_name'] }, { model: Location, as: 'commission_location', attributes: ['id', 'name'] }],
      attributes: ['id', 'driver_id', 'commission_location_id', 'total_amount', 'completed_at'],
      order: [['completed_at', 'ASC']]
    }),
    LocationCommissionRule.findAll({ include: [{ model: Location, as: 'location', attributes: ['id', 'name'] }], order: [['location_id', 'ASC'], ['effective_from', 'DESC'], ['id', 'DESC']] }),
    LocationMonthlyTarget.findAll({ where: { target_month: bounds.value, status: 'active' }, include: [{ model: Location, as: 'location', attributes: ['id', 'name'] }], order: [['location_id', 'ASC']] }),
    getHistoricalMembers(bounds)
  ]);

  const data = { settings, completedRequests, rules, targets, membersByLocation };
  reportCache.set(cacheKey, data);
  return data;
};

// ─── Commission Summary (uses shared data) ───────────────────────────────────
const commissionSummary = async ({ month } = {}) => {
  const bounds = monthBounds(month);
  const { settings, completedRequests, rules } = await loadMonthlyReportData(bounds);
  if (settings.commissions_enabled !== 'true') return { enabled: false, period: bounds.value, rows: [] };

  const rulesByLocation = rules.reduce((acc, rule) => { const k = Number(rule.location_id); acc[k] = acc[k] || []; acc[k].push(rule); return acc; }, {});
  const groups = new Map();
  completedRequests.forEach((request) => {
    const completedDate = request.completed_at ? new Date(request.completed_at).toISOString().slice(0, 10) : bounds.startDate;
    const rule = chooseRule(rulesByLocation[Number(request.commission_location_id)] || [], completedDate);
    if (!rule) return;
    const key = `${request.driver_id}:${request.commission_location_id}:${rule.id}`;
    const cur = groups.get(key) || { driver_id: request.driver_id, driver_name: request.driver?.full_name || `Driver #${request.driver_id}`, location_id: request.commission_location_id, location_name: request.commission_location?.name || `Location #${request.commission_location_id}`, rule_id: rule.id, base_commission_percent: Number(rule.base_commission_percent || 0), target_amount: Number(rule.target_amount || 0), target_bonus_percent: Number(rule.target_bonus_percent || 0), sales_total: 0, order_count: 0 };
    cur.sales_total += Number(request.total_amount || 0);
    cur.order_count += 1;
    groups.set(key, cur);
  });
  const rows = Array.from(groups.values()).map((row) => {
    const target_reached = row.target_amount > 0 && row.sales_total >= row.target_amount;
    const base_commission = row.sales_total * (row.base_commission_percent / 100);
    const bonus_commission = target_reached ? row.sales_total * (row.target_bonus_percent / 100) : 0;
    return { ...row, target_reached, target_progress_percent: row.target_amount > 0 ? Math.min((row.sales_total / row.target_amount) * 100, 100) : 100, base_commission, bonus_commission, total_commission: base_commission + bonus_commission };
  }).sort((a, b) => b.total_commission - a.total_commission);
  return { enabled: true, period: bounds.value, source_status: settings.commission_source_status || 'completed', rows };
};

// ─── Historical Members ──────────────────────────────────────────────────────
const getHistoricalMembers = async (bounds) => {
  const assignments = await DriverLocationAssignment.findAll({
    where: { assigned_from: { [Op.lt]: bounds.end }, [Op.or]: [{ assigned_until: null }, { assigned_until: { [Op.gte]: bounds.start } }] },
    include: [{ model: Driver, as: 'driver', attributes: ['id', 'full_name'], where: { status: 'active' } }, { model: Location, as: 'location', attributes: ['id', 'name'] }],
    attributes: ['id', 'driver_id', 'location_id'],
    order: [['location_id', 'ASC'], ['driver_id', 'ASC']]
  });
  const byLocation = new Map();
  assignments.forEach((a) => {
    const locId = Number(a.location_id), drvId = Number(a.driver_id);
    if (!byLocation.has(locId)) byLocation.set(locId, new Map());
    const drivers = byLocation.get(locId);
    if (!drivers.has(drvId)) drivers.set(drvId, { driver_id: drvId, driver_name: a.driver?.full_name || `Driver #${drvId}`, location_id: locId, location_name: a.location?.name || `Location #${locId}` });
  });
  return byLocation;
};

// ─── Target KPIs (uses shared data) ──────────────────────────────────────────
const targetKpis = async ({ month } = {}) => {
  const bounds = monthBounds(month);
  const { completedRequests, targets, membersByLocation } = await loadMonthlyReportData(bounds);

  const driverSales = new Map(), locationSales = new Map();
  completedRequests.forEach((r) => {
    const locId = Number(r.commission_location_id), drvId = Number(r.driver_id), amt = Number(r.total_amount || 0);
    driverSales.set(`${locId}:${drvId}`, (driverSales.get(`${locId}:${drvId}`) || 0) + amt);
    locationSales.set(locId, (locationSales.get(locId) || 0) + amt);
  });
  const locationRows = [], driverRows = [];
  targets.forEach((target) => {
    const locId = Number(target.location_id);
    const members = Array.from((membersByLocation.get(locId) || new Map()).values());
    const driverCount = members.length, targetAmount = Number(target.target_amount || 0);
    const locationTarget = target.target_mode === 'per_driver' ? targetAmount * driverCount : targetAmount;
    const perDriverTarget = target.target_mode === 'per_driver' ? targetAmount : driverCount > 0 ? locationTarget / driverCount : 0;
    const salesTotal = locationSales.get(locId) || 0;
    const progress = locationTarget > 0 ? (salesTotal / locationTarget) * 100 : 100;
    locationRows.push({ location_id: locId, location_name: target.location?.name || `Location #${locId}`, target_month: target.target_month, target_mode: target.target_mode, driver_count: driverCount, target_amount: locationTarget, sales_total: salesTotal, progress_percent: progress, variance_amount: salesTotal - locationTarget, target_reached: locationTarget > 0 ? salesTotal >= locationTarget : salesTotal > 0 });
    members.forEach((m) => {
      const sales = driverSales.get(`${locId}:${m.driver_id}`) || 0;
      driverRows.push({ ...m, target_month: target.target_month, target_mode: target.target_mode, target_amount: perDriverTarget, sales_total: sales, progress_percent: perDriverTarget > 0 ? (sales / perDriverTarget) * 100 : 100, variance_amount: sales - perDriverTarget, target_reached: perDriverTarget > 0 ? sales >= perDriverTarget : sales > 0 });
    });
  });
  return { period: bounds.value, locationRows: locationRows.sort((a, b) => b.progress_percent - a.progress_percent), driverRows: driverRows.sort((a, b) => b.progress_percent - a.progress_percent) };
};

// ─── Driver Payroll (uses shared commission + KPI data) ──────────────────────
const driverPayroll = async ({ month } = {}) => {
  const bounds = monthBounds(month);
  const payoutDate = new Date(bounds.end.getTime() - 86400000).toISOString().slice(0, 10);
  const [drivers, commissions, kpis] = await Promise.all([
    Driver.findAll({ where: { status: 'active' }, include: [{ model: Location, as: 'current_location', attributes: ['id', 'name'] }], attributes: ['id', 'full_name', 'phone', 'monthly_salary', 'current_location_id'], order: [['full_name', 'ASC']] }),
    commissionSummary({ month: bounds.value }),
    targetKpis({ month: bounds.value })
  ]);
  const commissionByDriver = new Map();
  (commissions.rows || []).forEach((row) => {
    const id = Number(row.driver_id);
    const cur = commissionByDriver.get(id) || { sales_total: 0, order_count: 0, base_commission: 0, bonus_commission: 0, total_commission: 0, locations: new Set() };
    cur.sales_total += Number(row.sales_total || 0); cur.order_count += Number(row.order_count || 0); cur.base_commission += Number(row.base_commission || 0); cur.bonus_commission += Number(row.bonus_commission || 0); cur.total_commission += Number(row.total_commission || 0);
    if (row.location_name) cur.locations.add(row.location_name);
    commissionByDriver.set(id, cur);
  });
  const kpiByDriver = new Map();
  (kpis.driverRows || []).forEach((row) => {
    const id = Number(row.driver_id);
    const cur = kpiByDriver.get(id) || { target_amount: 0, sales_total: 0, variance_amount: 0, locations: new Set() };
    cur.target_amount += Number(row.target_amount || 0); cur.sales_total += Number(row.sales_total || 0); cur.variance_amount += Number(row.variance_amount || 0);
    if (row.location_name) cur.locations.add(row.location_name);
    kpiByDriver.set(id, cur);
  });
  const rows = drivers.map((driver) => {
    const id = Number(driver.id), salary = Number(driver.monthly_salary || 0);
    const commission = commissionByDriver.get(id) || {}, kpi = kpiByDriver.get(id) || {};
    const targetAmount = Number(kpi.target_amount || 0), salesTotal = Number(kpi.sales_total || commission.sales_total || 0);
    const progressPercent = targetAmount > 0 ? (salesTotal / targetAmount) * 100 : (salesTotal > 0 ? 100 : 0);
    const totalCommission = Number(commission.total_commission || 0);
    const locations = new Set([...Array.from(kpi.locations || []), ...Array.from(commission.locations || [])]);
    return { driver_id: driver.id, driver_name: driver.full_name, phone: driver.phone, current_location_id: driver.current_location_id, current_location_name: driver.current_location?.name || null, performance_locations: Array.from(locations), period: bounds.value, payout_date: payoutDate, salary, sales_total: salesTotal, order_count: Number(commission.order_count || 0), target_amount: targetAmount, progress_percent: progressPercent, variance_amount: targetAmount > 0 ? salesTotal - targetAmount : Number(kpi.variance_amount || 0), target_reached: targetAmount > 0 ? salesTotal >= targetAmount : salesTotal > 0, performance: performanceLabel({ targetAmount, salesTotal, progressPercent }), base_commission: Number(commission.base_commission || 0), bonus_commission: Number(commission.bonus_commission || 0), total_commission: totalCommission, total_pay: salary + totalCommission };
  });
  return { period: bounds.value, payout_date: payoutDate, commissions_enabled: commissions.enabled !== false, rows };
};

// ─── Receipt status helper ───────────────────────────────────────────────────
const receiptStatusForRequest = (request) => {
  if (!request.driver_received_at) return 'receipt_pending';
  const items = request.items || [];
  if (!items.length) return 'receipt_submitted';
  const receivedCount = items.filter((l) => Boolean(l.confirmation?.confirmed) && Number(l.confirmation?.confirmed_quantity || 0) > 0).length;
  if (receivedCount === 0) return 'receipt_not_confirmed';
  const fullyReceivedCount = items.filter((l) => (
    Boolean(l.confirmation?.confirmed)
    && Number(l.confirmation?.confirmed_quantity || 0) >= Number(l.quantity || 0)
  )).length;
  if (fullyReceivedCount === items.length) return 'receipt_submitted';
  return 'receipt_partial';
};

// ─── Driver Detail Report Builder ────────────────────────────────────────────
const buildDriverReportRow = ({ driver, requests, payments, payrollRow, kpiRows, commissionRows, includeDetail = false, locationHistory = [] }) => {
  const completedRequests = requests.filter((r) => r.request_status === 'completed');
  const stockOutTotal = completedRequests.filter((r) => r.request_type === 'stock_out').reduce((s, r) => s + toNumber(r.total_amount), 0);
  const returnTotal = completedRequests.filter((r) => r.request_type === 'stock_return').reduce((s, r) => s + toNumber(r.total_amount), 0);
  const paidInPeriod = payments.reduce((s, p) => s + toNumber(p.amount), 0);
  const remainingOpen = requests.filter((r) => r.request_status !== 'cancelled' && r.request_type === 'stock_out').reduce((s, r) => s + toNumber(r.remaining_amount), 0);
  const targetAmount = kpiRows.reduce((s, r) => s + toNumber(r.target_amount), 0);
  const kpiSales = kpiRows.reduce((s, r) => s + toNumber(r.sales_total), 0);
  const progressPercent = targetAmount > 0 ? (kpiSales / targetAmount) * 100 : (kpiSales > 0 ? 100 : 0);
  const totalCommission = commissionRows.reduce((s, r) => s + toNumber(r.total_commission), 0);
  const salary = toNumber(driver.monthly_salary);
  const report = {
    driver: { id: driver.id, full_name: driver.full_name, phone: driver.phone, monthly_salary: salary, status: driver.status, current_location: driver.current_location || null, user: driver.user || null },
    summary: { request_count: requests.length, completed_count: completedRequests.length, stock_out_total: stockOutTotal, return_total: returnTotal, net_sales: stockOutTotal - returnTotal, paid_in_period: paidInPeriod, remaining_open: remainingOpen, missing_payments: requests.filter((r) => r.request_type === 'stock_out' && r.request_status === 'completed' && ['pending', 'partially_paid'].includes(r.payment_status)).reduce((s, r) => s + toNumber(r.remaining_amount), 0) },
    kpi: { target_amount: targetAmount, sales_total: kpiSales, progress_percent: progressPercent, variance_amount: kpiSales - targetAmount, target_reached: targetAmount > 0 ? kpiSales >= targetAmount : kpiSales > 0, performance: performanceLabel({ targetAmount, salesTotal: kpiSales, progressPercent }), rows: kpiRows },
    commission: { base_commission: commissionRows.reduce((s, r) => s + toNumber(r.base_commission), 0), bonus_commission: commissionRows.reduce((s, r) => s + toNumber(r.bonus_commission), 0), total_commission: totalCommission, rows: commissionRows },
    payroll: payrollRow || { salary, total_commission: totalCommission, total_pay: salary + totalCommission }
  };
  if (!includeDetail) return report;
  return { ...report,
    requests: requests.map((r) => ({ id: r.id, request_number: r.request_number, request_date: r.request_date, request_type: r.request_type, request_status: r.request_status, payment_status: r.payment_status, receipt_status: receiptStatusForRequest(r), total_amount: toNumber(r.total_amount), paid_amount: toNumber(r.paid_amount), remaining_amount: toNumber(r.remaining_amount), completed_at: r.completed_at, items: (r.items || []).map((l) => ({ id: l.id, item_name: l.item?.name || `Item #${l.item_id}`, quantity: toNumber(l.quantity), unit_price: toNumber(l.unit_price), confirmed: Boolean(l.confirmation?.confirmed), confirmed_quantity: toNumber(l.confirmation?.confirmed_quantity) })) })),
    payments: payments.map((p) => ({ id: p.id, payment_number: p.payment_number, request_number: p.stock_request?.request_number || '', amount: toNumber(p.amount), payment_method: p.payment_method, payment_date: p.payment_date })),
    location_history: locationHistory.map((a) => ({ id: a.id, location: a.location || null, assigned_from: a.assigned_from, assigned_until: a.assigned_until }))
  };
};

// ─── Driver Detail Data (shared queries, no duplicate calls) ─────────────────
const driverDetailData = async ({ month, driverId, includeDetail = false }) => {
  const bounds = monthBounds(month);
  const driverWhere = driverId ? { id: driverId } : {};
  const drivers = await Driver.findAll({
    where: driverWhere,
    include: [{ model: Location, as: 'current_location', attributes: ['id', 'name'] }, { model: User, as: 'user', attributes: ['id', 'full_name', 'email', 'status'], include: withRoleInclude() }],
    attributes: ['id', 'full_name', 'phone', 'monthly_salary', 'status', 'current_location_id'],
    order: [['full_name', 'ASC']]
  });
  drivers.forEach((driver) => { if (driver.user) normalizeUserRole(driver.user); });
  if (driverId && !drivers.length) throw new HttpError(404, 'Driver not found');
  const driverIds = drivers.map((d) => d.id);
  if (!driverIds.length) return { period: bounds.value, rows: [] };

  const [requests, payments, payroll, kpis, commissions, locationHistory] = await Promise.all([
    StockRequest.findAll({
      where: { driver_id: { [Op.in]: driverIds }, [Op.or]: [{ request_date: { [Op.gte]: bounds.startDate, [Op.lt]: bounds.endDate } }, { completed_at: { [Op.gte]: bounds.start, [Op.lt]: bounds.end } }] },
      include: [{ model: Location, as: 'commission_location', attributes: ['id', 'name'] }, { model: StockRequestItem, as: 'items', include: [{ model: Item, as: 'item', attributes: ['id', 'name', 'sku'] }, { model: StockRequestItemConfirmation, as: 'confirmation', attributes: ['confirmed', 'confirmed_quantity'] }] }],
      order: [['request_date', 'DESC'], ['id', 'DESC']]
    }),
    Payment.findAll({
      where: { driver_id: { [Op.in]: driverIds }, payment_date: { [Op.gte]: bounds.start, [Op.lt]: bounds.end } },
      include: [{ model: StockRequest, as: 'stock_request', attributes: ['id', 'request_number'] }],
      order: [['payment_date', 'DESC'], ['id', 'DESC']]
    }),
    driverPayroll({ month: bounds.value }),
    targetKpis({ month: bounds.value }),
    commissionSummary({ month: bounds.value }),
    includeDetail ? DriverLocationAssignment.findAll({ where: { driver_id: { [Op.in]: driverIds } }, include: [{ model: Location, as: 'location', attributes: ['id', 'name'] }], attributes: ['id', 'driver_id', 'assigned_from', 'assigned_until'], order: [['assigned_from', 'DESC']], limit: 100 }) : Promise.resolve([])
  ]);

  const requestsByDriver = groupByDriver(requests);
  const paymentsByDriver = groupByDriver(payments);
  const payrollByDriver = new Map((payroll.rows || []).map((r) => [Number(r.driver_id), r]));
  const kpiRowsByDriver = groupByDriver(kpis.driverRows || []);
  const commissionRowsByDriver = groupByDriver(commissions.rows || []);
  const historyByDriver = groupByDriver(locationHistory);
  const rows = drivers.map((driver) => buildDriverReportRow({ driver, requests: requestsByDriver.get(Number(driver.id)) || [], payments: paymentsByDriver.get(Number(driver.id)) || [], payrollRow: payrollByDriver.get(Number(driver.id)), kpiRows: kpiRowsByDriver.get(Number(driver.id)) || [], commissionRows: commissionRowsByDriver.get(Number(driver.id)) || [], includeDetail, locationHistory: historyByDriver.get(Number(driver.id)) || [] }));
  return { period: bounds.value, payout_date: payroll.payout_date, rows, report: driverId ? rows[0] : null };
};

const driverDetailReports = (query = {}) => driverDetailData({ month: query.month, includeDetail: false });
const driverDetailReport = (driverId, query = {}) => driverDetailData({ month: query.month, driverId, includeDetail: true });

module.exports = { dashboard, inventorySummary, driverBalances, paymentSummary, missingPayments, purchaseSummary, stockMovementReport, commissionSummary, targetKpis, driverPayroll, driverDetailReports, driverDetailReport, driverStatement, driverStatements, driverAging };
