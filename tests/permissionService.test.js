describe('permission service catalog sync', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('../src/models');
  });

  it('normalizes permission catalog rows to the database/API shape', () => {
    const { catalogPermissionRows } = require('../src/services/permissionService');
    const row = catalogPermissionRows().find((permission) => permission.permission_key === 'items.view');

    expect(row).toEqual({
      permission_key: 'items.view',
      module: 'Inventory',
      feature: 'Items',
      description: 'View items'
    });
    expect(row).not.toHaveProperty('key');
  });

  it('creates default role permission links from the catalog', async () => {
    jest.resetModules();
    const transaction = {};
    const Permission = {
      bulkCreate: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockImplementation(() => {
        const { permissions } = require('../src/config/permissions');
        return Promise.resolve(permissions.map((permission, index) => ({
          id: index + 1,
          permission_key: permission.key
        })));
      })
    };
    const Role = {
      findAll: jest.fn().mockResolvedValue([
        { id: 1, code: 'admin' },
        { id: 2, code: 'inventory' },
        { id: 3, code: 'accountant' },
        { id: 4, code: 'driver' }
      ])
    };
    const RolePermission = {
      bulkCreate: jest.fn().mockResolvedValue([])
    };
    const sequelize = { transaction: jest.fn((callback) => callback(transaction)) };

    jest.doMock('../src/models', () => ({ Permission, Role, RolePermission, sequelize }));
    const { syncPermissionCatalog } = require('../src/services/permissionService');

    await syncPermissionCatalog();

    expect(Permission.bulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ permission_key: 'items.view' })]),
      expect.objectContaining({ updateOnDuplicate: ['module', 'feature', 'description'], transaction })
    );
    expect(RolePermission.bulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role_id: 2 }),
        expect.objectContaining({ role_id: 3 }),
        expect.objectContaining({ role_id: 4 })
      ]),
      { ignoreDuplicates: true, transaction }
    );
  });
});
