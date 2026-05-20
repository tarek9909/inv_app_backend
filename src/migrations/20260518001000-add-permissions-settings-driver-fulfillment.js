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
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        permission_key VARCHAR(120) NOT NULL UNIQUE,
        module VARCHAR(100) NOT NULL,
        feature VARCHAR(100) NOT NULL,
        description TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        role_id BIGINT UNSIGNED NOT NULL,
        permission_id BIGINT UNSIGNED NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_role_permission (role_id, permission_id),
        CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(120) NOT NULL UNIQUE,
        setting_value LONGTEXT NULL,
        value_type VARCHAR(50) DEFAULT 'string',
        updated_by BIGINT UNSIGNED NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL,
        CONSTRAINT fk_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS driver_user_links (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        driver_id BIGINT UNSIGNED NOT NULL UNIQUE,
        user_id BIGINT UNSIGNED NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_driver_user_links_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_driver_user_links_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS stock_request_prints (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        stock_request_id BIGINT UNSIGNED NOT NULL,
        printed_by BIGINT UNSIGNED NULL,
        printer_name VARCHAR(255) NULL,
        qz_version VARCHAR(100) NULL,
        status ENUM('success', 'failed') NOT NULL,
        error_message TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_stock_request_prints_request FOREIGN KEY (stock_request_id) REFERENCES stock_requests(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_stock_request_prints_user FOREIGN KEY (printed_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    await queryInterface.bulkInsert('permissions', permissions.map((permission) => ({
      permission_key: permission.key,
      module: permission.module,
      feature: permission.feature,
      description: permission.description
    })), { ignoreDuplicates: true });

    const now = new Date();
    await queryInterface.bulkInsert('roles', [
      { id: 4, name: 'Driver', code: 'driver', description: 'Can access the driver portal', created_at: now, updated_at: now }
    ], { ignoreDuplicates: true });

    await queryInterface.bulkInsert('settings', [
      { setting_key: 'accepted_request_fulfillment_mode', setting_value: 'both', value_type: 'string', created_at: now, updated_at: now },
      { setting_key: 'qz_tray_enabled', setting_value: 'true', value_type: 'boolean', created_at: now, updated_at: now },
      { setting_key: 'qz_default_printer', setting_value: '', value_type: 'string', created_at: now, updated_at: now }
    ], { ignoreDuplicates: true });

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
    if (await tableExists(queryInterface, 'stock_request_prints')) await queryInterface.dropTable('stock_request_prints');
    if (await tableExists(queryInterface, 'driver_user_links')) await queryInterface.dropTable('driver_user_links');
    if (await tableExists(queryInterface, 'settings')) await queryInterface.dropTable('settings');
    if (await tableExists(queryInterface, 'role_permissions')) await queryInterface.dropTable('role_permissions');
    if (await tableExists(queryInterface, 'permissions')) await queryInterface.dropTable('permissions');
  }
};
