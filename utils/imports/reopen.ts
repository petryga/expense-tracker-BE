import { sequelize } from '../../config/database.js';
import { ImportedItem } from '../../models/ImportedItem.js';
import { ImportedTransaction } from '../../models/ImportedTransaction.js';
import { ImportInputError } from './errors.js';
import { pairRefunds } from './pairing.js';
import { findOwnBatch, lockUser } from './userLock.js';

// Puts skipped rows of one import back into review. Pairing runs again, so a
// reopened purchase whose full refund is already imported comes back as
// returned rather than as a draft.
export const reopenRows = async (userId: string | null, batchId: string, rowIds: string[]) =>
  sequelize.transaction(async (transaction) => {
    await lockUser(userId, transaction);
    await findOwnBatch(userId, batchId, transaction);
    const rows = await ImportedTransaction.findAll({
      where: { batchId, userId, id: rowIds },
      transaction,
    });
    const notSkipped = rowIds.filter((id) => rows.find((r) => r.id === id)?.status !== 'skipped');
    if (notSkipped.length) {
      throw new ImportInputError(
        'Only skipped rows of this import can be reviewed again',
        notSkipped.map((id, i) => ({
          line: i + 1,
          message: `Row ${id} is not a skipped row here`,
        })),
      );
    }
    for (const row of rows) {
      await row.update({ status: 'draft', category: null }, { transaction });
    }
    await ImportedItem.update(
      { category: null },
      { where: { userId, transactionId: rows.map((r) => r.id) }, transaction },
    );
    await pairRefunds(userId, transaction);
    return { reopened: rows.length };
  });
