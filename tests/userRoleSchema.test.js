describe('new user-role and driver-link schema', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('../src/models');
  });

  it('normalizes a user_roles row into the public user role shape', () => {
    const { normalizeUserRole } = require('../src/services/userService');
    const role = { id: 4, name: 'Driver', code: 'driver' };
    const driver = { id: 1, user_id: 7, full_name: 'Ahmad Driver' };
    const user = {
      id: 7,
      user_role: { role_id: 4, role },
      driver,
      get(key) { return this[key]; },
      setDataValue(key, value) { this[key] = value; }
    };

    normalizeUserRole(user);

    expect(user.role).toBe(role);
    expect(user.role_id).toBe(4);
    expect(user.driver_link).toEqual({ driver_id: 1, user_id: 7, driver });
  });

  it('normalizes Sequelize-style nested user role instances', () => {
    const { normalizeUserRole } = require('../src/services/userService');
    const role = { id: 1, name: 'Admin', code: 'admin' };
    const userRole = {
      dataValues: { role_id: 1, role },
      get(key) { return this.dataValues[key]; }
    };
    const user = {
      dataValues: { id: 1, user_role: userRole },
      get(key) { return this.dataValues[key]; },
      setDataValue(key, value) { this.dataValues[key] = value; }
    };

    normalizeUserRole(user);

    expect(user.dataValues.role).toBe(role);
    expect(user.dataValues.role_id).toBe(1);
  });

  it('creates users without users.role_id and writes the role into user_roles', async () => {
    jest.resetModules();
    const transaction = {};
    const role = { id: 4, name: 'Driver', code: 'driver' };
    const user = {
      id: 7,
      full_name: 'Driver User',
      email: 'driver@example.com',
      user_role: { role_id: 4, role },
      get(key) { return this[key]; },
      setDataValue(key, value) { this[key] = value; }
    };
    const User = {
      create: jest.fn().mockResolvedValue(user),
      findByPk: jest.fn().mockResolvedValue(user)
    };
    const UserRole = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({})
    };
    const sequelize = { transaction: jest.fn((callback) => callback(transaction)) };

    jest.doMock('../src/models', () => ({ sequelize, User, UserRole, Role: {}, Driver: {} }));
    const { createUser } = require('../src/services/userService');

    await createUser({
      role_id: 4,
      full_name: 'Driver User',
      email: 'driver@example.com',
      password: 'secret123'
    });

    expect(User.create.mock.calls[0][0]).not.toHaveProperty('role_id');
    expect(UserRole.create).toHaveBeenCalledWith({ user_id: 7, role_id: 4 }, { transaction });
  });

  it('finds notification recipients through user_roles', async () => {
    jest.resetModules();
    const users = [{ id: 1, full_name: 'System Admin', email: 'admin@example.com' }];
    const query = jest.fn().mockResolvedValue(users);

    jest.doMock('../src/models', () => ({
      sequelize: { query, QueryTypes: { SELECT: 'SELECT' } },
      Notification: { bulkCreate: jest.fn() }
    }));
    const notificationService = require('../src/services/notificationService');

    await expect(notificationService.usersWithPermission('stock_requests.view')).resolves.toEqual(users);
    expect(query.mock.calls[0][0]).toContain('JOIN user_roles ur ON ur.user_id = u.id');
    expect(query.mock.calls[0][0]).not.toContain('u.role_id');
  });
});
