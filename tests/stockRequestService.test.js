describe('stock request accounting fixes', () => {
  const loadService = ({ request, settingValue = 'print' }) => {
    jest.resetModules();

    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const models = {
      sequelize: { transaction: jest.fn((callback) => callback(transaction)) },
      StockRequest: { findByPk: jest.fn().mockResolvedValue(request) },
      StockRequestItem: { bulkCreate: jest.fn() },
      StockRequestItemConfirmation: { findOne: jest.fn(), create: jest.fn() },
      Driver: { findByPk: jest.fn() },
      UserRole: {},
      Role: {},
      User: {},
      Item: { findByPk: jest.fn() },
      Payment: { create: jest.fn() },
      StockRequestPrint: { create: jest.fn() },
      Setting: { findOne: jest.fn().mockResolvedValue({ setting_value: settingValue }) }
    };

    jest.doMock('../src/models', () => models);
    jest.doMock('../src/services/stockService', () => ({
      changeStock: jest.fn(),
      toEffectiveBaseQuantity: jest.fn((quantity) => Number(quantity))
    }));
    jest.doMock('../src/services/auditService', () => ({ logAction: jest.fn() }));
    jest.doMock('../src/utils/numbers', () => ({
      generateNumber: jest.fn((type) => `${type}-1`),
      toMoney: jest.fn((value) => Number(Number(value || 0).toFixed(2)))
    }));

    return { service: require('../src/services/stockRequestService'), models };
  };

  it('clears remaining balance when cancelling a non-completed request', async () => {
    const request = {
      id: 10,
      request_status: 'pending',
      toJSON: jest.fn(() => ({ id: 10, request_status: 'pending', remaining_amount: 125 })),
      update: jest.fn().mockResolvedValue()
    };
    const { service } = loadService({ request });

    await service.cancelStockRequest(10, { user: { id: 1 } });

    expect(request.update).toHaveBeenCalledWith({
      request_status: 'cancelled',
      payment_status: 'cancelled',
      remaining_amount: 0
    }, expect.any(Object));
  });

  it('completes stock returns as credits without creating payments', async () => {
    const request = {
      id: 11,
      request_number: 'SR-11',
      request_status: 'approved',
      request_type: 'stock_return',
      driver_id: 4,
      items: [],
      paid_amount: 0,
      remaining_amount: 0,
      total_amount: 75,
      toJSON: jest.fn(() => ({ id: 11, request_status: 'approved' })),
      setDataValue: jest.fn(),
      update: jest.fn().mockResolvedValue()
    };
    const { service, models } = loadService({ request });

    await service.completeStockRequest(11, { user: { id: 1 } }, { payment_amount: 75 });

    expect(models.Payment.create).not.toHaveBeenCalled();
    expect(request.update).toHaveBeenCalledWith(expect.objectContaining({
      request_status: 'completed',
      paid_amount: 0,
      remaining_amount: 0,
      payment_status: 'paid'
    }), expect.any(Object));
  });
});
