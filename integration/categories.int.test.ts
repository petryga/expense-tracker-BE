import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Category } from '../models/Category.js';
import { buildApp, newUser, wipeAll } from './helpers.js';

const app = buildApp();
const get = (user: string | null) => {
  const req = request(app).get('/categories');
  return user ? req.set('x-test-user', user) : req;
};

beforeEach(wipeAll);

describe('GET /categories (real database)', () => {
  it('provisions exactly one starter set when first requests overlap', async () => {
    // How many a single, uncontended first request creates.
    const baseline = newUser();
    await get(baseline);
    const perUser = await Category.count({ where: { userId: baseline, isDefault: false } });
    expect(perUser).toBeGreaterThan(0);

    // Two tabs, a retry, a double fetch: several first requests at once.
    const racer = newUser();
    const responses = await Promise.all(Array.from({ length: 8 }, () => get(racer)));

    responses.forEach((response) => expect(response.status).toBe(200));
    expect(await Category.count({ where: { userId: racer, isDefault: false } })).toBe(perUser);
  });

  it('does the same for the no-auth (null user) bucket', async () => {
    const baseline = newUser();
    await get(baseline);
    const perUser = await Category.count({ where: { userId: baseline, isDefault: false } });

    await Promise.all(Array.from({ length: 8 }, () => get(null)));

    expect(await Category.count({ where: { userId: null, isDefault: false } })).toBe(perUser);
  });

  it('does not provision again on later requests', async () => {
    const user = newUser();
    await get(user);
    const afterFirst = await Category.count({ where: { userId: user } });

    await get(user);
    await get(user);

    expect(await Category.count({ where: { userId: user } })).toBe(afterFirst);
  });

  it('gives each user their own set', async () => {
    const [a, b] = [newUser(), newUser()];
    await Promise.all([get(a), get(b)]);

    const countA = await Category.count({ where: { userId: a } });
    const countB = await Category.count({ where: { userId: b } });
    expect(countA).toBeGreaterThan(0);
    expect(countA).toBe(countB);
  });
});
