const authService = require('../services/authService');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/responses');

exports.login = asyncHandler(async (req, res) => {
  const data = await authService.login(req.body, req);
  ok(res, 'Login successful', data);
});

exports.me = asyncHandler(async (req, res) => {
  ok(res, 'Current user loaded', { user: req.user });
});

exports.logout = asyncHandler(async (req, res) => {
  ok(res, 'Logout successful');
});

exports.updateProfile = asyncHandler(async (req, res) => {
  const user = await authService.updateProfile(req.user.id, req.body);
  ok(res, 'Profile updated', { user });
});

exports.changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user.id, req.body, req);
  ok(res, 'Password changed');
});
