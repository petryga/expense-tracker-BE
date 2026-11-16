import { randomUUID } from 'node:crypto';
import { sequelize } from '../../config/database.js';
import type { Currency } from '../../models/Expense.js';
import { ImportBatch } from '../../models/ImportBatch.js';
import { ImportedTransaction } from '../../models/ImportedTransaction.js';
import { parseAmex } from '../statementParsers/amex.js';
import { matchAmazonCharges } from './amazon.js';
import { ImportInputError } from './errors.js';
import { pairRefunds } from './pairing.js';
import { lockUser } from './userLock.js';

// Parses a statement and stores every row as part of a new import. Rows seen
// in an earlier upload are counted as duplicates, not stored again.
export interface UploadInput {
  fileName: string;
  csv: string;
  account: string;
  currency: Currency;
}

export const uploadStatement = async (userId: string | null, input: UploadInput) => {
  const parsed = parseAmex(input.csv);
  if (!parsed.ok) throw new ImportInputError('The file could not be imported', parsed.errors);

  return sequelize.transaction(async (transaction) => {
    await lockUser(userId, transaction);

    const batch = await ImportBatch.create(
      {
        userId,
        source: 'amex',
        fileName: input.fileName,
        account: input.account,
        currency: input.currency,
        rowCount: parsed.transactions.length,
        fileTotalCents: parsed.totalCents,
      },
      { transaction },
    );

    // ON CONFLICT DO NOTHING on (user_id, fingerprint): rows already imported
    // from an earlier, overlapping file are left where they are.
    await ImportedTransaction.bulkCreate(
      parsed.transactions.map((t) => ({
        id: randomUUID(),
        userId,
        batchId: batch.id,
        line: t.line,
        fingerprint: t.fingerprint,
        reference: t.reference,
        postedDate: t.postedDate,
        description: t.description.slice(0, 512),
        merchantKey: t.merchantKey,
        amountCents: t.amountCents,
        raw: t.raw,
        kind: t.kind,
        // Card payments and reward credits are never expenses.
        status: t.kind === 'payment' || t.kind === 'reward' ? 'skipped' : 'draft',
      })),
      { transaction, ignoreDuplicates: true },
    );

    const inserted = await ImportedTransaction.findAll({
      where: { batchId: batch.id },
      attributes: ['fingerprint'],
      transaction,
    });
    const insertedFingerprints = new Set(inserted.map((row) => row.fingerprint));
    const duplicates = parsed.transactions.filter((t) => !insertedFingerprints.has(t.fingerprint));
    await batch.update(
      {
        duplicateCount: duplicates.length,
        duplicateTotalCents: duplicates.reduce((sum, t) => sum + t.amountCents, 0),
      },
      { transaction },
    );

    // Nothing new (the whole file was imported before): keep no empty import.
    if (!inserted.length) {
      await batch.destroy({ transaction });
      return { id: null, rowCount: parsed.transactions.length };
    }

    await pairRefunds(userId, transaction);
    // Amazon charges split into their items, when the order history is uploaded.
    await matchAmazonCharges(userId, transaction);
    return { id: batch.id, rowCount: parsed.transactions.length };
  });
};
