import { describe, expect, it } from 'vitest';
import { createExpenseObject } from './expensesUtils';
import { Currency } from '../models/Expense';

const baseBody = {
  category: 'Groceries',
  amount: '42.50',
  account: 'Amex',
  description: 'grocery run',
  datePosted: '2026-07-11',
  id: '',
  currency: Currency.USD,
};

describe('createExpenseObject', () => {
  it('derives year and month from datePosted', () => {
    const result = createExpenseObject(baseBody, 'user-1');
    expect(result.year).toBe(2026);
    expect(result.month).toBe(7);
  });

  it('capitalizes the description', () => {
    const result = createExpenseObject(baseBody, 'user-1');
    expect(result.description).toBe('Grocery Run');
  });

  it('attaches the given userId', () => {
    const result = createExpenseObject(baseBody, 'user-1');
    expect(result.userId).toBe('user-1');
  });

  it('accepts a null userId for local no-auth mode', () => {
    const result = createExpenseObject(baseBody, null);
    expect(result.userId).toBeNull();
  });

  it('preserves the other body fields unchanged', () => {
    const result = createExpenseObject(baseBody, 'user-1');
    expect(result.category).toBe('Groceries');
    expect(result.amount).toBe('42.50');
    expect(result.account).toBe('Amex');
    expect(result.currency).toBe(Currency.USD);
  });
});
