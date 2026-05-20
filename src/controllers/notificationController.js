const notificationService = require('../services/notificationService');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/responses');

exports.list = asyncHandler(async (req, res) => {
  const result = await notificationService.listForUser(req.user.id, req.query);
  const limit = Math.min(Number(req.query.limit || 50), 100);
  const page = Math.max(Number(req.query.page || 1), 1);
  ok(res, 'Notifications loaded', result.rows, {
    total: result.count,
    page,
    limit,
    pages: Math.ceil(result.count / limit) || 1
  });
});

exports.markRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markRead(req.user.id, req.params.id);
  ok(res, 'Notification marked read', notification);
});

exports.markAllRead = asyncHandler(async (req, res) => {
  await notificationService.markAllRead(req.user.id);
  ok(res, 'Notifications marked read');
});
