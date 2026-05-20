const { Op, literal } = require('sequelize');
const {
  ItemCategory,
  Supplier,
  Item,
  StockMovement,
  PurchaseOrder,
  StockEntry,
  PurchaseOrderItem,
  StockRequestItem
} = require('../models');
const { list, findOrFail } = require('../services/crudService');
const stockService = require('../services/stockService');
const purchaseOrderService = require('../services/purchaseOrderService');
const { logAction } = require('../services/auditService');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/responses');
const HttpError = require('../utils/httpError');

const itemIncludes = [
  { model: ItemCategory, as: 'category' },
  { model: Supplier, as: 'supplier' },
  { model: Item, as: 'carton_item' }
];

const reservedStockSql = '(SELECT COALESCE(SUM(sr.quantity), 0) FROM stock_reservations sr WHERE sr.item_id = items.id AND sr.status = \'active\')';
const availabilityAttributes = {
  include: [
    [literal(reservedStockSql), 'reserved_stock'],
    [literal(`items.current_stock - ${reservedStockSql}`), 'available_stock']
  ]
};

const normalizeItemPayload = async (payload, existingItem = null) => {
  const data = { ...payload };
  data.is_carton = Boolean(data.is_carton);
  if (data.size_unit === '') data.size_unit = null;
  if (data.sku === '') data.sku = null;
  if (data.barcode === '') data.barcode = null;

  if (data.is_carton) {
    if (!data.carton_item_id) throw new HttpError(400, 'Carton item is required');
    if (!data.carton_quantity || Number(data.carton_quantity) <= 0) throw new HttpError(400, 'Carton quantity must be greater than 0');
    if (existingItem && Number(data.carton_item_id) === Number(existingItem.id)) throw new HttpError(400, 'A carton cannot contain itself');
    const contained = await Item.findByPk(data.carton_item_id);
    if (!contained || contained.is_carton) throw new HttpError(400, 'Carton must contain a regular item');
    data.unit = 'carton';
  } else {
    data.carton_item_id = null;
    data.carton_quantity = null;
  }

  return data;
};

const createCrudHandlers = (Model, module, searchFields, extra = {}) => ({
  list: asyncHandler(async (req, res) => {
    const { rows, meta } = await list(Model, req.query, { searchFields, include: extra.include || [] });
    ok(res, `${module} loaded`, rows, meta);
  }),
  create: asyncHandler(async (req, res) => {
    const data = module === 'items' ? await normalizeItemPayload(req.body) : { ...req.body };
    if ('created_by' in Model.rawAttributes) data.created_by = req.user.id;
    const row = await Model.create(data);
    if (module === 'items' && row.is_carton) {
      await stockService.syncCartonStocks({ containedItemId: row.carton_item_id });
      await row.reload();
    }
    await logAction({ req, action: 'create', module, recordId: row.id, newData: row.toJSON() });
    created(res, `${module} created`, row);
  }),
  update: asyncHandler(async (req, res) => {
    const row = await findOrFail(Model, req.params.id, { name: module });
    const oldData = row.toJSON();
    const data = module === 'items' ? await normalizeItemPayload({ ...row.toJSON(), ...req.body }, row) : { ...req.body };
    if ('current_stock' in data) delete data.current_stock;
    await row.update(data);
    if (module === 'items') {
      if (oldData.carton_item_id) await stockService.syncCartonStocks({ containedItemId: oldData.carton_item_id });
      if (row.is_carton && row.carton_item_id) await stockService.syncCartonStocks({ containedItemId: row.carton_item_id });
      await row.reload();
    }
    await logAction({ req, action: 'update', module, recordId: row.id, oldData, newData: row.toJSON() });
    ok(res, `${module} updated`, row);
  })
});

exports.categories = createCrudHandlers(ItemCategory, 'categories', ['name', 'description']);
exports.suppliers = createCrudHandlers(Supplier, 'suppliers', ['name', 'phone', 'email']);
exports.items = createCrudHandlers(Item, 'items', ['name', 'sku', 'description'], { include: itemIncludes });

exports.items.list = asyncHandler(async (req, res) => {
  const { rows, meta } = await list(Item, req.query, { searchFields: ['name', 'sku', 'barcode', 'description'], include: itemIncludes, attributes: availabilityAttributes });
  ok(res, 'items loaded', rows, meta);
});

const updateStatus = (Model, module, name) => asyncHandler(async (req, res) => {
  const row = await findOrFail(Model, req.params.id, { name });
  const oldData = row.toJSON();
  await row.update({ status: req.body.status, updated_at: new Date() });
  await logAction({ req, action: 'status', module, recordId: row.id, oldData, newData: row.toJSON() });
  ok(res, `${name} status updated`, row);
});

exports.updateCategoryStatus = updateStatus(ItemCategory, 'categories', 'Category');
exports.updateSupplierStatus = updateStatus(Supplier, 'suppliers', 'Supplier');
exports.updateItemStatus = updateStatus(Item, 'items', 'Item');

exports.lowStockItems = asyncHandler(async (req, res) => {
  const rows = await Item.findAll({
    where: {
      status: 'active',
      [Op.and]: literal(`items.current_stock - ${reservedStockSql} <= items.minimum_stock`)
    },
    attributes: availabilityAttributes,
    include: itemIncludes,
    order: [['name', 'ASC']]
  });
  ok(res, 'Low stock items loaded', rows);
});

