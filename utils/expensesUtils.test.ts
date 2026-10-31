import { describe, expect, it } from 'vitest';
import { createExpenseObject } from './expensesUtils.js';
import { Currency } from '../models/Expense.js';
import { InvalidDateError } from './dates.js';

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

  it('leaves the description unchanged', () => {
    const result = createExpenseObject(baseBody, 'user-1');
    expect(result.description).toBe('grocery run');
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

  it('passes through the client-generated id (used for optimistic UI)', () => {
    const result = createExpenseObject({ ...baseBody, id: 'client-uuid-1' }, 'user-1');
    expect(result.id).toBe('client-uuid-1');
  });

  it('drops any unexpected fields instead of mass-assigning them (e.g. a forged createdAt)', () => {
    const maliciousBody = {
      ...baseBody,
      createdAt: '1999-01-01T00:00:00.000Z',
      isAdmin: true,
    } as typeof baseBody & { createdAt: string; isAdmin: boolean };

    const result = createExpenseObject(maliciousBody, 'user-1');

    expect(result).not.toHaveProperty('createdAt');
    expect(result).not.toHaveProperty('isAdmin');
  });

  it('reads year/month from a legacy ISO timestamp regardless of server time zone', () => {
    const result = createExpenseObject(
      { ...baseBody, datePosted: '2024-12-01T03:00:00.000Z' },
      null,
    );
    expect(result.year).toBe(2024);
    expect(result.month).toBe(12);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['garbled', 'yesterday'],
    ['impossible', '2026-02-30'],
  ])(
    'throws InvalidDateError when datePosted is %s instead of storing null year/month',
    (_l, v) => {
      expect(() => createExpenseObject({ ...baseBody, datePosted: v as any }, 'user-1')).toThrow(
        InvalidDateError,
      );
    },
  );
});
