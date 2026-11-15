import type { Transaction } from 'sequelize';
import { ImportedTransaction } from '../../models/ImportedTransaction.js';
import { matchRefunds } from '../statementParsers/refundMatching.js';

// Pairs every unpaired refund with an unpaired purchase across all of the
// user's imports (any month, any upload). A purchase that is still a draft or
// was skipped is simply marked returned together with its refund: neither
// becomes an expense. A purchase already saved as an expense is linked, and the
// refund waits on review for a "return" decision that removes that expense.
//
// Test seam: lets a test hold the pairing step open so two uploads are sure to
// overlap. Does nothing in the app.
export const pairingHooks = { beforePairing: async (): Promise<void> => {} };

export const pairRefunds = async (userId: string | null, transaction: Transaction) => {
  await pairingHooks.beforePairing();
  const [charges, refunds] = await Promise.all([
    ImportedTransaction.findAll({
      where: {
        userId,
        kind: 'charge',
        matchedTransactionId: null,
        status: ['draft', 'skipped', 'saved'],
      },
      transaction,
    }),
    ImportedTransaction.findAll({
      where: { userId, kind: 'refund', matchedTransactionId: null, status: ['draft', 'skipped'] },
      transaction,
    }),
  ]);
  if (!charges.length || !refunds.length) return;

  const byId = new Map([...charges, ...refunds].map((row) => [row.id, row]));
  for (const { refundId, chargeId } of matchRefunds(charges, refunds)) {
    const refund = byId.get(refundId)!;
    const charge = byId.get(chargeId)!;
    const purchaseSaved = charge.status === 'saved';
    await charge.update(
      { matchedTransactionId: refund.id, status: purchaseSaved ? 'saved' : 'returned' },
      { transaction },
    );
    await refund.update(
      { matchedTransactionId: charge.id, status: purchaseSaved ? 'draft' : 'returned' },
      { transaction },
    );
  }
};
