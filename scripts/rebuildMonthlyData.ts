// Recomputes the expense and income rollups (monthly_data) from the expenses
// and income_entries tables.
//
//   npx tsx scripts/rebuildMonthlyData.ts           # dry run: prints what would change
//   npx tsx scripts/rebuildMonthlyData.ts --apply   # writes the changes in one transaction
//
// Uses whatever DB_* env vars are loaded (BE/.env by default), so point them
// at the database you mean to fix before using --apply.
import { MonthlyDataTypes } from '../models/MonthlyData.js';
import { sequelize } from '../config/database.js';
import {
  applyRollupChanges,
  planExpenseRollupRebuild,
  planIncomeRollupRebuild,
  type RollupChange,
} from '../utils/rebuildMonthlyData.js';

const describe = (change: RollupChange) => {
  const who = change.userId ?? '(no user)';
  switch (change.action) {
    case 'create':
      return `CREATE ${who} ${change.yearMonth}: CAD ${change.amountCad}, USD ${change.amountUsd}`;
    case 'update':
      return (
        `UPDATE ${who} ${change.yearMonth}: ` +
        `CAD ${change.from.amountCad} -> ${change.to.amountCad}, ` +
        `USD ${change.from.amountUsd} -> ${change.to.amountUsd}`
      );
    case 'delete':
      return `DELETE ${who} ${change.yearMonth} (${change.reason})`;
  }
};

const main = async () => {
  const apply = process.argv.includes('--apply');
  const plans = [
    { type: MonthlyDataTypes.Expense, changes: await planExpenseRollupRebuild() },
    { type: MonthlyDataTypes.Income, changes: await planIncomeRollupRebuild() },
  ];
  const total = plans.reduce((sum, plan) => sum + plan.changes.length, 0);

  plans.forEach(({ type, changes }) => {
    console.log(`\n[${type}] ${changes.length} change(s)`);
    changes.forEach((change) => console.log(`  ${describe(change)}`));
  });

  if (!total) {
    console.log('\nRollups already match the source tables. Nothing to do.');
    return;
  }

  if (!apply) {
    console.log(`\nDry run: ${total} change(s) pending. Re-run with --apply to write them.`);
    return;
  }

  for (const { type, changes } of plans) {
    if (changes.length) await applyRollupChanges(type, changes);
  }
  console.log(`\nApplied ${total} change(s).`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
