import { AmazonOrderItem } from '../../models/AmazonOrderItem.js';
import { Expense } from '../../models/Expense.js';
import { ImportBatch } from '../../models/ImportBatch.js';
import { ImportedItem } from '../../models/ImportedItem.js';
import { ImportedTransaction } from '../../models/ImportedTransaction.js';
import { displayDescription } from '../statementParsers/merchant.js';
import { aiConfig } from './aiClient.js';
import { shortName } from './confirm.js';
import { findOwnBatch } from './userLock.js';

// What the API returns about imports: per-import counts and reconciliation,
// and the rows of one import with the row each is paired with.

// A row still 'pending' long after the AI timeout lost its job (say, a server
// restart): report it as settled with no suggestion, so the page stops waiting.
const settledStatus = (row: ImportedTransaction | ImportedItem) => {
  if (row.suggestionStatus !== 'pending') return row.suggestionStatus ?? 'none';
  const limit = (aiConfig()?.timeoutMs ?? 300_000) + 60_000;
  return Date.now() - new Date(row.updatedAt).getTime() > limit ? 'none' : 'pending';
};

// BIGINT columns come back from pg as strings.
const toCents = (value: string | number) => Number(value);

type Counts = Record<string, { count: number; cents: number }>;
const tally = (rows: ImportedTransaction[], key: 'kind' | 'status'): Counts => {
  const out: Counts = {};
  for (const row of rows) {
    const entry = (out[row[key]] ??= { count: 0, cents: 0 });
    entry.count += 1;
    entry.cents += row.amountCents;
  }
  return out;
};

const batchSummary = (batch: ImportBatch, rows: ImportedTransaction[]) => {
  const importedCents = rows.reduce((sum, row) => sum + row.amountCents, 0);
  const fileTotalCents = toCents(batch.fileTotalCents);
  const duplicateTotalCents = toCents(batch.duplicateTotalCents);
  return {
    id: batch.id,
    source: batch.source,
    fileName: batch.fileName,
    account: batch.account,
    currency: batch.currency,
    createdAt: batch.createdAt,
    rowCount: batch.rowCount,
    draftCount: rows.filter((row) => row.status === 'draft').length,
    byKind: tally(rows, 'kind'),
    byStatus: tally(rows, 'status'),
    // Every line in the file is either a row of this import or a duplicate of
    // a row imported before, and the amounts add up to the file's total.
    reconciliation: {
      fileTotalCents,
      importedCount: rows.length,
      importedCents,
      duplicateCount: batch.duplicateCount,
      duplicateTotalCents,
      balanced:
        rows.length + batch.duplicateCount === batch.rowCount &&
        importedCents + duplicateTotalCents === fileTotalCents,
    },
  };
};

export const listImports = async (userId: string | null) => {
  const batches = await ImportBatch.findAll({ where: { userId }, order: [['createdAt', 'DESC']] });
  const rows = await ImportedTransaction.findAll({
    where: { userId, batchId: batches.map((b) => b.id) },
    attributes: ['batchId', 'kind', 'status', 'amountCents'],
  });
  return batches.map((batch) =>
    batchSummary(
      batch,
      rows.filter((row) => row.batchId === batch.id),
    ),
  );
};

