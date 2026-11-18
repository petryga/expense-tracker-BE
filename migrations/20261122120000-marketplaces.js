'use strict';

// The user's marketplaces (Settings): a new expense whose description starts
// with one of these names gets it as its merchant (Expense.merchant).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('marketplaces', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      user_id: { type: Sequelize.UUID, allowNull: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    // One "eBay" per user, whatever the capitalisation.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX marketplaces_user_name
      ON marketplaces (user_id, lower(name)) NULLS NOT DISTINCT`);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('marketplaces');
  },
};
