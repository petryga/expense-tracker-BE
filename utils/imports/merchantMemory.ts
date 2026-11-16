import { Op } from 'sequelize';
import { Expense } from '../../models/Expense.js';
import { ImportedTransaction } from '../../models/ImportedTransaction.js';
import { memoryKey } from '../statementParsers/memoryKey.js';

// Merchant memory (decision 3): for each merchant key, the category the user
// gave it most often in earlier imports (ties: the most recent). Exactly what
// the eval measured as "memory": precise, but only for shops seen before.
//
// The category comes from the expense each row created, as it is now: if you
// later recategorize that expense (say, to a new Electronics category), memory
// follows. Rows whose expense you deleted teach nothing.
export const merchantMemory = async (userId: string | null): Promise<Map<string, string>> => {
  const saved = await ImportedTransaction.findAll({
    where: { userId, kind: 'charge', status: 'saved', expenseId: { [Op.ne]: null } },
    attributes: ['description', 'expenseId', 'updatedAt'],
    order: [['updatedAt', 'ASC']],
  });
  const expenses = await Expense.findAll({
    where: { userId, id: saved.map((row) => row.expenseId!) },
    attributes: ['id', 'category'],
  });
  const categoryOf = new Map(expenses.map((e) => [e.id, e.category]));

  const counts = new Map<string, Map<string, { n: number; last: number }>>();
  saved.forEach((row, i) => {
    const key = memoryKey(row.description);
    const category = categoryOf.get(row.expenseId!);
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
