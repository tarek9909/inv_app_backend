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
});
