import { randomUUID } from 'node:crypto';
import type { Transaction } from 'sequelize';
import { SavedStatementRow } from '../../models/SavedStatementRow.js';
import type { ImportedTransaction } from '../../models/ImportedTransaction.js';

// The record of statement rows saved as expenses, which outlives the import
// they came in (PLANS.md, "Improvements", 1). Merchant memory reads it, and a
// re-upload treats its rows as already imported.

export const recordSaved = async (
  userId: string | null,
  row: ImportedTransaction,
  expenseId: string | null,
  transaction: Transaction,
) => {
  await forgetSaved(userId, [row.fingerprint], transaction);
  await SavedStatementRow.create(
    {
      id: randomUUID(),
      userId,
      fingerprint: row.fingerprint,
      description: row.description,
      kind: row.kind,
      expenseId,
      source: 'import',
      chosenAt: new Date(),
    },
    { transaction },
  );
};

// A saved row that stopped being one: returned, or its import deleted along
// with its expenses.
export const forgetSaved = async (
  userId: string | null,
  fingerprints: string[],
  transaction: Transaction,
) => {
  if (!fingerprints.length) return;
  await SavedStatementRow.destroy({
    where: { userId, fingerprint: fingerprints, source: 'import' },
    transaction,
  });
};

// Of these fingerprints, the ones saved before (in any import, deleted or not).
export const savedFingerprints = async (
  userId: string | null,
  fingerprints: string[],
  transaction: Transaction,
) => {
  if (!fingerprints.length) return new Set<string>();
  const rows = await SavedStatementRow.findAll({
    where: { userId, fingerprint: fingerprints, source: 'import' },
    attributes: ['fingerprint'],
    transaction,
  });
  return new Set(rows.map((r) => r.fingerprint));
};
