const { Permission, Role, RolePermission, sequelize } = require('../models');
const { permissions: permissionCatalog, allPermissionKeys, defaultRolePermissions } = require('../config/permissions');

const catalogPermissionRows = () => permissionCatalog.map((permission) => ({
  permission_key: permission.key,
  module: permission.module,
  feature: permission.feature,
  description: permission.description
}));

const syncPermissionCatalog = async (options = {}) => {
  const run = async (transaction) => {
    const rows = catalogPermissionRows();
    await Permission.bulkCreate(rows, {
      updateOnDuplicate: ['module', 'feature', 'description'],
      transaction
    });

    const [roles, permissions] = await Promise.all([
      Role.findAll({ transaction }),
      Permission.findAll({ transaction })
    ]);
    const roleByCode = new Map(roles.map((role) => [role.code, role]));
    const permissionByKey = new Map(permissions.map((permission) => [permission.permission_key, permission]));

    const links = [];
    Object.entries(defaultRolePermissions).forEach(([roleCode, keys]) => {
      const role = roleByCode.get(roleCode);
      if (!role) return;
      keys.forEach((key) => {
        const permission = permissionByKey.get(key);
        if (permission) {
          links.push({ role_id: role.id, permission_id: permission.id });
        }
      });
    });

    if (links.length) {
      await RolePermission.bulkCreate(links, { ignoreDuplicates: true, transaction });
    }
    return { permissions: rows.length, rolePermissions: links.length };
  };

  return options.transaction ? run(options.transaction) : sequelize.transaction(run);
};

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

module.exports = {
  catalogPermissionRows,
  syncPermissionCatalog,
  getPermissionKeysForRole,
  attachPermissions,
  userHasPermission
};
