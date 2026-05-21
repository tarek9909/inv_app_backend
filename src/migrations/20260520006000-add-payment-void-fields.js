'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('payments');

    if (!table.voided_at) {
      await queryInterface.addColumn('payments', 'voided_at', { type: Sequelize.DATE, allowNull: true });
    }
    if (!table.voided_by) {
      await queryInterface.addColumn('payments', 'voided_by', { type: Sequelize.BIGINT.UNSIGNED, allowNull: true });
    }
    if (!table.void_reason) {
      await queryInterface.addColumn('payments', 'void_reason', { type: Sequelize.TEXT, allowNull: true });
    }
    if (!table.voided_by_payment_id) {
      await queryInterface.addColumn('payments', 'voided_by_payment_id', { type: Sequelize.BIGINT.UNSIGNED, allowNull: true });
    }
    if (!table.is_void) {
      await queryInterface.addColumn('payments', 'is_void', { type: Sequelize.BOOLEAN, defaultValue: false });
    }

    // Allow negative amounts for void/refund payments (drop any positive-only check if it existed)
    // MySQL doesn't enforce CHECK constraints in older versions, so amount can already be negative

    await queryInterface.addIndex('payments', ['voided_at'], { name: 'idx_payments_voided_at' }).catch(() => {});
    await queryInterface.addIndex('payments', ['voided_by_payment_id'], { name: 'idx_payments_voided_by_payment_id' }).catch(() => {});

    // Insert payments.void permission if not exists
    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE permission_key = 'payments.void' LIMIT 1`
    );
    let permissionId;
    if (!existing.length) {
      await queryInterface.bulkInsert('permissions', [{
        permission_key: 'payments.void',
        module: 'Fleet',
        feature: 'Payments',
        description: 'Void or refund payments',
        created_at: new Date()
      }]);
      const [inserted] = await queryInterface.sequelize.query(
        `SELECT id FROM permissions WHERE permission_key = 'payments.void' LIMIT 1`
      );
      permissionId = inserted[0]?.id;
    } else {
      permissionId = existing[0].id;
    }

    if (permissionId) {
      // Grant to admin and accountant roles
      const [roles] = await queryInterface.sequelize.query(
        `SELECT id, code FROM roles WHERE code IN ('admin', 'accountant')`
      );
      for (const role of roles) {
        const [exists] = await queryInterface.sequelize.query(
          `SELECT id FROM role_permissions WHERE role_id = ${role.id} AND permission_id = ${permissionId} LIMIT 1`
        );
        if (!exists.length) {
          await queryInterface.bulkInsert('role_permissions', [{
            role_id: role.id,
            permission_id: permissionId,
            created_at: new Date()
          }]);
        }
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('payments', 'idx_payments_voided_at').catch(() => {});
    await queryInterface.removeIndex('payments', 'idx_payments_voided_by_payment_id').catch(() => {});
    await queryInterface.removeColumn('payments', 'voided_at').catch(() => {});
    await queryInterface.removeColumn('payments', 'voided_by').catch(() => {});
    await queryInterface.removeColumn('payments', 'void_reason').catch(() => {});
    await queryInterface.removeColumn('payments', 'voided_by_payment_id').catch(() => {});
    await queryInterface.removeColumn('payments', 'is_void').catch(() => {});
  }
};
