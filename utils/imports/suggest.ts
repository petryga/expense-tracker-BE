import { Op } from 'sequelize';
import { Category } from '../../models/Category.js';
import { ImportedItem } from '../../models/ImportedItem.js';
import { ImportedTransaction } from '../../models/ImportedTransaction.js';
import { isDemoUser } from '../importAccess.js';
import { logger } from '../logger.js';
import { memoryKey } from '../statementParsers/memoryKey.js';
import { takeQuota } from '../dailyLimit.js';
import { aiConfig, requestSuggestions, syncItemExamples } from './aiClient.js';
import { pastItemChoices } from './itemExamples.js';
import { merchantMemory } from './merchantMemory.js';

// Suggestions for a fresh import, in two steps (PLANS.md, Phase B):
// 1. merchant memory, right away, before the upload responds;
// 2. the AI service, in the background, for the rest. The upload never waits
//    for it; rows show 'pending' until it answers, and any failure leaves them
//    usable with no suggestion (decision 11).

// The category names a user can pick on review: subcategories they can see
// (shared defaults plus their own), the same list the FE category picker shows.
export const pickableCategories = async (userId: string | null) => {
  const visible = await Category.findAll({
    where: { [Op.or]: [{ isDefault: true }, { userId }] },
    attributes: ['name', 'parentCategoryId'],
  });
  return [...new Set(visible.filter((c) => c.parentCategoryId).map((c) => c.name))];
};

// Draft purchases that need a suggestion. An Amazon charge split into its
// items is suggested item by item instead.
const draftPurchases = (userId: string | null, batchId: string) =>
  ImportedTransaction.findAll({
    where: {
      userId,
      batchId,
      kind: 'charge',
      status: 'draft',
      suggestedCategory: null,
      [Op.or]: [{ amazonStatus: null }, { amazonStatus: { [Op.ne]: 'matched' } }],
    },
  });

const draftItems = async (userId: string | null, where: { batchId?: string; ids?: string[] }) => {
  const rows = where.batchId
    ? await ImportedTransaction.findAll({
        where: { userId, batchId: where.batchId, status: 'draft', amazonStatus: 'matched' },
        attributes: ['id'],
      })
    : [];
  return ImportedItem.findAll({
    where: {
      userId,
      suggestedCategory: null,
      suggestionStatus: null,
      ...(where.ids ? { id: where.ids } : { transactionId: rows.map((r) => r.id) }),
    },
  });
};

interface Target {
  id: string;
  text: string;
  amountCents: number;
  bankCategory?: string;
  kind?: 'item';
}

// Step 1. Returns whether any rows are left for the AI service.
const suggestFromMemory = async (userId: string | null, batchId: string) => {
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

// Rows still pending are settled as "no suggestion". Never throws.
const settleNone = (userId: string | null, rowIds: string[], itemIds: string[]) =>
  Promise.all([
    ImportedTransaction.update(
      { suggestionStatus: 'none' },
      { where: { userId, id: rowIds, suggestionStatus: 'pending' } },
    ),
    ImportedItem.update(
      { suggestionStatus: 'none' },
      { where: { userId, id: itemIds, suggestionStatus: 'pending' } },
    ),
  ]).catch(() => {});

// Step 2, fire and forget. Marks the targets 'pending' first, so the
// response the user gets already says suggestions are on their way.
const runAi = async (
  userId: string | null,
  rows: ImportedTransaction[],
  items: ImportedItem[],
  requestId?: string,
): Promise<{ job: Promise<void> } | null> => {
  const config = aiConfig();
  if (!config || isDemoUser(userId) || (!rows.length && !items.length)) return null;
  const rowIds = rows.map((r) => r.id);
  const itemIds = items.map((i) => i.id);
  await ImportedTransaction.update(
    { suggestionStatus: 'pending' },
    { where: { userId, id: rowIds, status: 'draft' } },
  );
  await ImportedItem.update({ suggestionStatus: 'pending' }, { where: { userId, id: itemIds } });
  const targets: Target[] = [
    ...rows.map((r) => ({
      id: r.id,
      text: r.description,
      amountCents: r.amountCents,
      // The bank's own category, as a hint (it is in the raw row).
      ...(r.raw?.Category ? { bankCategory: r.raw.Category.slice(0, 100) } : {}),
    })),
    // Amazon items: the product name is the text.
    ...items.map((i) => ({
      id: i.id,
      text: i.description.slice(0, 512),
      amountCents: i.amountCents,
      kind: 'item' as const,
    })),
  ];
  const isItem = new Set(itemIds);
  // A daily cap on rows sent to the AI service (decision 12). Over it, rows
  // simply get no suggestion, as when the service is down.
  if (!takeQuota('categorize', userId, targets.length, config.dailyRowLimit)) {
    logger.warn({ rows: targets.length, requestId }, 'AI daily row limit reached');
    await settleNone(userId, rowIds, itemIds);
    return null;
  }

  const job = (async () => {
    try {
      // Items are suggested with the user's past choices for similar
      // products, so the service gets the current set of those first.
      if (items.length) {
        await syncItemExamples(config, userId, await pastItemChoices(userId), requestId);
      }
      const suggestions = await requestSuggestions(
        config,
        targets,
        await pickableCategories(userId),
        requestId,
        userId,
      );
      const values = {
        suggestedCategory: null as string | null,
        suggestionSource: 'model',
        suggestionStatus: 'done',
      };
      for (const [id, category] of suggestions) {
        values.suggestedCategory = category;
        // Rows reviewed or deleted in the meantime are left alone.
        if (isItem.has(id)) {
          await ImportedItem.update(values, { where: { id, userId, suggestionStatus: 'pending' } });
        } else {
          await ImportedTransaction.update(values, {
            where: { id, userId, status: 'draft', suggestionStatus: 'pending' },
          });
        }
      }
    } catch (error) {
      logger.warn(
        { err: { message: (error as Error)?.message }, requestId },
        'AI suggestions failed',
      );
    } finally {
      // Whatever got no answer is settled as "no suggestion".
      await settleNone(userId, rowIds, itemIds);
    }
  })();
  // Wrapped: an async function returning a bare promise would make its caller
  // wait for the whole job, which is exactly what this must not do.
  return { job };
};

const startAiSuggestions = async (userId: string | null, batchId: string, requestId?: string) =>
  runAi(
    userId,
    await draftPurchases(userId, batchId),
    await draftItems(userId, { batchId }),
    requestId,
  );

// Item rows created after the import (the order history came later, or the
// user picked an order). Never throws.
export const suggestForItems = async (userId: string | null, ids: string[], requestId?: string) => {
  if (!ids.length) return null;
  try {
    return await runAi(userId, [], await draftItems(userId, { ids }), requestId);
  } catch (error) {
    logger.warn({ err: { message: (error as Error)?.message }, requestId }, 'Suggestions failed');
    return null;
  }
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
    await suggestFromMemory(userId, batchId);
    return await startAiSuggestions(userId, batchId, requestId);
  } catch (error) {
    logger.warn({ err: { message: (error as Error)?.message }, requestId }, 'Suggestions failed');
    return null;
  }
};
