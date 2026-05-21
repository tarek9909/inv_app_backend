const { Op } = require('sequelize');
const { sequelize, StockRequest, StockRequestItem, StockRequestItemConfirmation, StockReservation, Driver, User, Item, Payment, StockRequestPrint, Setting } = require('../models');
const HttpError = require('../utils/httpError');
const { generateNumber, toMoney } = require('../utils/numbers');
const { changeStock, toEffectiveBaseQuantity, getAvailableBaseStock } = require('./stockService');
const { logAction } = require('./auditService');
const notificationService = require('./notificationService');
const { withRoleInclude, normalizeUserRole } = require('./userService');

const includeStockRequest = [
  { model: Driver, as: 'driver', include: [{ model: User, as: 'user', include: withRoleInclude() }] },
  { model: StockRequestItem, as: 'items', include: [{ model: Item, as: 'item' }, { model: StockRequestItemConfirmation, as: 'confirmation' }] },
  { model: StockRequestPrint, as: 'prints', include: [{ model: User, as: 'printer' }] }
];

const includeStockRequestList = [
  { model: Driver, as: 'driver', attributes: ['id', 'full_name', 'phone', 'status'] }
];

const receiptStatusFor = (request) => {
  if (!request.driver_received_at) return 'receipt_pending';
  const items = request.items || [];
  const itemCount = Number(request.get?.('item_count') ?? request.getDataValue?.('item_count') ?? 0);
  const summarizedConfirmedCount = Number(request.get?.('confirmed_count') ?? request.getDataValue?.('confirmed_count') ?? 0);
  if (!items.length && itemCount > 0) {
    if (summarizedConfirmedCount === itemCount) return 'receipt_submitted';
    if (summarizedConfirmedCount === 0) return 'receipt_not_confirmed';
    return 'receipt_partial';
  }
  if (!items.length) return 'receipt_submitted';
  const receivedCount = items.filter((line) => Boolean(line.confirmation?.confirmed) && Number(line.confirmation?.confirmed_quantity || 0) > 0).length;
  if (receivedCount === 0) return 'receipt_not_confirmed';
  const fullyReceivedCount = items.filter((line) => (
    Boolean(line.confirmation?.confirmed)
    && Number(line.confirmation?.confirmed_quantity || 0) >= Number(line.quantity || 0)
  )).length;
  if (fullyReceivedCount === items.length) return 'receipt_submitted';
  return 'receipt_partial';
};

const withReceiptStatus = (request) => {
  if (!request) return request;
  if (request.driver?.user) normalizeUserRole(request.driver.user);
  request.setDataValue('driver_receipt_status', receiptStatusFor(request));
  return request;
};

const loadRequest = (requestId, options = {}) => StockRequest.findByPk(requestId, { include: includeStockRequest, ...options });

const calculateTotals = (items, discountAmount = 0) => {
  const subtotal = (items || []).reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
  const total = subtotal - Number(discountAmount || 0);
  if (total < 0) throw new HttpError(400, 'Total amount cannot be negative');
  return { subtotal: toMoney(subtotal), total: toMoney(total) };
};

const resolveLineStock = async (line, transaction) => {
  const item = line.item || await Item.findByPk(line.item_id, { transaction, lock: transaction?.LOCK?.UPDATE });
  if (!item) throw new HttpError(404, 'Item not found');
  const baseQuantity = Number(line.base_quantity || toEffectiveBaseQuantity(line.quantity, item));
  const { targetItem, availableBase } = await getAvailableBaseStock(item, transaction);
  return { item, targetItem, baseQuantity, availableBase };
};

const ensureSufficientAvailable = async (request, transaction) => {
  if (request.request_type !== 'stock_out') return;
  const requiredByItem = new Map();
  for (const line of request.items || []) {
    const stock = await resolveLineStock(line, transaction);
    const targetId = Number(stock.targetItem.id);
    const current = requiredByItem.get(targetId) || {
      item: stock.item,
      targetItem: stock.targetItem,
      availableBase: stock.availableBase,
      requiredBase: 0
    };
    current.requiredBase += stock.baseQuantity;
    requiredByItem.set(targetId, current);
  }

  for (const requirement of requiredByItem.values()) {
    if (requirement.availableBase < requirement.requiredBase) {
      throw new HttpError(400, `Insufficient available stock for ${requirement.targetItem.name}. Available: ${toMoney(requirement.availableBase)}, requested: ${toMoney(requirement.requiredBase)}`);
    }
  }
};

