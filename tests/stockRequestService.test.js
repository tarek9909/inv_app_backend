describe('stock request accounting fixes', () => {
  const loadService = ({ request, settingValue = 'print' }) => {
    jest.resetModules();

    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const models = {
      sequelize: { transaction: jest.fn((callback) => callback(transaction)) },
      StockRequest: { findByPk: jest.fn().mockResolvedValue(request) },
      StockRequestItem: { bulkCreate: jest.fn(), destroy: jest.fn(), findAll: jest.fn(), create: jest.fn() },
      StockRequestItemConfirmation: { findOne: jest.fn(), create: jest.fn() },
      StockReservation: { bulkCreate: jest.fn(), update: jest.fn() },
      Driver: { findByPk: jest.fn() },
      UserRole: {},
      Role: {},
      User: {},
      Item: { findByPk: jest.fn() },
      Payment: { count: jest.fn().mockResolvedValue(0), create: jest.fn() },
      StockRequestPrint: { create: jest.fn() },
      Setting: { findOne: jest.fn().mockResolvedValue({ setting_value: settingValue }) }
    };
    const stockService = {
      changeStock: jest.fn(),
      toEffectiveBaseQuantity: jest.fn((quantity, item) => item?.is_carton ? Number(quantity) * Number(item.carton_quantity || 0) : Number(quantity)),
      getAvailableBaseStock: jest.fn()
    };

    jest.doMock('../src/models', () => models);
    jest.doMock('../src/services/stockService', () => stockService);
    jest.doMock('../src/services/auditService', () => ({ logAction: jest.fn() }));
    jest.doMock('../src/utils/numbers', () => ({
      generateNumber: jest.fn((type) => `${type}-1`),
      toMoney: jest.fn((value) => Number(Number(value || 0).toFixed(2)))
    }));

    return { service: require('../src/services/stockRequestService'), models, stockService };
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

  it('stores driver receipt quantities from submitted confirmations', async () => {
    const request = {
      id: 12,
      request_status: 'approved',
      driver_id: 4,
      driver_invoice_viewed_at: new Date(),
      items: [{ id: 101, quantity: 10 }],
      toJSON: jest.fn(() => ({ id: 12, request_status: 'approved' })),
      setDataValue: jest.fn(),
      update: jest.fn().mockResolvedValue()
    };
    const { service, models } = loadService({ request });

    await service.submitDriverReceipt(12, { id: 4 }, {
      notes: 'two missing',
      items: [{ stock_request_item_id: 101, confirmed: true, confirmed_quantity: 8 }]
    }, { user: { id: 4 } });

    expect(models.StockRequestItemConfirmation.create).toHaveBeenCalledWith(expect.objectContaining({
      stock_request_id: 12,
      stock_request_item_id: 101,
      confirmed: true,
      confirmed_quantity: 8
    }), expect.any(Object));
  });

  it('rejects received quantities greater than requested quantities', async () => {
    const request = {
      id: 13,
      request_status: 'approved',
      driver_id: 4,
      driver_invoice_viewed_at: new Date(),
      items: [{ id: 102, quantity: 10 }],
      toJSON: jest.fn(() => ({ id: 13, request_status: 'approved' })),
      setDataValue: jest.fn(),
      update: jest.fn().mockResolvedValue()
    };
    const { service } = loadService({ request });

    await expect(service.submitDriverReceipt(13, { id: 4 }, {
      items: [{ stock_request_item_id: 102, confirmed: true, confirmed_quantity: 11 }]
    }, { user: { id: 4 } })).rejects.toThrow('Confirmed quantity cannot exceed requested quantity');
  });

  it('reserves carton requests against the contained stock item using base quantity', async () => {
    const carton = { id: 20, name: 'Water Carton', is_carton: true, carton_item_id: 7, carton_quantity: 12 };
    const contained = { id: 7, name: 'Water Bottle', current_stock: 200 };
    const request = {
      id: 14,
      request_number: 'SR-14',
      request_status: 'pending',
      request_type: 'stock_out',
      items: [{ id: 201, item_id: 20, quantity: 2, base_quantity: 24, item: carton }],
      toJSON: jest.fn(() => ({ id: 14, request_status: 'pending' })),
      setDataValue: jest.fn(),
      update: jest.fn().mockResolvedValue()
    };
    const { service, models, stockService } = loadService({ request });
    stockService.getAvailableBaseStock.mockResolvedValue({ targetItem: contained, reserved: 0, availableBase: 100 });

    await service.acceptStockRequest(14, { user: { id: 1 } });

    expect(models.StockReservation.bulkCreate).toHaveBeenCalledWith([expect.objectContaining({
      stock_request_id: 14,
      stock_request_item_id: 201,
      item_id: 7,
      quantity: 24,
      status: 'active'
    })], expect.any(Object));
  });

  it('rejects carton acceptance when contained-item availability is insufficient', async () => {
    const carton = { id: 21, name: 'Juice Carton', is_carton: true, carton_item_id: 8, carton_quantity: 24 };
    const contained = { id: 8, name: 'Juice Bottle', current_stock: 10 };
    const request = {
      id: 15,
      request_number: 'SR-15',
      request_status: 'pending',
      request_type: 'stock_out',
      items: [{ id: 202, item_id: 21, quantity: 1, base_quantity: 24, item: carton }],
      toJSON: jest.fn(() => ({ id: 15, request_status: 'pending' })),
      setDataValue: jest.fn(),
      update: jest.fn().mockResolvedValue()
    };
    const { service, models, stockService } = loadService({ request });
    stockService.getAvailableBaseStock.mockResolvedValue({ targetItem: contained, reserved: 0, availableBase: 10 });

    await expect(service.acceptStockRequest(15, { user: { id: 1 } }))
      .rejects.toThrow('Insufficient available stock for Juice Bottle');
    expect(models.StockReservation.bulkCreate).not.toHaveBeenCalled();
  });

  it('transactionally edits draft request lines and recalculates totals', async () => {
    const oldLine = { id: 301, item_id: 1, quantity: 1, unit_price: 4, update: jest.fn() };
    const request = {
      id: 16,
      request_status: 'draft',
      request_type: 'stock_out',
      driver_id: 1,
      paid_amount: 0,
      request_date: '2026-05-20',
      discount_amount: 0,
      notes: '',
      items: [oldLine],
      toJSON: jest.fn(() => ({ id: 16, request_status: 'draft' })),
      setDataValue: jest.fn(),
      update: jest.fn().mockResolvedValue()
    };
    const { service, models } = loadService({ request });
    models.Driver.findByPk.mockResolvedValue({ id: 2, status: 'active', current_location_id: 9 });
    models.Item.findByPk.mockResolvedValue({ id: 1, is_carton: false });
    models.StockRequestItem.findAll.mockResolvedValue([{ id: 301, item_id: 1, quantity: 3, unit_price: 5 }]);

    await service.updateStockRequest(16, {
      driver_id: 2,
      request_date: '2026-05-21',
      request_type: 'stock_out',
      discount_amount: 2,
      notes: 'updated',
      items: [{ id: 301, item_id: 1, quantity: 3, unit_price: 5 }]
    }, { user: { id: 1 } });

    expect(oldLine.update).toHaveBeenCalledWith(expect.objectContaining({
      quantity: 3,
      unit_price: 5,
      base_quantity: 3
    }), expect.any(Object));
    expect(request.update).toHaveBeenCalledWith(expect.objectContaining({
      driver_id: 2,
      request_date: '2026-05-21',
      subtotal: 15,
      discount_amount: 2,
      total_amount: 13,
      remaining_amount: 13,
      commission_location_id: 9,
      notes: 'updated'
    }), expect.any(Object));
  });

  it('rejects editing requests after approval', async () => {
    const request = {
      id: 17,
      request_status: 'approved',
      items: [],
      toJSON: jest.fn(() => ({ id: 17, request_status: 'approved' })),
      setDataValue: jest.fn()
    };
    const { service } = loadService({ request });

    await expect(service.updateStockRequest(17, { notes: 'late' }, { user: { id: 1 } }))
      .rejects.toThrow('Only draft or pending requests can be edited');
  });

  it('reconciles partial receipts to confirmed quantities and refreshes reservations', async () => {
    const item = { id: 1, name: 'Water', is_carton: false, current_stock: 100 };
    const lineKept = {
      id: 401,
      item_id: 1,
      quantity: 10,
      unit_price: 4,
      item,
      confirmation: { confirmed: true, confirmed_quantity: 6 },
      update: jest.fn().mockResolvedValue()
    };
    const lineRemoved = {
      id: 402,
      item_id: 2,
      quantity: 5,
      unit_price: 3,
      confirmation: { confirmed: false, confirmed_quantity: 0 },
      destroy: jest.fn().mockResolvedValue()
    };
    const request = {
      id: 18,
      request_number: 'SR-18',
      request_status: 'approved',
      request_type: 'stock_out',
      driver_received_at: new Date(),
      paid_amount: 0,
      discount_amount: 0,
      driver_receipt_notes: '',
      items: [lineKept, lineRemoved],
      toJSON: jest.fn(() => ({ id: 18, request_status: 'approved' })),
      setDataValue: jest.fn(),
      update: jest.fn().mockResolvedValue()
    };
    const freshRequest = {
      ...request,
      items: [{ id: 401, item_id: 1, quantity: 6, base_quantity: 6, unit_price: 4, item }]
    };
    const { service, models, stockService } = loadService({ request });
    models.StockRequest.findByPk
      .mockResolvedValueOnce(request)
      .mockResolvedValueOnce(freshRequest)
      .mockResolvedValueOnce(freshRequest);
    models.StockRequestItem.findAll.mockResolvedValue(freshRequest.items);
    stockService.getAvailableBaseStock.mockResolvedValue({ targetItem: item, reserved: 0, availableBase: 100 });

    await service.reconcileStockRequestReceipt(18, { user: { id: 1 } }, { notes: 'match receipt' });

    expect(lineKept.update).toHaveBeenCalledWith(expect.objectContaining({ quantity: 6, base_quantity: 6 }), expect.any(Object));
    expect(lineRemoved.destroy).toHaveBeenCalledWith(expect.any(Object));
    expect(request.update).toHaveBeenCalledWith(expect.objectContaining({
      subtotal: 24,
      total_amount: 24,
      remaining_amount: 24,
      driver_receipt_notes: 'match receipt'
    }), expect.any(Object));
    expect(models.StockReservation.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'released' }), expect.any(Object));
    expect(models.StockReservation.bulkCreate).toHaveBeenCalledWith([expect.objectContaining({
      item_id: 1,
      quantity: 6
    })], expect.any(Object));
  });

  it('rejects reconciliation when no confirmed quantities remain', async () => {
    const request = {
      id: 19,
      request_status: 'approved',
      request_type: 'stock_out',
      driver_received_at: new Date(),
      items: [{
        id: 501,
        quantity: 10,
        confirmation: { confirmed: false, confirmed_quantity: 0 },
        destroy: jest.fn().mockResolvedValue()
      }],
      toJSON: jest.fn(() => ({ id: 19, request_status: 'approved' })),
      setDataValue: jest.fn(),
      update: jest.fn().mockResolvedValue()
    };
    const { service } = loadService({ request });

    await expect(service.reconcileStockRequestReceipt(19, { user: { id: 1 } }, {}))
      .rejects.toThrow('No confirmed quantities remain');
  });
});
