import type { Transaction } from 'sequelize';
import { AmazonOrderItem } from '../../models/AmazonOrderItem.js';
import { AmazonRefund } from '../../models/AmazonRefund.js';
import { ImportedItem } from '../../models/ImportedItem.js';
import { ImportedTransaction } from '../../models/ImportedTransaction.js';
import { matchItemRefunds } from '../amazon/itemRefunds.js';
import { isAmazonCharge } from '../amazon/matching.js';

// Pairs unpaired Amazon refunds with single items of split charges, across
// all of the user's imports. Same rule as whole charges (pairing.ts): an item
// not saved yet is returned together with its refund, neither becomes an
// expense; an item already saved is linked, and the refund waits on review
// for a "return" that removes that item's expense. A charge whose items are
// all returned is returned too.
export const pairItemRefunds = async (userId: string | null, transaction: Transaction) => {
  const refunds = (
    await ImportedTransaction.findAll({
      where: {
        userId,
        kind: 'refund',
        matchedTransactionId: null,
        matchedItemId: null,
        status: ['draft', 'skipped'],
      },
      transaction,
    })
  ).filter((row) => isAmazonCharge(row.description));
  if (!refunds.length) return;

  const items = await ImportedItem.findAll({
    where: { userId, refundTransactionId: null, status: null },
    transaction,
  });
  if (!items.length) return;
  const charges = await ImportedTransaction.findAll({
    where: {
      userId,
      id: [...new Set(items.map((i) => i.transactionId))],
      amazonStatus: 'matched',
      status: ['draft', 'skipped', 'saved'],
    },
    transaction,
  });
  const chargeById = new Map(charges.map((c) => [c.id, c]));
  const usable = items.filter((i) => chargeById.has(i.transactionId));
  const orderItems = await AmazonOrderItem.findAll({
    where: { userId, id: usable.map((i) => i.orderItemId).filter((id): id is string => !!id) },
    attributes: ['id', 'orderId'],
    transaction,
  });
  const orderOf = new Map(orderItems.map((o) => [o.id, o.orderId]));
  const details = await AmazonRefund.findAll({ where: { userId }, transaction });

  const pairs = matchItemRefunds(
    usable.map((i) => ({
      id: i.id,
      orderId: (i.orderItemId && orderOf.get(i.orderItemId)) || null,
      chargeDate: chargeById.get(i.transactionId)!.postedDate,
      amountCents: i.amountCents,
    })),
    refunds,
    details,
  );
  const itemById = new Map(usable.map((i) => [i.id, i]));
  const refundById = new Map(refunds.map((r) => [r.id, r]));
  for (const { refundId, itemId } of pairs) {
    const item = itemById.get(itemId)!;
    const refund = refundById.get(refundId)!;
    const saved = !!item.expenseId;
    await item.update(
      { refundTransactionId: refund.id, status: saved ? null : 'returned' },
      { transaction },
    );
    await refund.update(
      { matchedItemId: item.id, status: saved ? 'draft' : 'returned' },
      { transaction },
    );
    const charge = chargeById.get(item.transactionId)!;
    if (!saved && charge.status === 'draft') {
      const left = await ImportedItem.count({
        where: { transactionId: charge.id, userId, status: null },
        transaction,
      });
      if (!left) await charge.update({ status: 'returned' }, { transaction });
    }
  }
};

// Undoes item pairings when one side goes away (an import is deleted, or a
// refund is skipped): the item is back to normal, and so is a charge that was
// returned only because all its items were.
export const unpairItems = async (
  userId: string | null,
  where: { refundIds?: string[]; itemIds?: string[] },
  transaction: Transaction,
) => {
  if (where.refundIds?.length) {
    const items = await ImportedItem.findAll({
      where: { userId, refundTransactionId: where.refundIds },
      transaction,
    });
    for (const item of items) {
      await item.update({ status: null, refundTransactionId: null }, { transaction });
      await ImportedTransaction.update(
        { status: 'draft' },
        {
          where: { id: item.transactionId, userId, status: 'returned', matchedTransactionId: null },
          transaction,
        },
      );
    }
  }
  if (where.itemIds?.length) {
    const refunds = await ImportedTransaction.findAll({
      where: { userId, matchedItemId: where.itemIds },
      transaction,
    });
    for (const refund of refunds) {
      await refund.update(
        { matchedItemId: null, status: refund.status === 'returned' ? 'draft' : refund.status },
        { transaction },
      );
    }
  }
};
