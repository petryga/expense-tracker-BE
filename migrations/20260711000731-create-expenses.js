'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('expenses', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      category: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      description: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      account: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      amount: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0,
      },
      year: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      month: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      date_posted: {
        type: Sequelize.STRING,
        allowNull: true,
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

    await queryInterface.addIndex('expenses', ['user_id']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('expenses');
  },
};
