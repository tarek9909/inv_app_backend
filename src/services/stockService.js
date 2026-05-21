const { Op, fn, col } = require('sequelize');
const { sequelize, Item, StockEntry, StockMovement, StockReservation, InventoryBatch, StockMovementBatch } = require('../models');
const HttpError = require('../utils/httpError');
const { toMoney } = require('../utils/numbers');
const { logAction } = require('./auditService');
const notificationService = require('./notificationService');

const unitLabelFor = (item) => item?.unit || 'base unit';

const toEffectiveBaseQuantity = (quantity, item) => {
  if (item?.is_carton) return Number(quantity) * Number(item.carton_quantity || 0);
  return Number(quantity);
};

const getStockBearingItem = async (item, transaction, lock) => {
  if (!item?.is_carton) return item;
  const cartonQuantity = Number(item.carton_quantity || 0);
  if (cartonQuantity <= 0) throw new HttpError(400, 'Carton quantity must be greater than 0');
  const targetItem = await Item.findByPk(item.carton_item_id, { transaction, ...(lock ? { lock } : {}) });
  if (!targetItem) throw new HttpError(400, 'Carton contained item is not available');
  return targetItem;
};

const syncCartonStocks = async ({ containedItemId, transaction }) => {
  const cartons = await Item.findAll({ where: { carton_item_id: containedItemId }, transaction });
  const contained = await Item.findByPk(containedItemId, { transaction });
  if (!contained) return;
  for (const carton of cartons) {
    const cartonQuantity = Number(carton.carton_quantity || 0);
    if (cartonQuantity > 0) {
      await carton.update({ current_stock: toMoney(Number(contained.current_stock || 0) / cartonQuantity) }, { transaction });
    }
  }
};

const asArray = (rows) => Array.isArray(rows) ? rows : rows ? [rows] : [];

const getReservedStockByItemIds = async (itemIds, transaction) => {
  const ids = [...new Set((itemIds || []).filter(Boolean).map(Number))];
  if (!ids.length || !StockReservation?.findAll) return new Map();
  const rows = await StockReservation.findAll({
    attributes: ['item_id', [fn('SUM', col('quantity')), 'reserved_stock']],
    where: { item_id: { [Op.in]: ids }, status: 'active' },
    group: ['item_id'],
    transaction
  });
  return new Map(rows.map((row) => [Number(row.item_id), Number(row.get('reserved_stock') || 0)]));
};

const attachAvailability = async (items, transaction) => {
  const rows = asArray(items);
  const cartonContainedIds = rows
    .filter((item) => item.is_carton && item.carton_item_id)
    .map((item) => Number(item.carton_item_id));
  const reservedByItem = await getReservedStockByItemIds([
    ...rows.map((item) => item.id),
    ...cartonContainedIds
  ], transaction);
  const containedItems = cartonContainedIds.length
    ? await Item.findAll({ where: { id: { [Op.in]: [...new Set(cartonContainedIds)] } }, transaction })
    : [];
  const containedById = new Map(containedItems.map((item) => [Number(item.id), item]));
  rows.forEach((item) => {
    if (item.is_carton) {
      const cartonQuantity = Number(item.carton_quantity || 0);
      const contained = item.carton_item || containedById.get(Number(item.carton_item_id));
      const containedCurrent = Number(contained?.current_stock || 0);
      const containedReserved = reservedByItem.get(Number(item.carton_item_id)) || 0;
      item.setDataValue?.('reserved_stock', toMoney(cartonQuantity > 0 ? containedReserved / cartonQuantity : 0));
      item.setDataValue?.('available_stock', toMoney(cartonQuantity > 0 ? (containedCurrent - containedReserved) / cartonQuantity : 0));
      return;
    }

    const reserved = reservedByItem.get(Number(item.id)) || 0;
    const current = Number(item.current_stock || 0);
    item.setDataValue?.('reserved_stock', toMoney(reserved));
    item.setDataValue?.('available_stock', toMoney(current - reserved));
  });
  return items;
};

const getAvailableStock = async (item, transaction) => {
  const targetItem = await getStockBearingItem(item, transaction);
  const reserved = (await getReservedStockByItemIds([targetItem.id], transaction)).get(Number(targetItem.id)) || 0;
  const availableBase = Number(targetItem.current_stock || 0) - reserved;
  if (item?.is_carton) {
    const cartonQuantity = Number(item.carton_quantity || 0);
    return cartonQuantity > 0 ? availableBase / cartonQuantity : 0;
  }
  return availableBase;
};

