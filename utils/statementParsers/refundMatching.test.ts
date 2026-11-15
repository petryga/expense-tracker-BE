import { describe, expect, it } from 'vitest';
import { matchRefunds, type MatchCandidate } from './refundMatching.js';

const row = (
  id: string,
  postedDate: string,
  amountCents: number,
  merchantKey = 'AMAZON',
): MatchCandidate => ({
  id,
  postedDate,
  amountCents,
  merchantKey,
});

describe('matchRefunds', () => {
  it('pairs a refund with the purchase of the same merchant and exact amount, across months', () => {
    expect(matchRefunds([row('c1', '2026-09-28', 2499)], [row('r1', '2026-10-05', -2499)])).toEqual(
      [{ refundId: 'r1', chargeId: 'c1' }],
    );
  });

  it('does not pair a partial refund', () => {
    expect(matchRefunds([row('c1', '2026-09-28', 2499)], [row('r1', '2026-10-05', -1000)])).toEqual(
      [],
    );
  });

  it('does not pair across merchants, or a refund dated before the purchase', () => {
    expect(
      matchRefunds([row('c1', '2026-09-28', 2499, 'WALMART')], [row('r1', '2026-10-05', -2499)]),
    ).toEqual([]);
    expect(matchRefunds([row('c1', '2026-10-08', 2499)], [row('r1', '2026-10-05', -2499)])).toEqual(
      [],
    );
  });

  it('allows a same-day refund and stops at 180 days', () => {
    expect(
      matchRefunds([row('c1', '2026-10-05', 500)], [row('r1', '2026-10-05', -500)]),
    ).toHaveLength(1);
    expect(
      matchRefunds([row('c1', '2026-01-01', 500)], [row('r1', '2026-06-30', -500)]),
    ).toHaveLength(1); // 180 days
    expect(
      matchRefunds([row('c1', '2026-01-01', 500)], [row('r1', '2026-07-01', -500)]),
    ).toHaveLength(0); // 181
  });

  it('uses each purchase once, taking the nearest earlier one', () => {
    const charges = [row('old', '2026-08-01', 1000), row('near', '2026-09-20', 1000)];
    const refunds = [
      row('r1', '2026-10-01', -1000),
      row('r2', '2026-10-02', -1000),
      row('r3', '2026-10-03', -1000),
    ];
    expect(matchRefunds(charges, refunds)).toEqual([
      { refundId: 'r1', chargeId: 'near' },
      { refundId: 'r2', chargeId: 'old' },
    ]);
  });
});
