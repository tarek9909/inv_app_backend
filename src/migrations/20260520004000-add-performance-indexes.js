'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // Stock requests - heavily queried in reports, dashboard, driver portal
    await queryInterface.addIndex('stock_requests', ['completed_at'], { name: 'idx_stock_requests_completed_at' }).catch(() => {});
    await queryInterface.addIndex('stock_requests', ['driver_id', 'request_status'], { name: 'idx_stock_requests_driver_status' }).catch(() => {});
    await queryInterface.addIndex('stock_requests', ['commission_location_id'], { name: 'idx_stock_requests_commission_location' }).catch(() => {});
    await queryInterface.addIndex('stock_requests', ['request_status', 'payment_status'], { name: 'idx_stock_requests_status_payment' }).catch(() => {});
    await queryInterface.addIndex('stock_requests', ['request_date'], { name: 'idx_stock_requests_request_date' }).catch(() => {});

    // Payments - range queries in reports
    await queryInterface.addIndex('payments', ['driver_id', 'payment_date'], { name: 'idx_payments_driver_date' }).catch(() => {});
    await queryInterface.addIndex('payments', ['payment_date'], { name: 'idx_payments_date' }).catch(() => {});

    // Stock reservations - subquery on every item list
    await queryInterface.addIndex('stock_reservations', ['item_id', 'status'], { name: 'idx_stock_reservations_item_status' }).catch(() => {});

    // Driver location assignments - historical member queries
    await queryInterface.addIndex('driver_location_assignments', ['location_id', 'assigned_from'], { name: 'idx_driver_loc_assign_location_from' }).catch(() => {});

    // Inventory batches - FIFO consumption
    await queryInterface.addIndex('inventory_batches', ['item_id', 'status', 'quantity_remaining'], { name: 'idx_inventory_batches_item_status_qty' }).catch(() => {});

    // Audit logs - pagination ordering
    await queryInterface.addIndex('audit_logs', ['created_at'], { name: 'idx_audit_logs_created_at' }).catch(() => {});

    // Notifications - unread queries
    await queryInterface.addIndex('notifications', ['user_id', 'read_at'], { name: 'idx_notifications_user_read' }).catch(() => {});

    // Stock request item confirmations - receipt status
    await queryInterface.addIndex('stock_request_item_confirmations', ['stock_request_item_id'], { name: 'idx_confirmations_item_id' }).catch(() => {});
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('stock_requests', 'idx_stock_requests_completed_at').catch(() => {});
    await queryInterface.removeIndex('stock_requests', 'idx_stock_requests_driver_status').catch(() => {});
    await queryInterface.removeIndex('stock_requests', 'idx_stock_requests_commission_location').catch(() => {});
    await queryInterface.removeIndex('stock_requests', 'idx_stock_requests_status_payment').catch(() => {});
    await queryInterface.removeIndex('stock_requests', 'idx_stock_requests_request_date').catch(() => {});
    await queryInterface.removeIndex('payments', 'idx_payments_driver_date').catch(() => {});
    await queryInterface.removeIndex('payments', 'idx_payments_date').catch(() => {});
    await queryInterface.removeIndex('stock_reservations', 'idx_stock_reservations_item_status').catch(() => {});
    await queryInterface.removeIndex('driver_location_assignments', 'idx_driver_loc_assign_location_from').catch(() => {});
    await queryInterface.removeIndex('inventory_batches', 'idx_inventory_batches_item_status_qty').catch(() => {});
    await queryInterface.removeIndex('audit_logs', 'idx_audit_logs_created_at').catch(() => {});
    await queryInterface.removeIndex('notifications', 'idx_notifications_user_read').catch(() => {});
    await queryInterface.removeIndex('stock_request_item_confirmations', 'idx_confirmations_item_id').catch(() => {});
  }
};
