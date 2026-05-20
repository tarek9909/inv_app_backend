'use strict';

const isDuplicateOrExists = (error) => {
  const code = error?.parent?.code || error?.original?.code;
  return ['ER_DUP_FIELDNAME', 'ER_TABLE_EXISTS_ERROR', 'ER_DUP_KEYNAME', '42S01', '42S21'].includes(code)
    || /already exists|duplicate column|duplicate key/i.test(error?.message || '');
};

const safe = async (action) => {
  try {
    await action();
  } catch (error) {
    if (!isDuplicateOrExists(error)) throw error;
  }
};

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return tables
    .map((table) => typeof table === 'object' ? table.tableName || table.table_name || Object.values(table)[0] : table)
    .some((table) => String(table).toLowerCase() === tableName.toLowerCase());
};

const describe = async (queryInterface, tableName) => {
  if (!(await tableExists(queryInterface, tableName))) return null;
  return queryInterface.describeTable(tableName);
};

const ensureColumn = async (queryInterface, tableName, columnName, definition) => {
  const columns = await describe(queryInterface, tableName);
  if (!columns || columns[columnName]) return;
  await safe(() => queryInterface.addColumn(tableName, columnName, definition));
};

const ensureTable = async (queryInterface, tableName, definition) => {
  if (await tableExists(queryInterface, tableName)) return;
  await safe(() => queryInterface.createTable(tableName, definition));
};

const ensureIndex = async (queryInterface, tableName, fields, name) => {
  if (!(await tableExists(queryInterface, tableName))) return;
  try {
    await safe(() => queryInterface.addIndex(tableName, fields, { name }));
  } catch (error) {
    console.warn(`Skipping optional index ${name}: ${error?.parent?.sqlMessage || error.message}`);
  }
};

const ensurePermissions = async (queryInterface) => {
  if (!(await tableExists(queryInterface, 'permissions'))) return;
  await queryInterface.bulkInsert('permissions', [
    { permission_key: 'notifications.view', module: 'Notifications', feature: 'Notifications', description: 'View in-app notifications' },
    { permission_key: 'attachments.manage', module: 'Attachments', feature: 'Files', description: 'Upload and manage record attachments' },
    { permission_key: 'users.reset_password', module: 'Team', feature: 'Users', description: 'Reset user passwords' }
  ], { ignoreDuplicates: true });

  if (!(await tableExists(queryInterface, 'roles')) || !(await tableExists(queryInterface, 'role_permissions'))) return;

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
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await ensureColumn(queryInterface, 'users', 'must_change_password', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });

    await ensureColumn(queryInterface, 'items', 'barcode', {
      type: Sequelize.STRING(150),
      allowNull: true,
      unique: true
    });
    await ensureColumn(queryInterface, 'items', 'track_batches', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });

    await ensureColumn(queryInterface, 'stock_entries', 'batch_number', Sequelize.STRING(100));
    await ensureColumn(queryInterface, 'stock_entries', 'expiry_date', Sequelize.DATEONLY);
    await ensureColumn(queryInterface, 'stock_movements', 'batch_id', Sequelize.BIGINT.UNSIGNED);

    await ensureTable(queryInterface, 'stock_reservations', {
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
    });

    await ensureTable(queryInterface, 'inventory_batches', {
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
    });

    await ensureTable(queryInterface, 'stock_movement_batches', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      stock_movement_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      batch_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      quantity: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      created_at: Sequelize.DATE
    });

    await ensureTable(queryInterface, 'notifications', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      user_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      type: { type: Sequelize.STRING(80), allowNull: false },
      title: { type: Sequelize.STRING(180), allowNull: false },
      message: Sequelize.TEXT,
      entity_type: Sequelize.STRING(100),
      entity_id: Sequelize.BIGINT.UNSIGNED,
      read_at: Sequelize.DATE,
      created_at: Sequelize.DATE
    });

    await ensureTable(queryInterface, 'attachments', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      entity_type: { type: Sequelize.STRING(100), allowNull: false },
      entity_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      file_name: { type: Sequelize.STRING(255), allowNull: false },
      mime_type: { type: Sequelize.STRING(150), allowNull: false },
      size: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      storage_path: { type: Sequelize.STRING(500), allowNull: false },
      uploaded_by: Sequelize.BIGINT.UNSIGNED,
      created_at: Sequelize.DATE
    });

    await ensureTable(queryInterface, 'password_reset_tokens', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      user_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      token_hash: { type: Sequelize.STRING(255), allowNull: false },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      used_at: Sequelize.DATE,
      created_at: Sequelize.DATE
    });

    await ensureTable(queryInterface, 'login_events', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      user_id: Sequelize.BIGINT.UNSIGNED,
      email: Sequelize.STRING(150),
      event_type: { type: Sequelize.ENUM('success', 'failed', 'password_changed', 'admin_reset_password'), allowNull: false },
      ip_address: Sequelize.STRING(100),
      user_agent: Sequelize.TEXT,
      created_at: Sequelize.DATE
    });

    await ensurePermissions(queryInterface);

    if (process.env.RUNTIME_SCHEMA_INDEXES === 'true') {
      await ensureIndex(queryInterface, 'stock_reservations', ['item_id', 'status'], 'idx_stock_reservations_item_status');
      await ensureIndex(queryInterface, 'stock_reservations', ['stock_request_id', 'status'], 'idx_stock_reservations_request_status');
      await ensureIndex(queryInterface, 'stock_requests', ['request_status', 'request_type'], 'idx_stock_requests_status_type');
      await ensureIndex(queryInterface, 'stock_requests', ['driver_id', 'request_status'], 'idx_stock_requests_driver_status');
      await ensureIndex(queryInterface, 'stock_request_items', ['stock_request_id'], 'idx_stock_request_items_request');
      await ensureIndex(queryInterface, 'payments', ['driver_id', 'payment_date'], 'idx_payments_driver_date');
      await ensureIndex(queryInterface, 'items', ['status', 'category_id'], 'idx_items_status_category');
      await ensureIndex(queryInterface, 'inventory_batches', ['item_id', 'status', 'expiry_date'], 'idx_inventory_batches_item_status_expiry');
    }
  }
};
