'use strict';

const bcrypt = require('bcryptjs');

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const seedPassword = process.env.SEED_DEFAULT_PASSWORD;
    if (process.env.NODE_ENV === 'production' && !seedPassword) {
      throw new Error('SEED_DEFAULT_PASSWORD is required when seeding production');
    }
    const password = await bcrypt.hash(seedPassword || 'password123', 10);

    await queryInterface.bulkInsert('roles', [
      { id: 1, name: 'Admin', code: 'admin', description: 'Full access to the whole system', created_at: now, updated_at: now },
      { id: 2, name: 'Inventory', code: 'inventory', description: 'Can manage stock, stock movements, and purchase orders', created_at: now, updated_at: now },
      { id: 3, name: 'Accountant', code: 'accountant', description: 'Can manage drivers, stock deduction requests, and payments', created_at: now, updated_at: now },
      { id: 4, name: 'Driver', code: 'driver', description: 'Driver with portal access to view orders and confirm receipts', created_at: now, updated_at: now }
    ], { ignoreDuplicates: true });

    await queryInterface.bulkInsert('users', [
      { id: 1, full_name: 'System Admin', email: 'admin@example.com', password, status: 'active', created_at: now, updated_at: now },
      { id: 2, full_name: 'Inventory User', email: 'inventory@example.com', password, status: 'active', created_at: now, updated_at: now },
      { id: 3, full_name: 'Accountant User', email: 'accountant@example.com', password, status: 'active', created_at: now, updated_at: now },
      { id: 4, full_name: 'Ahmad Driver', email: 'driver@example.com', phone: '03000000', password, status: 'active', created_at: now, updated_at: now }
    ], { ignoreDuplicates: true });

    await queryInterface.bulkInsert('user_roles', [
      { id: 1, user_id: 1, role_id: 1, created_at: now },
      { id: 2, user_id: 2, role_id: 2, created_at: now },
      { id: 3, user_id: 3, role_id: 3, created_at: now },
      { id: 4, user_id: 4, role_id: 4, created_at: now }
    ], { ignoreDuplicates: true });

    await queryInterface.bulkInsert('item_categories', [
      { id: 1, name: 'General Items', description: 'Default category for stock items', status: 'active', created_at: now, updated_at: now },
      { id: 2, name: 'Drinks', description: 'Drink products', status: 'active', created_at: now, updated_at: now },
      { id: 3, name: 'Food', description: 'Food products', status: 'active', created_at: now, updated_at: now }
    ], { ignoreDuplicates: true });

    await queryInterface.bulkInsert('suppliers', [
      { id: 1, name: 'Default Supplier', status: 'active', created_by: 1, created_at: now, updated_at: now }
    ], { ignoreDuplicates: true });

    await queryInterface.bulkInsert('items', [
      { id: 1, category_id: 2, supplier_id: 1, name: 'Water Box', sku: 'WATER-BOX-001', description: 'Box of water bottles', unit: 'box', purchase_price: 2.00, selling_price: 3.00, current_stock: 100, minimum_stock: 10, status: 'active', created_by: 1, created_at: now, updated_at: now },
      { id: 2, category_id: 2, supplier_id: 1, name: 'Juice Box', sku: 'JUICE-BOX-001', description: 'Box of juice bottles', unit: 'box', purchase_price: 4.00, selling_price: 6.00, current_stock: 50, minimum_stock: 5, status: 'active', created_by: 1, created_at: now, updated_at: now }
    ], { ignoreDuplicates: true });

    await queryInterface.bulkInsert('drivers', [
      { id: 1, user_id: 4, full_name: 'Ahmad Driver', phone: '03000000', address: 'Lebanon', id_number: 'ID-001', vehicle_type: 'Motorcycle', vehicle_plate_number: 'PLATE-001', status: 'active', created_by: 3, created_at: now, updated_at: now }
    ], { ignoreDuplicates: true });
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('drivers', { id: [1] });
    await queryInterface.bulkDelete('items', { id: [1, 2] });
    await queryInterface.bulkDelete('suppliers', { id: [1] });
    await queryInterface.bulkDelete('item_categories', { id: [1, 2, 3] });
    await queryInterface.bulkDelete('user_roles', { user_id: [1, 2, 3, 4] });
    await queryInterface.bulkDelete('users', { id: [1, 2, 3, 4] });
    await queryInterface.bulkDelete('roles', { id: [1, 2, 3, 4] });
  }
};
