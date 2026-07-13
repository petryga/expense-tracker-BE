'use strict';

const { randomUUID } = require('crypto');

// Only "Cash" is a true global default - it's the one account concept that
// isn't bank-specific, so it makes sense for any new user. The rest are the
// existing dataset's own accounts, kept (non-default) under userId: null so
// today's userId-less data keeps working, without becoming something every
// new real user sees unprompted.
const DEFAULT_ACCOUNTS = [{ name: 'Cash', currency: 'USD', isDefault: true }];

const LEGACY_ACCOUNTS = [
  { name: 'TD Savings', currency: 'CAD' },
  { name: 'Amex', currency: 'USD' },
  { name: 'BofA Debit', currency: 'USD' },
  { name: 'Rogers', currency: 'CAD' },
];

module.exports = {
  up: async (queryInterface) => {
    const now = new Date();

    const rows = [
      ...DEFAULT_ACCOUNTS.map((account) => ({
        id: randomUUID(),
        name: account.name,
        currency: account.currency,
        is_default: true,
        user_id: null,
        created_at: now,
        updated_at: now,
      })),
      ...LEGACY_ACCOUNTS.map((account) => ({
        id: randomUUID(),
        name: account.name,
        currency: account.currency,
        is_default: false,
        user_id: null,
        created_at: now,
        updated_at: now,
      })),
    ];

    await queryInterface.bulkInsert('accounts', rows);
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('accounts', { user_id: null });
  },
};
