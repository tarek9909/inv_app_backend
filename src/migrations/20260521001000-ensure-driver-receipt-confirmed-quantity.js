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
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS stock_request_item_confirmations (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        stock_request_id BIGINT UNSIGNED NOT NULL,
        stock_request_item_id BIGINT UNSIGNED NOT NULL,
        confirmed TINYINT(1) NOT NULL DEFAULT 0,
        confirmed_quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
        confirmed_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL,
        UNIQUE KEY uq_stock_request_item_confirmation (stock_request_item_id),
        CONSTRAINT fk_sric_request FOREIGN KEY (stock_request_id) REFERENCES stock_requests(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_sric_item FOREIGN KEY (stock_request_item_id) REFERENCES stock_request_items(id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    if (!(await columnExists(queryInterface, 'stock_request_item_confirmations', 'confirmed_quantity'))) {
      await queryInterface.addColumn('stock_request_item_confirmations', 'confirmed_quantity', {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
      });
    }
  },

  async down(queryInterface) {
    if (await columnExists(queryInterface, 'stock_request_item_confirmations', 'confirmed_quantity')) {
      await queryInterface.removeColumn('stock_request_item_confirmations', 'confirmed_quantity');
    }
  }
};
