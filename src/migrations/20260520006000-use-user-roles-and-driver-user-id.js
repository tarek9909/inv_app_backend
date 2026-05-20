'use strict';

const isDuplicateOrExists = (error) => {
  const code = error?.parent?.code || error?.original?.code;
  return ['ER_DUP_FIELDNAME', 'ER_TABLE_EXISTS_ERROR', 'ER_DUP_KEYNAME', 'ER_CANT_DROP_FIELD_OR_KEY', 'ER_FK_DUP_NAME', '42S01', '42S21'].includes(code)
    || /already exists|duplicate column|duplicate key|check that column\/key exists/i.test(error?.message || '');
};

const safe = async (action) => {
  try {
    await action();
  } catch (error) {
    if (!isDuplicateOrExists(error)) throw error;
  }
};

const tableExists = async (queryInterface, table) => {
  try {
    await queryInterface.describeTable(table);
    return true;
  } catch {
    return false;
  }
};

const columnExists = async (queryInterface, table, column) => {
  try {
    const columns = await queryInterface.describeTable(table);
    return Boolean(columns[column]);
  } catch {
    return false;
  }
};

const dropForeignKeyIfExists = async (queryInterface, table, constraintName) => {
  await safe(() => queryInterface.sequelize.query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${constraintName}\``));
};

const dropIndexIfExists = async (queryInterface, table, indexName) => {
  await safe(() => queryInterface.sequelize.query(`ALTER TABLE \`${table}\` DROP INDEX \`${indexName}\``));
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS user_roles (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        role_id BIGINT UNSIGNED NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_user_roles_user (user_id),
        KEY idx_user_roles_role (role_id),
        CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await safe(() => queryInterface.addIndex('user_roles', ['user_id'], { name: 'uq_user_roles_user', unique: true }));
    await safe(() => queryInterface.addIndex('user_roles', ['role_id'], { name: 'idx_user_roles_role' }));
    await safe(() => queryInterface.addConstraint('user_roles', {
      fields: ['user_id'],
      type: 'foreign key',
      name: 'fk_user_roles_user',
      references: { table: 'users', field: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    }));
    await safe(() => queryInterface.addConstraint('user_roles', {
      fields: ['role_id'],
      type: 'foreign key',
      name: 'fk_user_roles_role',
      references: { table: 'roles', field: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    }));

    if (await columnExists(queryInterface, 'users', 'role_id')) {
      await queryInterface.sequelize.query(`
        INSERT INTO user_roles (user_id, role_id)
        SELECT id, role_id
        FROM users
        WHERE role_id IS NOT NULL
        ON DUPLICATE KEY UPDATE role_id = VALUES(role_id)
      `);
    }

    if (!(await columnExists(queryInterface, 'drivers', 'user_id'))) {
      await safe(() => queryInterface.addColumn('drivers', 'user_id', {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true
      }));
    }

    if (await tableExists(queryInterface, 'driver_user_links')) {
      await queryInterface.sequelize.query(`
        UPDATE drivers d
        JOIN driver_user_links dul ON dul.driver_id = d.id
        SET d.user_id = dul.user_id
        WHERE d.user_id IS NULL
      `);
    }

    await safe(() => queryInterface.addIndex('drivers', ['user_id'], { name: 'uq_drivers_user', unique: true }));
    await safe(() => queryInterface.addConstraint('drivers', {
      fields: ['user_id'],
      type: 'foreign key',
      name: 'fk_drivers_user',
      references: { table: 'users', field: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    }));

    if (await tableExists(queryInterface, 'driver_user_links')) {
      await queryInterface.dropTable('driver_user_links');
    }

    if (await columnExists(queryInterface, 'users', 'role_id')) {
      await dropForeignKeyIfExists(queryInterface, 'users', 'fk_users_role');
      await dropIndexIfExists(queryInterface, 'users', 'fk_users_role');
      await safe(() => queryInterface.removeColumn('users', 'role_id'));
    }
  },

  async down() {
    // Intentionally not reversible without risking loss of current user/driver links.
  }
};
