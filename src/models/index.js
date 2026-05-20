const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const commonTimestamps = {
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
};

const Role = sequelize.define('roles', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  description: DataTypes.TEXT,
  ...commonTimestamps
}, { tableName: 'roles', timestamps: false });

const User = sequelize.define('users', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  full_name: { type: DataTypes.STRING(150), allowNull: false },
  email: { type: DataTypes.STRING(150), allowNull: false, unique: true },
  phone: DataTypes.STRING(50),
  password: { type: DataTypes.STRING(255), allowNull: false },
  status: { type: DataTypes.ENUM('active', 'inactive', 'blocked'), defaultValue: 'active' },
  must_change_password: { type: DataTypes.BOOLEAN, defaultValue: false },
  last_login_at: DataTypes.DATE,
  ...commonTimestamps
}, {
  tableName: 'users',
  timestamps: false,
  defaultScope: { attributes: { exclude: ['password'] } },
  scopes: { withPassword: { attributes: {} } }
});

const Permission = sequelize.define('permissions', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  permission_key: { type: DataTypes.STRING(120), allowNull: false, unique: true },
  module: { type: DataTypes.STRING(100), allowNull: false },
  feature: { type: DataTypes.STRING(100), allowNull: false },
  description: DataTypes.TEXT,
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'permissions', timestamps: false });

const RolePermission = sequelize.define('role_permissions', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  role_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  permission_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'role_permissions', timestamps: false });

const UserRole = sequelize.define('user_roles', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  role_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'user_roles', timestamps: false });

const Setting = sequelize.define('settings', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  setting_key: { type: DataTypes.STRING(120), allowNull: false, unique: true },
  setting_value: DataTypes.TEXT('long'),
  value_type: { type: DataTypes.STRING(50), defaultValue: 'string' },
  updated_by: DataTypes.BIGINT.UNSIGNED,
  ...commonTimestamps
}, { tableName: 'settings', timestamps: false });

const Supplier = sequelize.define('suppliers', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(150), allowNull: false },
  phone: DataTypes.STRING(50),
  email: DataTypes.STRING(150),
  address: DataTypes.TEXT,
  notes: DataTypes.TEXT,
  status: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' },
  created_by: DataTypes.BIGINT.UNSIGNED,
  ...commonTimestamps
}, { tableName: 'suppliers', timestamps: false });

const ItemCategory = sequelize.define('item_categories', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(150), allowNull: false },
  description: DataTypes.TEXT,
  status: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' },
  ...commonTimestamps
}, { tableName: 'item_categories', timestamps: false });

const Item = sequelize.define('items', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  category_id: DataTypes.BIGINT.UNSIGNED,
  supplier_id: DataTypes.BIGINT.UNSIGNED,
  name: { type: DataTypes.STRING(150), allowNull: false },
  sku: { type: DataTypes.STRING(100), unique: true },
  barcode: { type: DataTypes.STRING(150), unique: true },
  description: DataTypes.TEXT,
  unit: { type: DataTypes.STRING(50), defaultValue: 'piece' },
  size_value: DataTypes.DECIMAL(12, 3),
  size_unit: DataTypes.STRING(20),
  is_carton: { type: DataTypes.BOOLEAN, defaultValue: false },
  carton_item_id: DataTypes.BIGINT.UNSIGNED,
  carton_quantity: DataTypes.DECIMAL(12, 3),
  purchase_price: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  selling_price: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  current_stock: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  minimum_stock: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  track_batches: { type: DataTypes.BOOLEAN, defaultValue: false },
  status: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' },
  created_by: DataTypes.BIGINT.UNSIGNED,
  ...commonTimestamps
}, { tableName: 'items', timestamps: false });

