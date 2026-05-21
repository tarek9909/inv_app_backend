const Joi = require('joi');

const id = Joi.number().integer().positive();
const money = Joi.number().precision(2).min(0);
const qty = Joi.number().precision(2).greater(0);
const status = (...values) => Joi.string().valid(...values);

const pagination = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  search: Joi.string().allow('', null)
});

const reportMonthQuery = Joi.object({
  month: Joi.string().pattern(/^\d{4}-(0[1-9]|1[0-2])$/)
});

const driverReportQuery = reportMonthQuery.keys({
  driver_id: id
});

const reportQuery = Joi.object({
  format: status('json', 'csv'),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
  driver_id: id,
  location_id: id,
  item_id: id,
  category_id: id,
  status: Joi.string().max(80),
  month: Joi.string().pattern(/^\d{4}-(0[1-9]|1[0-2])$/)
});

const userListQuery = pagination.keys({
  role_code: Joi.string().max(50).pattern(/^[a-z][a-z0-9_]*$/),
  status: status('active', 'inactive', 'blocked')
});

const login = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const profileUpdate = Joi.object({
  full_name: Joi.string().max(150).required(),
  email: Joi.string().email().max(150).required(),
  phone: Joi.string().max(50).allow(null, '')
});

const passwordChange = Joi.object({
  current_password: Joi.string().required(),
  new_password: Joi.string().min(6).required()
});

const userCreate = Joi.object({
  role_id: id.required(),
  full_name: Joi.string().max(150).required(),
  email: Joi.string().email().max(150).required(),
  phone: Joi.string().max(50).allow(null, ''),
  password: Joi.string().min(6).required(),
  monthly_salary: money,
  status: status('active', 'inactive', 'blocked')
});

const userUpdate = userCreate.fork(['role_id', 'full_name', 'email', 'password'], (field) => field.optional());
const userStatus = Joi.object({ status: status('active', 'inactive', 'blocked').required() });

const roleCreate = Joi.object({
  name: Joi.string().max(100).required(),
  code: Joi.string().max(50).pattern(/^[a-z][a-z0-9_]*$/).required(),
  description: Joi.string().allow(null, '')
});

const roleUpdate = Joi.object({
  name: Joi.string().max(100),
  code: Joi.string().max(50).pattern(/^[a-z][a-z0-9_]*$/),
  description: Joi.string().allow(null, '')
}).min(1);

const rolePermissionsUpdate = Joi.object({
  permissions: Joi.array().items(Joi.string().max(120)).required()
});

const category = Joi.object({
  name: Joi.string().max(150).required(),
  description: Joi.string().allow(null, ''),
  status: status('active', 'inactive')
});
const categoryUpdate = Joi.object({
  name: Joi.string().max(150),
  description: Joi.string().allow(null, '')
}).min(1);
const categoryStatus = Joi.object({ status: status('active', 'inactive').required() });

const supplier = Joi.object({
  name: Joi.string().max(150).required(),
  phone: Joi.string().max(50).allow(null, ''),
  email: Joi.string().email().max(150).allow(null, ''),
  address: Joi.string().allow(null, ''),
  notes: Joi.string().allow(null, ''),
  status: status('active', 'inactive')
});
const supplierUpdate = Joi.object({
  name: Joi.string().max(150),
  phone: Joi.string().max(50).allow(null, ''),
  email: Joi.string().email().max(150).allow(null, ''),
  address: Joi.string().allow(null, ''),
  notes: Joi.string().allow(null, '')
}).min(1);
const supplierStatus = Joi.object({ status: status('active', 'inactive').required() });

