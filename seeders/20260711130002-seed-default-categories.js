'use strict';

const { randomUUID } = require('crypto');

// Only these stay as the shared, undeletable isDefault:true pool that every
// user sees. Everything else is provisioned as a personal, deletable copy
// per user on first sign-in instead (see utils/starterCategories.ts).
const CATEGORIES = [
  {
    name: 'Bills',
    subcategories: ['Electricity', 'Internet'],
  },
  {
    name: 'Food & Dining',
    subcategories: ['Groceries'],
  },
];

const BUDGETS = {};

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
