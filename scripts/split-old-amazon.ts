// One-time tool: splits old, hand-entered Amazon expenses into the items they
// paid for, using Amazon's order history (PLANS.md, Phase D).
//
//   npx tsx scripts/split-old-amazon.ts preview --orders "<Order History.csv>" \
//     --out <review.csv> [--card "<account>=<brand>"]... [--user <id>]
//   npx tsx scripts/split-old-amazon.ts apply --in <review.csv> [--user <id>]
//
// preview changes nothing: it writes a review file with one line per item.
// Edit new_description, new_category and is_gift there if you like (blank
// category keeps the old one), delete the lines of any expense you want left
// alone, then apply. apply replaces each listed expense with its items in one
// transaction, and changes nothing if any expense no longer matches the file.
// A line whose new_category is "(returned)" or "(skip)" still counts toward the old
// expense's amount but becomes no expense: an item returned with the refund
// paid somewhere other than this card.
// Lines with expense_id "new" add an expense that was never entered (date,
// account and item_amount from the line, currency USD unless a currency
// column says otherwise; new_category is required).
// The review file holds your real data: keep it outside the repositories.
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { Category } from '../models/Category.js';
import { Expense } from '../models/Expense.js';
import { ImportedItem } from '../models/ImportedItem.js';
import { ImportedTransaction } from '../models/ImportedTransaction.js';
import { DEFAULT_OPTIONS, findSplits } from '../utils/amazon/oldExpenses.js';
import { parseOrderHistory } from '../utils/amazon/orderHistory.js';
import { shortName } from '../utils/imports/confirm.js';
import { centsToAmount, parseCents } from '../utils/statementParsers/money.js';

const COLUMNS = [
  'expense_id',
  'date',
  'account',
  'expense_amount',
  'old_description',
  'old_category',
  'item_amount',
  'product_name',
  'new_description',
  'new_category',
  'is_gift',
] as const;

const args = process.argv.slice(2);
const command = args[0];
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flags = (name: string) =>
  args.flatMap((a, i) => (a === `--${name}` && args[i + 1] ? [args[i + 1]] : []));
const userId = flag('user') ?? null;

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

// Expenses an import created are handled there, not here.
const importedExpenseIds = async () => {
  const [rows, items] = await Promise.all([
    ImportedTransaction.findAll({
      where: { expenseId: { [Op.ne]: null } },
      attributes: ['expenseId'],
    }),
    // Missing until the Phase D migration has run.
    ImportedItem.findAll({
      where: { expenseId: { [Op.ne]: null } },
      attributes: ['expenseId'],
    }).catch(() => []),
  ]);
  return new Set([...rows, ...items].map((r) => r.expenseId));
};

const preview = async () => {
  const ordersPath = flag('orders');
  const out = flag('out');
  if (!ordersPath || !out) throw new Error('preview needs --orders and --out');
  const parsed = parseOrderHistory(readFileSync(ordersPath, 'utf8'));
  if (!parsed.ok) throw new Error(`Order history: ${JSON.stringify(parsed.errors.slice(0, 3))}`);
  const items = parsed.items.map((item, i) => ({ ...item, id: String(i) }));
  const cardBrands = Object.fromEntries(
    flags('card').map((pair) => pair.split('=').map((s) => s.trim()) as [string, string]),
  );

  const skip = await importedExpenseIds();
  const expenses = (await Expense.findAll({ where: { userId } })).filter((e) => !skip.has(e.id));
  const byId = new Map(expenses.map((e) => [e.id, e]));
  const results = findSplits(
    expenses.map((e) => ({
      id: e.id,
      date: String(e.datePosted).slice(0, 10),
      amountCents: parseCents(String(e.amount)) ?? 0,
      currency: e.currency,
      account: e.account,
      description: e.description ?? '',
    })),
    items,
    { ...DEFAULT_OPTIONS, cardBrands },
  );

  const lines = [COLUMNS.join(',')];
  let itemCount = 0;
  for (const result of results) {
    if (result.outcome !== 'split') continue;
    const expense = byId.get(result.expenseId)!;
    for (const itemId of result.itemIds) {
      const item = items[Number(itemId)];
      itemCount += 1;
      lines.push(
        [
          expense.id,
          String(expense.datePosted).slice(0, 10),
          expense.account,
          centsToAmount(parseCents(String(expense.amount)) ?? 0),
          expense.description ?? '',
          expense.category,
          centsToAmount(item.totalCents),
          item.productName,
          shortName(item.productName),
          expense.category,
          expense.isGift ? 'yes' : 'no',
        ]
          .map(csvCell)
          .join(','),
      );
    }
  }
  writeFileSync(out, `${lines.join('\n')}\n`);
  const count = (o: string) => results.filter((r) => r.outcome === o).length;
  console.log(
    `${results.length} Amazon expenses: ${count('split')} traced to ${itemCount} items (written to ${out}), ` +
      `${count('several')} fit more than one set of items, ${count('none')} fit no order.`,
  );
};

