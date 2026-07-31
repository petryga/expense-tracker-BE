'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('category_budgets', 'budget', {
      type: Sequelize.FLOAT,
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('category_budgets', 'budget', {
      type: Sequelize.FLOAT,
      allowNull: false,
    });
  },
};
