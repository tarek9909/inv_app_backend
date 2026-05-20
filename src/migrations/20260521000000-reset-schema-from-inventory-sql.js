'use strict';

const fs = require('fs');
const path = require('path');

const MIGRATION_TABLES = new Set(['sequelize_meta', 'sequelizemeta']);
const BASE_SCHEMA_MIGRATION = '20260518000000-create-stock-driver-schema.js';

const quoteIdentifier = (identifier) => `\`${String(identifier).replace(/`/g, '``')}\``;

const normalizeTableName = (table) => {
  if (typeof table === 'string') return table;
  return table.tableName || table.table_name || Object.values(table)[0];
};

const splitSqlStatements = (sql) => {
  const statements = [];
  let current = '';
  let quote = null;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    const previous = sql[index - 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        current += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (!quote && char === '-' && next === '-' && (index === 0 || /\s/.test(previous || ''))) {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (!quote && char === '#') {
      inLineComment = true;
      continue;
    }

    if (!quote && char === '/' && next === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (quote) {
      current += char;
      if (char === quote) {
        if (quote === '`' && next === '`') {
          current += next;
          index += 1;
        } else if ((quote === '\'' || quote === '"') && next === quote) {
          current += next;
          index += 1;
        } else if (previous !== '\\') {
          quote = null;
        }
      }
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
      current += char;
      continue;
    }

    if (char === ';') {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = '';
      continue;
    }

    current += char;
  }

  const lastStatement = current.trim();
  if (lastStatement) statements.push(lastStatement);
  return statements;
};

const shouldRunStatement = (statement) => {
  const normalized = statement.trim().replace(/\s+/g, ' ').toUpperCase();
  return normalized
    && normalized !== 'START TRANSACTION'
    && normalized !== 'COMMIT'
    && normalized !== 'ROLLBACK';
};

const splitCommaClauses = (value) => {
  const clauses = [];
  let current = '';
  let quote = null;
  let depth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];
    const previous = value[index - 1];

    if (quote) {
      current += char;
      if (char === quote) {
        if (quote === '`' && next === '`') {
          current += next;
          index += 1;
        } else if ((quote === '\'' || quote === '"') && next === quote) {
          current += next;
          index += 1;
        } else if (previous !== '\\') {
          quote = null;
        }
      }
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
      current += char;
      continue;
    }

    if (char === '(') depth += 1;
    if (char === ')' && depth > 0) depth -= 1;

    if (char === ',' && depth === 0) {
      const clause = current.trim();
      if (clause) clauses.push(clause);
      current = '';
      continue;
    }

    current += char;
  }

  const finalClause = current.trim();
  if (finalClause) clauses.push(finalClause);
  return clauses;
};

