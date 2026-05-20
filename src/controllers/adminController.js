const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const { Role, User, AuditLog, LoginEvent, Permission, RolePermission, DriverUserLink, Driver, sequelize } = require('../models');
const { list, findOrFail } = require('../services/crudService');
const { createUser, updateUser, includeRole } = require('../services/userService');
const { syncUserIfDriver } = require('../services/driverSyncService');
const { logAction } = require('../services/auditService');
const { recordLoginEvent } = require('../services/authService');
const { userHasPermission } = require('../services/permissionService');
const { permissions: permissionCatalog } = require('../config/permissions');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/responses');
const HttpError = require('../utils/httpError');

exports.listUsers = asyncHandler(async (req, res) => {
  const canViewTeam = await userHasPermission(req.user, 'team.view');
  const roleCode = canViewTeam ? req.query.role_code : 'driver';
  const requestedStatus = canViewTeam ? req.query.status : 'active';
  const { role_code: ignoredRoleCode, status: ignoredStatus, ...query } = req.query;
  const include = [{
    ...includeRole[0],
    ...(roleCode ? { where: { code: roleCode }, required: true } : {})
  }, { model: DriverUserLink, as: 'driver_link', include: [{ model: Driver, as: 'driver' }] }];
  const where = requestedStatus ? { status: requestedStatus } : {};
  const { rows, meta } = await list(User, query, { where, include, searchFields: ['full_name', 'email', 'phone'] });
  ok(res, 'Users loaded', rows, meta);
});

exports.createUser = asyncHandler(async (req, res) => {
  const { monthly_salary, ...payload } = req.body;
  const user = await createUser(payload);
  const driver = await syncUserIfDriver(user.id, { actorId: req.user.id });
  if (driver) await driver.update({ monthly_salary: Number(monthly_salary || 0), updated_by: req.user.id });
  await logAction({ req, action: 'create', module: 'users', recordId: user.id, newData: req.body });
  created(res, 'User created', await User.findByPk(user.id, { include: includeRole }));
});

exports.updateUser = asyncHandler(async (req, res) => {
  const user = await findOrFail(User, req.params.id, { name: 'User' });
  const oldData = user.toJSON();
  const { monthly_salary, ...payload } = req.body;
  const updated = await updateUser(user, payload);
  const driver = await syncUserIfDriver(updated.id, { actorId: req.user.id });
  if (driver && monthly_salary !== undefined) await driver.update({ monthly_salary: Number(monthly_salary || 0), updated_by: req.user.id });
  await logAction({ req, action: 'update', module: 'users', recordId: user.id, oldData, newData: updated.toJSON() });
  ok(res, 'User updated', updated);
});

exports.updateUserStatus = asyncHandler(async (req, res) => {
  const user = await findOrFail(User, req.params.id, { name: 'User' });
  const oldData = user.toJSON();
  await user.update({ status: req.body.status });
  await syncUserIfDriver(user.id, { actorId: req.user.id });
  await logAction({ req, action: 'status', module: 'users', recordId: user.id, oldData, newData: user.toJSON() });
  ok(res, 'User status updated', user);
});

exports.resetUserPassword = asyncHandler(async (req, res) => {
  const user = await User.unscoped().findByPk(req.params.id);
  if (!user) throw new HttpError(404, 'User not found');
  const oldData = { id: user.id, must_change_password: user.must_change_password };
  const password = await bcrypt.hash(req.body.temporary_password, 10);
  await user.update({ password, must_change_password: true });
  await recordLoginEvent({ user_id: user.id, email: user.email, event_type: 'admin_reset_password', ip_address: req.ip, user_agent: req.headers['user-agent'] });
  await logAction({ req, action: 'reset_password', module: 'users', recordId: user.id, oldData, newData: { id: user.id, must_change_password: true } });
  ok(res, 'Password reset; user must change it on next login');
});

