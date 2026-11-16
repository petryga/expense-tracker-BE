import { describe, expect, it } from 'vitest';
import { reportCategory } from './gifts.js';
import { buildMonthlyReport } from './monthlyReport.js';
import { createExpenseObject } from './expensesUtils.js';

describe('gifts', () => {
  it('count under Gifts in reports, whatever their real category', () => {
    expect(reportCategory('Clothing', true)).toBe('Gifts');
    expect(reportCategory('Clothing', false)).toBe('Clothing');
    expect(reportCategory(null, false)).toBe('Uncategorized');
  });

  it('get their own slice in the monthly report', () => {
    const report = buildMonthlyReport('2026-10', [
      { category: 'Clothing', isGift: false, description: 'jeans', amount: 50, currency: 'USD' },
      {
        category: 'Clothing',
        isGift: true,
        description: 'scarf for a friend',
        amount: 30,
        currency: 'USD',
      },
      {
        category: 'Pharmacy',
        isGift: true,
        description: 'cream for a friend',
        amount: 12,
        currency: 'USD',
      },
    ]);
    expect(report.dataByCategory.map((c) => [c.category, c.total])).toEqual([
      ['Clothing', 50],
      ['Gifts', 42],
    ]);
    expect(report.totalSpentUsd).toBe(92);
  });

  it('are marked only by a real true from the client', () => {
    const base = {
      id: 'x',
      category: 'Clothing',
      amount: '1',
      account: 'Cash',
      description: 'd',
      datePosted: '2026-10-01',
      currency: 'USD' as const,
    };
    expect(createExpenseObject({ ...base, isGift: true }, null).isGift).toBe(true);
    expect(createExpenseObject({ ...base, isGift: 'yes' }, null).isGift).toBe(false);
    expect(createExpenseObject(base, null).isGift).toBe(false);
  });
});
