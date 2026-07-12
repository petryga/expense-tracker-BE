'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('income_entries', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      date: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      description: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      category: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      amount: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0,
      },
      currency: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'CAD',
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

    await queryInterface.addIndex('income_entries', ['user_id']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('income_entries');
  },
};
