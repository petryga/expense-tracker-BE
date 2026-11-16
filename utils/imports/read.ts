import { Expense } from '../../models/Expense.js';
import { ImportBatch } from '../../models/ImportBatch.js';
import { ImportedTransaction } from '../../models/ImportedTransaction.js';
import { displayDescription } from '../statementParsers/merchant.js';
import { aiConfig } from './aiClient.js';
import { findOwnBatch } from './userLock.js';

// What the API returns about imports: per-import counts and reconciliation,
// and the rows of one import with the row each is paired with.

// A row still 'pending' long after the AI timeout lost its job (say, a server
// restart): report it as settled with no suggestion, so the page stops waiting.
const settledStatus = (row: ImportedTransaction) => {
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
  const expenseIds = rows.map((row) => row.expenseId).filter((id): id is string => !!id);
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
