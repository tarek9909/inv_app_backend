const { sequelize, Payment, StockRequest, Driver } = require('../models');
const HttpError = require('../utils/httpError');
const { generateNumber, toMoney } = require('../utils/numbers');
const { logAction } = require('./auditService');

const includePayment = [
  { model: StockRequest, as: 'stock_request' },
  { model: Driver, as: 'driver' }
];

const recalculateRequestTotals = async (request, transaction, paidByUserId = null) => {
  const payments = await Payment.findAll({
    where: { stock_request_id: request.id },
    transaction
  });
  const totalPaid = Math.max(toMoney(payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)), 0);
  const total = Number(request.total_amount || 0);
  const remaining = toMoney(total - totalPaid);
  const isPaid = remaining <= 0 && totalPaid > 0;
  const isReturn = request.request_type === 'stock_return';

  let payment_status;
  if (request.request_status === 'cancelled' || request.payment_status === 'cancelled') {
    payment_status = 'cancelled';
  } else if (isReturn) {
    payment_status = 'paid';
  } else if (isPaid) {
    payment_status = 'paid';
  } else if (totalPaid > 0) {
    payment_status = 'partially_paid';
  } else {
    payment_status = 'pending';
  }

  await request.update({
    paid_amount: totalPaid,
    remaining_amount: isReturn ? 0 : Math.max(remaining, 0),
    payment_status,
    paid_by: !isReturn && isPaid ? (request.paid_by || paidByUserId) : null,
    paid_at: !isReturn && isPaid ? (request.paid_at || new Date()) : null
  }, { transaction });
};

const createPayment = async (payload, req) => sequelize.transaction(async (transaction) => {
  const request = await StockRequest.findByPk(payload.stock_request_id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!request) throw new HttpError(404, 'Stock request not found');
  if (request.request_status === 'cancelled' || request.payment_status === 'cancelled') throw new HttpError(400, 'Cancelled requests cannot receive payments');
  if (request.request_type !== 'stock_out') throw new HttpError(400, 'Payments can only be recorded for stock out requests');
  if (request.request_status !== 'completed') throw new HttpError(400, 'Payments can only be recorded after a stock request is completed');
  if (Number(request.remaining_amount || 0) <= 0) throw new HttpError(400, 'Stock request has no remaining balance');

  const amount = toMoney(Number(payload.amount));
  if (amount <= 0) throw new HttpError(400, 'Payment amount must be greater than 0');

  const currentPaid = Number(request.paid_amount || 0);
  const total = Number(request.total_amount || 0);
  if (amount > Number(request.remaining_amount || 0) || toMoney(currentPaid + amount) > toMoney(total)) {
    throw new HttpError(400, 'Payment amount exceeds remaining balance');
  }

  const payment = await Payment.create({
    stock_request_id: request.id,
    driver_id: request.driver_id,
    payment_number: generateNumber('payment'),
    amount,
    payment_method: payload.payment_method,
    payment_date: payload.payment_date,
    notes: payload.notes,
    received_by: req.user.id
  }, { transaction });

  await recalculateRequestTotals(request, transaction, req.user.id);

  await logAction({ req, action: 'create', module: 'payments', recordId: payment.id, newData: payment.toJSON(), transaction });
  return Payment.findByPk(payment.id, { include: includePayment, transaction });
});

const voidPayment = async (paymentId, payload, req) => sequelize.transaction(async (transaction) => {
  const payment = await Payment.findByPk(paymentId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!payment) throw new HttpError(404, 'Payment not found');
  if (payment.is_void) throw new HttpError(400, 'Payment is already voided');
  if (Number(payment.amount) < 0) throw new HttpError(400, 'Cannot void a refund/void payment directly');

  const request = await StockRequest.findByPk(payment.stock_request_id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!request) throw new HttpError(404, 'Stock request not found');

  const reason = String(payload.reason || '').trim();
  if (!reason) throw new HttpError(400, 'A reason is required to void a payment');

  // Create a reverse payment (negative amount)
  const voidPaymentRecord = await Payment.create({
    stock_request_id: request.id,
    driver_id: request.driver_id,
    payment_number: generateNumber('payment'),
    amount: toMoney(-Math.abs(Number(payment.amount))),
    payment_method: payment.payment_method,
    payment_date: new Date(),
    notes: `Void of payment ${payment.payment_number}: ${reason}`,
    received_by: req.user.id,
    is_void: false
  }, { transaction });

  // Mark original as voided
  const oldData = payment.toJSON();
  await payment.update({
    is_void: true,
    voided_at: new Date(),
    voided_by: req.user.id,
    void_reason: reason,
    voided_by_payment_id: voidPaymentRecord.id
  }, { transaction });

  await recalculateRequestTotals(request, transaction);

  await logAction({
    req,
    action: 'void',
    module: 'payments',
    recordId: payment.id,
    oldData,
    newData: { ...payment.toJSON(), void_payment_id: voidPaymentRecord.id },
    transaction
  });

  return Payment.findByPk(payment.id, { include: includePayment, transaction });
});

const refundPayment = async (payload, req) => sequelize.transaction(async (transaction) => {
  const request = await StockRequest.findByPk(payload.stock_request_id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!request) throw new HttpError(404, 'Stock request not found');

  const amount = toMoney(Math.abs(Number(payload.amount)));
  if (amount <= 0) throw new HttpError(400, 'Refund amount must be greater than 0');

  const currentPaid = Number(request.paid_amount || 0);
  if (amount > currentPaid) {
    throw new HttpError(400, 'Refund amount exceeds total paid amount');
  }

  const reason = String(payload.reason || '').trim();
  if (!reason) throw new HttpError(400, 'A reason is required to issue a refund');

  // Create a negative payment representing the refund
  const refund = await Payment.create({
    stock_request_id: request.id,
    driver_id: request.driver_id,
    payment_number: generateNumber('payment'),
    amount: toMoney(-amount),
    payment_method: payload.payment_method || 'cash',
    payment_date: payload.payment_date || new Date(),
    notes: `Refund: ${reason}`,
    received_by: req.user.id
  }, { transaction });

  await recalculateRequestTotals(request, transaction);

  await logAction({
    req,
    action: 'refund',
    module: 'payments',
    recordId: refund.id,
    newData: refund.toJSON(),
    transaction
  });

  return Payment.findByPk(refund.id, { include: includePayment, transaction });
});

module.exports = { includePayment, createPayment, voidPayment, refundPayment, recalculateRequestTotals };
