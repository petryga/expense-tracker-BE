import { Currency } from '../models/Expense.js';

// One place decides the CAD->USD rate. Today it is a single configurable
// number; per-year / per-month rates can slot into getCadToUsdRate later
// without touching any caller.
const DEFAULT_CAD_TO_USD = 0.74;

const readConfiguredRate = (): number => {
  const parsed = parseFloat(process.env.FX_CAD_TO_USD ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CAD_TO_USD;
};

export const getCadToUsdRate = (_year?: number, _month?: number): number => readConfiguredRate();

export const convertAmount = ({
  amount,
  from,
  to,
  year,
  month,
}: {
  amount: number;
  from: Currency;
  to: Currency;
  year?: number;
  month?: number;
}): number => {
  if (!Number.isFinite(amount)) return 0;
  if (from === to) return amount;

  const rate = getCadToUsdRate(year, month);
  if (from === Currency.CAD && to === Currency.USD) return amount * rate;
  if (from === Currency.USD && to === Currency.CAD) return amount / rate;
  return amount;
};