const createReservations = async (request, req, transaction) => {
  if (request.request_type !== 'stock_out') return [];
  await ensureSufficientAvailable(request, transaction);
  const reservations = [];
  for (const line of request.items || []) {
    const stock = await resolveLineStock(line, transaction);
    reservations.push({
      stock_request_id: request.id,
      stock_request_item_id: line.id,
      item_id: stock.targetItem.id,
      quantity: toMoney(stock.baseQuantity),
      status: 'active',
      created_by: req.user.id
    });
  }
  return StockReservation.bulkCreate(reservations, { transaction });
};

const updateReservations = (requestId, values, transaction) => {
  if (!StockReservation?.update) return Promise.resolve();
  return StockReservation.update({
    ...values,
    updated_at: new Date()
  }, { where: { stock_request_id: requestId, status: 'active' }, transaction });
};

const refreshActiveReservations = async (request, req, transaction) => {
  await updateReservations(request.id, { status: 'released', released_at: new Date() }, transaction);
  return createReservations(request, req, transaction);
};

const getFulfillmentMode = async (transaction) => {
  const setting = await Setting.findOne({ where: { setting_key: 'accepted_request_fulfillment_mode' }, transaction });
  return setting?.setting_value || 'both';
};

const hasFullyConfirmedReceipt = (request) => {
  const items = request.items || [];
  return items.length > 0 && items.every((line) => (
    Boolean(line.confirmation?.confirmed)
    && Number(line.confirmation?.confirmed_quantity || 0) >= Number(line.quantity || 0)
  ));
};

const createStockRequest = async (payload, req) => sequelize.transaction(async (transaction) => {
  const driver = await Driver.findByPk(payload.driver_id, { transaction });
  if (!driver || driver.status !== 'active') throw new HttpError(400, 'Driver is not active');

  const totals = calculateTotals(payload.items, payload.discount_amount);
  const isReturn = payload.request_type === 'stock_return';

  const request = await StockRequest.create({
    request_number: generateNumber('stockRequest'),
    driver_id: payload.driver_id,
    request_date: payload.request_date,
    request_type: payload.request_type,
    commission_location_id: driver.current_location_id || null,
    subtotal: totals.subtotal,
    discount_amount: payload.discount_amount || 0,
    total_amount: totals.total,
    remaining_amount: isReturn ? 0 : totals.total,
    payment_status: isReturn ? 'paid' : 'pending',
    notes: payload.notes,
    created_by: req.user.id
  }, { transaction });

  const lines = [];
  for (const line of payload.items) {
    const item = await Item.findByPk(line.item_id, { transaction });
    if (!item) throw new HttpError(404, 'Item not found');
    lines.push({
      stock_request_id: request.id,
      item_id: line.item_id,
      quantity: line.quantity,
      base_quantity: toMoney(toEffectiveBaseQuantity(line.quantity, item)),
      unit_price: line.unit_price,
      notes: line.notes
    });
  }
  await StockRequestItem.bulkCreate(lines, { transaction });

  await logAction({ req, action: 'create', module: 'stock_requests', recordId: request.id, newData: payload, transaction });
  await notificationService.notifyPermission({
    permissionKey: 'stock_requests.accept',
    type: 'stock_request_pending',
    title: `Stock request pending: ${request.request_number}`,
    message: `A ${payload.request_type || 'stock_out'} request is waiting for approval.`,
    entityType: 'stock_requests',
    entityId: request.id,
    transaction
  }).catch(() => {});
  return withReceiptStatus(await loadRequest(request.id, { transaction }));
});

