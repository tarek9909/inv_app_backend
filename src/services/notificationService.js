const { Op } = require('sequelize');
const { Notification, User, Role, Permission, RolePermission } = require('../models');

const usersWithPermission = async (permissionKey, transaction) => {
  const permission = await Permission.findOne({ where: { permission_key: permissionKey }, transaction });
  const roleIds = permission
    ? (await RolePermission.findAll({ where: { permission_id: permission.id }, transaction })).map((row) => row.role_id)
    : [];
  const roles = await Role.findAll({ where: { [Op.or]: [{ code: 'admin' }, ...(roleIds.length ? [{ id: { [Op.in]: roleIds } }] : [])] }, transaction });
  const ids = roles.map((role) => role.id);
  if (!ids.length) return [];
  return User.findAll({ where: { role_id: { [Op.in]: ids }, status: 'active' }, transaction });
};

const createForUsers = async ({ users, type, title, message, entityType, entityId, transaction }) => {
  const uniqueUsers = [...new Map((users || []).map((user) => [Number(user.id), user])).values()];
  if (!uniqueUsers.length) return [];
  return Notification.bulkCreate(uniqueUsers.map((user) => ({
    user_id: user.id,
    type,
    title,
    message,
    entity_type: entityType || null,
    entity_id: entityId || null
  })), { transaction });
};

const notifyPermission = async ({ permissionKey, type, title, message, entityType, entityId, transaction }) => {
  const users = await usersWithPermission(permissionKey, transaction);
  return createForUsers({ users, type, title, message, entityType, entityId, transaction });
};

const notifyLowStock = async (item, transaction) => notifyPermission({
  permissionKey: 'items.view',
  type: 'low_stock',
  title: `Low stock: ${item.name}`,
  message: `${item.name} is at or below minimum stock.`,
  entityType: 'items',
  entityId: item.id,
  transaction
});

const listForUser = async (userId, query = {}) => {
  const where = { user_id: userId };
  if (query.unread === 'true') where.read_at = null;
  return Notification.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit: Math.min(Number(query.limit || 50), 100),
    offset: Math.max(Number(query.page || 1) - 1, 0) * Math.min(Number(query.limit || 50), 100)
  });
};

const markRead = async (userId, id) => {
  const notification = await Notification.findOne({ where: { id, user_id: userId } });
  if (!notification) return null;
  await notification.update({ read_at: notification.read_at || new Date() });
  return notification;
};

const markAllRead = async (userId) => Notification.update({ read_at: new Date() }, { where: { user_id: userId, read_at: null } });

module.exports = {
  usersWithPermission,
  createForUsers,
  notifyPermission,
  notifyLowStock,
  listForUser,
  markRead,
  markAllRead
};