exports.listRoles = asyncHandler(async (req, res) => {
  ok(res, 'Roles loaded', await Role.findAll({ order: [['id', 'ASC']] }));
});

exports.createRole = asyncHandler(async (req, res) => {
  const role = await Role.create(req.body);
  await logAction({ req, action: 'create', module: 'roles', recordId: role.id, newData: role.toJSON() });
  created(res, 'Role created', role);
});

exports.updateRole = asyncHandler(async (req, res) => {
  const role = await findOrFail(Role, req.params.id, { name: 'Role' });
  if (role.code === 'admin' && req.body.code && req.body.code !== 'admin') {
    throw new HttpError(400, 'The admin role code cannot be changed');
  }
  const conflictChecks = [
    ...(req.body.name ? [{ name: req.body.name }] : []),
    ...(req.body.code ? [{ code: req.body.code }] : [])
  ];
  if (conflictChecks.length) {
    const conflict = await Role.findOne({ where: { id: { [Op.ne]: role.id }, [Op.or]: conflictChecks } });
    if (conflict) throw new HttpError(409, 'Role name or code is already in use');
  }
  const oldData = role.toJSON();
  await role.update(req.body);
  await logAction({ req, action: 'update', module: 'roles', recordId: role.id, oldData, newData: role.toJSON() });
  ok(res, 'Role updated', role);
});

exports.listPermissions = asyncHandler(async (req, res) => {
  const rows = await Permission.findAll({ order: [['module', 'ASC'], ['feature', 'ASC'], ['permission_key', 'ASC']] });
  ok(res, 'Permissions loaded', rows.length ? rows : permissionCatalog);
});

exports.getRolePermissions = asyncHandler(async (req, res) => {
  const role = await findOrFail(Role, req.params.id, {
    name: 'Role',
    include: [{ model: Permission, as: 'permissions', through: { attributes: [] } }]
  });
  const keys = role.code === 'admin'
    ? permissionCatalog.map((permission) => permission.key)
    : (role.permissions || []).map((permission) => permission.permission_key);
  ok(res, 'Role permissions loaded', { role, permissions: keys });
});

exports.updateRolePermissions = asyncHandler(async (req, res) => {
  const role = await findOrFail(Role, req.params.id, { name: 'Role' });
  if (role.code === 'admin') throw new HttpError(400, 'Admin role always has all permissions');

  const allowedKeys = permissionCatalog.map((permission) => permission.key);
  const keys = [...new Set(req.body.permissions || [])].filter((key) => allowedKeys.includes(key));
  const permissionRows = await Permission.findAll({ where: { permission_key: keys } });

  await sequelize.transaction(async (transaction) => {
    const oldData = {
      role: role.toJSON(),
      permissions: (await RolePermission.findAll({ where: { role_id: role.id }, include: [{ model: Permission, as: 'permission' }], transaction }))
        .map((row) => row.permission?.permission_key)
        .filter(Boolean)
    };
    await RolePermission.destroy({ where: { role_id: role.id }, transaction });
    if (permissionRows.length) {
      await RolePermission.bulkCreate(permissionRows.map((permission) => ({
        role_id: role.id,
        permission_id: permission.id
      })), { transaction });
    }
    await logAction({
      req,
      action: 'permissions',
      module: 'roles',
      recordId: role.id,
      oldData,
      newData: { permissions: keys },
      transaction
    });
  });

  ok(res, 'Role permissions updated', { role, permissions: keys });
});

exports.listAuditLogs = asyncHandler(async (req, res) => {
  const { rows, meta } = await list(AuditLog, req.query, { include: [{ model: User, as: 'user' }], searchFields: ['action', 'module'] });
  ok(res, 'Audit logs loaded', rows, meta);
});

exports.listLoginEvents = asyncHandler(async (req, res) => {
  const { rows, meta } = await list(LoginEvent, req.query, { include: [{ model: User, as: 'user' }], searchFields: ['email', 'event_type'] });
  ok(res, 'Login events loaded', rows, meta);
});
