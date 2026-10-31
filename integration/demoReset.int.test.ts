import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../models/Account.js';
import { Expense } from '../models/Expense.js';
import { IncomeEntry } from '../models/IncomeEntry.js';
import { resetDemoUserData } from '../utils/demoData.js';
import { newUser, wipeAll } from './helpers.js';

const seedUser = async (userId: string) => {
  await Expense.create({
    category: 'Keep me',
    description: 'original',
    account: 'Cash',
    amount: 42,
    year: 2026,
    month: 1,
    datePosted: '2026-01-02',
    currency: 'USD',
    userId,
  });
  await IncomeEntry.create({
    date: '2026-01-02',
    description: 'original',
    category: 'cash',
    amount: '10',
    currency: 'USD',
    userId,
  });
};

beforeEach(wipeAll);
afterEach(() => {
  vi.restoreAllMocks();
});

describe('resetDemoUserData (real transaction)', () => {
  it('replaces the demo user data and leaves everyone else alone', async () => {
    const [demo, other] = [newUser(), newUser()];
    await seedUser(demo);
    await seedUser(other);

    await resetDemoUserData(demo);

    expect(await Expense.count({ where: { userId: demo, category: 'Keep me' } })).toBe(0);
    expect(await Expense.count({ where: { userId: demo } })).toBeGreaterThanOrEqual(36);
    expect(await IncomeEntry.count({ where: { userId: demo } })).toBe(12);
    expect(await Account.count({ where: { userId: demo } })).toBe(3);

    expect(await Expense.count({ where: { userId: other, category: 'Keep me' } })).toBe(1);
    expect(await IncomeEntry.count({ where: { userId: other } })).toBe(1);
  });

  it('rolls everything back if a late step fails - the old data survives', async () => {
    const demo = newUser();
    await seedUser(demo);
    // Fail at the very last write, after every delete and insert has happened.
    vi.spyOn(Account, 'bulkCreate').mockRejectedValue(new Error('boom'));

    await expect(resetDemoUserData(demo)).rejects.toThrow('boom');

    expect(await Expense.count({ where: { userId: demo } })).toBe(1);
    expect(await Expense.count({ where: { userId: demo, category: 'Keep me' } })).toBe(1);
    expect(await IncomeEntry.count({ where: { userId: demo } })).toBe(1);
    expect(await Account.count({ where: { userId: demo } })).toBe(0);
  });
});