const StockEntry = sequelize.define('stock_entries', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  item_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  supplier_id: DataTypes.BIGINT.UNSIGNED,
  quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  base_quantity: DataTypes.DECIMAL(12, 2),
  batch_number: DataTypes.STRING(100),
  expiry_date: DataTypes.DATEONLY,
  unit_cost: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  total_cost: { type: DataTypes.VIRTUAL, get() { return Number(this.quantity || 0) * Number(this.unit_cost || 0); } },
  entry_date: { type: DataTypes.DATEONLY, allowNull: false },
  notes: DataTypes.TEXT,
  created_by: DataTypes.BIGINT.UNSIGNED,
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'stock_entries', timestamps: false });

const StockMovement = sequelize.define('stock_movements', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  item_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  movement_type: {
    type: DataTypes.ENUM('stock_in', 'stock_out', 'adjustment_in', 'adjustment_out', 'purchase_received', 'driver_request', 'driver_return', 'cancelled_request'),
    allowNull: false
  },
  reference_type: DataTypes.STRING(100),
  reference_id: DataTypes.BIGINT.UNSIGNED,
  quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  entered_quantity: DataTypes.DECIMAL(12, 2),
  entered_unit_label: DataTypes.STRING(100),
  base_quantity: DataTypes.DECIMAL(12, 2),
  batch_id: DataTypes.BIGINT.UNSIGNED,
  stock_before: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  stock_after: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  notes: DataTypes.TEXT,
  created_by: DataTypes.BIGINT.UNSIGNED,
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'stock_movements', timestamps: false });

const StockReservation = sequelize.define('stock_reservations', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  stock_request_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  stock_request_item_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  item_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  status: { type: DataTypes.ENUM('active', 'released', 'consumed'), defaultValue: 'active' },
  created_by: DataTypes.BIGINT.UNSIGNED,
  released_at: DataTypes.DATE,
  consumed_at: DataTypes.DATE,
  ...commonTimestamps
}, { tableName: 'stock_reservations', timestamps: false });

const InventoryBatch = sequelize.define('inventory_batches', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  item_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  supplier_id: DataTypes.BIGINT.UNSIGNED,
  purchase_order_item_id: DataTypes.BIGINT.UNSIGNED,
  batch_number: DataTypes.STRING(100),
  expiry_date: DataTypes.DATEONLY,
  quantity_received: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  quantity_remaining: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  unit_cost: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  status: { type: DataTypes.ENUM('valid', 'expiring_soon', 'expired', 'depleted'), defaultValue: 'valid' },
  created_by: DataTypes.BIGINT.UNSIGNED,
  ...commonTimestamps
}, { tableName: 'inventory_batches', timestamps: false });

const StockMovementBatch = sequelize.define('stock_movement_batches', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  stock_movement_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  batch_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'stock_movement_batches', timestamps: false });

const PurchaseOrder = sequelize.define('purchase_orders', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  po_number: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  supplier_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  order_date: { type: DataTypes.DATEONLY, allowNull: false },
  expected_delivery_date: DataTypes.DATEONLY,
  received_date: DataTypes.DATEONLY,
  status: { type: DataTypes.ENUM('draft', 'pending', 'partially_received', 'received', 'cancelled'), defaultValue: 'pending' },
  subtotal: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  discount_amount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  tax_amount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  total_amount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  notes: DataTypes.TEXT,
  created_by: DataTypes.BIGINT.UNSIGNED,
  approved_by: DataTypes.BIGINT.UNSIGNED,
  ...commonTimestamps
}, { tableName: 'purchase_orders', timestamps: false });

const PurchaseOrderItem = sequelize.define('purchase_order_items', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  purchase_order_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  item_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  ordered_quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  ordered_base_quantity: DataTypes.DECIMAL(12, 2),
  received_quantity: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  received_base_quantity: DataTypes.DECIMAL(12, 2),
  unit_cost: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  total_cost: { type: DataTypes.VIRTUAL, get() { return Number(this.ordered_quantity || 0) * Number(this.unit_cost || 0); } },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'purchase_order_items', timestamps: false });

