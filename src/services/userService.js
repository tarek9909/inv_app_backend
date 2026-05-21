const bcrypt = require('bcryptjs');
const { sequelize, User, UserRole, Role, Driver } = require('../models');

const buildRoleInclude = (roleWhere) => ({
  model: UserRole,
  as: 'user_role',
  required: Boolean(roleWhere),
  include: [{
    model: Role,
    as: 'role',
    ...(roleWhere ? { where: roleWhere, required: true } : {})
  }]
});

const includeRole = [buildRoleInclude()];
const includeDriver = [{ model: Driver, as: 'driver' }];

const getValue = (record, key) => {
  if (!record) return undefined;
  if (typeof record.get === 'function') return record.get(key);
  return record[key];
};

const setValue = (record, key, value) => {
  if (!record) return;
  if (typeof record.setDataValue === 'function') {
    record.setDataValue(key, value);
  }
  record[key] = value;
};

const hasLoadedValue = (record, key) => {
  if (!record) return false;
  if (record.dataValues) return Object.prototype.hasOwnProperty.call(record.dataValues, key);
  return Object.prototype.hasOwnProperty.call(record, key);
};

const normalizeUserRole = (user) => {
  if (!user) return user;
  const userRole = getValue(user, 'user_role');
  const roles = getValue(user, 'roles');
  const userRoleRole = getValue(userRole, 'role');
  const role = getValue(user, 'role') || userRoleRole || roles?.[0] || null;
  const roleId = getValue(role, 'id') || getValue(userRole, 'role_id') || null;
  setValue(user, 'role', role);
  setValue(user, 'role_id', roleId);

  if (hasLoadedValue(user, 'driver')) {
    const driver = getValue(user, 'driver');
    setValue(user, 'driver_link', driver ? {
      driver_id: driver.id,
      user_id: user.id,
      driver
    } : null);
  }

  return user;
};

const normalizeUserRoles = (users) => {
  (users || []).forEach(normalizeUserRole);
  return users;
};

const withRoleInclude = ({ roleWhere, includeDriver: shouldIncludeDriver = false, include = [] } = {}) => [
  buildRoleInclude(roleWhere),
  ...(shouldIncludeDriver ? includeDriver : []),
  ...include
];

const loadUserWithRole = async (id, options = {}) => {
  const model = options.withPassword ? User.unscoped() : User;
  const user = await model.findByPk(id, {
    include: withRoleInclude({ includeDriver: options.includeDriver, include: options.include }),
    transaction: options.transaction
  });
  return normalizeUserRole(user);
};

const findUserWithRole = async (where, options = {}) => {
  const model = options.withPassword ? User.unscoped() : User;
  const user = await model.findOne({
    where,
    include: withRoleInclude({ roleWhere: options.roleWhere, includeDriver: options.includeDriver, include: options.include }),
    transaction: options.transaction
  });
  return normalizeUserRole(user);
};

const syncUserRole = async (userId, roleId, transaction) => {
  if (roleId === undefined) return null;
  const existing = await UserRole.findOne({ where: { user_id: userId }, transaction });
  if (existing) {
    await existing.update({ role_id: roleId }, { transaction });
    return existing;
  }
  return UserRole.create({ user_id: userId, role_id: roleId }, { transaction });
};

const userFields = ['full_name', 'email', 'phone', 'password', 'status', 'must_change_password', 'last_login_at'];

const pickUserFields = (payload) => userFields.reduce((data, field) => {
  if (Object.prototype.hasOwnProperty.call(payload, field)) data[field] = payload[field];
  return data;
}, {});

const createUser = async (payload, options = {}) => {
  const run = async (transaction) => {
    const { role_id, ...userPayload } = payload;
    const password = await bcrypt.hash(userPayload.password, 10);
    const user = await User.create({ ...pickUserFields(userPayload), password }, { transaction });
    await syncUserRole(user.id, role_id, transaction);
    return loadUserWithRole(user.id, { transaction, includeDriver: true });
  };

  return options.transaction ? run(options.transaction) : sequelize.transaction(run);
};

const updateUser = async (user, payload, options = {}) => {
  const run = async (transaction) => {
    const { role_id, ...userPayload } = payload;
    const data = pickUserFields(userPayload);
    if (data.password) data.password = await bcrypt.hash(data.password, 10);
    if (Object.keys(data).length) await user.update(data, { transaction });
    await syncUserRole(user.id, role_id, transaction);
    return loadUserWithRole(user.id, { transaction, includeDriver: true });
  };

  return options.transaction ? run(options.transaction) : sequelize.transaction(run);
};

module.exports = {
  buildRoleInclude,
  includeRole,
  includeDriver,
  withRoleInclude,
  normalizeUserRole,
  normalizeUserRoles,
  loadUserWithRole,
  findUserWithRole,
  syncUserRole,
  createUser,
  updateUser
};
