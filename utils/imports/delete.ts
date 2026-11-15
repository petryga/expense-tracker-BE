import { Op } from 'sequelize';
import { sequelize } from '../../config/database.js';
import { Expense } from '../../models/Expense.js';
import { ImportedTransaction } from '../../models/ImportedTransaction.js';
import { pairRefunds } from './pairing.js';
import { findOwnBatch, lockUser } from './userLock.js';

// Deleting an import removes its rows. The expenses it saved that still exist
// are deleted too unless keepExpenses is set; kept ones become ordinary
// expenses (uploading the same file again would then offer those rows anew).
// Rows in other imports that were paired with one of its rows are unpaired,
// then pairing runs again over what is left.
export const deleteImport = async (
  userId: string | null,
  batchId: string,
  { keepExpenses = false }: { keepExpenses?: boolean } = {},
) =>
  sequelize.transaction(async (transaction) => {
    await lockUser(userId, transaction);
    const batch = await findOwnBatch(userId, batchId, transaction);
    const rows = await ImportedTransaction.findAll({
      where: { batchId, userId },
      attributes: ['id', 'expenseId'],
      transaction,
    });
    const ids = rows.map((r) => r.id);
    const expenseIds = rows.map((r) => r.expenseId).filter((id): id is string => !!id);

    const deletedExpenses =
      !keepExpenses && expenseIds.length
        ? await Expense.destroy({ where: { id: expenseIds, userId }, transaction })
        : 0;

    const partners = await ImportedTransaction.findAll({
      where: { userId, matchedTransactionId: ids, batchId: { [Op.ne]: batchId } },
      transaction,
    });
    for (const partner of partners) {
      await partner.update(
        {
          matchedTransactionId: null,
          status: partner.status === 'returned' ? 'draft' : partner.status,
        },
        { transaction },
      );
    }
    await ImportedTransaction.destroy({ where: { batchId, userId }, transaction });
    await batch.destroy({ transaction });
    await pairRefunds(userId, transaction);
    return { deletedExpenses };
  });
