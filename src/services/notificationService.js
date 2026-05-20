const { Op } = require('sequelize');
const { sequelize, Notification } = require('../models');

// Optimized: single query with JOINs instead of 3-4 sequential queries
const usersWithPermission = async (permissionKey, transaction) => {
  const users = await sequelize.query(
    `SELECT DISTINCT u.id, u.full_name, u.email FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON ur.role_id = r.id
     LEFT JOIN role_permissions rp ON r.id = rp.role_id
     LEFT JOIN permissions p ON rp.permission_id = p.id
     WHERE u.status = 'active' AND (r.code = 'admin' OR p.permission_key = :permissionKey)`,
    { replacements: { permissionKey }, transaction, type: sequelize.QueryTypes.SELECT }
  );
  return users || [];
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
