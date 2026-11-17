// Suggested versus confirmed: how often category suggestions were kept, for
// purchases imported since the prompt freeze (PLANS.md, "A trustworthy
// accuracy number"). Local; reads the database, changes nothing.
//
//   npx tsx scripts/suggestion-report.ts [--since YYYY-MM-DD] [--user <id>]
//
// --since defaults to the freeze date (PROMPT_FROZEN_ON in AI/app/prompt.py).
// The category compared is the expense's category now, so later fixes in the
// expenses grid count, and deleted expenses drop out.
import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { Expense } from '../models/Expense.js';
import { SuggestionOutcome } from '../models/SuggestionOutcome.js';
import {
  buildSuggestionReport,
  formatSuggestionReport,
  type OutcomeRow,
} from '../utils/imports/suggestionReport.js';

const PROMPT_FROZEN_ON = '2026-11-17';

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const main = async () => {
  const since = arg('--since') ?? PROMPT_FROZEN_ON;
  const start = new Date(`${since}T00:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || Number.isNaN(start.getTime()))
    throw new Error('--since must be a date like 2026-11-17');
  const userId = arg('--user') ?? null;

  const outcomes = await SuggestionOutcome.findAll({
    where: { userId, importedAt: { [Op.gte]: start } },
  });
  const expenses = outcomes.length
    ? await Expense.findAll({
        where: { userId, id: outcomes.map((o) => o.expenseId) },
        attributes: ['id', 'category'],
      })
    : [];
  const categoryOf = new Map(expenses.map((e) => [e.id, e.category]));
  const rows: OutcomeRow[] = outcomes.flatMap((o) => {
    const chosen = categoryOf.get(o.expenseId);
    return chosen
      ? [
          {
            kind: o.kind,
            month: o.postedDate.slice(0, 7),
            suggested: o.suggestedCategory,
            source: o.suggestionSource,
            chosen,
          },
        ]
      : [];
  });
  console.log(formatSuggestionReport(buildSuggestionReport(rows), since));
  await sequelize.close();
};

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await sequelize.close();
  process.exit(1);
});
