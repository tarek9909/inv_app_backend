const reportService = require('../services/reportService');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/responses');

exports.dashboard = asyncHandler(async (req, res) => ok(res, 'Dashboard loaded', await reportService.dashboard()));
const flatten = (value) => {
  if (value && typeof value.toJSON === 'function') return flatten(value.toJSON());
  if (Array.isArray(value)) return value.map(flatten);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, typeof entry === 'object' && entry !== null ? JSON.stringify(flatten(entry)) : entry]));
  }
  return value;
};

const sendReport = (res, message, data, query = {}) => {
  if (query.format !== 'csv') return ok(res, message, data);
  const rows = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : Array.isArray(data?.locationRows) ? data.locationRows : Array.isArray(data?.driverRows) ? data.driverRows : [data];
  const flatRows = rows.map(flatten);
  const headers = [...new Set(flatRows.flatMap((row) => Object.keys(row || {})))];
  const escape = (value) => {
    if (value === null || value === undefined) return '';
    const text = String(value).replace(/"/g, '""');
    return /[",\n]/.test(text) ? `"${text}"` : text;
  };
  const csv = [headers.join(','), ...flatRows.map((row) => headers.map((header) => escape(row?.[header])).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="report.csv"');
  return res.send(csv);
};

exports.inventorySummary = asyncHandler(async (req, res) => sendReport(res, 'Inventory summary loaded', await reportService.inventorySummary(req.query), req.query));
exports.driverBalances = asyncHandler(async (req, res) => sendReport(res, 'Driver balances loaded', await reportService.driverBalances(req.query), req.query));
exports.paymentSummary = asyncHandler(async (req, res) => sendReport(res, 'Payment summary loaded', await reportService.paymentSummary(req.query), req.query));
exports.missingPayments = asyncHandler(async (req, res) => ok(res, 'Missing payments loaded', await reportService.missingPayments(req.query)));
exports.purchaseSummary = asyncHandler(async (req, res) => sendReport(res, 'Purchase summary loaded', await reportService.purchaseSummary(req.query), req.query));
exports.stockMovementReport = asyncHandler(async (req, res) => sendReport(res, 'Stock movement report loaded', await reportService.stockMovementReport(req.query), req.query));
exports.commissionSummary = asyncHandler(async (req, res) => sendReport(res, 'Commission summary loaded', await reportService.commissionSummary(req.query), req.query));
exports.targetKpis = asyncHandler(async (req, res) => sendReport(res, 'Target KPIs loaded', await reportService.targetKpis(req.query), req.query));
exports.driverPayroll = asyncHandler(async (req, res) => sendReport(res, 'Driver payroll loaded', await reportService.driverPayroll(req.query), req.query));
exports.driverDetailReports = asyncHandler(async (req, res) => sendReport(res, 'Driver detail reports loaded', await reportService.driverDetailReports(req.query), req.query));
exports.driverDetailReport = asyncHandler(async (req, res) => sendReport(res, 'Driver detail report loaded', await reportService.driverDetailReport(req.params.id, req.query), req.query));
exports.driverStatement = asyncHandler(async (req, res) => sendReport(res, 'Driver statement loaded', await reportService.driverStatement(req.params.id, req.query), req.query));
exports.driverStatements = asyncHandler(async (req, res) => sendReport(res, 'Driver statements loaded', await reportService.driverStatements(req.query), req.query));
exports.driverAging = asyncHandler(async (req, res) => sendReport(res, 'Driver aging loaded', await reportService.driverAging(req.query), req.query));
