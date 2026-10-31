import { Router } from 'express';
import { Currency } from '../models/Expense.js';
import { getMonthlyTotals, type MonthlyTotalsFilters } from '../utils/monthlyTotals.js';
import { handleError } from '../utils/common.js';

const router = Router();

const TYPES = ['expense', 'income'] as const;

// Each filter is optional; a present-but-invalid one is a 400 rather than being
// silently ignored (which would return unfiltered totals that look correct).
const parseFilters = (query: Record<string, unknown>): MonthlyTotalsFilters | null => {
  const { type, category, currency } = query;
  const filters: MonthlyTotalsFilters = {};

  if (type !== undefined) {
    if (typeof type !== 'string' || !TYPES.includes(type as (typeof TYPES)[number])) return null;
    filters.type = type as MonthlyTotalsFilters['type'];
  }
  if (category !== undefined) {
    if (typeof category !== 'string' || !category.trim() || category.length > 100) return null;
    filters.category = category;
  }
  if (currency !== undefined) {
    if (currency !== Currency.CAD && currency !== Currency.USD) return null;
    filters.currency = currency;
  }
  return filters;
};

// Totals are summed from the expenses/income tables on every request; there is
// no stored copy to keep in sync (see utils/monthlyTotals.ts).
//
//   GET /monthlyData
//   GET /monthlyData?type=income&category=bankAccounts&currency=USD
router.get('/', async (req, res) => {
  const filters = parseFilters(req.query);
  if (!filters) {
    return res.status(400).json({ error: 'Invalid type, category or currency filter' });
  }

  try {
    res.json(await getMonthlyTotals(req.userId, filters));
  } catch (error) {
    handleError(res, error, 'Failed to get monthly data');
  }
});

export default router;
