'use strict';

// One rollup row per (user, type, month). Nothing enforced this before, so two
// requests racing to create the first row of a month could leave two rows.
//
// `npm start` runs migrations on every deploy, so this must not fail on a
// database that already holds duplicates (that would stop the service from
// booting). It therefore first collapses any duplicates, keeping the oldest
// row and recomputing its totals from the source tables, then adds the index.
//
// NULLS NOT DISTINCT (Postgres 15+) is what makes the index cover the
// single-tenant local/dev setup, where user_id is NULL on every row; a plain
// unique index treats NULLs as all different and would enforce nothing there.
module.exports = {
  up: async (queryInterface) => {
    const { sequelize } = queryInterface;

    await sequelize.transaction(async (transaction) => {
      const run = (sql) => sequelize.query(sql, { transaction });

      await run(`
        CREATE TEMP TABLE dup_rollups ON COMMIT DROP AS
        SELECT user_id, type, year_month
        FROM monthly_data
        GROUP BY user_id, type, year_month
        HAVING COUNT(*) > 1
      `);

      await run(`
        DELETE FROM monthly_data a
        USING monthly_data b
        WHERE a.type = b.type
          AND a.year_month = b.year_month
          AND a.user_id IS NOT DISTINCT FROM b.user_id
          AND (COALESCE(a.created_at, 'epoch'::timestamptz), a.id)
            > (COALESCE(b.created_at, 'epoch'::timestamptz), b.id)
      `);

      await run(`
        UPDATE monthly_data m
        SET amount_cad = COALESCE((
              SELECT SUM(e.amount) FROM expenses e
              WHERE e.user_id IS NOT DISTINCT FROM m.user_id
                AND e.year || '-' || e.month = m.year_month
                AND e.currency = 'CAD'
            ), 0),
            amount_usd = COALESCE((
              SELECT SUM(e.amount) FROM expenses e
              WHERE e.user_id IS NOT DISTINCT FROM m.user_id
                AND e.year || '-' || e.month = m.year_month
                AND e.currency = 'USD'
            ), 0),
            updated_at = NOW()
        FROM dup_rollups d
        WHERE m.type = 'expense' AND d.type = 'expense'
          AND d.year_month = m.year_month
          AND d.user_id IS NOT DISTINCT FROM m.user_id
      `);

      await run(`
        UPDATE monthly_data m
        SET amount_cad = COALESCE((
              SELECT SUM(i.amount) FROM income_entries i
              WHERE i.user_id IS NOT DISTINCT FROM m.user_id
                AND SUBSTRING(i.date FROM 1 FOR 7) = m.year_month
                AND i.currency = 'CAD'
            ), 0),
            amount_usd = COALESCE((
              SELECT SUM(i.amount) FROM income_entries i
              WHERE i.user_id IS NOT DISTINCT FROM m.user_id
                AND SUBSTRING(i.date FROM 1 FOR 7) = m.year_month
                AND i.currency = 'USD'
            ), 0),
            updated_at = NOW()
        FROM dup_rollups d
        WHERE m.type = 'income' AND d.type = 'income'
          AND d.year_month = m.year_month
          AND d.user_id IS NOT DISTINCT FROM m.user_id
      `);

      await run(`
        CREATE UNIQUE INDEX monthly_data_user_type_year_month_unique
        ON monthly_data (user_id, type, year_month) NULLS NOT DISTINCT
      `);
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS monthly_data_user_type_year_month_unique;',
    );
  },
};