const itemCreate = Joi.object({
  category_id: id.allow(null),
  supplier_id: id.allow(null),
  name: Joi.string().max(150).required(),
  sku: Joi.string().max(100).allow(null, ''),
  barcode: Joi.string().max(150).allow(null, ''),
  description: Joi.string().allow(null, ''),
  unit: Joi.string().max(50).default('piece'),
  size_value: Joi.number().precision(3).min(0).allow(null),
  size_unit: status('g', 'kg', 'ml', 'l', 'piece').allow(null, ''),
  is_carton: Joi.boolean().default(false),
  carton_item_id: id.allow(null),
  carton_quantity: Joi.number().precision(3).greater(0).allow(null),
  purchase_price: money.default(0),
  selling_price: money.default(0),
  minimum_stock: money.default(0),
  track_batches: Joi.boolean().default(false),
  status: status('active', 'inactive')
});

const itemUpdate = itemCreate.fork(['name'], (field) => field.optional());
const itemStatus = Joi.object({ status: status('active', 'inactive').required() });

const stockEntry = Joi.object({
  item_id: id.required(),
  supplier_id: id.allow(null),
  quantity: qty.required(),
  unit_cost: money.default(0),
  batch_number: Joi.string().max(100).allow(null, ''),
  expiry_date: Joi.date().iso().allow(null),
  entry_date: Joi.date().iso().required(),
  notes: Joi.string().allow(null, '')
});

const stockAdjustment = Joi.object({
  item_id: id.required(),
  adjustment_type: status('adjustment_in', 'adjustment_out').required(),
  quantity: qty.required(),
  notes: Joi.string().allow(null, '')
});

const purchaseOrderCreate = Joi.object({
  supplier_id: id.required(),
  order_date: Joi.date().iso().required(),
  expected_delivery_date: Joi.date().iso().allow(null),
  discount_amount: money.default(0),
  tax_amount: money.default(0),
  notes: Joi.string().allow(null, ''),
  items: Joi.array().items(Joi.object({
    item_id: id.required(),
    ordered_quantity: qty.required(),
    unit_cost: money.required()
  })).min(1).required()
});

const purchaseOrderUpdate = Joi.object({
  expected_delivery_date: Joi.date().iso().allow(null),
  discount_amount: money,
  tax_amount: money,
  notes: Joi.string().allow(null, '')
});

const receivePurchaseOrder = Joi.object({
  received_date: Joi.date().iso(),
  items: Joi.array().items(Joi.object({
    purchase_order_item_id: id.required(),
    received_quantity: qty.required(),
    batch_number: Joi.string().max(100).allow(null, ''),
    expiry_date: Joi.date().iso().allow(null)
  })).min(1).required()
});

const driverCreate = Joi.object({
  user_id: id.allow(null),
  location_id: id.allow(null),
  full_name: Joi.string().max(150).required(),
  phone: Joi.string().max(50).allow(null, ''),
  address: Joi.string().allow(null, ''),
  id_number: Joi.string().max(100).allow(null, ''),
  vehicle_type: Joi.string().max(100).allow(null, ''),
  vehicle_plate_number: Joi.string().max(100).allow(null, ''),
  monthly_salary: money.default(0),
  notes: Joi.string().allow(null, ''),
  status: status('active', 'inactive', 'blocked')
});

const driverUpdate = driverCreate.fork(['full_name'], (field) => field.optional());
const driverStatus = Joi.object({ status: status('active', 'inactive', 'blocked').required() });

const locationCreate = Joi.object({
  name: Joi.string().max(150).required(),
  description: Joi.string().allow(null, ''),
  status: status('active', 'inactive')
});
const locationUpdate = locationCreate.fork(['name'], (field) => field.optional());
const locationStatus = Joi.object({ status: status('active', 'inactive').required() });

const commissionRuleCreate = Joi.object({
  location_id: id.required(),
  base_commission_percent: Joi.number().precision(2).min(0).max(100).required(),
  target_amount: money.required(),
  target_bonus_percent: Joi.number().precision(2).min(0).max(100).required(),
  effective_from: Joi.date().iso().allow(null),
  effective_until: Joi.date().iso().allow(null),
  status: status('active', 'inactive')
});
const commissionRuleUpdate = commissionRuleCreate.fork(['location_id', 'base_commission_percent', 'target_amount', 'target_bonus_percent'], (field) => field.optional());
const commissionRuleStatus = Joi.object({ status: status('active', 'inactive').required() });