const Driver = sequelize.define('drivers', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  user_id: DataTypes.BIGINT.UNSIGNED,
  full_name: { type: DataTypes.STRING(150), allowNull: false },
  phone: DataTypes.STRING(50),
  address: DataTypes.TEXT,
  id_number: DataTypes.STRING(100),
  vehicle_type: DataTypes.STRING(100),
  vehicle_plate_number: DataTypes.STRING(100),
  monthly_salary: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  current_location_id: DataTypes.BIGINT.UNSIGNED,
  notes: DataTypes.TEXT,
  status: { type: DataTypes.ENUM('active', 'inactive', 'blocked'), defaultValue: 'active' },
  created_by: DataTypes.BIGINT.UNSIGNED,
  updated_by: DataTypes.BIGINT.UNSIGNED,
  ...commonTimestamps
}, { tableName: 'drivers', timestamps: false });

const Location = sequelize.define('locations', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(150), allowNull: false, unique: true },
  description: DataTypes.TEXT,
  status: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' },
  created_by: DataTypes.BIGINT.UNSIGNED,
  ...commonTimestamps
}, { tableName: 'locations', timestamps: false });

const DriverLocationAssignment = sequelize.define('driver_location_assignments', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  driver_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  location_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  assigned_from: { type: DataTypes.DATE, allowNull: false },
  assigned_until: DataTypes.DATE,
  assigned_by: DataTypes.BIGINT.UNSIGNED,
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: DataTypes.DATE
}, { tableName: 'driver_location_assignments', timestamps: false });

const LocationCommissionRule = sequelize.define('location_commission_rules', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  location_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  base_commission_percent: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
  target_amount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  target_bonus_percent: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
  effective_from: DataTypes.DATEONLY,
  effective_until: DataTypes.DATEONLY,
  status: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' },
  created_by: DataTypes.BIGINT.UNSIGNED,
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: DataTypes.DATE
}, { tableName: 'location_commission_rules', timestamps: false });

const LocationMonthlyTarget = sequelize.define('location_monthly_targets', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  location_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  target_month: { type: DataTypes.STRING(7), allowNull: false },
  target_mode: { type: DataTypes.ENUM('location_total', 'per_driver'), defaultValue: 'location_total' },
  target_amount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  status: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' },
  created_by: DataTypes.BIGINT.UNSIGNED,
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: DataTypes.DATE
}, { tableName: 'location_monthly_targets', timestamps: false });

const StockRequest = sequelize.define('stock_requests', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  request_number: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  driver_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  request_date: { type: DataTypes.DATEONLY, allowNull: false },
  request_type: { type: DataTypes.ENUM('stock_out', 'stock_return'), defaultValue: 'stock_out' },
  request_status: { type: DataTypes.ENUM('draft', 'pending', 'approved', 'completed', 'cancelled'), defaultValue: 'pending' },
  payment_status: { type: DataTypes.ENUM('pending', 'partially_paid', 'paid', 'cancelled'), defaultValue: 'pending' },
  subtotal: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  discount_amount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  total_amount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  paid_amount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  remaining_amount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  notes: DataTypes.TEXT,
  created_by: DataTypes.BIGINT.UNSIGNED,
  approved_by: DataTypes.BIGINT.UNSIGNED,
  completed_by: DataTypes.BIGINT.UNSIGNED,
  paid_by: DataTypes.BIGINT.UNSIGNED,
  approved_at: DataTypes.DATE,
  completed_at: DataTypes.DATE,
  paid_at: DataTypes.DATE,
  driver_invoice_viewed_at: DataTypes.DATE,
  driver_received_at: DataTypes.DATE,
  driver_received_by: DataTypes.BIGINT.UNSIGNED,
  driver_receipt_notes: DataTypes.TEXT,
  commission_location_id: DataTypes.BIGINT.UNSIGNED,
  ...commonTimestamps
}, { tableName: 'stock_requests', timestamps: false });

