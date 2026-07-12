import { describe, expect, it } from 'vitest';
import { createIncomeEntryObject } from './incomeEntriesUtils';

const baseBody = {
  date: '2026-07-11',
  description: 'salary',
  category: 'bankAccounts',
  amount: '3500',
};

describe('createIncomeEntryObject', () => {
  it('capitalizes the description', () => {
    const result = createIncomeEntryObject(baseBody, 'user-1');
    expect(result.description).toBe('Salary');
  });

  it('attaches the given userId', () => {
    const result = createIncomeEntryObject(baseBody, 'user-1');
    expect(result.userId).toBe('user-1');
  });

  it('accepts a null userId for local no-auth mode', () => {
    const result = createIncomeEntryObject(baseBody, null);
    expect(result.userId).toBeNull();
  });

  it('preserves the other body fields unchanged', () => {
    const result = createIncomeEntryObject(baseBody, 'user-1');
    expect(result.date).toBe('2026-07-11');
    expect(result.category).toBe('bankAccounts');
    expect(result.amount).toBe('3500');
  });
});
