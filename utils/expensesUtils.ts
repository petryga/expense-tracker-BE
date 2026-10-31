import { Currency } from '../models/Expense.js';
import { requireDateParts } from './dates.js';

interface ExpenseBody {
  category: string;
  amount: string;
  account: string;
  description: string;
  datePosted: string;
  id: string;
  currency: Currency | '';
}

export const createExpenseObject = (body: ExpenseBody, userId: string | null) => {
  // Explicit allow-list rather than `...body` — the FE assigns its own uuid
  // client-side for optimistic UI (see EditToolBar.tsx), so `id` is a
  // legitimate field to accept, but nothing else the client sends (e.g. a
  // forged createdAt/updatedAt) should reach the database.
  const { id, category, amount, account, description, datePosted, currency } = body;
  // Throws InvalidDateError for a missing/garbled date. Letting it through used
  // to store year/month as null, which silently dropped the expense from every
  // monthly total and spawned a "null-null" rollup row.
  const { year, month } = requireDateParts(datePosted);
  return {
    id,
    category,
    amount,
    account,
    description,
    datePosted,
    currency,
    year,
    month,
    userId,
  };
};
