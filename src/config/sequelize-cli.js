require('dotenv').config();

const dbSslEnabled = ['1', 'true', 'yes', 'on'].includes(String(process.env.DB_SSL || '').toLowerCase());

const base = {
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'stock_driver_system',
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  dialect: 'mysql',
  logging: false,
  dialectOptions: dbSslEnabled ? { ssl: { require: true, rejectUnauthorized: false } } : {},
  migrationStorageTableName: 'sequelize_meta',
  seederStorage: 'sequelize',
  seederStorageTableName: 'sequelize_data'
};

module.exports = {
  development: base,
  test: { ...base, database: process.env.DB_TEST_NAME || `${base.database}_test` },
  production: {
    ...base
  }
};
