'use strict';

// Amazon order matching (PLANS.md, Phase D).
// - amazon_order_items: the user's uploaded Amazon order history, one row per
//   item, only the fields matching needs (no addresses or gift messages).
// - imported_items: a matched Amazon charge split into its items; each item
//   is reviewed and saved as its own expense.
// - imported_transactions.amazon_status: matched | ambiguous | declined, and
//   amazon_candidates: the orders a charge could be ([{ key, itemIds }]).
// - amazon_refunds: Amazon's refund list (order, amount, date), to tell apart
//   same-price items when a card refund returns one item.
// - an item returned on its own: imported_items.status 'returned' and
//   refund_transaction_id; the refund row points back with matched_item_id.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('amazon_order_items', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      user_id: { type: Sequelize.UUID, allowNull: true },
      fingerprint: { type: Sequelize.STRING, allowNull: false },
      order_id: { type: Sequelize.STRING, allowNull: false },
      asin: { type: Sequelize.STRING, allowNull: false },
      product_name: { type: Sequelize.STRING(1024), allowNull: false },
      order_date: { type: Sequelize.DATEONLY, allowNull: false },
      ship_date: { type: Sequelize.DATEONLY, allowNull: true },
      currency: { type: Sequelize.STRING, allowNull: false },
      total_cents: { type: Sequelize.INTEGER, allowNull: false },
      quantity: { type: Sequelize.INTEGER, allowNull: false },
      payment_method: { type: Sequelize.STRING, allowNull: false },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX amazon_order_items_user_fingerprint ON amazon_order_items (user_id, fingerprint) NULLS NOT DISTINCT',
    );

    await queryInterface.createTable('imported_items', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      user_id: { type: Sequelize.UUID, allowNull: true },
      transaction_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'imported_transactions', key: 'id' },
        onDelete: 'CASCADE',
      },
      order_item_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'amazon_order_items', key: 'id' },
        onDelete: 'SET NULL',
      },
      position: { type: Sequelize.INTEGER, allowNull: false },
      description: { type: Sequelize.STRING(1024), allowNull: false },
      amount_cents: { type: Sequelize.INTEGER, allowNull: false },
      quantity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      category: { type: Sequelize.STRING, allowNull: true },
      expense_id: { type: Sequelize.UUID, allowNull: true },
      suggested_category: { type: Sequelize.STRING, allowNull: true },
      suggestion_source: { type: Sequelize.STRING, allowNull: true },
      suggestion_status: { type: Sequelize.STRING, allowNull: true },
      // null | returned
      status: { type: Sequelize.STRING, allowNull: true },
      refund_transaction_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'imported_transactions', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('imported_items', ['transaction_id']);
    await queryInterface.addIndex('imported_items', ['order_item_id']);

    await queryInterface.addColumn('imported_transactions', 'amazon_status', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('imported_transactions', 'amazon_candidates', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
    await queryInterface.addColumn('imported_transactions', 'matched_item_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'imported_items', key: 'id' },
      onDelete: 'SET NULL',
    });

    await queryInterface.createTable('amazon_refunds', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      user_id: { type: Sequelize.UUID, allowNull: true },
      fingerprint: { type: Sequelize.STRING, allowNull: false },
      order_id: { type: Sequelize.STRING, allowNull: false },
      amount_cents: { type: Sequelize.INTEGER, allowNull: false },
      refund_date: { type: Sequelize.DATEONLY, allowNull: false },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX amazon_refunds_user_fingerprint ON amazon_refunds (user_id, fingerprint) NULLS NOT DISTINCT',
    );
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('amazon_refunds');
    await queryInterface.removeColumn('imported_transactions', 'matched_item_id');
    await queryInterface.removeColumn('imported_transactions', 'amazon_candidates');
    await queryInterface.removeColumn('imported_transactions', 'amazon_status');
    await queryInterface.dropTable('imported_items');
    await queryInterface.dropTable('amazon_order_items');
  },
};
