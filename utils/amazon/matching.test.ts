import { describe, expect, it } from 'vitest';
import { matchCharges, type MatchItem } from './matching.js';

const options = { cardBrand: 'CardBrand', currency: 'USD' };
let n = 0;
const item = (o: Partial<MatchItem>): MatchItem => ({
  id: `item-${++n}`,
  orderId: 'order-a',
  orderDate: '2026-03-01',
  shipDate: '2026-03-02',
  currency: 'USD',
  totalCents: 1000,
  paymentMethod: 'CardBrand - 0001',
  ...o,
});
const charge = (id: string, amountCents: number, postedDate = '2026-03-03') => ({
  id,
  amountCents,
  postedDate,
  description: 'AMAZON MKTPL*TEST0001 SEATTLE WA',
});

describe('matchCharges', () => {
  it('matches a whole order on its exact total', () => {
    const items = [item({ id: 'a1', totalCents: 1250 }), item({ id: 'a2', totalCents: 499 })];
    expect(matchCharges([charge('c1', 1749)], items, options).get('c1')).toEqual([
      { key: 'order-a', itemIds: ['a1', 'a2'] },
    ]);
  });

  it('matches each shipment of an order shipped in parts', () => {
    const items = [
      item({ id: 'a1', totalCents: 1000, shipDate: '2026-03-02' }),
      item({ id: 'a2', totalCents: 2000, shipDate: '2026-03-06' }),
    ];
    const result = matchCharges(
      [charge('c1', 1000, '2026-03-02'), charge('c2', 2000, '2026-03-06')],
      items,
      options,
    );
    expect(result.get('c1')).toEqual([{ key: 'order-a@2026-03-02', itemIds: ['a1'] }]);
    expect(result.get('c2')).toEqual([{ key: 'order-a@2026-03-06', itemIds: ['a2'] }]);
  });

  it.each([
    ['a different card', { paymentMethod: 'OtherBrand - 0002' }],
    ['a different currency', { currency: 'CAD' }],
    ['shipped too long before', { shipDate: '2026-02-15' }],
    ['shipped after the charge by more than the window', { shipDate: '2026-03-08' }],
  ])('does not match an order paid with %s', (_, override) => {
    const result = matchCharges([charge('c1', 1000)], [item(override)], options);
    expect(result.get('c1')).toEqual([]);
  });

  it('uses the order date when nothing shipped', () => {
    const result = matchCharges(
      [charge('c1', 1000, '2026-03-01')],
      [item({ id: 'a1', shipDate: null })],
      options,
    );
    expect(result.get('c1')).toEqual([{ key: 'order-a', itemIds: ['a1'] }]);
  });

  it('offers every candidate when several orders fit', () => {
    const items = [item({ id: 'a1' }), item({ id: 'b1', orderId: 'order-b' })];
    const result = matchCharges([charge('c1', 1000)], items, options);
    expect(result.get('c1')!.map((c) => c.key)).toEqual(['order-a', 'order-b']);
  });

  it('does not offer an order already matched to an earlier charge', () => {
    const items = [item({ id: 'a1' })];
    const result = matchCharges(
      [charge('later', 1000, '2026-03-04'), charge('earlier', 1000, '2026-03-03')],
      items,
      options,
    );
    expect(result.get('earlier')).toHaveLength(1);
    expect(result.get('later')).toEqual([]);
  });

  it('ignores charges that are not from Amazon, and credits', () => {
    const other = { ...charge('c1', 1000), description: 'CORNER CAFE' };
    const result = matchCharges([other, charge('c2', -1000)], [item({})], options);
    expect(result.size).toBe(0);
  });

  it('offers an order paid partly with a gift card, but only to pick', () => {
    const gift = 'CardBrand - 0001 and Gift Certificate/Card';
    const items = [
      item({ id: 'g1', totalCents: 3000, paymentMethod: gift }),
      item({ id: 'g2', totalCents: 1000, paymentMethod: gift }),
    ];
    const result = matchCharges([charge('c1', 2500), charge('c2', 2600)], items, options);
    expect(result.get('c1')).toEqual([{ key: 'order-a', itemIds: ['g1', 'g2'], partial: true }]);
    // Not taken by c1, so still offered to c2.
    expect(result.get('c2')).toHaveLength(1);
  });

  it('never offers a gift-card guess when an exact order fits, or for orders paid by card only', () => {
    const gift = 'CardBrand - 0001 and Gift Certificate/Card';
    const exact = [
      item({ id: 'a1', totalCents: 2500 }),
      item({ id: 'b1', orderId: 'order-b', totalCents: 4000, paymentMethod: gift }),
    ];
    expect(matchCharges([charge('c1', 2500)], exact, options).get('c1')).toEqual([
      { key: 'order-a', itemIds: ['a1'] },
    ]);
    expect(
      matchCharges([charge('c1', 2000)], [item({ totalCents: 4000 })], options).get('c1'),
    ).toEqual([]);
  });
});
