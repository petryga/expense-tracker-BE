// Which Amazon order (or shipment) a card charge pays for (PLANS.md, Phase D,
// decision 7). Amazon charges the card once per shipment, or once for the
// whole order, for exactly the sum of those items' totals, around the day it
// ships. So a candidate is a group of items (an order, or one shipment of it)
// paid with the card's brand, in the charge's currency, whose items add up to
// the charge exactly and whose ship date (order date when not shipped) is
// within the window. One candidate is a match; several, the user picks; none,
// the charge stays an ordinary row.

export interface MatchItem {
  id: string;
  orderId: string;
  orderDate: string;
  shipDate: string | null;
  currency: string;
  totalCents: number;
  paymentMethod: string;
}

export interface MatchCharge {
  id: string;
  postedDate: string;
  amountCents: number;
  description: string;
}

export interface Candidate {
  key: string; // orderId, or orderId@shipDate for one shipment
  itemIds: string[];
  // Paid partly with a gift card: the charge is less than the items. Only
  // ever offered for the user to pick, never matched on its own.
  partial?: boolean;
}

export interface MatchOptions {
  cardBrand: string; // as Amazon names it in Payment Method Type
  currency: string;
}

const WINDOW_DAYS = { before: 3, after: 10 } as const;

export const isAmazonCharge = (description: string) => /\b(amazon|amzn)/i.test(description);

const dayNumber = (iso: string) =>
  Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

const GIFT_CARD = /gift/i;

const sum = (items: MatchItem[]) => items.reduce((total, item) => total + item.totalCents, 0);

// Orders and their shipments as candidate groups; an order shipped at once is
// one group, not two.
const candidateGroups = (items: MatchItem[], options: MatchOptions) => {
  const brand = options.cardBrand.toLowerCase();
  const usable = items.filter(
    (item) =>
      item.currency === options.currency && item.paymentMethod.toLowerCase().includes(brand),
  );
  const byOrder = new Map<string, MatchItem[]>();
  for (const item of usable)
    byOrder.set(item.orderId, [...(byOrder.get(item.orderId) ?? []), item]);

  const groups: { key: string; items: MatchItem[]; day: number }[] = [];
  for (const [orderId, orderItems] of byOrder) {
    const day = (item: MatchItem) => item.shipDate ?? item.orderDate;
    const latest = orderItems.map(day).sort().reverse()[0];
    groups.push({ key: orderId, items: orderItems, day: dayNumber(latest) });
    const byShipment = new Map<string, MatchItem[]>();
    for (const item of orderItems)
      byShipment.set(day(item), [...(byShipment.get(day(item)) ?? []), item]);
    if (byShipment.size > 1) {
      for (const [shipped, shipmentItems] of byShipment) {
        groups.push({
          key: `${orderId}@${shipped}`,
          items: shipmentItems,
          day: dayNumber(shipped),
        });
      }
    }
  }
  return groups;
};

// Candidates for each charge, charges in date order. An item matched to one
// charge is not offered to a later one.
export const matchCharges = (
  charges: MatchCharge[],
  items: MatchItem[],
  options: MatchOptions,
): Map<string, Candidate[]> => {
  const groups = candidateGroups(items, options);
  const used = new Set<string>();
  const result = new Map<string, Candidate[]>();
  const ordered = [...charges].sort((a, b) => a.postedDate.localeCompare(b.postedDate));
  for (const charge of ordered) {
    if (!isAmazonCharge(charge.description) || charge.amountCents <= 0) continue;
    const posted = dayNumber(charge.postedDate);
    const near = groups.filter((group) => {
      const offset = posted - group.day;
      return (
        offset >= -WINDOW_DAYS.before &&
        offset <= WINDOW_DAYS.after &&
        group.items.every((item) => !used.has(item.id))
      );
    });
    const toCandidate = (group: (typeof groups)[number], partial: boolean): Candidate => ({
      key: group.key,
      itemIds: group.items.map((item) => item.id),
      ...(partial ? { partial: true } : {}),
    });
    let candidates = near
      .filter((group) => sum(group.items) === charge.amountCents)
      .map((group) => toCandidate(group, false));
    if (!candidates.length) {
      candidates = near
        .filter(
          (group) =>
            sum(group.items) > charge.amountCents &&
            group.items.some((item) => GIFT_CARD.test(item.paymentMethod)),
        )
        .map((group) => toCandidate(group, true));
    }
    result.set(charge.id, candidates);
    if (candidates.length === 1 && !candidates[0].partial)
      candidates[0].itemIds.forEach((id) => used.add(id));
  }
  return result;
};