const completeStockRequest = async (requestId, req, payload = {}) => sequelize.transaction(async (transaction) => {
  const request = await loadRequest(requestId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!request) throw new HttpError(404, 'Stock request not found');
  if (request.request_status === 'completed') throw new HttpError(400, 'Stock request is already completed');
  if (request.request_status === 'cancelled') throw new HttpError(400, 'Cancelled stock requests cannot be completed');
  if (request.request_status !== 'approved') throw new HttpError(400, 'Stock request must be accepted before completion');
  const isReturn = request.request_type === 'stock_return';
  const fulfillmentMode = await getFulfillmentMode(transaction);
  if (fulfillmentMode !== 'print') {
    if (!request.driver_received_at) throw new HttpError(400, 'Driver receipt confirmation is required before completion');
    if (!hasFullyConfirmedReceipt(request)) throw new HttpError(400, 'All request items must be confirmed by the driver before completion');
  }

  for (const line of request.items) {
    const item = await Item.findByPk(line.item_id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!item) throw new HttpError(404, 'Item not found');
    await changeStock({
      item,
      quantity: line.quantity,
      baseQuantity: line.base_quantity || line.quantity,
      direction: request.request_type === 'stock_return' ? 'in' : 'out',
      movementType: request.request_type === 'stock_return' ? 'driver_return' : 'driver_request',
      referenceType: 'stock_requests',
      referenceId: request.id,
      notes: `Completed request ${request.request_number}`,
      userId: req.user.id,
      transaction
    });
  }

  if (!isReturn) {
    await updateReservations(request.id, { status: 'consumed', consumed_at: new Date() }, transaction);
  }

  const oldData = request.toJSON();
  const paymentAmount = isReturn ? 0 : Number(payload.payment_amount || 0);
  const currentPaid = Number(request.paid_amount || 0);
  const total = Number(request.total_amount || 0);
  if (paymentAmount > 0 && currentPaid + paymentAmount > total) {
    throw new HttpError(400, 'Payment amount exceeds remaining balance');
  }

  let nextPaid = currentPaid;
  let nextRemaining = isReturn ? 0 : Number(request.remaining_amount || total);
  if (paymentAmount > 0) {
    const payment = await Payment.create({
      stock_request_id: request.id,
      driver_id: request.driver_id,
      payment_number: generateNumber('payment'),
      amount: paymentAmount,
      payment_method: payload.payment_method || 'cash',
      payment_date: payload.payment_date || new Date(),
      notes: payload.payment_notes || null,
      received_by: req.user.id
    }, { transaction });
    await logAction({ req, action: 'create', module: 'payments', recordId: payment.id, newData: payment.toJSON(), transaction });
    nextPaid = toMoney(currentPaid + paymentAmount);
    nextRemaining = toMoney(total - nextPaid);
  }
  const isPaid = isReturn || nextRemaining <= 0;

  await request.update({
    request_status: 'completed',
    completed_by: req.user.id,
    completed_at: new Date(),
    paid_amount: nextPaid,
    remaining_amount: isPaid ? 0 : nextRemaining,
    payment_status: isPaid ? 'paid' : nextPaid > 0 ? 'partially_paid' : 'pending',
    paid_by: isPaid ? req.user.id : request.paid_by,
    paid_at: isPaid ? new Date() : request.paid_at
  }, { transaction });

  await logAction({ req, action: 'complete', module: 'stock_requests', recordId: request.id, oldData, newData: request.toJSON(), transaction });
  await notificationService.notifyPermission({
    permissionKey: 'stock_requests.view',
    type: 'stock_request_completed',
    title: `Stock request completed: ${request.request_number}`,
    message: 'A stock request has been completed.',
    entityType: 'stock_requests',
    entityId: request.id,
    transaction
  }).catch(() => {});
  return withReceiptStatus(await loadRequest(request.id, { transaction }));
});

const acceptStockRequest = async (requestId, req) => sequelize.transaction(async (transaction) => {
  const request = await loadRequest(requestId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!request) throw new HttpError(404, 'Stock request not found');
  if (request.request_status !== 'pending') throw new HttpError(400, 'Only pending requests can be accepted');

  const oldData = request.toJSON();
  await createReservations(request, req, transaction);
  await request.update({
    request_status: 'approved',
    approved_by: req.user.id,
    approved_at: new Date()
  }, { transaction });
  await logAction({ req, action: 'accept', module: 'stock_requests', recordId: request.id, oldData, newData: request.toJSON(), transaction });
  await notificationService.notifyPermission({
    permissionKey: 'stock_requests.view',
    type: 'stock_request_approved',
    title: `Stock request accepted: ${request.request_number}`,
    message: 'Reserved stock is now held for this request.',
    entityType: 'stock_requests',
    entityId: request.id,
    transaction
  }).catch(() => {});
  return withReceiptStatus(await loadRequest(request.id, { transaction }));
});

