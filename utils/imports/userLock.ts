import type { Transaction } from 'sequelize';
import { sequelize } from '../../config/database.js';
import { ImportBatch } from '../../models/ImportBatch.js';
import { ImportNotFoundError } from './errors.js';

// Every change to a user's imports (upload, confirm, reopen, delete) runs one
// at a time for that user, so two tabs can't pair the same purchase with two
// refunds or confirm the same row twice.
export const lockUser = (userId: string | null, transaction: Transaction) =>
  sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', {
    replacements: { key: `imports:${userId ?? 'null-user'}` },
    transaction,
  });

// The user's own import, or 404.
export const findOwnBatch = async (
  userId: string | null,
  batchId: string,
  transaction?: Transaction,
) => {
  const batch = await ImportBatch.findOne({ where: { id: batchId, userId }, transaction });
  if (!batch) throw new ImportNotFoundError();
  return batch;
};
