describe('payment service request type rules', () => {
  it('rejects payments for stock return requests', async () => {
    jest.resetModules();

    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const models = {
      sequelize: { transaction: jest.fn((callback) => callback(transaction)) },
      Payment: { create: jest.fn() },
      StockRequest: {
        findByPk: jest.fn().mockResolvedValue({
          id: 1,
          request_type: 'stock_return',
          request_status: 'completed',
          payment_status: 'paid'
        })
      },
      Driver: {}
    };

    jest.doMock('../src/models', () => models);
    jest.doMock('../src/services/auditService', () => ({ logAction: jest.fn() }));
    jest.doMock('../src/utils/numbers', () => ({
      generateNumber: jest.fn(() => 'PAY-1'),
      toMoney: jest.fn((value) => Number(value))
    }));

    const service = require('../src/services/paymentService');
    await expect(service.createPayment({ stock_request_id: 1, amount: 5 }, { user: { id: 1 } }))
      .rejects.toMatchObject({ statusCode: 400, message: 'Payments can only be recorded for stock out requests' });
    expect(models.Payment.create).not.toHaveBeenCalled();
  });
});
