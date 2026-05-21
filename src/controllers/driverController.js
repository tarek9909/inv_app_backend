const { literal, Op } = require('sequelize');
const { Driver, StockRequest } = require('../models');
const stockRequestService = require('../services/stockRequestService');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/responses');
const HttpError = require('../utils/httpError');

const isAdmin = (user) => user?.role?.code === 'admin';
const DRIVER_VISIBLE_STATUSES = ['approved', 'completed', 'cancelled'];

const loadDriverForUser = async (userId) => {
  const driver = await Driver.findOne({ where: { user_id: userId } });
  if (!driver) throw new HttpError(403, 'No driver profile is linked to this account');
  return driver;
};

exports.me = asyncHandler(async (req, res) => {
  if (isAdmin(req.user)) {
    ok(res, 'Admin driver portal access loaded', { driver: null });
    return;
  }
  const driver = await loadDriverForUser(req.user.id);
  ok(res, 'Driver profile loaded', { driver });
});

exports.listStockRequests = asyncHandler(async (req, res) => {
  const admin = isAdmin(req.user);
  const driver = admin ? null : await loadDriverForUser(req.user.id);
  const itemCountSql = '(SELECT COUNT(*) FROM stock_request_items sri WHERE sri.stock_request_id = stock_requests.id)';
  const confirmedCountSql = '(SELECT COUNT(*) FROM stock_request_items sri JOIN stock_request_item_confirmations src ON src.stock_request_item_id = sri.id WHERE sri.stock_request_id = stock_requests.id AND src.confirmed = 1 AND src.confirmed_quantity >= sri.quantity)';
  const rows = await StockRequest.findAll({
    where: admin ? {} : {
      driver_id: driver.id,
      request_status: { [Op.in]: DRIVER_VISIBLE_STATUSES }
    },
    include: stockRequestService.includeStockRequestList,
    attributes: { include: [[literal(itemCountSql), 'item_count'], [literal(confirmedCountSql), 'confirmed_count']] },
    order: [['created_at', 'DESC']],
    limit: 50
  });
  rows.forEach(stockRequestService.withReceiptStatus);
  ok(res, 'Driver stock requests loaded', rows, { total: rows.length });
});

exports.getStockRequest = asyncHandler(async (req, res) => {
  const admin = isAdmin(req.user);
  const driver = admin ? null : await loadDriverForUser(req.user.id);
  const request = await StockRequest.findOne({
    where: admin ? { id: req.params.id } : {
      id: req.params.id,
      driver_id: driver.id,
      request_status: { [Op.in]: DRIVER_VISIBLE_STATUSES }
    },
    include: stockRequestService.includeStockRequest
  });
  if (!request) throw new HttpError(404, 'Stock request not found');
  ok(res, 'Driver stock request loaded', stockRequestService.withReceiptStatus(request));
});

exports.markInvoiceViewed = asyncHandler(async (req, res) => {
  const driver = await loadDriverForUser(req.user.id);
  const request = await stockRequestService.markDriverInvoiceViewed(req.params.id, driver, req);
  ok(res, 'Driver invoice opened', request);
});

exports.submitReceipt = asyncHandler(async (req, res) => {
  const driver = await loadDriverForUser(req.user.id);
  const request = await stockRequestService.submitDriverReceipt(req.params.id, driver, req.body, req);
  ok(res, 'Driver receipt submitted', request);
});
