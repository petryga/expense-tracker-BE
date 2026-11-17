import { randomUUID } from 'node:crypto';
import { Op, type Transaction } from 'sequelize';
import { sequelize } from '../../config/database.js';
import { AmazonOrderItem } from '../../models/AmazonOrderItem.js';
import { ImportBatch } from '../../models/ImportBatch.js';
import { ImportedItem } from '../../models/ImportedItem.js';
import { ImportedTransaction } from '../../models/ImportedTransaction.js';
import { isAmazonCharge, matchCharges } from '../amazon/matching.js';
import { splitCents } from '../amazon/split.js';
import { ImportInputError } from './errors.js';
import { pairItemRefunds, unpairItems } from './itemRefundPairing.js';
import { findOwnBatch, lockUser } from './userLock.js';

// Amazon orders in statement import (PLANS.md, Phase D): every draft Amazon
// charge is matched to the order (or shipment) it paid for and split into its
// items, each reviewed and saved as its own expense. Uploading Amazon's files
// is in amazonUpload.ts.

// How Amazon names each statement source's card in "Payment Method Type".
const CARD_BRAND: Record<string, string> = { amex: 'AmericanExpress' };

// Splits a charge into item rows for review. Returns the new item ids.
const createItems = async (
  userId: string | null,
  row: ImportedTransaction,
  orderItems: AmazonOrderItem[],
  transaction: Transaction,
) => {
  const parts = splitCents(
    row.amountCents,
    orderItems.map((item) => item.totalCents),
  );
  const created = await ImportedItem.bulkCreate(
    orderItems.map((item, position) => ({
      id: randomUUID(),
      userId,
      transactionId: row.id,
      orderItemId: item.id,
      position,
      description: item.productName,
      amountCents: parts[position],
      quantity: item.quantity,
    })),
    { transaction },
  );
  return created.map((item) => item.id);
};

// Matches every open Amazon charge of the user (draft, not yet split, not
// declined) against their uploaded orders. Returns the ids of new item rows,
// which still need category suggestions.
export const matchAmazonCharges = async (userId: string | null, transaction: Transaction) => {
  const open = await ImportedTransaction.findAll({
    where: {
      userId,
      kind: 'charge',
      status: 'draft',
      [Op.or]: [{ amazonStatus: null }, { amazonStatus: 'ambiguous' }],
    },
    transaction,
  });
  const charges = open.filter((row) => isAmazonCharge(row.description));
  if (!charges.length) return [];

  const linked = await ImportedItem.findAll({
    where: { userId, orderItemId: { [Op.ne]: null } },
    attributes: ['orderItemId'],
    transaction,
  });
  const taken = new Set(linked.map((item) => item.orderItemId));
  const orderItems = (await AmazonOrderItem.findAll({ where: { userId }, transaction })).filter(
    (item) => !taken.has(item.id),
  );
  if (!orderItems.length) return [];
  const orderItemById = new Map(orderItems.map((item) => [item.id, item]));

  const batches = await ImportBatch.findAll({
    where: { id: [...new Set(charges.map((row) => row.batchId))], userId },
    transaction,
  });
  const newItemIds: string[] = [];
  // Card brand and currency differ per import, so match import by import.
  for (const batch of batches) {
    const cardBrand = CARD_BRAND[batch.source];
    if (!cardBrand) continue;
    const rows = charges.filter((row) => row.batchId === batch.id);
    const available = orderItems.filter((item) => orderItemById.has(item.id));
    const result = matchCharges(rows, available, { cardBrand, currency: batch.currency });
    for (const row of rows) {
      const candidates = result.get(row.id) ?? [];
      if (candidates.length === 1 && !candidates[0].partial) {
        const items = candidates[0].itemIds.map((id) => orderItemById.get(id)!);
        newItemIds.push(...(await createItems(userId, row, items, transaction)));
        items.forEach((item) => orderItemById.delete(item.id));
        await row.update({ amazonStatus: 'matched', amazonCandidates: null }, { transaction });
      } else if (candidates.length) {
        await row.update(
          { amazonStatus: 'ambiguous', amazonCandidates: candidates },
          { transaction },
        );
      } else if (row.amazonStatus === 'ambiguous') {
        await row.update({ amazonStatus: null, amazonCandidates: null }, { transaction });
      }
    }
  }
  if (newItemIds.length) await pairItemRefunds(userId, transaction);
  return newItemIds;
};

// The user's answer for one charge: an order out of its candidates (or the
// matched one), or null to keep the charge as a single row. Returns new item
// ids that need suggestions.
export const chooseAmazonOrder = async (
  userId: string | null,
  batchId: string,
  rowId: string,
  orderKey: string | null,
) =>
  sequelize.transaction(async (transaction) => {
    await lockUser(userId, transaction);
    await findOwnBatch(userId, batchId, transaction);
    const row = await ImportedTransaction.findOne({
      where: { id: rowId, batchId, userId },
      transaction,
    });
    if (!row || row.status !== 'draft' || !row.amazonStatus) {
      throw new ImportInputError('Only an Amazon charge waiting for review can be changed', [
        { line: 1, message: `Row ${rowId} has no Amazon order to choose` },
      ]);
    }
    const oldItems = await ImportedItem.findAll({
      where: { transactionId: row.id, userId },
      attributes: ['id'],
      transaction,
    });
    await unpairItems(userId, { itemIds: oldItems.map((i) => i.id) }, transaction);
    await ImportedItem.destroy({ where: { transactionId: row.id, userId }, transaction });
    if (orderKey === null) {
      await row.update({ amazonStatus: 'declined', amazonCandidates: null }, { transaction });
      return { newItemIds: [] as string[] };
    }
    const candidate = row.amazonCandidates?.find((c) => c.key === orderKey);
    if (!candidate) {
      throw new ImportInputError('That order is not one of the choices', [
        { line: 1, message: `Order ${orderKey} does not match row ${rowId}` },
      ]);
    }
    const linked = await ImportedItem.count({
      where: { userId, orderItemId: candidate.itemIds },
      transaction,
    });
    const orderItems = await AmazonOrderItem.findAll({
      where: { userId, id: candidate.itemIds },
      order: [['productName', 'ASC']],
      transaction,
    });
    if (linked || orderItems.length !== candidate.itemIds.length) {
      throw new ImportInputError('That order is already matched to another charge', [
        { line: 1, message: `Order ${orderKey} is taken` },
      ]);
    }
    const newItemIds = await createItems(userId, row, orderItems, transaction);
    await row.update({ amazonStatus: 'matched', amazonCandidates: null }, { transaction });
    await pairItemRefunds(userId, transaction);
    return { newItemIds };
  });
