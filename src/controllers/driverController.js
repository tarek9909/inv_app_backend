const { Op } = require('sequelize');
const { Driver, DriverUserLink, StockRequest } = require('../models');
const stockRequestService = require('../services/stockRequestService');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/responses');
const HttpError = require('../utils/httpError');

const loadDriverForUser = async (userId) => {
  const link = await DriverUserLink.findOne({ where: { user_id: userId }, include: [{ model: Driver, as: 'driver' }] });
  if (!link?.driver) throw new HttpError(403, 'No driver profile is linked to this account');
  return link.driver;
};

exports.me = asyncHandler(async (req, res) => {
  const driver = await loadDriverForUser(req.user.id);
  ok(res, 'Driver profile loaded', { driver });
});

exports.listStockRequests = asyncHandler(async (req, res) => {
  const driver = await loadDriverForUser(req.user.id);
  const rows = await StockRequest.findAll({
    where: {
      driver_id: driver.id,
      request_status: { [Op.in]: ['approved', 'completed'] }
    },
    include: stockRequestService.includeStockRequestList,
    order: [['created_at', 'DESC']],
    limit: 50
  });
  ok(res, 'Driver stock requests loaded', rows, { total: rows.length });
});

exports.getStockRequest = asyncHandler(async (req, res) => {
  const driver = await loadDriverForUser(req.user.id);
  const request = await StockRequest.findOne({
    where: {
      id: req.params.id,
      driver_id: driver.id,
      request_status: { [Op.in]: ['approved', 'completed'] }
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
