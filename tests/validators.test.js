const schemas = require('../src/validators/schemas');

describe('validator contracts', () => {
  it('does not allow purchase order status through metadata updates', () => {
    const result = schemas.purchaseOrderUpdate.validate({
      status: 'received',
      notes: 'keep status transitions on action endpoints'
    }, { stripUnknown: true });

    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({ notes: 'keep status transitions on action endpoints' });
  });

  it('accepts stock request list filters for server-side pagination', () => {
    const result = schemas.stockRequestListQuery.validate({
      page: '2',
      limit: '12',
      search: 'REQ',
      request_status: 'approved',
      request_type: 'stock_out',
      payment_status: 'partially_paid'
    }, { stripUnknown: true });

    expect(result.error).toBeUndefined();
    expect(result.value).toEqual(expect.objectContaining({
      page: 2,
      limit: 12,
      request_status: 'approved',
      request_type: 'stock_out',
      payment_status: 'partially_paid'
    }));
  });

  it('accepts full draft stock request edits with line items', () => {
    const result = schemas.stockRequestUpdate.validate({
      driver_id: 1,
      request_date: '2026-05-21',
      request_type: 'stock_out',
      discount_amount: 2,
      notes: 'updated',
      items: [{ id: 10, item_id: 3, quantity: 5, unit_price: 7.5 }]
    }, { stripUnknown: true });

    expect(result.error).toBeUndefined();
    expect(result.value.items).toHaveLength(1);
  });

  it('accepts empty stock request reconciliation payloads', () => {
    const result = schemas.stockRequestReconcile.validate({}, { stripUnknown: true });

    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({});
  });
});
