'use strict';

const ignoreDuplicate = async (queryInterface, action) => {
  try {
    await action();
  } catch (error) {
    const code = error?.parent?.code || error?.original?.code;
    if (!['ER_DUP_FIELDNAME', 'ER_TABLE_EXISTS_ERROR', '42S01', '42S21'].includes(code) && !/already exists|duplicate column/i.test(error?.message || '')) {
      throw error;
    }
  }
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await ignoreDuplicate(queryInterface, () => queryInterface.addColumn('users', 'must_change_password', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }));
    await ignoreDuplicate(queryInterface, () => queryInterface.addColumn('items', 'barcode', {
      type: Sequelize.STRING(150),
      allowNull: true,
      unique: true
    }));
    await ignoreDuplicate(queryInterface, () => queryInterface.addColumn('items', 'track_batches', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }));
    await ignoreDuplicate(queryInterface, () => queryInterface.addColumn('stock_entries', 'batch_number', Sequelize.STRING(100)));
    await ignoreDuplicate(queryInterface, () => queryInterface.addColumn('stock_entries', 'expiry_date', Sequelize.DATEONLY));
    await ignoreDuplicate(queryInterface, () => queryInterface.addColumn('stock_movements', 'batch_id', Sequelize.BIGINT.UNSIGNED));

    await ignoreDuplicate(queryInterface, () => queryInterface.createTable('stock_reservations', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      stock_request_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      stock_request_item_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      item_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      quantity: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      status: { type: Sequelize.ENUM('active', 'released', 'consumed'), allowNull: false, defaultValue: 'active' },
      created_by: Sequelize.BIGINT.UNSIGNED,
      released_at: Sequelize.DATE,
      consumed_at: Sequelize.DATE,
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE
    }));

    await ignoreDuplicate(queryInterface, () => queryInterface.createTable('inventory_batches', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      item_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      supplier_id: Sequelize.BIGINT.UNSIGNED,
      purchase_order_item_id: Sequelize.BIGINT.UNSIGNED,
      batch_number: Sequelize.STRING(100),
      expiry_date: Sequelize.DATEONLY,
      quantity_received: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      quantity_remaining: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      unit_cost: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      status: { type: Sequelize.ENUM('valid', 'expiring_soon', 'expired', 'depleted'), allowNull: false, defaultValue: 'valid' },
      created_by: Sequelize.BIGINT.UNSIGNED,
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE
    }));

    await ignoreDuplicate(queryInterface, () => queryInterface.createTable('stock_movement_batches', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      stock_movement_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      batch_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      quantity: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      created_at: Sequelize.DATE
    }));

    await ignoreDuplicate(queryInterface, () => queryInterface.createTable('notifications', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      user_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      type: { type: Sequelize.STRING(80), allowNull: false },
      title: { type: Sequelize.STRING(180), allowNull: false },
      message: Sequelize.TEXT,
      entity_type: Sequelize.STRING(100),
      entity_id: Sequelize.BIGINT.UNSIGNED,
      read_at: Sequelize.DATE,
      created_at: Sequelize.DATE
    }));

    await ignoreDuplicate(queryInterface, () => queryInterface.createTable('attachments', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      entity_type: { type: Sequelize.STRING(100), allowNull: false },
      entity_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      file_name: { type: Sequelize.STRING(255), allowNull: false },
      mime_type: { type: Sequelize.STRING(150), allowNull: false },
      size: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      storage_path: { type: Sequelize.STRING(500), allowNull: false },
      uploaded_by: Sequelize.BIGINT.UNSIGNED,
      created_at: Sequelize.DATE
    }));

    await ignoreDuplicate(queryInterface, () => queryInterface.createTable('password_reset_tokens', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      user_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      token_hash: { type: Sequelize.STRING(255), allowNull: false },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      used_at: Sequelize.DATE,
      created_at: Sequelize.DATE
    }));

    await ignoreDuplicate(queryInterface, () => queryInterface.createTable('login_events', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      user_id: Sequelize.BIGINT.UNSIGNED,
      email: Sequelize.STRING(150),
      event_type: { type: Sequelize.ENUM('success', 'failed', 'password_changed', 'admin_reset_password'), allowNull: false },
      ip_address: Sequelize.STRING(100),
      user_agent: Sequelize.TEXT,
      created_at: Sequelize.DATE
    }));

    await queryInterface.bulkInsert('permissions', [
      { permission_key: 'notifications.view', module: 'Notifications', feature: 'Notifications', description: 'View in-app notifications' },
      { permission_key: 'attachments.manage', module: 'Attachments', feature: 'Files', description: 'Upload and manage record attachments' },
      { permission_key: 'users.reset_password', module: 'Team', feature: 'Users', description: 'Reset user passwords' }
    ], { ignoreDuplicates: true });

    const [roleRows] = await queryInterface.sequelize.query('SELECT id, code FROM roles');
    const [permissionRows] = await queryInterface.sequelize.query("SELECT id, permission_key FROM permissions WHERE permission_key IN ('notifications.view', 'attachments.manage', 'users.reset_password')");
    const rolesByCode = Object.fromEntries(roleRows.map((role) => [role.code, role.id]));
    const permissionsByKey = Object.fromEntries(permissionRows.map((permission) => [permission.permission_key, permission.id]));
    const grants = [
      ['admin', 'notifications.view'],
      ['admin', 'attachments.manage'],
      ['admin', 'users.reset_password'],
      ['inventory', 'notifications.view'],
      ['inventory', 'attachments.manage'],
      ['accountant', 'notifications.view'],
      ['accountant', 'attachments.manage'],
      ['driver', 'notifications.view']
    ].map(([roleCode, key]) => ({
      role_id: rolesByCode[roleCode],
      permission_id: permissionsByKey[key]
    })).filter((row) => row.role_id && row.permission_id);
    if (grants.length) await queryInterface.bulkInsert('role_permissions', grants, { ignoreDuplicates: true });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('login_events');
    await queryInterface.dropTable('password_reset_tokens');
    await queryInterface.dropTable('attachments');
    await queryInterface.dropTable('notifications');
    await queryInterface.dropTable('stock_movement_batches');
    await queryInterface.dropTable('inventory_batches');
    await queryInterface.dropTable('stock_reservations');
    await queryInterface.removeColumn('stock_movements', 'batch_id');
    await queryInterface.removeColumn('stock_entries', 'expiry_date');
    await queryInterface.removeColumn('stock_entries', 'batch_number');
    await queryInterface.removeColumn('items', 'track_batches');
    await queryInterface.removeColumn('items', 'barcode');
    await queryInterface.removeColumn('users', 'must_change_password');
  }
};
