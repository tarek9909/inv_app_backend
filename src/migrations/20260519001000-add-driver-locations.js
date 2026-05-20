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
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL UNIQUE,
        description TEXT NULL,
        status ENUM('active', 'inactive') DEFAULT 'active',
        created_by BIGINT UNSIGNED NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL,
        CONSTRAINT fk_locations_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    if (!(await columnExists(queryInterface, 'drivers', 'current_location_id'))) {
      await queryInterface.addColumn('drivers', 'current_location_id', {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: 'locations', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      });
    }

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS driver_location_assignments (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        driver_id BIGINT UNSIGNED NOT NULL,
        location_id BIGINT UNSIGNED NOT NULL,
        assigned_from DATETIME NOT NULL,
        assigned_until DATETIME NULL,
        assigned_by BIGINT UNSIGNED NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL,
        INDEX idx_driver_location_current (driver_id, assigned_until),
        CONSTRAINT fk_dla_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_dla_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_dla_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
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
    if (await tableExists(queryInterface, 'driver_location_assignments')) {
      await queryInterface.dropTable('driver_location_assignments');
    }
    if (await columnExists(queryInterface, 'drivers', 'current_location_id')) {
      await queryInterface.removeColumn('drivers', 'current_location_id');
    }
    if (await tableExists(queryInterface, 'locations')) {
      await queryInterface.dropTable('locations');
    }
  }
};
