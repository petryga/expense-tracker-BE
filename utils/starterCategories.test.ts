import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { provisionStarterCategoriesForUser } from './starterCategories.js';
import { sequelize } from '../config/database.js';
import { Category } from '../models/Category.js';
import { CategoryBudget } from '../models/CategoryBudget.js';

const USER_ID = 'user-123';
// provisionStarterCategoriesForUser runs everything inside
// sequelize.transaction; the callback form only receives the transaction, so
// a plain marker object stands in for it and lets us assert every write was
// scoped to it.
const FAKE_TRANSACTION = { fake: true } as any;

const SHARED_PARENTS = [
  { id: 'bills-id', name: 'Bills' },
  { id: 'food-id', name: 'Food & Dining' },
];

beforeEach(() => {
  vi.spyOn(Category, 'findAll').mockResolvedValue(SHARED_PARENTS as any);
  vi.spyOn(sequelize, 'transaction').mockImplementation(((fn: any) =>
    fn(FAKE_TRANSACTION)) as any);
  vi.spyOn(Category, 'create').mockImplementation(
    (data: any) => Promise.resolve({ id: `${data.name}-id`, ...data }) as any
  );
  vi.spyOn(CategoryBudget, 'create').mockImplementation((data: any) => Promise.resolve(data) as any);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('provisionStarterCategoriesForUser', () => {
  it('looks up the shared Bills/Food & Dining parents scoped to the shared default pool', async () => {
    await provisionStarterCategoriesForUser(USER_ID);

    expect(Category.findAll).toHaveBeenCalledWith({
      where: {
        isDefault: true,
        userId: null,
        parentCategoryId: null,
        name: ['Bills', 'Food & Dining'],
      },
    });
  });

  it('creates every starter top-level category as isDefault:false, owned by the user', async () => {
    await provisionStarterCategoriesForUser(USER_ID);

    const topLevelNames = [
      'Fees',
      'Transportation',
      'Lifestyle',
      'Shopping',
      'Health',
      'Gifts',
      'Rewards',
    ];
    for (const name of topLevelNames) {
      expect(Category.create).toHaveBeenCalledWith(
        { name, parentCategoryId: null, isDefault: false, userId: USER_ID },
        { transaction: FAKE_TRANSACTION }
      );
    }
  });

  it('creates subcategories under their newly-created personal parent, not under a shared one', async () => {
    await provisionStarterCategoriesForUser(USER_ID);

    expect(Category.create).toHaveBeenCalledWith(
      { name: 'Financial Fees', parentCategoryId: 'Fees-id', isDefault: false, userId: USER_ID },
      { transaction: FAKE_TRANSACTION }
    );
  });

  it('creates a personal CategoryBudget only for subcategories that specify one', async () => {
    await provisionStarterCategoriesForUser(USER_ID);

    expect(CategoryBudget.create).toHaveBeenCalledWith(
      { categoryId: 'Subscriptions-id', userId: USER_ID, budget: 40 },
      { transaction: FAKE_TRANSACTION }
    );
    expect(CategoryBudget.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: 'Books-id' }),
      expect.anything()
    );
  });

  it('parents Rent and Mobile Phone under the shared Bills category, not a new one', async () => {
    await provisionStarterCategoriesForUser(USER_ID);

    expect(Category.create).toHaveBeenCalledWith(
      { name: 'Rent', parentCategoryId: 'bills-id', isDefault: false, userId: USER_ID },
      { transaction: FAKE_TRANSACTION }
    );
    expect(Category.create).toHaveBeenCalledWith(
      { name: 'Mobile Phone', parentCategoryId: 'bills-id', isDefault: false, userId: USER_ID },
      { transaction: FAKE_TRANSACTION }
    );
  });

  it('parents Eating Out and Coffee Shops under the shared Food & Dining category', async () => {
    await provisionStarterCategoriesForUser(USER_ID);

    expect(Category.create).toHaveBeenCalledWith(
      { name: 'Eating Out', parentCategoryId: 'food-id', isDefault: false, userId: USER_ID },
      { transaction: FAKE_TRANSACTION }
    );
    expect(Category.create).toHaveBeenCalledWith(
      { name: 'Coffee Shops', parentCategoryId: 'food-id', isDefault: false, userId: USER_ID },
      { transaction: FAKE_TRANSACTION }
    );
  });

  it('skips shared-parent subcategories gracefully if a shared parent is unexpectedly missing', async () => {
    vi.spyOn(Category, 'findAll').mockResolvedValue([SHARED_PARENTS[0]] as any);

    await expect(provisionStarterCategoriesForUser(USER_ID)).resolves.not.toThrow();
    expect(Category.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Eating Out' }),
      expect.anything()
    );
  });

  it('works for the null-user local-dev bucket too', async () => {
    await provisionStarterCategoriesForUser(null);

    expect(Category.create).toHaveBeenCalledWith(
      { name: 'Fees', parentCategoryId: null, isDefault: false, userId: null },
      { transaction: FAKE_TRANSACTION }
    );
  });
});
