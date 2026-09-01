import { Category } from '../models/Category.js';
import { CategoryBudget } from '../models/CategoryBudget.js';
import { sequelize } from '../config/database.js';

// Groceries, Electricity and Internet (plus their parents, Food & Dining and
// Bills) stay as the single shared isDefault:true pool visible to everyone.
// Everything below is provisioned as a personal, deletable copy for each
// user the first time they load their categories, so nobody's category list
// starts empty but nothing is locked behind isDefault either.
const STARTER_TOP_LEVEL_CATEGORIES: {
  name: string;
  subcategories: { name: string; budget?: number }[];
}[] = [
  {
    name: 'Fees',
    subcategories: [{ name: 'Financial Fees' }, { name: 'Legal Fees' }],
  },
  {
    name: 'Transportation',
    subcategories: [{ name: 'Public Transport' }, { name: 'Taxi & Ride Shares' }],
  },
  {
    name: 'Lifestyle',
    subcategories: [
      { name: 'Subscriptions', budget: 40 },
      { name: 'Travel & Vacation', budget: 50 },
      { name: 'Entertainment', budget: 50 },
      { name: 'Books' },
      { name: 'Pets' },
      { name: 'Education' },
    ],
  },
  {
    name: 'Shopping',
    subcategories: [
      { name: 'Clothing', budget: 50 },
      { name: 'Household Goods' },
      { name: 'Furniture & Housewares', budget: 100 },
      { name: 'Beauty', budget: 50 },
      { name: 'Hobbies' },
    ],
  },
  {
    name: 'Health',
    subcategories: [{ name: 'Medical Expenses' }, { name: 'Pharmacy' }, { name: 'Wellness & Spa' }],
  },
  {
    name: 'Gifts',
    subcategories: [{ name: 'Gifts' }],
  },
  {
    name: 'Rewards',
    subcategories: [{ name: 'Credit Card Rewards' }],
  },
];

// Subcategories that hang off the categories which remain shared defaults -
// their parent already exists (isDefault:true, userId:null), so only the
// subcategory itself needs a personal copy.
const STARTER_SUBCATEGORIES_FOR_SHARED_PARENTS: { parentName: string; subcategories: string[] }[] =
  [
    { parentName: 'Bills', subcategories: ['Rent', 'Mobile Phone'] },
    { parentName: 'Food & Dining', subcategories: ['Eating Out', 'Coffee Shops'] },
  ];

export const provisionStarterCategoriesForUser = async (userId: string | null) => {
  const sharedParentNames = STARTER_SUBCATEGORIES_FOR_SHARED_PARENTS.map((p) => p.parentName);
  const sharedParents = await Category.findAll({
    where: { isDefault: true, userId: null, parentCategoryId: null, name: sharedParentNames },
  });
  const sharedParentIdByName = new Map(
    sharedParents.map((category) => [category.name, category.id]),
  );

  await sequelize.transaction(async (transaction) => {
    for (const { name, subcategories } of STARTER_TOP_LEVEL_CATEGORIES) {
      const parent = await Category.create(
        { name, parentCategoryId: null, isDefault: false, userId },
        { transaction },
      );

      for (const subcategory of subcategories) {
        const created = await Category.create(
          { name: subcategory.name, parentCategoryId: parent.id, isDefault: false, userId },
          { transaction },
        );

        if (subcategory.budget !== undefined) {
          await CategoryBudget.create(
            { categoryId: created.id, userId, budget: subcategory.budget },
            { transaction },
          );
        }
      }
    }

    for (const { parentName, subcategories } of STARTER_SUBCATEGORIES_FOR_SHARED_PARENTS) {
      const parentId = sharedParentIdByName.get(parentName);
      if (!parentId) continue;

      for (const name of subcategories) {
        await Category.create(
          { name, parentCategoryId: parentId, isDefault: false, userId },
          { transaction },
        );
      }
    }
  });
};
