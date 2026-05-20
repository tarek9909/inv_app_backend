const { Role, User, UserRole, Driver } = require('../models');
const { normalizeUserRole } = require('./userService');

const driverInclude = [{
  model: UserRole,
  as: 'user_role',
  required: true,
  include: [{ model: Role, as: 'role', where: { code: 'driver' }, required: true }]
}];
let lastDriverRoleSyncAt = 0;
const DRIVER_ROLE_SYNC_COOLDOWN_MS = 60 * 1000;

const syncDriverUser = async (user, { transaction, actorId } = {}) => {
  if (!user) return null;
  normalizeUserRole(user);

  const driver = await Driver.findOne({ where: { user_id: user.id }, transaction });

  if (user.role?.code !== 'driver') {
    if (driver && driver.status !== 'inactive') {
      await driver.update({ user_id: null, status: 'inactive', updated_by: actorId || null }, { transaction });
    }
    return null;
  }

  if (driver) {
    const updates = {};
    if (driver.full_name !== user.full_name) updates.full_name = user.full_name;
    if ((driver.phone || '') !== (user.phone || '')) updates.phone = user.phone || null;
    if (driver.status !== user.status) updates.status = user.status;
    if (Object.keys(updates).length) {
      updates.updated_by = actorId || null;
      await driver.update(updates, { transaction });
    }
    return driver;
  }

  return Driver.create({
    user_id: user.id,
    full_name: user.full_name,
    phone: user.phone || null,
    status: user.status || 'active',
    created_by: actorId || null
  }, { transaction });
};

const syncDriverRoleUsers = async ({ transaction, actorId, force = false } = {}) => {
  const now = Date.now();
  if (!force && !transaction && now - lastDriverRoleSyncAt < DRIVER_ROLE_SYNC_COOLDOWN_MS) return;

  const users = await User.findAll({
    where: { status: 'active' },
    include: driverInclude,
    transaction
  });

  for (const user of users) {
    await syncDriverUser(user, { transaction, actorId });
  }
  if (!transaction) lastDriverRoleSyncAt = Date.now();
};

const syncUserIfDriver = async (userId, { transaction, actorId } = {}) => {
  const user = await User.findByPk(userId, {
    include: [{ model: UserRole, as: 'user_role', include: [{ model: Role, as: 'role' }] }],
    transaction
  });
  return syncDriverUser(user, { transaction, actorId });
};

module.exports = { syncDriverRoleUsers, syncUserIfDriver };
