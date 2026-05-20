const { sequelize, StockRequest, StockRequestItem, StockRequestItemConfirmation, StockReservation, Driver, DriverUserLink, User, Role, Item, Payment, StockRequestPrint, Setting } = require('../models');
const HttpError = require('../utils/httpError');
const { generateNumber, toMoney } = require('../utils/numbers');
const { changeStock, toEffectiveBaseQuantity, getAvailableStock } = require('./stockService');
const { logAction } = require('./auditService');
const notificationService = require('./notificationService');

const includeStockRequest = [
  { model: Driver, as: 'driver', include: [{ model: DriverUserLink, as: 'user_link', include: [{ model: User, as: 'user', include: [{ model: Role, as: 'role' }] }] }] },
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
  const confirmedCount = items.filter((line) => Boolean(line.confirmation?.confirmed)).length;
  if (confirmedCount === items.length) return 'receipt_submitted';
  if (confirmedCount === 0) return 'receipt_not_confirmed';
  return 'receipt_partial';
};

const withReceiptStatus = (request) => {
  if (!request) return request;
  request.setDataValue('driver_receipt_status', receiptStatusFor(request));
  return request;
};

const loadRequest = (requestId, options = {}) => StockRequest.findByPk(requestId, { include: includeStockRequest, ...options });

const ensureSufficientAvailable = async (request, transaction) => {
  if (request.request_type !== 'stock_out') return;
  for (const line of request.items || []) {
    const item = await Item.findByPk(line.item_id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!item) throw new HttpError(404, 'Item not found');
    const available = await getAvailableStock(item, transaction);
    const quantity = Number(line.quantity || 0);
    if (available < quantity) {
      throw new HttpError(400, `Insufficient available stock for ${item.name}. Available: ${available}, requested: ${quantity}`);
    }
  }
};

const createReservations = async (request, req, transaction) => {
  if (request.request_type !== 'stock_out') return [];
  await ensureSufficientAvailable(request, transaction);
  return StockReservation.bulkCreate((request.items || []).map((line) => ({
    stock_request_id: request.id,
    stock_request_item_id: line.id,
    item_id: line.item_id,
    quantity: line.quantity,
    status: 'active',
    created_by: req.user.id
  })), { transaction });
};

const updateReservations = (requestId, values, transaction) => {
  if (!StockReservation?.update) return Promise.resolve();
  return StockReservation.update({
    ...values,
    updated_at: new Date()
  }, { where: { stock_request_id: requestId, status: 'active' }, transaction });
};

const getFulfillmentMode = async (transaction) => {
  const setting = await Setting.findOne({ where: { setting_key: 'accepted_request_fulfillment_mode' }, transaction });
  return setting?.setting_value || 'both';
};

const hasFullyConfirmedReceipt = (request) => {
  const items = request.items || [];
  return items.length > 0 && items.every((line) => Boolean(line.confirmation?.confirmed));
};

const createStockRequest = async (payload, req) => sequelize.transaction(async (transaction) => {
  const driver = await Driver.findByPk(payload.driver_id, {
    include: [{ model: DriverUserLink, as: 'user_link', include: [{ model: User, as: 'user', include: [{ model: Role, as: 'role' }] }] }],
    transaction
  });
  if (!driver || driver.status !== 'active') throw new HttpError(400, 'Driver is not active');
  if (!driver.user_link?.user || driver.user_link.user.status !== 'active' || driver.user_link.user.role?.code !== 'driver') {
    throw new HttpError(400, 'Driver must be linked to an active user with the driver role');
  }

  const subtotal = payload.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_price), 0);
  const total = subtotal - Number(payload.discount_amount || 0);
  if (total < 0) throw new HttpError(400, 'Total amount cannot be negative');
  const isReturn = payload.request_type === 'stock_return';

  const request = await StockRequest.create({
    request_number: generateNumber('stockRequest'),
    driver_id: payload.driver_id,
    request_date: payload.request_date,
    request_type: payload.request_type,
    commission_location_id: driver.current_location_id || null,
    subtotal: toMoney(subtotal),
    discount_amount: payload.discount_amount || 0,
    total_amount: toMoney(total),
    remaining_amount: isReturn ? 0 : toMoney(total),
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
  if (!['draft', 'pending'].includes(request.request_status)) throw new HttpError(400, 'Only draft or pending requests can be accepted');

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
    const values = {
      stock_request_id: request.id,
      stock_request_item_id: line.id,
      confirmed,
      confirmed_quantity: confirmed ? line.quantity : 0,
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
  acceptStockRequest,
  completeStockRequest,
  cancelStockRequest,
  recordStockRequestPrint,
  markDriverInvoiceViewed,
  submitDriverReceipt
};
