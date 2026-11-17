// Pairs refunds with the purchases they return. Deterministic, no model:
// same merchant key, the refund is exactly the purchase amount negated, and
// the purchase is on or before the refund date and at most MAX_DAYS earlier.
// The purchase can be in another month and in another upload.
//
// When several purchases qualify they are interchangeable for the books (same
// merchant, same amount), so the nearest earlier one is taken. Partial refunds
// never match, by design: they stay for a person to decide.
const MAX_REFUND_DAYS = 180;

export interface MatchCandidate {
  id: string;
  postedDate: string; // YYYY-MM-DD
  merchantKey: string;
  amountCents: number;
}

export interface RefundMatch {
  refundId: string;
  chargeId: string;
}

const dayNumber = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000;

export const matchRefunds = (
  charges: MatchCandidate[],
  refunds: MatchCandidate[],
): RefundMatch[] => {
  const available = [...charges].sort((a, b) => (a.postedDate < b.postedDate ? 1 : -1)); // newest first
  const used = new Set<string>();
  const matches: RefundMatch[] = [];

  // Oldest refund first, so an earlier refund can't take a purchase that only a
  // later refund could have been for.
  const ordered = [...refunds].sort((a, b) =>
    a.postedDate < b.postedDate ? -1 : a.postedDate > b.postedDate ? 1 : 0,
  );
  for (const refund of ordered) {
    const refundDay = dayNumber(refund.postedDate);
    const charge = available.find((c) => {
      if (used.has(c.id) || c.merchantKey !== refund.merchantKey) return false;
      if (c.amountCents !== -refund.amountCents || c.amountCents <= 0) return false;
      const gap = refundDay - dayNumber(c.postedDate);
      return gap >= 0 && gap <= MAX_REFUND_DAYS;
    });
    if (charge) {
      used.add(charge.id);
      matches.push({ refundId: refund.id, chargeId: charge.id });
    }
  }
  return matches;
};