const StockRequestItem = sequelize.define('stock_request_items', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  stock_request_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  item_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  base_quantity: DataTypes.DECIMAL(12, 2),
  unit_price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  total_price: { type: DataTypes.VIRTUAL, get() { return Number(this.quantity || 0) * Number(this.unit_price || 0); } },
  notes: DataTypes.TEXT,
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'stock_request_items', timestamps: false });

const StockRequestItemConfirmation = sequelize.define('stock_request_item_confirmations', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  stock_request_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  stock_request_item_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  confirmed: { type: DataTypes.BOOLEAN, defaultValue: false },
  confirmed_quantity: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  confirmed_at: DataTypes.DATE,
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: DataTypes.DATE
}, { tableName: 'stock_request_item_confirmations', timestamps: false });

const Payment = sequelize.define('payments', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  stock_request_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  driver_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  payment_number: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  payment_method: { type: DataTypes.ENUM('cash', 'bank_transfer', 'other'), defaultValue: 'cash' },
  payment_date: { type: DataTypes.DATE, allowNull: false },
  notes: DataTypes.TEXT,
  received_by: DataTypes.BIGINT.UNSIGNED,
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'payments', timestamps: false });

const StockRequestPrint = sequelize.define('stock_request_prints', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  stock_request_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  printed_by: DataTypes.BIGINT.UNSIGNED,
  printer_name: DataTypes.STRING(255),
  qz_version: DataTypes.STRING(100),
  status: { type: DataTypes.ENUM('success', 'failed'), allowNull: false },
  error_message: DataTypes.TEXT,
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'stock_request_prints', timestamps: false });

const Notification = sequelize.define('notifications', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  type: { type: DataTypes.STRING(80), allowNull: false },
  title: { type: DataTypes.STRING(180), allowNull: false },
  message: DataTypes.TEXT,
  entity_type: DataTypes.STRING(100),
  entity_id: DataTypes.BIGINT.UNSIGNED,
  read_at: DataTypes.DATE,
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'notifications', timestamps: false });

const Attachment = sequelize.define('attachments', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  entity_type: { type: DataTypes.STRING(100), allowNull: false },
  entity_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  file_name: { type: DataTypes.STRING(255), allowNull: false },
  mime_type: { type: DataTypes.STRING(150), allowNull: false },
  size: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  storage_path: { type: DataTypes.STRING(500), allowNull: false },
  uploaded_by: DataTypes.BIGINT.UNSIGNED,
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'attachments', timestamps: false });

const PasswordResetToken = sequelize.define('password_reset_tokens', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  token_hash: { type: DataTypes.STRING(255), allowNull: false },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  used_at: DataTypes.DATE,
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'password_reset_tokens', timestamps: false });

const LoginEvent = sequelize.define('login_events', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  user_id: DataTypes.BIGINT.UNSIGNED,
  email: DataTypes.STRING(150),
  event_type: { type: DataTypes.ENUM('success', 'failed', 'password_changed', 'admin_reset_password'), allowNull: false },
  ip_address: DataTypes.STRING(100),
  user_agent: DataTypes.TEXT,
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'login_events', timestamps: false });

const AuditLog = sequelize.define('audit_logs', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  user_id: DataTypes.BIGINT.UNSIGNED,
  action: { type: DataTypes.STRING(150), allowNull: false },
  module: { type: DataTypes.STRING(100), allowNull: false },
  record_id: DataTypes.BIGINT.UNSIGNED,
  old_data: {
    type: DataTypes.TEXT('long'),
    get() {
      const value = this.getDataValue('old_data');
      if (!value) return null;
      try { return JSON.parse(value); } catch { return value; }
    }
  },
  new_data: {
    type: DataTypes.TEXT('long'),
    get() {
      const value = this.getDataValue('new_data');
      if (!value) return null;
      try { return JSON.parse(value); } catch { return value; }
    }
  },
  ip_address: DataTypes.STRING(100),
  user_agent: DataTypes.TEXT,
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'audit_logs', timestamps: false });