const collectPrimaryKeyClauses = (statements) => {
  const primaryKeys = new Map();

  statements.forEach((statement) => {
    const match = statement.match(/^ALTER\s+TABLE\s+`([^`]+)`\s+([\s\S]+)$/i);
    if (!match) return;

    const [, tableName, alterBody] = match;
    const primaryKeyClause = splitCommaClauses(alterBody)
      .find((clause) => /^\s*ADD\s+PRIMARY\s+KEY\b/i.test(clause));

    if (primaryKeyClause) {
      primaryKeys.set(tableName, primaryKeyClause.replace(/^\s*ADD\s+/i, '').trim());
    }
  });

  return primaryKeys;
};

const addPrimaryKeyToCreateStatement = (statement, primaryKeyClause) => {
  if (!primaryKeyClause || /\bPRIMARY\s+KEY\b/i.test(statement)) return statement;

  const engineMatch = statement.match(/\r?\n\)\s*ENGINE=/i);
  if (engineMatch?.index == null) {
    const closeIndex = statement.lastIndexOf(')');
    if (closeIndex === -1) return statement;
    return `${statement.slice(0, closeIndex)},\n  ${primaryKeyClause}\n${statement.slice(closeIndex)}`;
  }

  return `${statement.slice(0, engineMatch.index)},\n  ${primaryKeyClause}${statement.slice(engineMatch.index)}`;
};

const removePrimaryKeyFromAlterStatement = (statement) => {
  const match = statement.match(/^ALTER\s+TABLE\s+`([^`]+)`\s+([\s\S]+)$/i);
  if (!match) return statement;

  const [, tableName, alterBody] = match;
  const clauses = splitCommaClauses(alterBody)
    .filter((clause) => !/^\s*ADD\s+PRIMARY\s+KEY\b/i.test(clause));

  if (!clauses.length) return null;
  return `ALTER TABLE \`${tableName}\`\n  ${clauses.join(',\n  ')}`;
};

const makePrimaryKeySafeDumpStatements = (statements) => {
  const primaryKeys = collectPrimaryKeyClauses(statements);

  return statements
    .map((statement) => {
      const createMatch = statement.match(/^CREATE\s+TABLE\s+`([^`]+)`/i);
      if (createMatch) {
        return addPrimaryKeyToCreateStatement(statement, primaryKeys.get(createMatch[1]));
      }

      if (/^ALTER\s+TABLE\s+`[^`]+`\s+[\s\S]*ADD\s+PRIMARY\s+KEY\b/i.test(statement)) {
        return removePrimaryKeyFromAlterStatement(statement);
      }

      return statement;
    })
    .filter(Boolean);
};

const dropExistingTables = async (queryInterface) => {
  const sequelize = queryInterface.sequelize;
  const [databaseRows] = await sequelize.query('SELECT DATABASE() AS database_name');
  const databaseName = databaseRows[0]?.database_name;
  if (!databaseName) throw new Error('Could not resolve active database before schema reset');

  const [objects] = await sequelize.query(`
    SELECT TABLE_NAME AS table_name, TABLE_TYPE AS table_type
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = ?
  `, { replacements: [databaseName] });

  const views = objects
    .filter((object) => String(object.table_type).toUpperCase() === 'VIEW')
    .map((object) => object.table_name)
    .filter((tableName) => !MIGRATION_TABLES.has(String(tableName).toLowerCase()));

  const tables = objects
    .filter((object) => String(object.table_type).toUpperCase() !== 'VIEW')
    .map((object) => object.table_name)
    .filter((tableName) => !MIGRATION_TABLES.has(String(tableName).toLowerCase()));

  for (const view of views) {
    await sequelize.query(`DROP VIEW IF EXISTS ${quoteIdentifier(view)}`);
  }

  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const table of tables) {
      await sequelize.query(`DROP TABLE IF EXISTS ${quoteIdentifier(table)}`);
    }
  } finally {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  }
};

const importInventorySql = async (queryInterface) => {
  const inventorySqlPath = path.resolve(__dirname, '../../inventory.sql');
  if (!fs.existsSync(inventorySqlPath)) {
    throw new Error(`Cannot reset database because inventory.sql was not found at ${inventorySqlPath}`);
  }

  const sql = fs.readFileSync(inventorySqlPath, 'utf8');
  const statements = makePrimaryKeySafeDumpStatements(splitSqlStatements(sql).filter(shouldRunStatement));

  await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const statement of statements) {
      await queryInterface.sequelize.query(statement);
    }
  } finally {
    await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  }
};

const postBaselineMigrationFiles = () => {
  const thisFile = path.basename(__filename);
  return fs.readdirSync(__dirname)
    .filter((file) => file.endsWith('.js'))
    .filter((file) => file !== thisFile && file !== BASE_SCHEMA_MIGRATION)
    .filter((file) => file < thisFile)
    .sort();
};

const runPostBaselineMigrations = async (queryInterface, Sequelize) => {
  for (const file of postBaselineMigrationFiles()) {
    const migration = require(path.join(__dirname, file));
    if (typeof migration.up !== 'function') {
      throw new Error(`Migration ${file} does not export an up function`);
    }
    await migration.up(queryInterface, Sequelize);
  }
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await dropExistingTables(queryInterface);
    await importInventorySql(queryInterface);
    await runPostBaselineMigrations(queryInterface, Sequelize);
  },

  async down() {
    // Destructive reset migrations are intentionally not reversible.
  },

  // Exported for focused tests and future maintenance.
  _private: {
    makePrimaryKeySafeDumpStatements,
    normalizeTableName,
    splitCommaClauses,
    splitSqlStatements,
    shouldRunStatement
  }
};
