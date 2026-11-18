'use strict';

// Money was created as FLOAT (double precision): 0.1 + 0.2 isn't 0.3, and a
// third decimal was stored as typed. Every money column becomes an exact
// decimal to the cent; values are rounded to the cent on the way. It works
// whatever the column is now (one local database already had numeric(10,2)).
const COLUMNS = [
  ['expenses', 'amount'],
  ['income_entries', 'amount'],
  ['recurring_expenses', 'amount'],
  ['recurring_income_entries', 'amount'],
  ['category_budgets', 'budget'],
];

module.exports = {
  up: async (queryInterface) => {
    for (const [table, column] of COLUMNS) {
      await queryInterface.sequelize.query(
        `ALTER TABLE ${table} ALTER COLUMN ${column} TYPE numeric(12,2) USING round(${column}::numeric, 2)`,
      );
    }
  },

  down: async (queryInterface) => {
    for (const [table, column] of COLUMNS) {
      await queryInterface.sequelize.query(
        `ALTER TABLE ${table} ALTER COLUMN ${column} TYPE double precision USING ${column}::double precision`,
      );
    }
  },
};
