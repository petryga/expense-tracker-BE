import { ImportedTransaction } from '../../models/ImportedTransaction.js';
import { memoryKey } from '../statementParsers/memoryKey.js';

// Categories whose answer depends on why something was bought, which a
// statement can't show (PLANS.md, Phase B): never suggested, by memory or by
// the AI service (whose AI_NEVER_SUGGEST lists the same), and one gift never
// teaches memory what a shop usually is.
export const NEVER_SUGGEST = new Set(['Gifts']);

// Merchant memory (decision 3): for each merchant key, the category the user
// saved most often for it in earlier imports (ties: the most recent). Exactly
// what the eval measured as "memory": precise, but only for shops seen before.
export const merchantMemory = async (userId: string | null): Promise<Map<string, string>> => {
  const saved = await ImportedTransaction.findAll({
    where: { userId, kind: 'charge', status: 'saved' },
    attributes: ['description', 'category', 'updatedAt'],
    order: [['updatedAt', 'ASC']],
  });
  const counts = new Map<string, Map<string, { n: number; last: number }>>();
  saved.forEach((row, i) => {
    const key = memoryKey(row.description);
    if (!key || !row.category || NEVER_SUGGEST.has(row.category)) return;
    const perCategory = counts.get(key) ?? new Map();
    const entry = perCategory.get(row.category) ?? { n: 0, last: 0 };
    perCategory.set(row.category, { n: entry.n + 1, last: i });
    counts.set(key, perCategory);
  });
  const memory = new Map<string, string>();
  for (const [key, perCategory] of counts) {
    const [best] = [...perCategory].sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last);
    memory.set(key, best[0]);
  }
  return memory;
};
