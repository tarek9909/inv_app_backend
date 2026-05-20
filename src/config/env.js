require('dotenv').config();

const parseList = (value) => String(value || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const parseBoolean = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
const DEFAULT_DEV_JWT_SECRET = 'development_only_change_me';
const jwtSecret = process.env.JWT_SECRET || DEFAULT_DEV_JWT_SECRET;
const env = process.env.NODE_ENV || 'development';

if (env === 'production' && (!process.env.JWT_SECRET || jwtSecret === DEFAULT_DEV_JWT_SECRET || jwtSecret === 'replace_with_a_long_random_secret')) {
  throw new Error('JWT_SECRET must be configured with a strong non-default value in production');
}

module.exports = {
  env,
  port: Number(process.env.PORT || 3000),
  trustProxy: parseBoolean(process.env.TRUST_PROXY),
  cors: {
    origins: parseList(process.env.CORS_ORIGIN),
    allowNoOrigin: parseBoolean(process.env.CORS_ALLOW_NO_ORIGIN)
  },
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    name: process.env.DB_NAME || 'stock_driver_system',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    ssl: parseBoolean(process.env.DB_SSL),
    autoMigrate: String(process.env.DB_AUTO_MIGRATE || 'true').toLowerCase() !== 'false'
  },
  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '1d'
  },
  qz: {
    certificate: process.env.QZ_CERTIFICATE || '',
    privateKey: process.env.QZ_PRIVATE_KEY || ''
  }
};
