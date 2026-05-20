const { sequelize, PurchaseOrder, PurchaseOrderItem, Item, Supplier } = require('../models');
const HttpError = require('../utils/httpError');
const { generateNumber, toMoney } = require('../utils/numbers');
const { changeStock, toEffectiveBaseQuantity } = require('./stockService');
const { logAction } = require('./auditService');
const notificationService = require('./notificationService');

const includePurchaseOrder = [
  { model: Supplier, as: 'supplier' },
  { model: PurchaseOrderItem, as: 'items', include: [{ model: Item, as: 'item' }] }
];

const createPurchaseOrder = async (payload, req) => sequelize.transaction(async (transaction) => {
  const subtotal = payload.items.reduce((sum, item) => sum + Number(item.ordered_quantity) * Number(item.unit_cost), 0);
  const total = subtotal - Number(payload.discount_amount || 0) + Number(payload.tax_amount || 0);

  const po = await PurchaseOrder.create({
    po_number: generateNumber('purchaseOrder'),
    supplier_id: payload.supplier_id,
    order_date: payload.order_date,
    expected_delivery_date: payload.expected_delivery_date,
    subtotal: toMoney(subtotal),
    discount_amount: payload.discount_amount || 0,
    tax_amount: payload.tax_amount || 0,
    total_amount: toMoney(total),
    notes: payload.notes,
    created_by: req.user.id
  }, { transaction });

  const lines = [];
  for (const line of payload.items) {
    const item = await Item.findByPk(line.item_id, { transaction });
    if (!item) throw new HttpError(404, 'Item not found');
    lines.push({
      purchase_order_id: po.id,
      item_id: line.item_id,
      ordered_quantity: line.ordered_quantity,
      ordered_base_quantity: toMoney(toEffectiveBaseQuantity(line.ordered_quantity, item)),
      unit_cost: line.unit_cost
    });
  }
  await PurchaseOrderItem.bulkCreate(lines, { transaction });

  await logAction({ req, action: 'create', module: 'purchase_orders', recordId: po.id, newData: payload, transaction });
  return PurchaseOrder.findByPk(po.id, { include: includePurchaseOrder, transaction });
});

const receivePurchaseOrder = async (poId, payload, req) => sequelize.transaction(async (transaction) => {
  const po = await PurchaseOrder.findByPk(poId, { include: includePurchaseOrder, transaction, lock: transaction.LOCK.UPDATE });
  if (!po) throw new HttpError(404, 'Purchase order not found');
  if (po.status === 'cancelled') throw new HttpError(400, 'Cancelled purchase orders cannot be received');

  for (const received of payload.items) {
    const poItem = po.items.find((item) => Number(item.id) === Number(received.purchase_order_item_id));
    if (!poItem) throw new HttpError(404, 'Purchase order item not found');

    const newReceived = Number(poItem.received_quantity) + Number(received.received_quantity);
    if (newReceived > Number(poItem.ordered_quantity)) throw new HttpError(400, 'Received quantity cannot exceed ordered quantity');

    const item = await Item.findByPk(poItem.item_id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!item) throw new HttpError(404, 'Item not found');
    const receivedBaseQuantity = toEffectiveBaseQuantity(received.received_quantity, item);
    const newReceivedBase = Number(poItem.received_base_quantity || 0) + receivedBaseQuantity;
    await poItem.update({ received_quantity: toMoney(newReceived), received_base_quantity: toMoney(newReceivedBase) }, { transaction });

    await changeStock({
      item,
      quantity: received.received_quantity,
      baseQuantity: receivedBaseQuantity,
      direction: 'in',
      movementType: 'purchase_received',
      referenceType: 'purchase_orders',
      referenceId: po.id,
      notes: `Received PO ${po.po_number}`,
      userId: req.user.id,
      batch: {
        supplier_id: po.supplier_id,
        purchase_order_item_id: poItem.id,
        batch_number: received.batch_number,
        expiry_date: received.expiry_date,
        unit_cost: poItem.unit_cost
      },
      transaction
    });
  }

  const freshItems = await PurchaseOrderItem.findAll({ where: { purchase_order_id: po.id }, transaction });
  const allReceived = freshItems.every((item) => Number(item.received_quantity) >= Number(item.ordered_quantity));
  const someReceived = freshItems.some((item) => Number(item.received_quantity) > 0);

  await po.update({
    status: allReceived ? 'received' : someReceived ? 'partially_received' : po.status,
    received_date: payload.received_date || new Date()
  }, { transaction });

  await logAction({ req, action: 'receive', module: 'purchase_orders', recordId: po.id, newData: payload, transaction });
  await notificationService.notifyPermission({
    permissionKey: 'purchase_orders.view',
    type: 'purchase_order_received',
    title: `Purchase order received: ${po.po_number}`,
    message: 'Stock has been added from a purchase order receipt.',
    entityType: 'purchase_orders',
    entityId: po.id,
    transaction
  }).catch(() => {});
  return PurchaseOrder.findByPk(po.id, { include: includePurchaseOrder, transaction });
});

const cancelPurchaseOrder = async (poId, req) => sequelize.transaction(async (transaction) => {
  const po = await PurchaseOrder.findByPk(poId, { transaction });
  if (!po) throw new HttpError(404, 'Purchase order not found');
  if (po.status === 'received' || po.status === 'partially_received') throw new HttpError(400, 'Received purchase orders cannot be cancelled');

  const oldData = po.toJSON();
  await po.update({ status: 'cancelled' }, { transaction });
  await logAction({ req, action: 'cancel', module: 'purchase_orders', recordId: po.id, oldData, newData: po.toJSON(), transaction });
  await notificationService.notifyPermission({
    permissionKey: 'purchase_orders.view',
    type: 'purchase_order_cancelled',
    title: `Purchase order cancelled: ${po.po_number}`,
    message: 'A purchase order has been cancelled.',
    entityType: 'purchase_orders',
    entityId: po.id,
    transaction
  }).catch(() => {});
  return po;
});

module.exports = { includePurchaseOrder, createPurchaseOrder, receivePurchaseOrder, cancelPurchaseOrder };
