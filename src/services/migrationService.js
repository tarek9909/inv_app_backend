const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');

const MIGRATION_TABLE = 'sequelize_meta';
const STARTUP_MIGRATION_SKIP = new Set([
  '20260521000000-reset-schema-from-inventory-sql.js'
]);

const ensureMigrationTable = async (queryInterface) => {
  await queryInterface.createTable(MIGRATION_TABLE, {
    name: {
      type: Sequelize.STRING,
      allowNull: false,
      primaryKey: true
    }
  }).catch((error) => {
    const code = error?.parent?.code || error?.original?.code;
    if (!['ER_TABLE_EXISTS_ERROR', '42S01'].includes(code) && !/already exists/i.test(error?.message || '')) {
      throw error;
    }
  });
};

const loadAppliedMigrationNames = async (sequelize) => {
  const [rows] = await sequelize.query(`SELECT name FROM ${MIGRATION_TABLE}`);
  return new Set(rows.map((row) => row.name));
};

const listMigrationFiles = () => {
  const migrationsDir = path.resolve(__dirname, '../migrations');
  return fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.js'))
    .filter((file) => !STARTUP_MIGRATION_SKIP.has(file))
    .sort()
    .map((file) => ({ file, fullPath: path.join(migrationsDir, file) }));
};

const listRepeatableMigrationFiles = () => {
  const migrationsDir = path.resolve(__dirname, '../migrations/repeatable');
  if (!fs.existsSync(migrationsDir)) return [];
  return fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.js'))
    .sort()
    .map((file) => ({ file, fullPath: path.join(migrationsDir, file) }));
};

const runPendingMigrations = async (sequelize) => {
  const queryInterface = sequelize.getQueryInterface();
  await ensureMigrationTable(queryInterface);

  const applied = await loadAppliedMigrationNames(sequelize);
  const pending = listMigrationFiles().filter(({ file }) => !applied.has(file));
  if (!pending.length) return [];

  const appliedNow = [];
  for (const { file, fullPath } of pending) {
    const migration = require(fullPath);
    if (typeof migration.up !== 'function') {
      throw new Error(`Migration ${file} does not export an up function`);
    }

    console.log(`Applying database migration ${file}`);
    await migration.up(queryInterface, Sequelize);
    await queryInterface.bulkInsert(MIGRATION_TABLE, [{ name: file }]);
    appliedNow.push(file);
  }

  return appliedNow;
};

const runRepeatableMigrations = async (sequelize) => {
  const queryInterface = sequelize.getQueryInterface();
  const ran = [];

  for (const { file, fullPath } of listRepeatableMigrationFiles()) {
    const migration = require(fullPath);
    if (typeof migration.up !== 'function') {
      throw new Error(`Repeatable migration ${file} does not export an up function`);
    }

    console.log(`Checking repeatable database migration ${file}`);
    await migration.up(queryInterface, Sequelize);
    ran.push(file);
  }

  return ran;
};

module.exports = { runPendingMigrations, runRepeatableMigrations };
