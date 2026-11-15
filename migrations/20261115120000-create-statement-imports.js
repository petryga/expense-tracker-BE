'use strict';

// Statement import (PLANS.md, Plan 3 Phase A). One row per uploaded file, and
// one row per statement transaction. Every statement row is kept (payments,
// rewards, returned purchases included) so the file always reconciles and the
// labelled rows can feed the categorization eval later.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('import_batches', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      user_id: { type: Sequelize.UUID, allowNull: true },
      source: { type: Sequelize.STRING, allowNull: false },
      file_name: { type: Sequelize.STRING, allowNull: false },
      account: { type: Sequelize.STRING, allowNull: false },
      currency: { type: Sequelize.STRING, allowNull: false },
      row_count: { type: Sequelize.INTEGER, allowNull: false },
      file_total_cents: { type: Sequelize.BIGINT, allowNull: false },
      duplicate_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      duplicate_total_cents: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('import_batches', ['user_id']);

    await queryInterface.createTable('imported_transactions', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      user_id: { type: Sequelize.UUID, allowNull: true },
      batch_id: { type: Sequelize.UUID, allowNull: false },
      line: { type: Sequelize.INTEGER, allowNull: false },
      fingerprint: { type: Sequelize.STRING, allowNull: false },
      reference: { type: Sequelize.STRING, allowNull: true },
      posted_date: { type: Sequelize.DATEONLY, allowNull: false },
      description: { type: Sequelize.STRING(512), allowNull: false },
      merchant_key: { type: Sequelize.STRING, allowNull: false },
      amount_cents: { type: Sequelize.INTEGER, allowNull: false },
      raw: { type: Sequelize.JSONB, allowNull: false },
      // charge | refund | payment | reward
      kind: { type: Sequelize.STRING, allowNull: false },
      // draft | saved | skipped | returned
      status: { type: Sequelize.STRING, allowNull: false },
      category: { type: Sequelize.STRING, allowNull: true },
      expense_id: { type: Sequelize.UUID, allowNull: true },
      // refund <-> the purchase it returns, set on both rows
      matched_transaction_id: { type: Sequelize.UUID, allowNull: true },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('imported_transactions', ['batch_id']);
    await queryInterface.addIndex('imported_transactions', ['user_id', 'kind', 'merchant_key']);
    // Re-uploading an overlapping file must not create the row twice. NULLS NOT
    // DISTINCT (Postgres 15+) so the no-auth null user is deduplicated too.
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX imported_transactions_user_fingerprint ON imported_transactions (user_id, fingerprint) NULLS NOT DISTINCT',
    );
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('imported_transactions');
    await queryInterface.dropTable('import_batches');
  },
};
