import { randomUUID } from 'node:crypto';
import { sequelize } from '../../config/database.js';
import { Expense } from '../../models/Expense.js';
import { ImportedItem } from '../../models/ImportedItem.js';
import { ImportedTransaction } from '../../models/ImportedTransaction.js';
import { displayDescription } from '../statementParsers/merchant.js';
import { centsToAmount } from '../statementParsers/money.js';
import { checkDecisions } from './confirmChecks.js';
import { ImportInputError } from './errors.js';
import { unpairItems } from './itemRefundPairing.js';
import { forgetSaved, recordSaved } from './savedRows.js';
import { recordOutcome } from './suggestionOutcomes.js';
import { findOwnBatch, lockUser } from './userLock.js';
import { marketplaceNames, merchantFor } from '../marketplaces.js';

export type ConfirmAction = 'save' | 'skip' | 'return';
export interface ConfirmDecision {
  id: string;
  action: ConfirmAction;
  category?: string;
  description?: string;
  // Bought as a gift: the expense keeps its real category and gets the flag.
  isGift?: boolean;
  // A split Amazon charge: one decision per item, all saved together.
  items?: ItemDecision[];
}
export interface ItemDecision {
  id: string;
  category: string;
  description?: string;
  isGift?: boolean;
}

// The merchant of every item saved from a split Amazon charge (Expense.merchant).
export const AMAZON_MERCHANT = 'Amazon';

// Product names run long; an expense gets the first few words.
export const shortName = (productName: string) => {
  const words = productName.replace(/\s+/g, ' ').trim().split(' ');
  const short = words
    .slice(0, 6)
    .join(' ')
    .replace(/[,;:\-–|]+$/, '');
  return (short.length > 80 ? short.slice(0, 80).trim() : short) || 'Amazon item';
};

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
    // The user's marketplaces, read once if a saved row needs them.
    let marketplaces: string[] | undefined;
    const marketplacesOf = async () =>
      (marketplaces ??= await marketplaceNames(userId, transaction));

    const rows = await ImportedTransaction.findAll({
      where: { batchId, userId, id: decisions.map((d) => d.id) },
      transaction,
    });
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const items = await ImportedItem.findAll({
      where: { userId, transactionId: rows.map((row) => row.id) },
      order: [['position', 'ASC']],
      transaction,
    });
    // Items returned on their own are neither reviewed nor saved.
    const itemsOf = (rowId: string) =>
      items.filter((item) => item.transactionId === rowId && item.status !== 'returned');
    const problems = checkDecisions(decisions, rowById, itemsOf);
    if (problems.length)
      throw new ImportInputError('Some decisions could not be applied', problems);

    let saved = 0;
    let skipped = 0;
    let returned = 0;
    for (const decision of decisions) {
      const row = rowById.get(decision.id)!;
      if (decision.action === 'skip') {
        if (row.matchedItemId) {
          // Keep the item's expense; free the item for another refund.
          await unpairItems(userId, { refundIds: [row.id] }, transaction);
          await row.update({ matchedItemId: null }, { transaction });
        }
        if (row.matchedTransactionId) {
          // Keep the purchase as an expense; free it to pair with another refund.
          await ImportedTransaction.update(
            { matchedTransactionId: null },
            { where: { id: row.matchedTransactionId, userId }, transaction },
          );
        }
        await row.update({ status: 'skipped', matchedTransactionId: null }, { transaction });
        skipped += 1;
      } else if (decision.action === 'return' && row.matchedItemId) {
        const item = await ImportedItem.findOne({
          where: { id: row.matchedItemId, userId },
          transaction,
        });
        if (item?.expenseId) {
          await Expense.destroy({ where: { id: item.expenseId, userId }, transaction });
        }
        await item?.update({ status: 'returned', expenseId: null }, { transaction });
        await row.update({ status: 'returned' }, { transaction });
        returned += 1;
      } else if (decision.action === 'return') {
        const purchase = await ImportedTransaction.findOne({
          where: { id: row.matchedTransactionId!, userId },
          transaction,
        });
        if (purchase?.expenseId) {
          await Expense.destroy({ where: { id: purchase.expenseId, userId }, transaction });
        }
        if (purchase) {
          const purchaseItems = await ImportedItem.findAll({
            where: { transactionId: purchase.id, userId },
            transaction,
          });
          const itemExpenses = purchaseItems
            .map((i) => i.expenseId)
            .filter((id): id is string => !!id);
          if (itemExpenses.length)
            await Expense.destroy({ where: { id: itemExpenses, userId }, transaction });
          await ImportedItem.update(
            { expenseId: null },
            { where: { transactionId: purchase.id, userId }, transaction },
          );
        }
        await purchase?.update({ status: 'returned', expenseId: null }, { transaction });
        if (purchase) await forgetSaved(userId, [purchase.fingerprint], transaction);
        await row.update({ status: 'returned' }, { transaction });
        returned += 1;
      } else if (itemsOf(row.id).length) {
        const given = new Map(decision.items!.map((item) => [item.id, item]));
        for (const item of itemsOf(row.id)) {
          const choice = given.get(item.id)!;
          const category = choice.category.trim();
          const expenseId = randomUUID();
          await Expense.create(
            {
              id: expenseId,
              category,
              description: choice.description?.trim() || shortName(item.description),
              account: batch.account,
              amount: centsToAmount(item.amountCents),
              datePosted: row.postedDate,
              currency: batch.currency,
              ...isoDateParts(row.postedDate),
              isGift: choice.isGift === true,
              // The description is the product name; this keeps where it came from.
              merchant: AMAZON_MERCHANT,
              userId,
            },
            { transaction },
          );
          await item.update({ category, expenseId }, { transaction });
          await recordOutcome(
            {
              userId,
              kind: 'item',
              ref: item.id,
              postedDate: row.postedDate,
              suggestedCategory: item.suggestedCategory,
              suggestionSource: item.suggestionSource,
              expenseId,
              importedAt: batch.createdAt,
            },
            transaction,
          );
        }
        await row.update({ status: 'saved' }, { transaction });
        await recordSaved(userId, row, null, transaction);
        saved += 1;
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
            merchant: merchantFor(description, await marketplacesOf()),
            userId,
          },
          { transaction },
        );
        await row.update({ status: 'saved', category, expenseId }, { transaction });
        await recordSaved(userId, row, expenseId, transaction);
        if (row.kind === 'charge') {
          await recordOutcome(
            {
              userId,
              kind: 'statement',
              ref: row.fingerprint,
              postedDate: row.postedDate,
              suggestedCategory: row.suggestedCategory,
              suggestionSource: row.suggestionSource,
              expenseId,
              importedAt: batch.createdAt,
            },
            transaction,
          );
        }
        saved += 1;
      }
    }
    return { saved, skipped, returned };
  });
};
