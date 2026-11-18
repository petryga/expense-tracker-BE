// One-time tool: marks the item expenses made by scripts/split-old-amazon.ts
// with merchant "Amazon" (Expense.merchant came later). Reads the review
// files that were applied and finds each item's expense by description,
// amount, date and account.
//
//   npx tsx scripts/tag-amazon-merchant.ts --in <review.csv> [--in ...] [--user <id>] [--apply]
//
// Without --apply it changes nothing and prints counts only. The review files
// hold real data: keep them outside the repositories.
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { sequelize } from '../config/database.js';
import { Expense } from '../models/Expense.js';
import { AMAZON_MERCHANT, shortName } from '../utils/imports/confirm.js';
import { parseCents } from '../utils/statementParsers/money.js';

const args = process.argv.slice(2);
const files = args.flatMap((a, i) => (a === '--in' && args[i + 1] ? [args[i + 1]] : []));
const userIndex = args.indexOf('--user');
const userId = userIndex >= 0 ? args[userIndex + 1] : null;
const apply = args.includes('--apply');

if (!files.length) {
  console.error('Give at least one review file: --in <review.csv>');
  process.exit(1);
}

type Line = Record<string, string>;

// An item line became an expense unless it was marked returned or skipped.
const NOT_SAVED = new Set(['(returned)', '(skip)']);

const keyOf = (description: string, cents: number, date: string, account: string) =>
  [description, cents, date, account].join('|');

const wanted = new Set<string>();
let lines = 0;
for (const file of files) {
  const rows = parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''), {
    columns: true,
    skip_empty_lines: true,
  }) as Line[];
  for (const row of rows) {
    if (NOT_SAVED.has(row.new_category?.trim() ?? '')) continue;
    const cents = parseCents(row.item_amount ?? '');
    if (cents === null || !row.date) continue;
    const description = row.new_description?.trim() || shortName(row.product_name ?? '');
    wanted.add(keyOf(description, cents, row.date.slice(0, 10), row.account ?? ''));
    lines += 1;
  }
}

const expenses = await Expense.findAll({ where: { userId, merchant: null } });
const matches = expenses.filter((e) =>
  wanted.has(
    keyOf(
      e.description,
      Math.round(Number(e.amount) * 100),
      String(e.datePosted).slice(0, 10),
      e.account,
    ),
  ),
);
const foundKeys = new Set(
  matches.map((e) =>
    keyOf(
      e.description,
      Math.round(Number(e.amount) * 100),
      String(e.datePosted).slice(0, 10),
      e.account,
    ),
  ),
);
const alreadyTagged = await Expense.count({ where: { userId, merchant: AMAZON_MERCHANT } });

// Counts only: no descriptions or amounts in the output.
console.log(
  `${lines} item lines (${wanted.size} distinct); ${matches.length} expenses match; ` +
    `${wanted.size - foundKeys.size} distinct lines match no untagged expense; ` +
    `${alreadyTagged} already tagged ${AMAZON_MERCHANT}.`,
);

if (apply && matches.length) {
  await Expense.update(
    { merchant: AMAZON_MERCHANT },
    { where: { id: matches.map((e) => e.id), userId } },
  );
  console.log(`Tagged ${matches.length} expenses ${AMAZON_MERCHANT}.`);
} else if (!apply) {
  console.log('Preview only; add --apply to tag them.');
}
await sequelize.close();