const getAvailableBaseStock = async (item, transaction) => {
  const targetItem = await getStockBearingItem(item, transaction, transaction?.LOCK?.UPDATE);
  const reserved = (await getReservedStockByItemIds([targetItem.id], transaction)).get(Number(targetItem.id)) || 0;
  return {
    targetItem,
    reserved,
    availableBase: Number(targetItem.current_stock || 0) - reserved
  };
};

const batchStatusFor = (expiryDate, remaining) => {
  if (Number(remaining || 0) <= 0) return 'depleted';
  if (!expiryDate) return 'valid';
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);
  const soonValue = soon.toISOString().slice(0, 10);
  if (String(expiryDate) < today) return 'expired';
  if (String(expiryDate) <= soonValue) return 'expiring_soon';
  return 'valid';
};

const createIncomingBatch = async ({ item, quantity, baseQuantity, supplierId, purchaseOrderItemId, batchNumber, expiryDate, unitCost, userId, transaction }) => {
  if (!item.track_batches && !batchNumber && !expiryDate) return null;
  const amount = toMoney(baseQuantity || quantity);
  return InventoryBatch.create({
    item_id: item.id,
    supplier_id: supplierId || item.supplier_id || null,
    purchase_order_item_id: purchaseOrderItemId || null,
    batch_number: batchNumber || null,
    expiry_date: expiryDate || null,
    quantity_received: amount,
    quantity_remaining: amount,
    unit_cost: unitCost || item.purchase_price || 0,
    status: batchStatusFor(expiryDate, amount),
    created_by: userId
  }, { transaction });
};

