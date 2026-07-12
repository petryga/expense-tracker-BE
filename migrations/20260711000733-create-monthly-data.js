'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('monthly_data', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      type: {
        type: Sequelize.ENUM('expense', 'income'),
        allowNull: false,
      },
      amount_cad: {
        type: Sequelize.DECIMAL,
        allowNull: false,
        defaultValue: 0,
      },
      amount_usd: {
        type: Sequelize.DECIMAL,
        allowNull: false,
        defaultValue: 0,
      },
      year_month: {
        type: Sequelize.STRING,
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

    await queryInterface.addIndex('monthly_data', ['user_id']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('monthly_data');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_monthly_data_type";');
  },
};
