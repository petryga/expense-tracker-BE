import { randomUUID } from 'node:crypto';
import { Op, type Transaction } from 'sequelize';
import { sequelize } from '../../config/database.js';
import { AmazonOrderItem } from '../../models/AmazonOrderItem.js';
import { AmazonRefund } from '../../models/AmazonRefund.js';
import { ImportedItem } from '../../models/ImportedItem.js';
import { parseOrderHistory, type OrderItem } from '../amazon/orderHistory.js';
import { parseRefundDetails, REFUND_COLUMNS } from '../amazon/refundDetails.js';
import { matchAmazonCharges } from './amazonMatching.js';
import { ImportInputError } from './errors.js';
import { pairItemRefunds } from './itemRefundPairing.js';
import { lockUser } from './userLock.js';

// Uploading Amazon's files (PLANS.md, Phase D): the order history, whose items
// are stored and matched against open charges, and the refund list, which
// helps pair single-item refunds. Matching itself is in amazonMatching.ts.

// Amazon's refund list: stored, then refunds are paired again (it only helps
// to tell apart same-price items of different orders).
const uploadAmazonRefunds = async (userId: string | null, csv: string) => {
  const parsed = parseRefundDetails(csv);
  if (!parsed.ok) throw new ImportInputError('The refund list could not be read', parsed.errors);
  return sequelize.transaction(async (transaction) => {
    await lockUser(userId, transaction);
    const before = await AmazonRefund.count({ where: { userId }, transaction });
    await AmazonRefund.bulkCreate(
      parsed.refunds.map((refund) => ({ id: randomUUID(), userId, ...refund })),
      { transaction, ignoreDuplicates: true },
    );
    const refundCount = await AmazonRefund.count({ where: { userId }, transaction });
    const pairedBefore = await ImportedItem.count({
      where: { userId, refundTransactionId: { [Op.ne]: null } },
      transaction,
    });
    await pairItemRefunds(userId, transaction);
    const pairedAfter = await ImportedItem.count({
      where: { userId, refundTransactionId: { [Op.ne]: null } },
      transaction,
    });
    return {
      kind: 'refunds' as const,
      refundCount,
      newRefundCount: refundCount - before,
      pairedCount: pairedAfter - pairedBefore,
      newItemIds: [] as string[],
    };
  });
};

// An export taken before an order shipped lists its items with no ship date;
// a later export lists them again with one, and the ship date is part of the
// fingerprint, so both copies would be stored and the charge would offer the
// same order twice. Once an upload has the shipped item, the earlier unshipped
// copy goes, unless this upload still lists it (an identical item not shipped
// yet) or a charge was already split from it.
const sameItem = (item: { orderId: string; asin: string; totalCents: number }) =>
  `${item.orderId}|${item.asin}|${item.totalCents}`;

const dropUnshippedCopies = async (
  userId: string | null,
  uploaded: OrderItem[],
  transaction: Transaction,
) => {
  const shipped = uploaded.filter((item) => item.shipDate);
  if (!shipped.length) return;
  const shippedItems = new Set(shipped.map(sameItem));
  const inThisUpload = new Set(uploaded.map((item) => item.fingerprint));
  const unshipped = await AmazonOrderItem.findAll({
    where: { userId, shipDate: null, orderId: [...new Set(shipped.map((item) => item.orderId))] },
    transaction,
  });
  const candidates = unshipped.filter(
    (item) => shippedItems.has(sameItem(item)) && !inThisUpload.has(item.fingerprint),
  );
  if (!candidates.length) return;
  const splitFrom = new Set(
    (
      await ImportedItem.findAll({
        where: { orderItemId: candidates.map((item) => item.id) },
        attributes: ['orderItemId'],
        transaction,
      })
    ).map((item) => item.orderItemId),
  );
  const stale = candidates.filter((item) => !splitFrom.has(item.id));
  if (stale.length) {
    await AmazonOrderItem.destroy({ where: { id: stale.map((item) => item.id) }, transaction });
  }
};

// Stores a new order history upload (items seen before are kept as they are)
// and matches open charges against it.
const uploadAmazonOrders = async (userId: string | null, csv: string) => {
  const parsed = parseOrderHistory(csv);
  if (!parsed.ok) throw new ImportInputError('The order history could not be read', parsed.errors);
  return sequelize.transaction(async (transaction) => {
    await lockUser(userId, transaction);
    const before = await AmazonOrderItem.count({ where: { userId }, transaction });
    await AmazonOrderItem.bulkCreate(
      parsed.items.map((item) => ({ id: randomUUID(), userId, ...item })),
      { transaction, ignoreDuplicates: true },
    );
    const added = (await AmazonOrderItem.count({ where: { userId }, transaction })) - before;
    await dropUnshippedCopies(userId, parsed.items, transaction);
    const itemCount = await AmazonOrderItem.count({ where: { userId }, transaction });
    const newItemIds = await matchAmazonCharges(userId, transaction);
    const matchedCount = newItemIds.length
      ? (
          await ImportedItem.findAll({
            where: { id: newItemIds },
            attributes: ['transactionId'],
            transaction,
          })
        ).reduce((set, item) => set.add(item.transactionId), new Set<string>()).size
      : 0;
    return {
      kind: 'orders' as const,
      itemCount,
      newItemCount: added,
      matchedCount,
      newItemIds,
    };
  });
};

// Either Amazon file: "Order History.csv" or "Refund Details.csv".
export const uploadAmazonFile = async (userId: string | null, csv: string) => {
  const header = csv.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  const isRefunds =
    REFUND_COLUMNS.every((c) => header.includes(c)) && !header.includes('Product Name');
  return isRefunds ? uploadAmazonRefunds(userId, csv) : uploadAmazonOrders(userId, csv);
};

// What the import page shows about the uploaded order history.
export const amazonSummary = async (userId: string | null) => {
  const [itemCount, latest, refundCount] = await Promise.all([
    AmazonOrderItem.count({ where: { userId } }),
    AmazonOrderItem.max('orderDate', { where: { userId } }),
    AmazonRefund.count({ where: { userId } }),
  ]);
  return { itemCount, latestOrderDate: (latest as string | null) ?? null, refundCount };
};
