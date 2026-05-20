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
    if (!(await columnExists(queryInterface, 'drivers', 'monthly_salary'))) {
      await queryInterface.addColumn('drivers', 'monthly_salary', {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
        after: 'vehicle_plate_number'
      });
    }
  },

  async down(queryInterface) {
    if (await columnExists(queryInterface, 'drivers', 'monthly_salary')) {
      await queryInterface.removeColumn('drivers', 'monthly_salary');
    }
  }
};
