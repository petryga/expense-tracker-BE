import { describe, expect, it } from 'vitest';
import { matchItemRefunds, type RefundableItem } from './itemRefunds.js';

const item = (id: string, o: Partial<RefundableItem> = {}): RefundableItem => ({
  id,
  orderId: 'order-a',
  chargeDate: '2026-03-04',
  amountCents: 499,
  ...o,
});
const refund = (id: string, amountCents = -499, postedDate = '2026-03-20') => ({
  id,
  amountCents,
  postedDate,
});

describe('matchItemRefunds', () => {
  it('pairs a refund with the item of exactly that amount', () => {
    const items = [item('cable'), item('hose', { amountCents: 1250 })];
    expect(matchItemRefunds(items, [refund('r1')], [])).toEqual([
      { refundId: 'r1', itemId: 'cable' },
    ]);
  });

  it.each([
    ['a refund before the charge', refund('r1', -499, '2026-03-01')],
    ['a refund too long after', refund('r1', -499, '2026-12-01')],
    ['a different amount', refund('r1', -400)],
  ])('does not pair %s', (_, r) => {
    expect(matchItemRefunds([item('cable')], [r], [])).toEqual([]);
  });

  it("uses Amazon's refund list to choose between orders", () => {
    const items = [item('a1'), item('b1', { orderId: 'order-b' })];
    const details = [{ orderId: 'order-b', amountCents: 499, refundDate: '2026-03-18' }];
    expect(matchItemRefunds(items, [refund('r1')], details)).toEqual([
      { refundId: 'r1', itemId: 'b1' },
    ]);
    // Without it, the refund is left for a person.
    expect(matchItemRefunds(items, [refund('r1')], [])).toEqual([]);
  });

  it('treats same-price items of one order as interchangeable, each refunded once', () => {
    const items = [item('x1'), item('x2')];
    expect(matchItemRefunds(items, [refund('r1'), refund('r2'), refund('r3')], [])).toEqual([
      { refundId: 'r1', itemId: 'x1' },
      { refundId: 'r2', itemId: 'x2' },
    ]);
  });
});
