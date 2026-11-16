import { Op } from 'sequelize';
import { Category } from '../../models/Category.js';
import { ImportedTransaction } from '../../models/ImportedTransaction.js';
import { isDemoUser } from '../importAccess.js';
import { logger } from '../logger.js';
import { memoryKey } from '../statementParsers/memoryKey.js';
import { aiConfig, requestSuggestions } from './aiClient.js';
import { merchantMemory, NEVER_SUGGEST } from './merchantMemory.js';

// Suggestions for a fresh import, in two steps (PLANS.md, Phase B):
// 1. merchant memory, right away, before the upload responds;
// 2. the AI service, in the background, for the rest. The upload never waits
//    for it; rows show 'pending' until it answers, and any failure leaves them
//    usable with no suggestion (decision 11).

// The category names a user can pick on review: subcategories they can see
// (shared defaults plus their own), the same list the FE category picker shows.
const pickableCategories = async (userId: string | null) => {
  const visible = await Category.findAll({
    where: { [Op.or]: [{ isDefault: true }, { userId }] },
    attributes: ['name', 'parentCategoryId'],
  });
  return [
    ...new Set(
      visible.filter((c) => c.parentCategoryId && !NEVER_SUGGEST.has(c.name)).map((c) => c.name),
    ),
  ];
};

const draftPurchases = (userId: string | null, batchId: string) =>
  ImportedTransaction.findAll({
    where: { userId, batchId, kind: 'charge', status: 'draft', suggestedCategory: null },
  });

// Step 1. Returns whether any rows are left for the AI service.
export const suggestFromMemory = async (userId: string | null, batchId: string) => {
  const rows = await draftPurchases(userId, batchId);
  if (!rows.length) return false;
  const memory = await merchantMemory(userId);
  const categories = new Set(await pickableCategories(userId));
  let left = 0;
  for (const row of rows) {
    const category = memory.get(memoryKey(row.description));
    // A remembered category the user has since deleted is not suggested.
    if (category && categories.has(category)) {
      await row.update({
        suggestedCategory: category,
        suggestionSource: 'memory',
        suggestionStatus: 'done',
      });
    } else {
      left += 1;
    }
  }
  return left > 0;
};

// Step 2, fire and forget. Marks the remaining rows 'pending' first, so the
// response the user gets already says suggestions are on their way.
export const startAiSuggestions = async (
  userId: string | null,
  batchId: string,
  requestId?: string,
): Promise<{ job: Promise<void> } | null> => {
  const config = aiConfig();
  if (!config || isDemoUser(userId)) return null;
  const rows = await draftPurchases(userId, batchId);
  if (!rows.length) return null;
  const ids = rows.map((r) => r.id);
  await ImportedTransaction.update(
    { suggestionStatus: 'pending' },
    { where: { userId, id: ids, status: 'draft' } },
  );

  const job = (async () => {
    try {
      const suggestions = await requestSuggestions(
        config,
        rows.map((r) => ({
          id: r.id,
          text: r.description,
          amountCents: r.amountCents,
          // The bank's own category, as a hint (it is in the raw row).
          ...(r.raw?.Category ? { bankCategory: r.raw.Category.slice(0, 100) } : {}),
        })),
        await pickableCategories(userId),
        requestId,
      );
      for (const [id, category] of suggestions) {
        await ImportedTransaction.update(
          { suggestedCategory: category, suggestionSource: 'model', suggestionStatus: 'done' },
          // Rows reviewed or deleted in the meantime are left alone.
          { where: { id, userId, status: 'draft', suggestionStatus: 'pending' } },
        );
      }
    } catch (error) {
      logger.warn(
        { err: { message: (error as Error)?.message }, requestId },
        'AI suggestions failed',
      );
    } finally {
      // Whatever got no answer is settled as "no suggestion".
      await ImportedTransaction.update(
        { suggestionStatus: 'none' },
        { where: { userId, id: ids, suggestionStatus: 'pending' } },
      ).catch(() => {});
    }
  })();
  // Wrapped: an async function returning a bare promise would make its caller
  // wait for the whole job, which is exactly what this must not do.
  return { job };
};

// Both steps, as the upload route calls them. Never throws: suggestions are
// optional and the import is already saved. Returns the background job (or
// null), which the route does not wait for.
export const suggestForImport = async (
  userId: string | null,
  batchId: string,
  requestId?: string,
): Promise<{ job: Promise<void> } | null> => {
  try {
    const anyLeft = await suggestFromMemory(userId, batchId);
    return anyLeft ? await startAiSuggestions(userId, batchId, requestId) : null;
  } catch (error) {
    logger.warn({ err: { message: (error as Error)?.message }, requestId }, 'Suggestions failed');
    return null;
  }
};
