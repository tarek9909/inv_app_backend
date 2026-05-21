describe('payment service request type rules', () => {
  const loadService = ({ request, payment = null, ledger = [], createdPayment = null } = {}) => {
    jest.resetModules();

    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const requestRow = request ? {
      ...request,
      update: jest.fn(async function update(values) {
        Object.assign(this, values);
      })
    } : null;
    const paymentRow = payment ? {
      ...payment,
      toJSON: jest.fn(() => ({ ...payment })),
      update: jest.fn(async function update(values) {
        Object.assign(this, values);
      })
    } : null;
    const newPayment = createdPayment || {
      id: 99,
      payment_number: 'PAY-99',
      amount: 10,
      toJSON: jest.fn(() => ({ id: 99, payment_number: 'PAY-99' }))
    };
    const models = {
      sequelize: { transaction: jest.fn((callback) => callback(transaction)) },
      Payment: {
        create: jest.fn().mockResolvedValue(newPayment),
        findAll: jest.fn().mockResolvedValue(ledger),
        findByPk: jest.fn()
      },
      StockRequest: {
        findByPk: jest.fn().mockResolvedValue(requestRow)
      },
      Driver: {}
    };
    models.Payment.findByPk
      .mockResolvedValueOnce(paymentRow)
      .mockResolvedValue(newPayment);

    jest.doMock('../src/models', () => models);
    jest.doMock('../src/services/auditService', () => ({ logAction: jest.fn() }));
    jest.doMock('../src/utils/numbers', () => ({
      generateNumber: jest.fn(() => 'PAY-1'),
      toMoney: jest.fn((value) => Number(Number(value || 0).toFixed(2)))
    }));

    return { service: require('../src/services/paymentService'), models, requestRow, paymentRow, newPayment };
  };

  it('rejects payments for stock return requests', async () => {
    const { service, models } = loadService({
      request: {
        id: 1,
        request_type: 'stock_return',
        request_status: 'completed',
        payment_status: 'paid'
      }
    });

    await expect(service.createPayment({ stock_request_id: 1, amount: 5 }, { user: { id: 1 } }))
      .rejects.toMatchObject({ statusCode: 400, message: 'Payments can only be recorded for stock out requests' });
    expect(models.Payment.create).not.toHaveBeenCalled();
  });

  it.each(['pending', 'approved'])('rejects standalone payments for %s stock out requests', async (requestStatus) => {
    const { service, models } = loadService({
      request: {
        id: 2,
        request_type: 'stock_out',
        request_status: requestStatus,
        payment_status: 'pending',
        remaining_amount: 100,
        total_amount: 100
      }
    });

    await expect(service.createPayment({ stock_request_id: 2, amount: 10 }, { user: { id: 1 } }))
      .rejects.toMatchObject({ statusCode: 400, message: 'Payments can only be recorded after a stock request is completed' });
    expect(models.Payment.create).not.toHaveBeenCalled();
  });

  it('accepts standalone payments for completed stock out requests with remaining balance', async () => {
    const { service, models, requestRow } = loadService({
      request: {
        id: 3,
        driver_id: 7,
        request_type: 'stock_out',
        request_status: 'completed',
        payment_status: 'pending',
        paid_amount: 0,
        remaining_amount: 100,
        total_amount: 100
      },
      ledger: [{ amount: 25 }]
    });

    await service.createPayment({
      stock_request_id: 3,
      amount: 25,
      payment_method: 'cash',
      payment_date: '2026-05-21'
    }, { user: { id: 5 } });

    expect(models.Payment.create).toHaveBeenCalledWith(expect.objectContaining({
      stock_request_id: 3,
      driver_id: 7,
      amount: 25
    }), expect.any(Object));
    expect(requestRow.update).toHaveBeenCalledWith(expect.objectContaining({
      paid_amount: 25,
      remaining_amount: 75,
      payment_status: 'partially_paid',
      paid_by: null,
      paid_at: null
    }), expect.any(Object));
  });

  it('voiding a payment nets the original and reversal to zero', async () => {
    const { service, models, requestRow, paymentRow } = loadService({
      request: {
        id: 4,
        driver_id: 8,
        request_type: 'stock_out',
        request_status: 'completed',
        payment_status: 'paid',
        paid_amount: 40,
        remaining_amount: 0,
        total_amount: 40,
        paid_by: 5,
        paid_at: new Date('2026-05-21T00:00:00Z')
      },
      payment: {
        id: 11,
        stock_request_id: 4,
        payment_number: 'PAY-11',
        amount: 40,
        payment_method: 'cash',
        is_void: false
      },
      ledger: [{ amount: 40, is_void: true }, { amount: -40, is_void: false }]
    });

    await service.voidPayment(11, { reason: 'duplicate' }, { user: { id: 9 } });

    expect(models.Payment.create).toHaveBeenCalledWith(expect.objectContaining({
      stock_request_id: 4,
      driver_id: 8,
      amount: -40,
      is_void: false
    }), expect.any(Object));
    expect(paymentRow.update).toHaveBeenCalledWith(expect.objectContaining({
      is_void: true,
      voided_by: 9,
      void_reason: 'duplicate'
    }), expect.any(Object));
    expect(requestRow.update).toHaveBeenCalledWith(expect.objectContaining({
      paid_amount: 0,
      remaining_amount: 40,
      payment_status: 'pending',
      paid_by: null,
      paid_at: null
    }), expect.any(Object));
  });

  it('recalculates correctly when one of multiple payments is voided', async () => {
    const { service, requestRow } = loadService({
      request: {
        id: 5,
        driver_id: 8,
        request_type: 'stock_out',
        request_status: 'completed',
        payment_status: 'partially_paid',
        paid_amount: 50,
        remaining_amount: 50,
        total_amount: 100
      },
      payment: {
        id: 12,
        stock_request_id: 5,
        payment_number: 'PAY-12',
        amount: 30,
        payment_method: 'cash',
        is_void: false
      },
      ledger: [{ amount: 30, is_void: true }, { amount: 20 }, { amount: -30 }]
    });

    await service.voidPayment(12, { reason: 'wrong request' }, { user: { id: 9 } });

    expect(requestRow.update).toHaveBeenCalledWith(expect.objectContaining({
      paid_amount: 20,
      remaining_amount: 80,
      payment_status: 'partially_paid'
    }), expect.any(Object));
  });

  it('refunds reduce paid amount without going negative', async () => {
    const { service, requestRow } = loadService({
      request: {
        id: 6,
        driver_id: 9,
        request_type: 'stock_out',
        request_status: 'completed',
        payment_status: 'paid',
        paid_amount: 50,
        remaining_amount: 0,
        total_amount: 50,
        paid_by: 5,
        paid_at: new Date('2026-05-21T00:00:00Z')
      },
      ledger: [{ amount: 50 }, { amount: -20 }]
    });

    await service.refundPayment({
      stock_request_id: 6,
      amount: 20,
      payment_method: 'cash',
      reason: 'returned cash'
    }, { user: { id: 9 } });

    expect(requestRow.update).toHaveBeenCalledWith(expect.objectContaining({
      paid_amount: 30,
      remaining_amount: 20,
      payment_status: 'partially_paid',
      paid_by: null,
      paid_at: null
    }), expect.any(Object));
  });
});
