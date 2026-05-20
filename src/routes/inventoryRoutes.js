const router = require('express').Router();
const controller = require('../controllers/inventoryController');
const authenticate = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const schemas = require('../validators/schemas');

router.get('/categories', authenticate, requirePermission('categories.view'), validate(schemas.pagination, 'query'), controller.categories.list);
router.post('/categories', authenticate, requirePermission('categories.manage'), validate(schemas.category), controller.categories.create);
router.patch('/categories/:id/status', authenticate, requirePermission('categories.archive'), validate(schemas.categoryStatus), controller.updateCategoryStatus);
router.patch('/categories/:id', authenticate, requirePermission('categories.manage'), validate(schemas.categoryUpdate), controller.categories.update);
router.delete('/categories/:id', authenticate, requirePermission('categories.delete'), controller.deleteCategory);

router.get('/suppliers', authenticate, requirePermission('suppliers.view'), validate(schemas.pagination, 'query'), controller.suppliers.list);
router.post('/suppliers', authenticate, requirePermission('suppliers.manage'), validate(schemas.supplier), controller.suppliers.create);
router.patch('/suppliers/:id/status', authenticate, requirePermission('suppliers.archive'), validate(schemas.supplierStatus), controller.updateSupplierStatus);
router.patch('/suppliers/:id', authenticate, requirePermission('suppliers.manage'), validate(schemas.supplierUpdate), controller.suppliers.update);
router.delete('/suppliers/:id', authenticate, requirePermission('suppliers.delete'), controller.deleteSupplier);

router.get('/items/low-stock', authenticate, requirePermission('items.view'), controller.lowStockItems);
router.get('/items/lookup', authenticate, requirePermission('items.view'), validate(schemas.itemLookup, 'query'), controller.lookupItem);
router.get('/items', authenticate, requirePermission('items.view'), validate(schemas.pagination, 'query'), controller.items.list);
router.post('/items', authenticate, requirePermission('items.create'), validate(schemas.itemCreate), controller.items.create);
router.patch('/items/:id/status', authenticate, requirePermission('items.archive'), validate(schemas.itemStatus), controller.updateItemStatus);
router.patch('/items/:id', authenticate, requirePermission('items.update'), validate(schemas.itemUpdate), controller.items.update);
router.delete('/items/:id', authenticate, requirePermission('items.delete'), controller.deleteItem);

router.post('/stock-entries', authenticate, requirePermission('items.stock_entry'), validate(schemas.stockEntry), controller.addStockEntry);
router.post('/stock-adjustments', authenticate, requirePermission('items.adjust_stock'), validate(schemas.stockAdjustment), controller.adjustStock);
router.get('/stock-movements', authenticate, requirePermission('stock_movements.view'), validate(schemas.pagination, 'query'), controller.listStockMovements);
router.get('/inventory-batches', authenticate, requirePermission('stock_movements.view'), controller.listBatches);
router.get('/inventory-batches/expiry-risk', authenticate, requirePermission('stock_movements.view'), controller.expiryRisk);

router.get('/purchase-orders', authenticate, requirePermission('purchase_orders.view'), validate(schemas.pagination, 'query'), controller.listPurchaseOrders);
router.post('/purchase-orders', authenticate, requirePermission('purchase_orders.create'), validate(schemas.purchaseOrderCreate), controller.createPurchaseOrder);
router.get('/purchase-orders/:id', authenticate, requirePermission('purchase_orders.view'), controller.getPurchaseOrder);
router.patch('/purchase-orders/:id', authenticate, requirePermission('purchase_orders.update'), validate(schemas.purchaseOrderUpdate), controller.updatePurchaseOrder);
router.post('/purchase-orders/:id/receive', authenticate, requirePermission('purchase_orders.receive'), validate(schemas.receivePurchaseOrder), controller.receivePurchaseOrder);
router.post('/purchase-orders/:id/cancel', authenticate, requirePermission('purchase_orders.cancel'), controller.cancelPurchaseOrder);

module.exports = router;
