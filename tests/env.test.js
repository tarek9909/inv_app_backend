describe('environment safeguards', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  it('rejects missing JWT_SECRET in production', () => {
    process.env = { ...originalEnv, NODE_ENV: 'production' };
    delete process.env.JWT_SECRET;

    expect(() => require('../src/config/env')).toThrow('JWT_SECRET must be configured');
  });

  it('rejects default JWT_SECRET in production', () => {
    process.env = { ...originalEnv, NODE_ENV: 'production', JWT_SECRET: 'development_only_change_me' };

    expect(() => require('../src/config/env')).toThrow('JWT_SECRET must be configured');
  });
});
