import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import { sequelize } from '../../config/database.js';
import { AmazonOrderItem } from '../../models/AmazonOrderItem.js';
import { AmazonRefund } from '../../models/AmazonRefund.js';
import { ImportedItem } from '../../models/ImportedItem.js';
import { parseOrderHistory } from '../amazon/orderHistory.js';
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
      newItemCount: itemCount - before,
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
