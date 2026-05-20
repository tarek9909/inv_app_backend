const app = require('./app');
const config = require('./config/env');
const { sequelize } = require('./models');
const { runPendingMigrations, runRepeatableMigrations } = require('./services/migrationService');

const start = async () => {
  await sequelize.authenticate();
  if (config.db.autoMigrate) {
    await runPendingMigrations(sequelize);
  }
  await runRepeatableMigrations(sequelize);
  app.listen(config.port, () => {
    console.log(`API running on http://localhost:${config.port}`);
    console.log(`Swagger docs on http://localhost:${config.port}/api-docs`);
  });
};

start().catch((error) => {
  console.error('Failed to start API', error);
  process.exit(1);
});