exports.lookupItem = asyncHandler(async (req, res) => {
  const code = String(req.query.code || '').trim();
  const item = await Item.findOne({
    where: {
      status: 'active',
      [Op.or]: [{ sku: code }, { barcode: code }]
    },
    include: itemIncludes
  });
  if (!item) throw new HttpError(404, 'Item not found');
  await stockService.attachAvailability(item);
  ok(res, 'Item loaded', item);
});

exports.addStockEntry = asyncHandler(async (req, res) => {
  const entry = await stockService.addStockEntry(req.body, req);
  created(res, 'Stock entry created', entry);
});

exports.adjustStock = asyncHandler(async (req, res) => {
  const movement = await stockService.adjustStock(req.body, req);
  created(res, 'Stock adjustment created', movement);
});

exports.listStockMovements = asyncHandler(async (req, res) => {
  const { rows, meta } = await list(StockMovement, req.query, { include: [{ model: Item, as: 'item' }] });
  ok(res, 'Stock movements loaded', rows, meta);
});

exports.listBatches = asyncHandler(async (req, res) => {
  ok(res, 'Inventory batches loaded', await stockService.listBatches(req.query));
});

exports.expiryRisk = asyncHandler(async (req, res) => {
  ok(res, 'Expiry risk loaded', await stockService.expiryRisk(req.query));
});

exports.listPurchaseOrders = asyncHandler(async (req, res) => {
  const { rows, meta } = await list(PurchaseOrder, req.query, { include: purchaseOrderService.includePurchaseOrder, searchFields: ['po_number', 'status'] });
  ok(res, 'Purchase orders loaded', rows, meta);
});

exports.getPurchaseOrder = asyncHandler(async (req, res) => {
  const po = await findOrFail(PurchaseOrder, req.params.id, { name: 'Purchase order', include: purchaseOrderService.includePurchaseOrder });
  ok(res, 'Purchase order loaded', po);
});

exports.createPurchaseOrder = asyncHandler(async (req, res) => {
  const po = await purchaseOrderService.createPurchaseOrder(req.body, req);
  created(res, 'Purchase order created', po);
});

exports.updatePurchaseOrder = asyncHandler(async (req, res) => {
  const po = await findOrFail(PurchaseOrder, req.params.id, { name: 'Purchase order' });
  const oldData = po.toJSON();
  const next = { ...req.body };
  delete next.status;
  if ('discount_amount' in next || 'tax_amount' in next) {
    const discount = Number(next.discount_amount ?? po.discount_amount ?? 0);
    const tax = Number(next.tax_amount ?? po.tax_amount ?? 0);
    next.total_amount = Number(po.subtotal || 0) - discount + tax;
  }
  await po.update(next);
  await logAction({ req, action: 'update', module: 'purchase_orders', recordId: po.id, oldData, newData: po.toJSON() });
  ok(res, 'Purchase order updated', po);
});

exports.receivePurchaseOrder = asyncHandler(async (req, res) => {
  const po = await purchaseOrderService.receivePurchaseOrder(req.params.id, req.body, req);
  ok(res, 'Purchase order received', po);
});

exports.cancelPurchaseOrder = asyncHandler(async (req, res) => {
  const po = await purchaseOrderService.cancelPurchaseOrder(req.params.id, req);
  ok(res, 'Purchase order cancelled', po);
});

const ensureNoReferences = async (checks) => {
  for (const check of checks) {
    const count = await check.model.count({ where: check.where });
    if (count > 0) throw new HttpError(409, `${check.name} has related records and cannot be permanently deleted`);
  }
};

exports.deleteCategory = asyncHandler(async (req, res) => {
  const category = await findOrFail(ItemCategory, req.params.id, { name: 'Category' });
  await ensureNoReferences([{ model: Item, where: { category_id: category.id }, name: 'Category' }]);
  const oldData = category.toJSON();
  await category.destroy();
  await logAction({ req, action: 'delete', module: 'categories', recordId: category.id, oldData });
  ok(res, 'Category permanently deleted');
});

exports.deleteSupplier = asyncHandler(async (req, res) => {
  const supplier = await findOrFail(Supplier, req.params.id, { name: 'Supplier' });
  await ensureNoReferences([
    { model: Item, where: { supplier_id: supplier.id }, name: 'Supplier' },
    { model: StockEntry, where: { supplier_id: supplier.id }, name: 'Supplier' },
    { model: PurchaseOrder, where: { supplier_id: supplier.id }, name: 'Supplier' }
  ]);
  const oldData = supplier.toJSON();
  await supplier.destroy();
  await logAction({ req, action: 'delete', module: 'suppliers', recordId: supplier.id, oldData });
  ok(res, 'Supplier permanently deleted');
});

exports.deleteItem = asyncHandler(async (req, res) => {
  const item = await findOrFail(Item, req.params.id, { name: 'Item' });
  await ensureNoReferences([
    { model: StockEntry, where: { item_id: item.id }, name: 'Item' },
    { model: StockMovement, where: { item_id: item.id }, name: 'Item' },
    { model: PurchaseOrderItem, where: { item_id: item.id }, name: 'Item' },
    { model: StockRequestItem, where: { item_id: item.id }, name: 'Item' }
  ]);
  const oldData = item.toJSON();
  await item.destroy();
  await logAction({ req, action: 'delete', module: 'items', recordId: item.id, oldData });
  ok(res, 'Item permanently deleted');
});