const monthlyTargetCreate = Joi.object({
  location_id: id.required(),
  target_month: Joi.string().pattern(/^\d{4}-\d{2}$/).required(),
  target_mode: status('location_total', 'per_driver').required(),
  target_amount: money.required(),
  status: status('active', 'inactive')
});
const monthlyTargetUpdate = monthlyTargetCreate.fork(['location_id', 'target_month', 'target_mode', 'target_amount'], (field) => field.optional());
const monthlyTargetStatus = Joi.object({ status: status('active', 'inactive').required() });

const stockRequestCreate = Joi.object({
  driver_id: id.required(),
  request_date: Joi.date().iso().required(),
  request_type: status('stock_out', 'stock_return').default('stock_out'),
  discount_amount: money.default(0),
  notes: Joi.string().allow(null, ''),
  items: Joi.array().items(Joi.object({
    item_id: id.required(),
    quantity: qty.required(),
    unit_price: money.required(),
    notes: Joi.string().allow(null, '')
  })).min(1).required()
});

const stockRequestUpdate = Joi.object({
  notes: Joi.string().allow(null, ''),
  request_status: status('draft', 'pending')
});

const stockRequestComplete = Joi.object({
  payment_amount: money.default(0),
  payment_method: status('cash', 'bank_transfer', 'other').default('cash'),
  payment_date: Joi.date().iso(),
  payment_notes: Joi.string().allow(null, '')
});

const paymentCreate = Joi.object({
  stock_request_id: id.required(),
  amount: qty.required(),
  payment_method: status('cash', 'bank_transfer', 'other').default('cash'),
  payment_date: Joi.date().iso().required(),
  notes: Joi.string().allow(null, '')
});

const driverReceipt = Joi.object({
  notes: Joi.string().allow(null, ''),
  items: Joi.array().items(Joi.object({
    stock_request_item_id: id.required(),
    confirmed: Joi.boolean().required(),
    confirmed_quantity: Joi.number().precision(2).min(0)
  })).min(1).required()
});

const itemLookup = Joi.object({
  code: Joi.string().max(150).required()
});

const notificationList = pagination.keys({
  unread: Joi.string().valid('true', 'false')
});

const attachmentCreate = Joi.object({
  entity_type: status('purchase_orders', 'stock_requests', 'payments', 'drivers').required(),
  entity_id: id.required(),
  file_name: Joi.string().max(255).required(),
  mime_type: Joi.string().max(150).required(),
  content_base64: Joi.string().required()
});

const attachmentList = Joi.object({
  entity_type: status('purchase_orders', 'stock_requests', 'payments', 'drivers').required(),
  entity_id: id.required()
});

const adminPasswordReset = Joi.object({
  temporary_password: Joi.string().min(6).required(),
  must_change_password: Joi.boolean().default(true)
});

module.exports = {
  pagination,
  reportMonthQuery,
  driverReportQuery,
  reportQuery,
  userListQuery,
  login,
  profileUpdate,
  passwordChange,
  userCreate,
  userUpdate,
  userStatus,
  roleCreate,
  roleUpdate,
  rolePermissionsUpdate,
  category,
  categoryUpdate,
  categoryStatus,
  supplier,
  supplierUpdate,
  supplierStatus,
  itemCreate,
  itemUpdate,
  itemStatus,
  stockEntry,
  stockAdjustment,
  purchaseOrderCreate,
  purchaseOrderUpdate,
  receivePurchaseOrder,
  driverCreate,
  driverUpdate,
  driverStatus,
  locationCreate,
  locationUpdate,
  locationStatus,
  commissionRuleCreate,
  commissionRuleUpdate,
  commissionRuleStatus,
  monthlyTargetCreate,
  monthlyTargetUpdate,
  monthlyTargetStatus,
  stockRequestCreate,
  stockRequestUpdate,
  stockRequestComplete,
  paymentCreate,
  driverReceipt,
  itemLookup,
  notificationList,
  attachmentCreate,
  attachmentList,
  adminPasswordReset
};
