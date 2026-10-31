import { Router } from 'express';
import { Currency } from '../models/Expense.js';
import { getMonthlyTotals } from '../utils/monthlyTotals.js';
import { buildYearlyComparison, type CutoffsByYear } from '../utils/yearlyComparison.js';
import { getMonthlyReport, getReportMonths } from '../utils/monthlyReport.js';
import { getFlowReport } from '../utils/flowReport.js';
import { handleError } from '../utils/common.js';

const router = Router();

// `cutoffs=2026:3,2025:none` -> {2026: 3, 2025: null}. Returns null when
// malformed so the route can answer 400 instead of silently ignoring input.
const parseCutoffs = (raw: unknown): CutoffsByYear | null => {
  if (raw === undefined || raw === '') return {};
  if (typeof raw !== 'string') return null;

  const result: CutoffsByYear = {};
  for (const part of raw.split(',')) {
    const match = /^(\d{4}):(none|\d{1,2})$/.exec(part.trim());
    if (!match) return null;
    const month = match[2] === 'none' ? null : parseInt(match[2], 10);
    if (month !== null && (month < 1 || month > 12)) return null;
    result[parseInt(match[1], 10)] = month;
  }
  return result;
};

//   GET /reports/yearly-comparison?mode=ytd&baseCurrency=USD&cutoffs=2026:3,2025:none
router.get('/yearly-comparison', async (req, res) => {
  const { mode = 'full-year', baseCurrency = Currency.USD } = req.query;
  const cutoffs = parseCutoffs(req.query.cutoffs);

  if (
    (mode !== 'ytd' && mode !== 'full-year') ||
    (baseCurrency !== Currency.CAD && baseCurrency !== Currency.USD) ||
    !cutoffs
  ) {
    return res.status(400).json({ error: 'Invalid mode, baseCurrency or cutoffs' });
  }

  try {
    const monthly = await getMonthlyTotals(req.userId, { type: 'expense' });
    res.json(buildYearlyComparison({ monthly, mode, baseCurrency, cutoffs }));
  } catch (error) {
    handleError(res, error, 'Failed to build yearly comparison');
  }
});

//   GET /reports/months                    -> ["2026-10", "2026-09", ...]
router.get('/months', async (req, res) => {
  try {
    res.json(await getReportMonths(req.userId));
  } catch (error) {
    handleError(res, error, 'Failed to list report months');
  }
});

//   GET /reports/monthly?yearMonth=2026-10
router.get('/monthly', async (req, res) => {
  const { yearMonth } = req.query;
  const match = typeof yearMonth === 'string' ? /^(\d{4})-(\d{2})$/.exec(yearMonth) : null;
  const month = match ? parseInt(match[2], 10) : 0;
  if (!match || month < 1 || month > 12) {
    return res.status(400).json({ error: 'yearMonth must look like 2026-10' });
  }

  try {
    res.json(await getMonthlyReport(req.userId, parseInt(match[1], 10), month));
  } catch (error) {
    handleError(res, error, 'Failed to build monthly report');
  }
});

//   GET /reports/flow            -> latest eligible month
//   GET /reports/flow?month=2026-10
router.get('/flow', async (req, res) => {
  const { month } = req.query;
  if (
    month !== undefined &&
    (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
  ) {
    return res.status(400).json({ error: 'month must look like 2026-10' });
  }

  try {
    res.json(await getFlowReport(req.userId, month));
  } catch (error) {
    handleError(res, error, 'Failed to build flow report');
  }
});

export default router;
