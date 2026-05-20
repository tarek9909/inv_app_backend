const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { Op } = require('sequelize');
const { User, LoginEvent } = require('../models');
const { attachPermissions } = require('./permissionService');
const { findUserWithRole, loadUserWithRole } = require('./userService');
const HttpError = require('../utils/httpError');

const eventMeta = (req) => ({ ip_address: req?.ip, user_agent: req?.headers?.['user-agent'] });

const recordLoginEvent = (values) => LoginEvent?.create ? LoginEvent.create(values).catch(() => {}) : Promise.resolve();

const login = async ({ email, password }, req) => {
  const user = await findUserWithRole({ email }, { withPassword: true });

  if (!user || user.status !== 'active' || !user.role) {
    await recordLoginEvent({ email, event_type: 'failed', ...eventMeta(req) });
    throw new HttpError(401, 'Invalid credentials');
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    await recordLoginEvent({ user_id: user.id, email, event_type: 'failed', ...eventMeta(req) });
    throw new HttpError(401, 'Invalid credentials');
  }

  await user.update({ last_login_at: new Date() });
  await recordLoginEvent({ user_id: user.id, email, event_type: 'success', ...eventMeta(req) });
  const token = jwt.sign({ id: user.id, role: user.role.code }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
  const safeUser = await attachPermissions(await loadUserWithRole(user.id, { includeDriver: true }));

  return { token, user: safeUser };
};

const loadSafeUser = async (id) => attachPermissions(await loadUserWithRole(id, { includeDriver: true }));

const updateProfile = async (userId, payload) => {
  const user = await User.unscoped().findByPk(userId);
  if (!user) throw new HttpError(404, 'User not found');

  const existing = await User.unscoped().findOne({
    where: {
      email: payload.email,
      id: { [Op.ne]: userId }
    }
  });
  if (existing) throw new HttpError(409, 'Email is already in use');

  await user.update({
    full_name: payload.full_name,
    email: payload.email,
    phone: payload.phone || null
  });
  return loadSafeUser(userId);
};

const changePassword = async (userId, { current_password, new_password }, req) => {
  const user = await User.unscoped().findByPk(userId);
  if (!user) throw new HttpError(404, 'User not found');

  const ok = await bcrypt.compare(current_password, user.password);
  if (!ok) throw new HttpError(400, 'Current password is incorrect');

  const password = await bcrypt.hash(new_password, 10);
  await user.update({ password, must_change_password: false });
  await recordLoginEvent({ user_id: user.id, email: user.email, event_type: 'password_changed', ...eventMeta(req) });
  return true;
};

module.exports = { login, updateProfile, changePassword, recordLoginEvent };