const updateStockRequest = async (requestId, payload, req) => sequelize.transaction(async (transaction) => {
  const request = await loadRequest(requestId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!request) throw new HttpError(404, 'Stock request not found');
  if (!['draft', 'pending'].includes(request.request_status)) {
    throw new HttpError(400, 'Only draft or pending requests can be edited');
  }

  const oldData = request.toJSON();
  const nextDriverId = payload.driver_id ?? request.driver_id;
  const nextRequestType = payload.request_type ?? request.request_type;
  const nextDiscount = payload.discount_amount ?? request.discount_amount ?? 0;

  const driver = await Driver.findByPk(nextDriverId, { transaction });
  if (!driver || driver.status !== 'active') throw new HttpError(400, 'Driver is not active');

  let nextItems = request.items || [];
  if (payload.items) {
    const existingById = new Map((request.items || []).map((line) => [Number(line.id), line]));
    const keepIds = payload.items.filter((line) => line.id).map((line) => Number(line.id));

    for (const line of payload.items) {
      if (line.id && !existingById.has(Number(line.id))) {
        throw new HttpError(400, 'Request item does not belong to this stock request');
      }
    }

    if (keepIds.length) {
      await StockRequestItem.destroy({
        where: {
          stock_request_id: request.id,
          id: { [Op.notIn]: keepIds }
        },
        transaction
      });
    } else {
      await StockRequestItem.destroy({ where: { stock_request_id: request.id }, transaction });
    }

    for (const line of payload.items) {
      const item = await Item.findByPk(line.item_id, { transaction });
      if (!item) throw new HttpError(404, 'Item not found');
      const values = {
        stock_request_id: request.id,
        item_id: line.item_id,
        quantity: line.quantity,
        base_quantity: toMoney(toEffectiveBaseQuantity(line.quantity, item)),
        unit_price: line.unit_price,
        notes: line.notes || null
      };
      if (line.id) {
        await existingById.get(Number(line.id)).update(values, { transaction });
      } else {
        await StockRequestItem.create(values, { transaction });
      }
    }

    nextItems = await StockRequestItem.findAll({
      where: { stock_request_id: request.id },
      include: [{ model: Item, as: 'item' }],
      transaction
    });
  }

  const totals = calculateTotals(nextItems, nextDiscount);
  const paidAmount = Number(request.paid_amount || 0);
  if (nextRequestType !== 'stock_return' && paidAmount > Number(totals.total)) {
    throw new HttpError(400, 'Total amount cannot be less than already paid amount');
  }
  const isReturn = nextRequestType === 'stock_return';
  const remainingAmount = isReturn ? 0 : toMoney(Number(totals.total) - paidAmount);

  await request.update({
    driver_id: nextDriverId,
    request_date: payload.request_date ?? request.request_date,
    request_type: nextRequestType,
    request_status: payload.request_status ?? request.request_status,
    commission_location_id: driver.current_location_id || null,
    subtotal: totals.subtotal,
    discount_amount: nextDiscount,
    total_amount: totals.total,
    paid_amount: isReturn ? 0 : request.paid_amount,
    remaining_amount: remainingAmount,
    payment_status: isReturn ? 'paid' : paidAmount > 0 ? 'partially_paid' : 'pending',
    notes: payload.notes ?? request.notes
  }, { transaction });

  await logAction({ req, action: 'update', module: 'stock_requests', recordId: request.id, oldData, newData: payload, transaction });
  return withReceiptStatus(await loadRequest(request.id, { transaction }));
});

