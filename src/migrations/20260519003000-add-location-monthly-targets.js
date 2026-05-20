'use strict';

const { permissions, defaultRolePermissions } = require('../config/permissions');

const tableExists = async (queryInterface, table) => {
  try {
    await queryInterface.describeTable(table);
    return true;
  } catch {
    return false;
  }
};

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS location_monthly_targets (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        location_id BIGINT UNSIGNED NOT NULL,
        target_month CHAR(7) NOT NULL,
        target_mode ENUM('location_total', 'per_driver') NOT NULL DEFAULT 'location_total',
        target_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        status ENUM('active', 'inactive') DEFAULT 'active',
        created_by BIGINT UNSIGNED NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL,
        UNIQUE KEY uq_location_monthly_target (location_id, target_month),
        INDEX idx_location_monthly_targets_lookup (target_month, status),
        CONSTRAINT fk_lmt_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_lmt_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

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
    if (await tableExists(queryInterface, 'location_monthly_targets')) {
      await queryInterface.dropTable('location_monthly_targets');
    }
  }
};
