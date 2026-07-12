'use strict';

const { randomUUID } = require('crypto');

module.exports = {
  up: async (queryInterface) => {
    const now = new Date();

    await queryInterface.bulkInsert('recurring_expenses', [
      {
        id: randomUUID(),
        account: 'Amex',
        description: 'Coffee Subscription',
        category: 'Groceries',
        currency: 'USD',
        amount: 20.0,
        day_of_month: 6,
        user_id: null,
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        account: 'Amex',
        description: 'iCloud+ Subscription',
        category: 'Subscriptions',
        currency: 'USD',
        amount: 0.99,
        day_of_month: 26,
        user_id: null,
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        account: 'TD Savings',
        description: 'Account Fee',
        category: 'Financial Fees',
        currency: 'CAD',
        amount: 3.95,
        day_of_month: 28,
        user_id: null,
        created_at: now,
        updated_at: now,
      },
    ]);

    await queryInterface.bulkInsert('recurring_income_entries', [
      {
        id: randomUUID(),
        category: 'bankAccounts',
        description: '',
        currency: 'USD',
        amount: 0,
        user_id: null,
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        category: 'bankAccounts',
        description: '',
        currency: 'CAD',
        amount: 300,
        user_id: null,
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        category: 'crypto',
        description: '',
        currency: 'USD',
        amount: 0,
        user_id: null,
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        category: 'investments',
        description: '',
        currency: 'USD',
        amount: 0,
        user_id: null,
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        category: 'cash',
        description: '',
        currency: 'USD',
        amount: 0,
        user_id: null,
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('recurring_expenses', { user_id: null });
    await queryInterface.bulkDelete('recurring_income_entries', { user_id: null });
  },
};
