'use strict';

// Monthly totals are now summed from `expenses` and `income_entries` on every
// read (utils/monthlyTotals.ts), so this stored rollup is unused. Dropping it
// removes the only place the totals could drift from the real rows.
//
// `down` recreates the table EMPTY (same shape as before). That is enough to
// roll back a deploy, since nothing reads it; the data itself is derivable and
// is not restored.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS monthly_data;');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_monthly_data_type";');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('monthly_data', {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
      type: { type: Sequelize.ENUM('expense', 'income'), allowNull: false },
      amount_cad: { type: Sequelize.DECIMAL, allowNull: false, defaultValue: 0 },
      amount_usd: { type: Sequelize.DECIMAL, allowNull: false, defaultValue: 0 },
      year_month: { type: Sequelize.STRING, allowNull: false },
      user_id: { type: Sequelize.UUID, allowNull: true },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('monthly_data', ['user_id']);
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX monthly_data_user_type_year_month_unique ' +
        'ON monthly_data (user_id, type, year_month) NULLS NOT DISTINCT;',
    );
  },
};
