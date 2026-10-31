import { Currency } from '../models/IncomeEntry.js';
import { requireDateParts } from './dates.js';

interface IncomeEntryBody {
  id?: string;
  date: string;
  description: string;
  category: string;
  amount: string;
  currency?: Currency | '';
}

export const createIncomeEntryObject = (body: IncomeEntryBody, userId: string | null) => {
  // Explicit allow-list rather than `...body` — the FE assigns its own uuid
  // client-side for optimistic UI, so `id` is a legitimate field to accept,
  // but nothing else the client sends (e.g. a forged createdAt/updatedAt)
  // should reach the database.
  const { id, date, description, category, amount, currency } = body;
  // Throws InvalidDateError. A date that isn't YYYY-MM-DD(...) would produce a
  // garbage rollup key (e.g. "2026/10/31-undefined") and never be summed.
  requireDateParts(date);
  return {
    id,
    date,
    description,
    category,
    amount,
    currency,
    userId,
  };
};
