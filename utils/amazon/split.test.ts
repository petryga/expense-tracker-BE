import { describe, expect, it } from 'vitest';
import { splitCents } from './split.js';

describe('splitCents', () => {
  it.each([
    ['item totals that already add up', 1749, [1250, 499], [1250, 499]],
    ['an even split', 1000, [1, 1], [500, 500]],
    ['a remainder, on the largest part', 1000, [1, 1, 1], [334, 333, 333]],
    ['a total smaller than the items', 900, [600, 400], [540, 360]],
    ['one part', 1234, [1], [1234]],
    ['zero weights', 500, [0, 0], [500, 0]],
    ['nothing to split', 500, [], []],
  ])('handles %s', (_, total, weights, expected) => {
    const parts = splitCents(total, weights);
    expect(parts).toEqual(expected);
    if (weights.length) expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
  });
});