const reconcileStockRequestReceipt = async (requestId, req, payload = {}) => sequelize.transaction(async (transaction) => {
  const request = await loadRequest(requestId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!request) throw new HttpError(404, 'Stock request not found');
  if (request.request_status !== 'approved') throw new HttpError(400, 'Only accepted requests can be reconciled');
  if (!request.driver_received_at) throw new HttpError(400, 'Driver receipt confirmation is required before reconciliation');

  const receiptStatus = receiptStatusFor(request);
  if (!['receipt_partial', 'receipt_not_confirmed'].includes(receiptStatus)) {
    throw new HttpError(400, 'Only partial or not-confirmed receipts can be reconciled');
  }

  const oldData = request.toJSON();
  const keptLines = [];
  for (const line of request.items || []) {
    const confirmedQuantity = line.confirmation?.confirmed ? Number(line.confirmation.confirmed_quantity || 0) : 0;
    if (confirmedQuantity <= 0) {
      await line.destroy({ transaction });
      continue;
    }
    const item = line.item || await Item.findByPk(line.item_id, { transaction });
    if (!item) throw new HttpError(404, 'Item not found');
    await line.update({
      quantity: toMoney(confirmedQuantity),
      base_quantity: toMoney(toEffectiveBaseQuantity(confirmedQuantity, item))
    }, { transaction });
    keptLines.push(line);
  }

  if (!keptLines.length) {
    throw new HttpError(400, 'No confirmed quantities remain; cancel the request instead');
  }

  const freshLines = await StockRequestItem.findAll({
    where: { stock_request_id: request.id },
    include: [{ model: Item, as: 'item' }, { model: StockRequestItemConfirmation, as: 'confirmation' }],
    transaction
  });
  const totals = calculateTotals(freshLines, request.discount_amount);
  const paidAmount = Number(request.paid_amount || 0);
  if (request.request_type !== 'stock_return' && paidAmount > Number(totals.total)) {
    throw new HttpError(400, 'Reconciled total cannot be less than already paid amount');
  }
  const remainingAmount = request.request_type === 'stock_return' ? 0 : toMoney(Number(totals.total) - paidAmount);

  await request.update({
    subtotal: totals.subtotal,
    total_amount: totals.total,
    remaining_amount: remainingAmount,
    payment_status: request.request_type === 'stock_return' ? 'paid' : paidAmount > 0 ? 'partially_paid' : 'pending',
    driver_receipt_notes: payload.notes ?? request.driver_receipt_notes
  }, { transaction });

  const freshRequest = await loadRequest(request.id, { transaction });
  await refreshActiveReservations(freshRequest, req, transaction);
  await logAction({ req, action: 'reconcile_receipt', module: 'stock_requests', recordId: request.id, oldData, newData: freshRequest.toJSON(), transaction });
  return withReceiptStatus(await loadRequest(request.id, { transaction }));
});

const recordStockRequestPrint = async (requestId, payload, req) => {
  const request = await loadRequest(requestId);
  if (!request) throw new HttpError(404, 'Stock request not found');
  if (!['approved', 'completed'].includes(request.request_status)) throw new HttpError(400, 'Only accepted or completed requests can be printed');

  const print = await StockRequestPrint.create({
    stock_request_id: request.id,
    printed_by: req.user.id,
    printer_name: payload.printer_name || null,
    qz_version: payload.qz_version || null,
    status: payload.status === 'failed' ? 'failed' : 'success',
    error_message: payload.error_message || null
  });
  await logAction({ req, action: print.status === 'success' ? 'print' : 'print_failed', module: 'stock_requests', recordId: request.id, newData: print.toJSON() });
  return { request, print };
};

const markDriverInvoiceViewed = async (requestId, driver, req) => sequelize.transaction(async (transaction) => {
  const request = await loadRequest(requestId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!request) throw new HttpError(404, 'Stock request not found');
  if (Number(request.driver_id) !== Number(driver.id)) throw new HttpError(404, 'Stock request not found');
  if (request.request_status !== 'approved') throw new HttpError(400, 'Only accepted requests can be viewed as driver invoices');

  const oldData = request.toJSON();
  await request.update({ driver_invoice_viewed_at: request.driver_invoice_viewed_at || new Date() }, { transaction });
  await logAction({ req, action: 'invoice_viewed', module: 'stock_requests', recordId: request.id, oldData, newData: request.toJSON(), transaction });
  return withReceiptStatus(await loadRequest(request.id, { transaction }));
});

