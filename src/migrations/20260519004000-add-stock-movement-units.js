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
    const addColumn = async (table, column, definition) => {
      if (!(await columnExists(queryInterface, table, column))) {
        await queryInterface.addColumn(table, column, definition);
      }
    };

    await addColumn('stock_entries', 'base_quantity', { type: Sequelize.DECIMAL(12, 2), allowNull: true });

    await addColumn('purchase_order_items', 'ordered_base_quantity', { type: Sequelize.DECIMAL(12, 2), allowNull: true });
    await addColumn('purchase_order_items', 'received_base_quantity', { type: Sequelize.DECIMAL(12, 2), allowNull: true });

    await addColumn('stock_request_items', 'base_quantity', { type: Sequelize.DECIMAL(12, 2), allowNull: true });

    await addColumn('stock_movements', 'entered_quantity', { type: Sequelize.DECIMAL(12, 2), allowNull: true });
    await addColumn('stock_movements', 'entered_unit_label', { type: Sequelize.STRING(100), allowNull: true });
    await addColumn('stock_movements', 'base_quantity', { type: Sequelize.DECIMAL(12, 2), allowNull: true });
  },

  async down(queryInterface) {
    const removeColumn = async (table, column) => {
      if (await columnExists(queryInterface, table, column)) await queryInterface.removeColumn(table, column);
    };

    await removeColumn('stock_movements', 'base_quantity');
    await removeColumn('stock_movements', 'entered_unit_label');
    await removeColumn('stock_movements', 'entered_quantity');
    await removeColumn('stock_request_items', 'base_quantity');
    await removeColumn('purchase_order_items', 'received_base_quantity');
    await removeColumn('purchase_order_items', 'ordered_base_quantity');
    await removeColumn('stock_entries', 'base_quantity');
  }
};
