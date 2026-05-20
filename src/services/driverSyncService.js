const { Role, User, Driver, DriverUserLink } = require('../models');

const driverInclude = [{ model: Role, as: 'role', where: { code: 'driver' }, required: true }];
let lastDriverRoleSyncAt = 0;
const DRIVER_ROLE_SYNC_COOLDOWN_MS = 60 * 1000;

const syncDriverUser = async (user, { transaction, actorId } = {}) => {
  if (!user) return null;

  const link = await DriverUserLink.findOne({
    where: { user_id: user.id },
    include: [{ model: Driver, as: 'driver' }],
    transaction
  });

  if (user.role?.code !== 'driver') {
    if (link?.driver && link.driver.status !== 'inactive') {
      await link.driver.update({ status: 'inactive', updated_by: actorId || null }, { transaction });
    }
    return null;
  }

  if (link?.driver) {
    const updates = {};
    if (link.driver.full_name !== user.full_name) updates.full_name = user.full_name;
    if ((link.driver.phone || '') !== (user.phone || '')) updates.phone = user.phone || null;
    if (link.driver.status !== user.status) updates.status = user.status;
    if (Object.keys(updates).length) {
      updates.updated_by = actorId || null;
      await link.driver.update(updates, { transaction });
    }
    return link.driver;
  }

  const driver = await Driver.create({
    full_name: user.full_name,
    phone: user.phone || null,
    status: user.status || 'active',
    created_by: actorId || null
  }, { transaction });
  await DriverUserLink.create({ driver_id: driver.id, user_id: user.id }, { transaction });
  return driver;
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
    include: [{ model: Role, as: 'role' }],
    transaction
  });
  return syncDriverUser(user, { transaction, actorId });
};

module.exports = { syncDriverRoleUsers, syncUserIfDriver };