User.hasOne(UserRole, { foreignKey: 'user_id', as: 'user_role' });
UserRole.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Role.hasMany(UserRole, { foreignKey: 'role_id', as: 'user_roles' });
UserRole.belongsTo(Role, { foreignKey: 'role_id', as: 'role' });
Role.belongsToMany(Permission, { through: RolePermission, foreignKey: 'role_id', otherKey: 'permission_id', as: 'permissions' });
Permission.belongsToMany(Role, { through: RolePermission, foreignKey: 'permission_id', otherKey: 'role_id', as: 'roles' });
Role.hasMany(RolePermission, { foreignKey: 'role_id', as: 'role_permissions' });
Permission.hasMany(RolePermission, { foreignKey: 'permission_id', as: 'role_permissions' });
RolePermission.belongsTo(Role, { foreignKey: 'role_id', as: 'role' });
RolePermission.belongsTo(Permission, { foreignKey: 'permission_id', as: 'permission' });

Supplier.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
ItemCategory.hasMany(Item, { foreignKey: 'category_id', as: 'items' });
Item.belongsTo(ItemCategory, { foreignKey: 'category_id', as: 'category' });
Supplier.hasMany(Item, { foreignKey: 'supplier_id', as: 'items' });
Item.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });
Item.belongsTo(Item, { foreignKey: 'carton_item_id', as: 'carton_item' });
Item.hasMany(Item, { foreignKey: 'carton_item_id', as: 'carton_items' });

Item.hasMany(StockEntry, { foreignKey: 'item_id', as: 'stock_entries' });
StockEntry.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
Supplier.hasMany(StockEntry, { foreignKey: 'supplier_id', as: 'stock_entries' });
StockEntry.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });

Item.hasMany(StockMovement, { foreignKey: 'item_id', as: 'stock_movements' });
StockMovement.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
Item.hasMany(StockReservation, { foreignKey: 'item_id', as: 'stock_reservations' });
StockReservation.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
StockReservation.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
Item.hasMany(InventoryBatch, { foreignKey: 'item_id', as: 'inventory_batches' });
InventoryBatch.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
InventoryBatch.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });
StockMovement.belongsTo(InventoryBatch, { foreignKey: 'batch_id', as: 'batch' });
InventoryBatch.hasMany(StockMovementBatch, { foreignKey: 'batch_id', as: 'movement_links' });
StockMovement.hasMany(StockMovementBatch, { foreignKey: 'stock_movement_id', as: 'batch_links' });
StockMovementBatch.belongsTo(InventoryBatch, { foreignKey: 'batch_id', as: 'batch' });
StockMovementBatch.belongsTo(StockMovement, { foreignKey: 'stock_movement_id', as: 'stock_movement' });

Supplier.hasMany(PurchaseOrder, { foreignKey: 'supplier_id', as: 'purchase_orders' });
PurchaseOrder.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });
PurchaseOrder.hasMany(PurchaseOrderItem, { foreignKey: 'purchase_order_id', as: 'items' });
PurchaseOrderItem.belongsTo(PurchaseOrder, { foreignKey: 'purchase_order_id', as: 'purchase_order' });
PurchaseOrderItem.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
PurchaseOrderItem.hasMany(InventoryBatch, { foreignKey: 'purchase_order_item_id', as: 'batches' });
InventoryBatch.belongsTo(PurchaseOrderItem, { foreignKey: 'purchase_order_item_id', as: 'purchase_order_item' });

