const { Permission, RolePermission } = require('../models');
const { allPermissionKeys } = require('../config/permissions');

const getPermissionKeysForRole = async (role) => {
  if (!role) return [];
  if (role.code === 'admin') return allPermissionKeys;

  const rows = await RolePermission.findAll({
    where: { role_id: role.id },
    include: [{ model: Permission, as: 'permission' }]
  });
  return rows.map((row) => row.permission?.permission_key).filter(Boolean);
};

const attachPermissions = async (user) => {
  if (!user) return user;
  const role = user.role || user.getDataValue?.('role') || null;
  const permissions = await getPermissionKeysForRole(role);
  if (typeof user.setDataValue === 'function') {
    user.setDataValue('permissions', permissions);
  } else {
    user.permissions = permissions;
  }
  return user;
};

const userHasPermission = async (user, permissionKey) => {
  if (!user?.role) return false;
  if (user.role.code === 'admin') return true;
  const keys = user.permissions || user.getDataValue?.('permissions') || await getPermissionKeysForRole(user.role);
  return keys.includes(permissionKey);
};

module.exports = { getPermissionKeysForRole, attachPermissions, userHasPermission };
