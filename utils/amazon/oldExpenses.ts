import { isAmazonCharge } from './matching.js';

// One-time tool (PLANS.md, Phase D): expenses entered by hand before statement
// import, where one row stands for a whole Amazon purchase (sometimes several
// orders added together), traced back to the items in the order history.
// A row is split only when exactly one set of items fits it: same currency,
// paid with the account's card, shipped (or ordered) within the window, and
// adding up to the row's amount to the cent.

export interface OldExpense {
  id: string;
  date: string; // YYYY-MM-DD
  amountCents: number;
  currency: string;
  account: string;
  description: string;
}

export interface HistoryItem {
  id: string;
  orderDate: string;
  shipDate: string | null;
  currency: string;
  totalCents: number;
  paymentMethod: string;
}

export interface SplitOptions {
  // Account name -> the card brand as Amazon names it; accounts not listed
  // match any payment method.
  cardBrands: Record<string, string>;
  windowDays: number;
  maxItems: number;
  poolSize: number; // nearest items considered per expense
}

const ORDERED_AFTER_SLACK_DAYS = 3;

export type SplitResult =
  | { expenseId: string; outcome: 'split'; itemIds: string[] }
  | { expenseId: string; outcome: 'several' | 'none' };

export const DEFAULT_OPTIONS: Omit<SplitOptions, 'cardBrands'> = {
  windowDays: 20,
  maxItems: 4,
  poolSize: 30,
};

const day = (iso: string) =>
  Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

// Every set of up to `max` items adding up to `target`; stops after two (one
// is all that counts as an answer).
const subsetsSumming = (pool: HistoryItem[], target: number, max: number) => {
  const found: HistoryItem[][] = [];
  const walk = (start: number, chosen: HistoryItem[], total: number) => {
    if (found.length > 1) return;
    if (total === target && chosen.length) {
      found.push([...chosen]);
      return;
    }
    if (chosen.length === max) return;
    for (let i = start; i < pool.length; i++) {
      const next = total + pool[i].totalCents;
      if (next > target) continue;
      chosen.push(pool[i]);
      walk(i + 1, chosen, next);
      chosen.pop();
    }
  };
  walk(0, [], 0);
  return found;
};

export const findSplits = (
  expenses: OldExpense[],
  items: HistoryItem[],
  options: SplitOptions,
): SplitResult[] => {
  const used = new Set<string>();
  return [...expenses]
    .filter((e) => isAmazonCharge(e.description) && e.amountCents > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((expense): SplitResult => {
      const brand = options.cardBrands[expense.account]?.toLowerCase();
      const when = day(expense.date);
      const pool = items
        .filter(
          (item) =>
            !used.has(item.id) &&
            item.totalCents > 0 &&
            item.currency === expense.currency &&
            (!brand || item.paymentMethod.toLowerCase().includes(brand)) &&
            Math.abs(when - day(item.shipDate ?? item.orderDate)) <= options.windowDays &&
            // Nothing ordered after the day you paid (a few days' slack for
            // dates entered by hand).
            day(item.orderDate) <= when + ORDERED_AFTER_SLACK_DAYS,
        )
        .sort(
          (a, b) =>
            Math.abs(when - day(a.shipDate ?? a.orderDate)) -
            Math.abs(when - day(b.shipDate ?? b.orderDate)),
        )
        .slice(0, options.poolSize);
      const fits = subsetsSumming(pool, expense.amountCents, options.maxItems);
      if (fits.length === 1) {
        fits[0].forEach((item) => used.add(item.id));
        return { expenseId: expense.id, outcome: 'split', itemIds: fits[0].map((i) => i.id) };
      }
      return { expenseId: expense.id, outcome: fits.length ? 'several' : 'none' };
    });
};