Driver.hasMany(StockRequest, { foreignKey: 'driver_id', as: 'stock_requests' });
StockRequest.belongsTo(Driver, { foreignKey: 'driver_id', as: 'driver' });
Driver.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasOne(Driver, { foreignKey: 'user_id', as: 'driver' });
Driver.belongsTo(Location, { foreignKey: 'current_location_id', as: 'current_location' });
Location.hasMany(Driver, { foreignKey: 'current_location_id', as: 'drivers' });
Driver.hasMany(DriverLocationAssignment, { foreignKey: 'driver_id', as: 'location_history' });
DriverLocationAssignment.belongsTo(Driver, { foreignKey: 'driver_id', as: 'driver' });
DriverLocationAssignment.belongsTo(Location, { foreignKey: 'location_id', as: 'location' });
DriverLocationAssignment.belongsTo(User, { foreignKey: 'assigned_by', as: 'assigner' });
Location.hasMany(LocationCommissionRule, { foreignKey: 'location_id', as: 'commission_rules' });
LocationCommissionRule.belongsTo(Location, { foreignKey: 'location_id', as: 'location' });
LocationCommissionRule.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
Location.hasMany(LocationMonthlyTarget, { foreignKey: 'location_id', as: 'monthly_targets' });
LocationMonthlyTarget.belongsTo(Location, { foreignKey: 'location_id', as: 'location' });
LocationMonthlyTarget.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
StockRequest.hasMany(StockRequestItem, { foreignKey: 'stock_request_id', as: 'items' });
StockRequestItem.belongsTo(StockRequest, { foreignKey: 'stock_request_id', as: 'stock_request' });
StockRequest.hasMany(StockReservation, { foreignKey: 'stock_request_id', as: 'reservations' });
StockReservation.belongsTo(StockRequest, { foreignKey: 'stock_request_id', as: 'stock_request' });
StockRequestItem.hasOne(StockReservation, { foreignKey: 'stock_request_item_id', as: 'reservation' });
StockReservation.belongsTo(StockRequestItem, { foreignKey: 'stock_request_item_id', as: 'stock_request_item' });
StockRequest.belongsTo(Location, { foreignKey: 'commission_location_id', as: 'commission_location' });
StockRequestItem.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
StockRequest.hasMany(StockRequestItemConfirmation, { foreignKey: 'stock_request_id', as: 'item_confirmations' });
StockRequestItemConfirmation.belongsTo(StockRequest, { foreignKey: 'stock_request_id', as: 'stock_request' });
StockRequestItem.hasOne(StockRequestItemConfirmation, { foreignKey: 'stock_request_item_id', as: 'confirmation' });
StockRequestItemConfirmation.belongsTo(StockRequestItem, { foreignKey: 'stock_request_item_id', as: 'stock_request_item' });

StockRequest.hasMany(Payment, { foreignKey: 'stock_request_id', as: 'payments' });
Payment.belongsTo(StockRequest, { foreignKey: 'stock_request_id', as: 'stock_request' });
Driver.hasMany(Payment, { foreignKey: 'driver_id', as: 'payments' });
Payment.belongsTo(Driver, { foreignKey: 'driver_id', as: 'driver' });

StockRequest.hasMany(StockRequestPrint, { foreignKey: 'stock_request_id', as: 'prints' });
StockRequestPrint.belongsTo(StockRequest, { foreignKey: 'stock_request_id', as: 'stock_request' });
StockRequestPrint.belongsTo(User, { foreignKey: 'printed_by', as: 'printer' });

AuditLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(Notification, { foreignKey: 'user_id', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Attachment.belongsTo(User, { foreignKey: 'uploaded_by', as: 'uploader' });
PasswordResetToken.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
LoginEvent.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

module.exports = {
  sequelize,
  Role,
  User,
  Permission,
  RolePermission,
  UserRole,
  Setting,
  Supplier,
  ItemCategory,
  Item,
  StockEntry,
  StockMovement,
  StockReservation,
  InventoryBatch,
  StockMovementBatch,
  PurchaseOrder,
  PurchaseOrderItem,
  Driver,
  Location,
  DriverLocationAssignment,
  LocationCommissionRule,
  LocationMonthlyTarget,
  StockRequest,
  StockRequestItem,
  StockRequestItemConfirmation,
  Payment,
  StockRequestPrint,
  Notification,
  Attachment,
  PasswordResetToken,
  LoginEvent,
  AuditLog
};
