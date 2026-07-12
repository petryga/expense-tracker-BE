'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('category_budgets', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      category_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      budget: {
        type: Sequelize.FLOAT,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex('category_budgets', ['category_id', 'user_id']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('category_budgets');
  },
};
