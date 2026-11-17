'use strict';

// Every statement row ever saved as an expense, kept after its import is
// deleted (PLANS.md, "Improvements", 1). Two jobs:
// - re-uploading a file never offers a row whose expense was kept;
// - merchant memory survives deleting the import it learned from.
// Rows from the hand-labelled eval set can be loaded as source 'label', so
// memory does not start empty; those never count as duplicates.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('saved_statement_rows', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      user_id: { type: Sequelize.UUID, allowNull: true },
      fingerprint: { type: Sequelize.STRING, allowNull: false },
      description: { type: Sequelize.STRING(512), allowNull: false },
      kind: { type: Sequelize.STRING, allowNull: false },
      // The expense it became. Memory reads the category from it as it is
      // now, so later edits count and a deleted expense teaches nothing.
      expense_id: { type: Sequelize.UUID, allowNull: true },
      // Only for source 'label', which has no expense.
      category: { type: Sequelize.STRING, allowNull: true },
      source: { type: Sequelize.STRING, allowNull: false },
      chosen_at: { type: Sequelize.DATE, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX saved_statement_rows_user_fingerprint
      ON saved_statement_rows (user_id, fingerprint) NULLS NOT DISTINCT`);
    // Rows already saved by an import.
    await queryInterface.sequelize.query(`
      INSERT INTO saved_statement_rows
        (id, user_id, fingerprint, description, kind, expense_id, source, chosen_at)
      SELECT gen_random_uuid(), user_id, fingerprint, description, kind, expense_id,
             'import', updated_at
      FROM imported_transactions WHERE status = 'saved'`);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('saved_statement_rows');
  },
};