const submitDriverReceipt = async (requestId, driver, payload, req) => sequelize.transaction(async (transaction) => {
  const request = await loadRequest(requestId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!request) throw new HttpError(404, 'Stock request not found');
  if (Number(request.driver_id) !== Number(driver.id)) throw new HttpError(404, 'Stock request not found');
  if (request.request_status !== 'approved') throw new HttpError(400, 'Only accepted requests can be confirmed by the driver');
  if (!request.driver_invoice_viewed_at) throw new HttpError(400, 'Invoice must be opened before confirming receipt');

  const requestItemIds = new Set((request.items || []).map((line) => Number(line.id)));
  const submittedByItemId = new Map((payload.items || []).map((line) => [Number(line.stock_request_item_id), line]));
  if (requestItemIds.size !== submittedByItemId.size) throw new HttpError(400, 'Receipt confirmation must include every request item');
  for (const itemId of submittedByItemId.keys()) {
    if (!requestItemIds.has(itemId)) throw new HttpError(400, 'Receipt confirmation includes an invalid item');
  }

  const now = new Date();
  for (const line of request.items || []) {
    const submitted = submittedByItemId.get(Number(line.id));
    const confirmed = Boolean(submitted.confirmed);
    const requestedQuantity = Number(line.quantity || 0);
    const confirmedQuantity = confirmed
      ? Number(submitted.confirmed_quantity ?? requestedQuantity)
      : 0;
    if (confirmed && confirmedQuantity <= 0) {
      throw new HttpError(400, 'Confirmed quantity must be greater than zero');
    }
    if (confirmedQuantity > requestedQuantity) {
      throw new HttpError(400, 'Confirmed quantity cannot exceed requested quantity');
    }
    const values = {
      stock_request_id: request.id,
      stock_request_item_id: line.id,
      confirmed,
      confirmed_quantity: confirmedQuantity,
      confirmed_at: now,
      updated_at: now
    };
    const existing = await StockRequestItemConfirmation.findOne({ where: { stock_request_item_id: line.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (existing) {
      await existing.update(values, { transaction });
    } else {
      await StockRequestItemConfirmation.create(values, { transaction });
    }
  }

  const oldData = request.toJSON();
  await request.update({
    driver_received_at: now,
    driver_received_by: req.user.id,
    driver_receipt_notes: payload.notes || null
  }, { transaction });
  await logAction({ req, action: 'driver_receipt', module: 'stock_requests', recordId: request.id, oldData, newData: { ...request.toJSON(), items: payload.items }, transaction });
  return withReceiptStatus(await loadRequest(request.id, { transaction }));
});

const cancelStockRequest = async (requestId, req) => sequelize.transaction(async (transaction) => {
  const request = await StockRequest.findByPk(requestId, { transaction });
  if (!request) throw new HttpError(404, 'Stock request not found');
  if (request.request_status === 'completed') throw new HttpError(400, 'Completed stock requests cannot be cancelled');

  // Block cancellation if there are non-voided payments
  const activePayments = await Payment.count({
    where: { stock_request_id: request.id, is_void: false, amount: { [Op.gt]: 0 } },
    transaction
  });
  if (activePayments > 0) {
    throw new HttpError(400, 'Cannot cancel a request with recorded payments. Void the payments first.');
  }

  const oldData = request.toJSON();
  await request.update({ request_status: 'cancelled', payment_status: 'cancelled', remaining_amount: 0 }, { transaction });
  await updateReservations(request.id, { status: 'released', released_at: new Date() }, transaction);
  await logAction({ req, action: 'cancel', module: 'stock_requests', recordId: request.id, oldData, newData: request.toJSON(), transaction });
  await notificationService.notifyPermission({
    permissionKey: 'stock_requests.view',
    type: 'stock_request_cancelled',
    title: `Stock request cancelled: ${request.request_number}`,
    message: 'Any reserved stock for this request has been released.',
    entityType: 'stock_requests',
    entityId: request.id,
    transaction
  }).catch(() => {});
  return request;
});

module.exports = {
  includeStockRequest,
  includeStockRequestList,
  withReceiptStatus,
  createStockRequest,
  updateStockRequest,
  acceptStockRequest,
  completeStockRequest,
  cancelStockRequest,
  recordStockRequestPrint,
  markDriverInvoiceViewed,
  submitDriverReceipt,
  reconcileStockRequestReceipt
};