const consumeBatches = async ({ item, movement, quantity, transaction }) => {
  const batches = await InventoryBatch.findAll({
    where: { item_id: item.id, quantity_remaining: { [Op.gt]: 0 }, status: { [Op.ne]: 'depleted' } },
    order: [['expiry_date', 'ASC'], ['created_at', 'ASC'], ['id', 'ASC']],
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  if (!batches.length && !item.track_batches) return [];

  let remaining = Number(quantity || 0);
  const links = [];
  for (const batch of batches) {
    if (remaining <= 0) break;
    const available = Number(batch.quantity_remaining || 0);
    const used = Math.min(available, remaining);
    const nextRemaining = toMoney(available - used);
    await batch.update({
      quantity_remaining: nextRemaining,
      status: batchStatusFor(batch.expiry_date, nextRemaining),
      updated_at: new Date()
    }, { transaction });
    links.push(await StockMovementBatch.create({
      stock_movement_id: movement.id,
      batch_id: batch.id,
      quantity: toMoney(used)
    }, { transaction }));
    remaining = toMoney(remaining - used);
  }

  if (remaining > 0 && item.track_batches) throw new HttpError(400, `Insufficient tracked batch stock for ${item.name}`);
  return links;
};

const changeStock = async ({ item, quantity, baseQuantity, direction, movementType, referenceType, referenceId, notes, userId, transaction, batch = {} }) => {
  const cartonQuantity = item.is_carton ? Number(item.carton_quantity || 0) : 0;
  if (item.is_carton && cartonQuantity <= 0) throw new HttpError(400, 'Carton quantity must be greater than 0');
  const targetItem = item.is_carton
    ? await Item.findByPk(item.carton_item_id, { transaction, lock: transaction.LOCK.UPDATE })
    : item;
  if (!targetItem) throw new HttpError(400, 'Carton contained item is not available');

  const movementBefore = Number(item.current_stock);
  const before = Number(targetItem.current_stock);
  const enteredQuantity = Number(quantity);
  const delta = Number(baseQuantity ?? toEffectiveBaseQuantity(enteredQuantity, item));
  const after = direction === 'in' ? before + delta : before - delta;

  if (after < 0) throw new HttpError(400, `Insufficient stock for ${targetItem.name}`);

  let incomingBatch = null;
  if (direction === 'in') {
    incomingBatch = await createIncomingBatch({
      item: targetItem,
      quantity,
      baseQuantity: delta,
      supplierId: batch.supplier_id,
      purchaseOrderItemId: batch.purchase_order_item_id,
      batchNumber: batch.batch_number,
      expiryDate: batch.expiry_date,
      unitCost: batch.unit_cost,
      userId,
      transaction
    });
  }

  await targetItem.update({ current_stock: toMoney(after) }, { transaction });
  if (item.is_carton) {
    await item.update({ current_stock: toMoney(cartonQuantity > 0 ? after / cartonQuantity : 0) }, { transaction });
    await syncCartonStocks({ containedItemId: targetItem.id, transaction });
  } else {
    await syncCartonStocks({ containedItemId: item.id, transaction });
  }

  const movement = await StockMovement.create({
    item_id: item.id,
    movement_type: movementType,
    reference_type: referenceType,
    reference_id: referenceId,
    quantity: delta,
    entered_quantity: quantity,
    entered_unit_label: item.is_carton ? 'carton' : unitLabelFor(item),
    base_quantity: delta,
    batch_id: incomingBatch?.id || null,
    stock_before: toMoney(movementBefore),
    stock_after: toMoney(item.is_carton && cartonQuantity > 0 ? after / cartonQuantity : after),
    notes,
    created_by: userId
  }, { transaction });

  if (direction === 'out') await consumeBatches({ item: targetItem, movement, quantity: delta, transaction });
  if (Number(targetItem.current_stock || 0) <= Number(targetItem.minimum_stock || 0)) {
    await notificationService.notifyLowStock(targetItem, transaction).catch(() => {});
  }
  return movement;
};

const addStockEntry = async (payload, req) => sequelize.transaction(async (transaction) => {
  const item = await Item.findByPk(payload.item_id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!item) throw new HttpError(404, 'Item not found');
  const baseQuantity = toEffectiveBaseQuantity(payload.quantity, item);

  const entry = await StockEntry.create({
    ...payload,
    base_quantity: toMoney(baseQuantity),
    batch_number: payload.batch_number || null,
    expiry_date: payload.expiry_date || null,
    created_by: req.user.id
  }, { transaction });

  await changeStock({
    item,
    quantity: payload.quantity,
    baseQuantity,
    direction: 'in',
    movementType: 'stock_in',
    referenceType: 'stock_entries',
    referenceId: entry.id,
    notes: payload.notes,
    userId: req.user.id,
    batch: {
      supplier_id: payload.supplier_id,
      batch_number: payload.batch_number,
      expiry_date: payload.expiry_date,
      unit_cost: payload.unit_cost
    },
    transaction
  });

  await logAction({ req, action: 'create', module: 'stock_entries', recordId: entry.id, newData: entry.toJSON(), transaction });
  return entry;
});

const adjustStock = async (payload, req) => sequelize.transaction(async (transaction) => {
  const item = await Item.findByPk(payload.item_id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!item) throw new HttpError(404, 'Item not found');
  const baseQuantity = toEffectiveBaseQuantity(payload.quantity, item);

  const direction = payload.adjustment_type === 'adjustment_in' ? 'in' : 'out';
  const movement = await changeStock({
    item,
    quantity: payload.quantity,
    baseQuantity,
    direction,
    movementType: payload.adjustment_type,
    referenceType: 'stock_adjustments',
    referenceId: null,
    notes: payload.notes,
    userId: req.user.id,
    transaction
  });

  await logAction({ req, action: payload.adjustment_type, module: 'stock_movements', recordId: movement.id, newData: movement.toJSON(), transaction });
  return movement;
});

const listBatches = async (query = {}) => {
  const where = {};
  if (query.item_id) where.item_id = query.item_id;
  if (query.status) where.status = query.status;
  const rows = await InventoryBatch.findAll({
    where,
    include: [{ model: Item, as: 'item' }],
    order: [['expiry_date', 'ASC'], ['created_at', 'ASC']]
  });
  rows.forEach((batch) => batch.setDataValue('expiry_status', batchStatusFor(batch.expiry_date, batch.quantity_remaining)));
  return rows;
};

const expiryRisk = async ({ days = 30 } = {}) => {
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date();
  soon.setDate(soon.getDate() + Number(days || 30));
  const soonValue = soon.toISOString().slice(0, 10);
  const rows = await InventoryBatch.findAll({
    where: { quantity_remaining: { [Op.gt]: 0 }, expiry_date: { [Op.ne]: null, [Op.lte]: soonValue } },
    include: [{ model: Item, as: 'item' }],
    order: [['expiry_date', 'ASC']]
  });
  rows.forEach((batch) => batch.setDataValue('expiry_status', String(batch.expiry_date) < today ? 'expired' : 'expiring_soon'));
  return rows;
};

module.exports = {
  addStockEntry,
  adjustStock,
  changeStock,
  syncCartonStocks,
  toEffectiveBaseQuantity,
  getStockBearingItem,
  unitLabelFor,
  attachAvailability,
  getAvailableStock,
  getAvailableBaseStock,
  getReservedStockByItemIds,
  listBatches,
  expiryRisk,
  batchStatusFor
};
