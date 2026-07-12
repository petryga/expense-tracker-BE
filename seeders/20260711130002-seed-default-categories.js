'use strict';

const { randomUUID } = require('crypto');

const CATEGORIES = [
  {
    name: 'Bills',
    subcategories: ['Rent', 'Electricity', 'Internet', 'Mobile Phone'],
  },
  {
    name: 'Fees',
    subcategories: ['Financial Fees', 'Legal Fees'],
  },
  {
    name: 'Food & Dining',
    subcategories: ['Groceries', 'Eating Out', 'Coffee Shops'],
  },
  {
    name: 'Transportation',
    subcategories: ['Public Transport', 'Taxi & Ride Shares'],
  },
  {
    name: 'Lifestyle',
    subcategories: ['Subscriptions', 'Travel & Vacation', 'Entertainment', 'Books', 'Pets', 'Education'],
  },
  {
    name: 'Shopping',
    subcategories: ['Clothing', 'Household Goods', 'Furniture & Housewares', 'Beauty', 'Hobbies'],
  },
  {
    name: 'Health',
    subcategories: ['Medical Expenses', 'Pharmacy', 'Wellness & Spa'],
  },
  {
    name: 'Gifts',
    subcategories: ['Gifts'],
  },
  {
    name: 'Rewards',
    subcategories: ['Credit Card Rewards'],
  },
];

const BUDGETS = {
  'Travel & Vacation': 50,
  Entertainment: 50,
  Clothing: 50,
  Beauty: 50,
  'Furniture & Housewares': 100,
  Subscriptions: 40,
};

module.exports = {
  up: async (queryInterface) => {
    const now = new Date();
    const categoryRows = [];
    const subcategoryRows = [];
    const budgetRows = [];

    for (const category of CATEGORIES) {
      const categoryId = randomUUID();
      categoryRows.push({
        id: categoryId,
        name: category.name,
        parent_category_id: null,
        is_default: true,
        user_id: null,
        created_at: now,
        updated_at: now,
      });

      for (const subcategoryName of category.subcategories) {
        const subcategoryId = randomUUID();
        subcategoryRows.push({
          id: subcategoryId,
          name: subcategoryName,
          parent_category_id: categoryId,
          is_default: true,
          user_id: null,
          created_at: now,
          updated_at: now,
        });

        if (BUDGETS[subcategoryName] !== undefined) {
          budgetRows.push({
            id: randomUUID(),
            category_id: subcategoryId,
            budget: BUDGETS[subcategoryName],
            user_id: null,
            created_at: now,
            updated_at: now,
          });
        }
      }
    }

    await queryInterface.bulkInsert('categories', [...categoryRows, ...subcategoryRows]);
    await queryInterface.bulkInsert('category_budgets', budgetRows);
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('category_budgets', { user_id: null });
    await queryInterface.bulkDelete('categories', { user_id: null, is_default: true });
  },
};
