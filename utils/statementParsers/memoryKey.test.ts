import { describe, expect, it } from 'vitest';
import { memoryKey } from './memoryKey.js';

// The same cases as AI/tests (merchant_key). Made-up merchants only.
describe('memoryKey', () => {
  it.each([
    ['AplPay FD *STATE PERMITS 7SPRINGFIELD IL', 'STATE PERMITS'],
    ['SQ *BEAN THERE CAFE', 'BEAN THERE'],
    ['BEANTHERECOFFEECOSPRINGFIELD IL', 'BEANTHERECOFFEECOSPRINGFIELD IL'],
    ['GREENLEAF MARKET 12', 'GREENLEAF MARKET'],
    ['AplPay GREENLEAF MARKET SPRINGFIELD', 'GREENLEAF MARKET'],
    ['TST* LITTLE DINER 0042', 'LITTLE DINER'],
    ['12345', ''],
  ])('%s -> %s', (description, key) => {
    expect(memoryKey(description)).toBe(key);
  });
});
