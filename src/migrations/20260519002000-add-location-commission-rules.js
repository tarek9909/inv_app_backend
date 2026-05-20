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

const columnExists = async (queryInterface, table, column) => {
  try {
    const description = await queryInterface.describeTable(table);
    return Boolean(description[column]);
  } catch {
    return false;
  }
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await columnExists(queryInterface, 'stock_requests', 'commission_location_id'))) {
      await queryInterface.addColumn('stock_requests', 'commission_location_id', {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: 'locations', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      });
    }

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS location_commission_rules (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        location_id BIGINT UNSIGNED NOT NULL,
        base_commission_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
        target_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        target_bonus_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
        effective_from DATE NULL,
        effective_until DATE NULL,
        status ENUM('active', 'inactive') DEFAULT 'active',
        created_by BIGINT UNSIGNED NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL,
        INDEX idx_location_commission_rule_lookup (location_id, status, effective_from, effective_until),
        CONSTRAINT fk_lcr_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_lcr_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    await queryInterface.bulkInsert('settings', [
      { setting_key: 'commissions_enabled', setting_value: 'false', value_type: 'boolean', created_at: new Date(), updated_at: new Date() },
      { setting_key: 'commission_period', setting_value: 'monthly', value_type: 'string', created_at: new Date(), updated_at: new Date() },
      { setting_key: 'commission_source_status', setting_value: 'completed', value_type: 'string', created_at: new Date(), updated_at: new Date() }
    ], { ignoreDuplicates: true });

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
    if (await tableExists(queryInterface, 'location_commission_rules')) {
      await queryInterface.dropTable('location_commission_rules');
    }
    if (await columnExists(queryInterface, 'stock_requests', 'commission_location_id')) {
      await queryInterface.removeColumn('stock_requests', 'commission_location_id');
    }
  }
};
