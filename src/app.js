const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const config = require('./config/env');

const app = express();

if (config.trustProxy || config.env === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      return callback(null, config.env !== 'production' || config.cors.allowNoOrigin);
    }
    if (config.cors.origins.length === 0) {
      return callback(null, config.env !== 'production');
    }
    return callback(null, config.cors.origins.includes(origin));
  },
  credentials: true
}));
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));
app.use(morgan(process.env.NODE_ENV === 'test' ? 'tiny' : 'dev'));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 }));

app.get('/health', (req, res) => {
  res.json({ success: true, message: 'API is healthy', data: {}, meta: {} });
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use('/api/v1', routes);
app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found', errors: [] }));
app.use(errorHandler);

module.exports = app;
