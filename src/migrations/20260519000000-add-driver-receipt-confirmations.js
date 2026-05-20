'use strict';

const columnExists = async (queryInterface, table, column) => {
  try {
    const description = await queryInterface.describeTable(table);
    return Boolean(description[column]);
  } catch {
    return false;
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

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await columnExists(queryInterface, 'stock_requests', 'driver_invoice_viewed_at'))) {
      await queryInterface.addColumn('stock_requests', 'driver_invoice_viewed_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    if (!(await columnExists(queryInterface, 'stock_requests', 'driver_received_at'))) {
      await queryInterface.addColumn('stock_requests', 'driver_received_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    if (!(await columnExists(queryInterface, 'stock_requests', 'driver_received_by'))) {
      await queryInterface.addColumn('stock_requests', 'driver_received_by', {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      });
    }

    if (!(await columnExists(queryInterface, 'stock_requests', 'driver_receipt_notes'))) {
      await queryInterface.addColumn('stock_requests', 'driver_receipt_notes', {
        type: Sequelize.TEXT,
        allowNull: true
      });
    }

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
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'stock_request_item_confirmations')) {
      await queryInterface.dropTable('stock_request_item_confirmations');
    }
    if (await columnExists(queryInterface, 'stock_requests', 'driver_receipt_notes')) await queryInterface.removeColumn('stock_requests', 'driver_receipt_notes');
    if (await columnExists(queryInterface, 'stock_requests', 'driver_received_by')) await queryInterface.removeColumn('stock_requests', 'driver_received_by');
    if (await columnExists(queryInterface, 'stock_requests', 'driver_received_at')) await queryInterface.removeColumn('stock_requests', 'driver_received_at');
    if (await columnExists(queryInterface, 'stock_requests', 'driver_invoice_viewed_at')) await queryInterface.removeColumn('stock_requests', 'driver_invoice_viewed_at');
  }
};
