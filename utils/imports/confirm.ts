import { randomUUID } from 'node:crypto';
import { sequelize } from '../../config/database.js';
import { Expense } from '../../models/Expense.js';
import { ImportedTransaction } from '../../models/ImportedTransaction.js';
import { displayDescription } from '../statementParsers/merchant.js';
import { centsToAmount } from '../statementParsers/money.js';
import type { ParseError } from '../statementParsers/types.js';
import { ImportInputError } from './errors.js';
import { findOwnBatch, lockUser } from './userLock.js';

export type ConfirmAction = 'save' | 'skip' | 'return';
export interface ConfirmDecision {
  id: string;
  action: ConfirmAction;
  category?: string;
  description?: string;
  // Bought as a gift: the expense keeps its real category and gets the flag.
  isGift?: boolean;
}

const isoDateParts = (iso: string) => ({
  year: Number(iso.slice(0, 4)),
  month: Number(iso.slice(5, 7)),
});

// Applies review decisions to draft rows of one import, in one transaction.
// Rows not mentioned stay drafts, so a long statement can be reviewed in parts.
export const confirmImport = async (
  userId: string | null,
  batchId: string,
  decisions: ConfirmDecision[],
) => {
  return sequelize.transaction(async (transaction) => {
    await lockUser(userId, transaction);
    const batch = await findOwnBatch(userId, batchId, transaction);

    const rows = await ImportedTransaction.findAll({
      where: { batchId, userId, id: decisions.map((d) => d.id) },
      transaction,
    });
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const problems: ParseError[] = [];
    decisions.forEach((decision, index) => {
      const row = rowById.get(decision.id);
      const where = index + 1;
      if (!row)
        return problems.push({ line: where, message: `Row ${decision.id} is not in this import` });
      if (row.status !== 'draft')
        return problems.push({ line: where, message: `Row ${decision.id} was already reviewed` });
      const returnsSavedPurchase = row.kind === 'refund' && !!row.matchedTransactionId;
      if (decision.action === 'return' && !returnsSavedPurchase)
        return problems.push({
          line: where,
          message: `Row ${decision.id} has no saved purchase to return`,
        });
      if (decision.action === 'save' && returnsSavedPurchase)
        return problems.push({
          line: where,
          message: `Row ${decision.id} returns a purchase; choose return or skip`,
        });
      if (decision.action === 'save' && !decision.category?.trim())
        return problems.push({ line: where, message: `Row ${decision.id} needs a category` });
    });
    if (problems.length)
      throw new ImportInputError('Some decisions could not be applied', problems);

    let saved = 0;
    let skipped = 0;
    let returned = 0;
    for (const decision of decisions) {
      const row = rowById.get(decision.id)!;
      if (decision.action === 'skip') {
        if (row.matchedTransactionId) {
          // Keep the purchase as an expense; free it to pair with another refund.
          await ImportedTransaction.update(
            { matchedTransactionId: null },
            { where: { id: row.matchedTransactionId, userId }, transaction },
          );
        }
        await row.update({ status: 'skipped', matchedTransactionId: null }, { transaction });
        skipped += 1;
      } else if (decision.action === 'return') {
        const purchase = await ImportedTransaction.findOne({
          where: { id: row.matchedTransactionId!, userId },
          transaction,
        });
        if (purchase?.expenseId) {
          await Expense.destroy({ where: { id: purchase.expenseId, userId }, transaction });
        }
        await purchase?.update({ status: 'returned', expenseId: null }, { transaction });
        await row.update({ status: 'returned' }, { transaction });
        returned += 1;
      } else {
        const category = decision.category!.trim();
        const description = decision.description?.trim() || displayDescription(row.description);
        const expenseId = randomUUID();
        await Expense.create(
          {
            id: expenseId,
            category,
            description,
            account: batch.account,
            amount: centsToAmount(row.amountCents),
            datePosted: row.postedDate,
            currency: batch.currency,
            ...isoDateParts(row.postedDate),
            isGift: decision.isGift === true,
            userId,
          },
          { transaction },
        );
        await row.update({ status: 'saved', category, expenseId }, { transaction });
        saved += 1;
      }
    }
    return { saved, skipped, returned };
  });
};
