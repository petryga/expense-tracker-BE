'use strict';

// What was suggested for each purchase saved on review, kept after its import
// is deleted (PLANS.md, "A trustworthy accuracy number"). The report
// (scripts/suggestion-report.ts) compares it with the category the expense
// has now. One row per saved statement charge or Amazon item.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('suggestion_outcomes', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      user_id: { type: Sequelize.UUID, allowNull: true },
      // 'statement' (a card charge) or 'item' (one item of a split Amazon charge).
      kind: { type: Sequelize.STRING, allowNull: false },
      // The statement row's fingerprint, or the item's id.
      ref: { type: Sequelize.STRING, allowNull: false },
      posted_date: { type: Sequelize.STRING, allowNull: false },
      suggested_category: { type: Sequelize.STRING, allowNull: true },
      // 'memory', 'model', or null when nothing was suggested.
      suggestion_source: { type: Sequelize.STRING, allowNull: true },
      expense_id: { type: Sequelize.UUID, allowNull: false },
      imported_at: { type: Sequelize.DATE, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX suggestion_outcomes_user_kind_ref
      ON suggestion_outcomes (user_id, kind, ref) NULLS NOT DISTINCT`);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('suggestion_outcomes');
  },
};
