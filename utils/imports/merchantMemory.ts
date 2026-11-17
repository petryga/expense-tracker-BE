import { Expense } from '../../models/Expense.js';
import { SavedStatementRow } from '../../models/SavedStatementRow.js';
import { memoryKey } from '../statementParsers/memoryKey.js';

// Merchant memory (decision 3): for each merchant key, the category the user
// gave it most often (ties: the most recent). Exactly what the eval measured
// as "memory": precise, but only for shops seen before.
//
// It reads every statement row ever saved, including those whose import was
// since deleted. The category comes from the expense each row created, as it
// is now: if you later recategorize that expense, memory follows; rows whose
// expense you deleted teach nothing. Rows loaded from the hand-labelled set
// carry their own category.

// General marketplaces sell everything, so one category per shop would be a
// guess (decision 16): never remembered.
const MARKETPLACE = /\b(AMAZON|AMZN|EBAY|ALIEXPRESS|ALIPAY|SHEIN|WALMART|ETSY|TEMU|VINTED)/i;
export const isMarketplace = (description: string) => MARKETPLACE.test(description);

export const merchantMemory = async (userId: string | null): Promise<Map<string, string>> => {
  const saved = await SavedStatementRow.findAll({
    where: { userId, kind: 'charge' },
    attributes: ['description', 'expenseId', 'category', 'source'],
    order: [['chosenAt', 'ASC']],
  });
  const expenseIds = saved.map((row) => row.expenseId).filter((id): id is string => !!id);
  const expenses = expenseIds.length
    ? await Expense.findAll({
        where: { userId, id: expenseIds },
        attributes: ['id', 'category'],
      })
    : [];
  const categoryOf = new Map(expenses.map((e) => [e.id, e.category]));

  const counts = new Map<string, Map<string, { n: number; last: number }>>();
  saved.forEach((row, i) => {
    if (isMarketplace(row.description)) return;
    const key = memoryKey(row.description);
    const category =
      row.source === 'label' ? row.category : row.expenseId && categoryOf.get(row.expenseId);
    if (!key || !category) return;
    const perCategory = counts.get(key) ?? new Map();
    const entry = perCategory.get(category) ?? { n: 0, last: 0 };
    perCategory.set(category, { n: entry.n + 1, last: i });
    counts.set(key, perCategory);
  });
  const memory = new Map<string, string>();
  for (const [key, perCategory] of counts) {
    const [best] = [...perCategory].sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last);
    memory.set(key, best[0]);
  }
  return memory;
};
