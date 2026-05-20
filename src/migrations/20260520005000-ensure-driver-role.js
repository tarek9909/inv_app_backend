'use strict';

const { defaultRolePermissions, permissions } = require('../config/permissions');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // Ensure the driver role exists
    const [roles] = await queryInterface.sequelize.query(
      `SELECT id FROM roles WHERE code = 'driver' LIMIT 1`
    );
    let driverRoleId;
    if (!roles.length) {
      await queryInterface.bulkInsert('roles', [{
        name: 'Driver',
        code: 'driver',
        description: 'Driver with portal access to view orders and confirm receipts',
        created_at: new Date(),
        updated_at: new Date()
      }]);
      const [inserted] = await queryInterface.sequelize.query(
        `SELECT id FROM roles WHERE code = 'driver' LIMIT 1`
      );
      driverRoleId = inserted[0]?.id;
    } else {
      driverRoleId = roles[0].id;
    }

    if (!driverRoleId) return;

    // Ensure driver permissions are assigned
    const driverPermKeys = defaultRolePermissions.driver || [];
    if (!driverPermKeys.length) return;

    const [permRows] = await queryInterface.sequelize.query(
      `SELECT id, permission_key FROM permissions WHERE permission_key IN (${driverPermKeys.map((k) => `'${k}'`).join(',')})`
    );

    const [existingRp] = await queryInterface.sequelize.query(
      `SELECT permission_id FROM role_permissions WHERE role_id = ${driverRoleId}`
    );
    const existingPermIds = new Set(existingRp.map((r) => r.permission_id));

    const toInsert = permRows
      .filter((p) => !existingPermIds.has(p.id))
      .map((p) => ({ role_id: driverRoleId, permission_id: p.id, created_at: new Date() }));

    if (toInsert.length) {
      await queryInterface.bulkInsert('role_permissions', toInsert);
    }
  },

  async down() {
    // Don't remove the role on down - it may have users assigned
  }
};
