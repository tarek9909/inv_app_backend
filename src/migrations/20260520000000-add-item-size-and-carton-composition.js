'use strict';

const columnExists = async (queryInterface, table, column) => {
  try {
    const description = await queryInterface.describeTable(table);
    return Boolean(description[column]);
  } catch {
    return false;
  }
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const addColumn = async (column, definition) => {
      if (!(await columnExists(queryInterface, 'items', column))) {
        await queryInterface.addColumn('items', column, definition);
      }
    };

    await addColumn('size_value', { type: Sequelize.DECIMAL(12, 3), allowNull: true });
    await addColumn('size_unit', { type: Sequelize.STRING(20), allowNull: true });
    await addColumn('is_carton', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    await addColumn('carton_item_id', {
      type: Sequelize.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'items', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });
    await addColumn('carton_quantity', { type: Sequelize.DECIMAL(12, 3), allowNull: true });
  },

  async down(queryInterface) {
    const removeColumn = async (column) => {
      if (await columnExists(queryInterface, 'items', column)) await queryInterface.removeColumn('items', column);
    };

    await removeColumn('carton_quantity');
    await removeColumn('carton_item_id');
    await removeColumn('is_carton');
    await removeColumn('size_unit');
    await removeColumn('size_value');
  }
};
