'use strict';

const { permissions, defaultRolePermissions } = require('../config/permissions');

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('permissions', permissions.map((permission) => ({
      permission_key: permission.key,
      module: permission.module,
      feature: permission.feature,
      description: permission.description
    })), { ignoreDuplicates: true });

    const [roleRows] = await queryInterface.sequelize.query('SELECT id, code FROM roles');
    const [permissionRows] = await queryInterface.sequelize.query('SELECT id, permission_key FROM permissions');
    const rolesByCode = Object.fromEntries(roleRows.map((role) => [role.code, role.id]));
    const permissionsByKey = Object.fromEntries(permissionRows.map((permission) => [permission.permission_key, permission.id]));
    const rolePermissions = [];

    Object.entries(defaultRolePermissions).forEach(([roleCode, keys]) => {
      const roleId = rolesByCode[roleCode];
      if (!roleId) return;
      keys.forEach((key) => {
        const permissionId = permissionsByKey[key];
        if (permissionId) rolePermissions.push({ role_id: roleId, permission_id: permissionId });
      });
    });

    if (rolePermissions.length) {
      await queryInterface.bulkInsert('role_permissions', rolePermissions, { ignoreDuplicates: true });
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE rp FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE p.permission_key IN ('categories.archive', 'suppliers.archive')
    `);
    await queryInterface.sequelize.query(`
      DELETE FROM permissions
      WHERE permission_key IN ('categories.archive', 'suppliers.archive')
    `);
  }
};
