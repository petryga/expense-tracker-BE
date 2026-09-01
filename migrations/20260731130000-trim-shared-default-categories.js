'use strict';

// Only Bills, Food & Dining, Electricity, Internet, and Groceries remain
// shared isDefault:true categories. Everything else that was seeded as a
// shared default is removed here - it's provisioned as a personal, deletable
// copy per user instead (see utils/starterCategories.ts).
const REMOVED_CATEGORY_NAMES = [
  'Fees',
  'Financial Fees',
  'Legal Fees',
  'Transportation',
  'Public Transport',
  'Taxi & Ride Shares',
  'Lifestyle',
  'Subscriptions',
  'Travel & Vacation',
  'Entertainment',
  'Books',
  'Pets',
  'Education',
  'Shopping',
  'Clothing',
  'Household Goods',
  'Furniture & Housewares',
  'Beauty',
  'Hobbies',
  'Health',
  'Medical Expenses',
  'Pharmacy',
  'Wellness & Spa',
  'Gifts',
  'Rewards',
  'Credit Card Rewards',
  'Rent',
  'Mobile Phone',
  'Eating Out',
  'Coffee Shops',
];

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const rows = await queryInterface.sequelize.query(
      'SELECT id FROM categories WHERE user_id IS NULL AND is_default = true AND name IN (:names)',
      {
        replacements: { names: REMOVED_CATEGORY_NAMES },
        type: queryInterface.sequelize.QueryTypes.SELECT,
      },
    );
    const categoryIds = rows.map((row) => row.id);
    if (categoryIds.length === 0) return;

    await queryInterface.bulkDelete('category_budgets', {
      category_id: { [Sequelize.Op.in]: categoryIds },
      user_id: null,
    });

    await queryInterface.bulkDelete('categories', {
      id: { [Sequelize.Op.in]: categoryIds },
    });
  },

  down: async () => {
    // Irreversible: the removed shared defaults are now provisioned
    // per-user on first sign-in instead of restored as shared rows.
  },
};