export const getImport = async (userId: string | null, batchId: string) => {
  const batch = await findOwnBatch(userId, batchId);
  const rows = await ImportedTransaction.findAll({
    where: { batchId, userId },
    order: [
      ['postedDate', 'DESC'],
      ['line', 'ASC'],
    ],
  });
  const matchIds = rows.map((row) => row.matchedTransactionId).filter((id): id is string => !!id);
  const matches = matchIds.length
    ? await ImportedTransaction.findAll({ where: { id: matchIds, userId } })
    : [];
  const matchById = new Map(matches.map((m) => [m.id, m]));
  // Expenses this import saved that still exist (some may have been deleted
  // on the Expenses page since); deleting the import removes these.
  const items = await ImportedItem.findAll({
    where: { userId, transactionId: rows.map((row) => row.id) },
    order: [['position', 'ASC']],
  });
  const candidateItemIds = rows.flatMap(
    (row) => row.amazonCandidates?.flatMap((c) => c.itemIds) ?? [],
  );
  const candidateItems = candidateItemIds.length
    ? await AmazonOrderItem.findAll({ where: { userId, id: candidateItemIds } })
    : [];
  const orderItemById = new Map(candidateItems.map((item) => [item.id, item]));
  // Items that refunds of this import return (they may be in another import).
  const refundItemIds = rows.map((row) => row.matchedItemId).filter((id): id is string => !!id);
  const refundItems = refundItemIds.length
    ? await ImportedItem.findAll({ where: { userId, id: refundItemIds } })
    : [];
  const refundCharges = refundItems.length
    ? await ImportedTransaction.findAll({
        where: { userId, id: refundItems.map((i) => i.transactionId) },
        attributes: ['id', 'postedDate'],
      })
    : [];
  const refundItemById = new Map(refundItems.map((i) => [i.id, i]));
  const chargeDateById = new Map(refundCharges.map((c) => [c.id, c.postedDate]));
  const expenseIds = [...rows, ...items]
    .map((row) => row.expenseId)
    .filter((id): id is string => !!id);
  const savedExpenseCount = expenseIds.length
    ? await Expense.count({ where: { id: expenseIds, userId } })
    : 0;

  return {
    ...batchSummary(batch, rows),
    savedExpenseCount,
    rows: rows.map((row) => {
      const match = row.matchedTransactionId ? matchById.get(row.matchedTransactionId) : undefined;
      return {
        id: row.id,
        postedDate: row.postedDate,
        description: row.description,
        suggestedDescription: displayDescription(row.description),
        amountCents: row.amountCents,
        kind: row.kind,
        status: row.status,
        category: row.category,
        suggestedCategory: row.suggestedCategory ?? null,
        suggestionSource: row.suggestionSource ?? null,
        suggestionStatus: settledStatus(row),
        expenseId: row.expenseId,
        amexCategory: row.raw.Category || null,
        amazonStatus: row.amazonStatus ?? null,
        // A matched Amazon charge, split into its items (they add up to it).
        items: items
          .filter((item) => item.transactionId === row.id)
          .map((item) => ({
            id: item.id,
            description: item.description,
            suggestedDescription: shortName(item.description),
            amountCents: item.amountCents,
            quantity: item.quantity,
            category: item.category,
            expenseId: item.expenseId,
            suggestedCategory: item.suggestedCategory ?? null,
            suggestionSource: item.suggestionSource ?? null,
            suggestionStatus: settledStatus(item),
            status: item.status ?? null,
          })),
        // A refund that returns one item of a split Amazon charge.
        matchedItem: (() => {
          const item = row.matchedItemId ? refundItemById.get(row.matchedItemId) : undefined;
          return item
            ? {
                id: item.id,
                description: item.description,
                amountCents: item.amountCents,
                expenseId: item.expenseId,
                chargePostedDate: chargeDateById.get(item.transactionId) ?? null,
              }
            : null;
        })(),
        // Several orders fit this charge: the user picks one.
        amazonCandidates: (row.amazonCandidates ?? []).map((candidate) => {
          const orderItems = candidate.itemIds
            .map((id) => orderItemById.get(id))
            .filter((item): item is AmazonOrderItem => !!item);
          return {
            key: candidate.key,
            partial: candidate.partial === true,
            orderDate: orderItems[0]?.orderDate ?? null,
            shipDate: orderItems[0]?.shipDate ?? null,
            items: orderItems.map((item) => ({
              description: item.productName,
              amountCents: item.totalCents,
            })),
          };
        }),
        matched: match
          ? {
              id: match.id,
              batchId: match.batchId,
              postedDate: match.postedDate,
              description: match.description,
              amountCents: match.amountCents,
              status: match.status,
              expenseId: match.expenseId,
            }
          : null,
      };
    }),
  };
};
