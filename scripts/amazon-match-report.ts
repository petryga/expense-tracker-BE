// Phase D eval, match rate (PLANS.md): how Amazon charges on card statements
// line up with the order history, using the same pure functions as import.
// Prints counts only.
//
//   npx tsx scripts/amazon-match-report.ts <statements folder> "<Order History.csv>" \
//     ["<Refund Details.csv>"] [--brand AmericanExpress] [--currency USD]
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { matchItemRefunds } from '../utils/amazon/itemRefunds.js';
import { isAmazonCharge, matchCharges } from '../utils/amazon/matching.js';
import { parseOrderHistory } from '../utils/amazon/orderHistory.js';
import { parseRefundDetails } from '../utils/amazon/refundDetails.js';
import { parseAmex } from '../utils/statementParsers/amex.js';
import { matchRefunds } from '../utils/statementParsers/refundMatching.js';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const [folder, ordersPath, refundsPath] = args.filter(
  (a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'),
);
if (!folder || !ordersPath) throw new Error('usage: see the top of the file');

const orders = parseOrderHistory(readFileSync(ordersPath, 'utf8'));
if (!orders.ok) throw new Error('order history unreadable');
const items = orders.items.map((item, i) => ({ ...item, id: String(i) }));
const details = refundsPath
  ? (() => {
      const r = parseRefundDetails(readFileSync(refundsPath, 'utf8'));
      return r.ok ? r.refunds : [];
    })()
  : [];

const seen = new Set<string>();
const rows = readdirSync(folder)
  .filter((f) => f.endsWith('.csv'))
  .flatMap((f) => {
    const parsed = parseAmex(readFileSync(join(folder, f), 'utf8'));
    return parsed.ok ? parsed.transactions : [];
  })
  .filter((t) => !seen.has(t.fingerprint) && seen.add(t.fingerprint))
  .map((t) => ({ ...t, id: t.fingerprint }));

const charges = rows.filter((t) => t.kind === 'charge');
const refunds = rows.filter((t) => t.kind === 'refund' && isAmazonCharge(t.description));
// As on import: refunds of whole charges pair first, then the rest match orders.
const whole = matchRefunds(charges, refunds);
const returned = new Set(whole.map((m) => m.chargeId));
const amazon = charges.filter((t) => isAmazonCharge(t.description) && !returned.has(t.id));
const result = matchCharges(amazon, items, {
  cardBrand: option('brand', 'AmericanExpress'),
  currency: option('currency', 'USD'),
});
const count = { split: 0, multiItem: 0, several: 0, giftCard: 0, none: 0 };
const splitItems: { id: string; orderId: string; chargeDate: string; amountCents: number }[] = [];
for (const charge of amazon) {
  const c = result.get(charge.id) ?? [];
  if (c.length === 1 && !c[0].partial) {
    count.split += 1;
    if (c[0].itemIds.length > 1) count.multiItem += 1;
    for (const id of c[0].itemIds)
      splitItems.push({
        id,
        orderId: items[+id].orderId,
        chargeDate: charge.postedDate,
        amountCents: items[+id].totalCents,
      });
  } else if (c.length && c.every((x) => x.partial)) count.giftCard += 1;
  else if (c.length) count.several += 1;
  else count.none += 1;
}
const pairedWhole = new Set(whole.map((m) => m.refundId));
const itemRefunds = matchItemRefunds(
  splitItems,
  refunds.filter((r) => !pairedWhole.has(r.id)),
  details,
);
const pct = (n: number) => `${((100 * n) / amazon.length).toFixed(1)}%`;
console.log(`Amazon charges (not refunded in full): ${amazon.length}`);
console.log(
  `  split automatically:       ${count.split} (${pct(count.split)}), ${count.multiItem} of them into 2+ items`,
);
console.log(`  several orders fit (pick): ${count.several} (${pct(count.several)})`);
console.log(`  gift-card order (pick):    ${count.giftCard} (${pct(count.giftCard)})`);
console.log(`  no order found:            ${count.none} (${pct(count.none)})`);
console.log(
  `Amazon refunds: ${refunds.length}; whole charge ${whole.length}, single item ${itemRefunds.length}, unmatched ${refunds.length - whole.length - itemRefunds.length}`,
);