// "(skip)" works the same, for something on the bill you didn't pay for.
const EXCLUDED = new Set(['(returned)', '(skip)']);
const isReturned = (line: Record<string, string>) => EXCLUDED.has(line.new_category?.trim() ?? '');

const apply = async () => {
  const input = flag('in');
  if (!input) throw new Error('apply needs --in');
  const lines: Record<string, string>[] = parse(readFileSync(input, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
  });
  const NEW = 'new';
  const additions = lines.filter((l) => l.expense_id.trim().toLowerCase() === NEW);
  const groups = new Map<string, Record<string, string>[]>();
  for (const line of lines.filter((l) => !additions.includes(l)))
    groups.set(line.expense_id, [...(groups.get(line.expense_id) ?? []), line]);

  const result = await sequelize.transaction(async (transaction) => {
    const expenses = await Expense.findAll({
      where: { id: [...groups.keys()], userId },
      transaction,
    });
    const byId = new Map(expenses.map((e) => [e.id, e]));
    const problems: string[] = [];
    // A typo would quietly create a category nobody has: only existing names.
    const known = new Set(
      (
        await Category.findAll({
          where: { [Op.or]: [{ isDefault: true }, { userId }] },
          attributes: ['name'],
          transaction,
        })
      ).map((c) => c.name),
    );
    for (const line of lines) {
      const category = line.new_category?.trim();
      if (category && !EXCLUDED.has(category) && !known.has(category))
        problems.push(`${line.expense_id}: no category named "${category}"`);
    }
    for (const [id, parts] of groups) {
      const expense = byId.get(id);
      const amount = parseCents(String(expense?.amount ?? ''));
      const sum = parts.reduce((total, p) => total + (parseCents(p.item_amount) ?? NaN), 0);
      if (!expense) problems.push(`${id}: expense not found`);
      else if (amount !== parseCents(parts[0].expense_amount))
        problems.push(`${id}: amount changed`);
      else if (sum !== amount)
        problems.push(
          `${id}: items add up to ${centsToAmount(sum)}, not ${centsToAmount(amount!)}`,
        );
    }
    for (const line of additions) {
      if (!line.new_category?.trim()) problems.push(`new "${line.product_name}": needs a category`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(line.date ?? '') || !line.account?.trim())
        problems.push(`new "${line.product_name}": needs a date and an account`);
      if (!parseCents(line.item_amount ?? ''))
        problems.push(`new "${line.product_name}": needs an amount`);
    }
    if (problems.length) throw new Error(`Nothing applied:\n${problems.join('\n')}`);

    let created = 0;
    for (const [id, parts] of groups) {
      const expense = byId.get(id)!;
      for (const part of parts.filter((p) => !isReturned(p))) {
        await Expense.create(
          {
            id: randomUUID(),
            category: part.new_category?.trim() || expense.category,
            description: part.new_description?.trim() || shortName(part.product_name),
            account: expense.account,
            amount: centsToAmount(parseCents(part.item_amount)!),
            datePosted: expense.datePosted,
            currency: expense.currency,
            year: expense.year,
            month: expense.month,
            isGift: part.is_gift?.trim().toLowerCase() === 'yes',
            userId: expense.userId,
          },
          { transaction },
        );
        created += 1;
      }
      await expense.destroy({ transaction });
    }
    for (const line of additions) {
      await Expense.create(
        {
          id: randomUUID(),
          category: line.new_category.trim(),
          description: line.new_description?.trim() || shortName(line.product_name),
          account: line.account.trim(),
          amount: centsToAmount(parseCents(line.item_amount)!),
          datePosted: line.date,
          currency: line.currency?.trim() || 'USD',
          year: Number(line.date.slice(0, 4)),
          month: Number(line.date.slice(5, 7)),
          isGift: line.is_gift?.trim().toLowerCase() === 'yes',
          userId,
        },
        { transaction },
      );
    }
    return { replaced: groups.size, created, added: additions.length };
  });
  console.log(
    `Replaced ${result.replaced} expenses with ${result.created} item expenses; added ${result.added} new expenses.`,
  );
};

try {
  if (command === 'preview') await preview();
  else if (command === 'apply') await apply();
  else throw new Error('Usage: split-old-amazon.ts preview|apply (see the top of the file)');
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
