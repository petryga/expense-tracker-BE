// Pairs a card refund with the one item of a split Amazon charge it returns
// (PLANS.md, Phase D). Like whole-charge pairing: the refund is exactly the
// item's amount, within MAX_ITEM_REFUND_DAYS after the charge. When items of
// the same price in different orders qualify, Amazon's refund list (order,
// amount, date) decides; if it can't, the refund is left for a person.
const MAX_ITEM_REFUND_DAYS = 180;
const REFUND_DETAIL_DAYS = 7;

export interface RefundableItem {
  id: string;
  orderId: string | null;
  chargeDate: string;
  amountCents: number;
}

export interface CardRefund {
  id: string;
  postedDate: string;
  amountCents: number; // negative
}

export interface RefundDetail {
  orderId: string;
  amountCents: number; // positive
  refundDate: string;
}

const day = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000;

export const matchItemRefunds = (
  items: RefundableItem[],
  refunds: CardRefund[],
  details: RefundDetail[],
): { refundId: string; itemId: string }[] => {
  const used = new Set<string>();
  const pairs: { refundId: string; itemId: string }[] = [];
  const ordered = [...refunds].sort((a, b) => a.postedDate.localeCompare(b.postedDate));
  for (const refund of ordered) {
    const amount = -refund.amountCents;
    if (amount <= 0) continue;
    const refundDay = day(refund.postedDate);
    let candidates = items.filter((item) => {
      const gap = refundDay - day(item.chargeDate);
      return (
        !used.has(item.id) && item.amountCents === amount && gap >= 0 && gap <= MAX_ITEM_REFUND_DAYS
      );
    });
    const orders = new Set(candidates.map((c) => c.orderId));
    if (orders.size > 1) {
      const refundedOrders = new Set(
        details
          .filter(
            (d) =>
              d.amountCents === amount &&
              Math.abs(day(d.refundDate) - refundDay) <= REFUND_DETAIL_DAYS,
          )
          .map((d) => d.orderId),
      );
      candidates = candidates.filter((c) => c.orderId && refundedOrders.has(c.orderId));
    }
    // Items left are all from one order and the same price: interchangeable.
    if (candidates.length && new Set(candidates.map((c) => c.orderId)).size === 1) {
      used.add(candidates[0].id);
      pairs.push({ refundId: refund.id, itemId: candidates[0].id });
    }
  }
  return pairs;
};
