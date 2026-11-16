import { parse } from 'csv-parse/sync';
import { parseCents } from '../statementParsers/money.js';
import type { ParseError } from '../statementParsers/types.js';

// Amazon's "Order History.csv" (Request My Data > Your Orders): one row per
// item. Only what matching and splitting need is kept; addresses, gift
// messages and the rest of the row are dropped here and never stored.
export interface OrderItem {
  orderId: string;
  asin: string;
  productName: string;
  orderDate: string; // YYYY-MM-DD (UTC)
  shipDate: string | null; // first ship date, YYYY-MM-DD, null when not shipped
  currency: string;
  totalCents: number; // what this item cost: price, tax and shipping, less discounts
  quantity: number;
  paymentMethod: string;
  fingerprint: string; // the same item in a later, overlapping export
}

export type OrderHistoryResult =
  { ok: true; items: OrderItem[]; cancelled: number } | { ok: false; errors: ParseError[] };

const REQUIRED = [
  'Order ID',
  'Order Date',
  'Ship Date',
  'Product Name',
  'Total Amount',
  'Currency',
  'Payment Method Type',
  'Order Status',
];

// "2025-03-04T18:22:11Z" or with milliseconds; "a and b" when shipped twice.
const isoDay = (value: string | undefined) => {
  const match = /^(\d{4}-\d{2}-\d{2})T/.exec((value ?? '').trim());
  return match ? match[1] : null;
};

// Amazon writes negative discounts as "'-5.00'" so spreadsheets keep them as text.
const cents = (value: string | undefined) => parseCents((value ?? '').replace(/'/g, ''));

export const parseOrderHistory = (text: string): OrderHistoryResult => {
  let records: Record<string, string>[];
  try {
    records = parse(text.replace(/^\uFEFF/, ''), {
      columns: (header: string[]) => header.map((h) => h.trim()),
      skip_empty_lines: true,
      relax_column_count: true,
    });
  } catch (error) {
    return {
      ok: false,
      errors: [{ line: 0, message: `Not a readable CSV file: ${(error as Error).message}` }],
    };
  }
  if (!records.length)
    return { ok: false, errors: [{ line: 0, message: 'The file has no orders' }] };
  const missing = REQUIRED.filter((column) => !(column in records[0]));
  if (missing.length) {
    return {
      ok: false,
      errors: [
        {
          line: 1,
          message: `Missing column(s): ${missing.join(', ')}. Use "Order History.csv" from the Amazon data export.`,
        },
      ],
    };
  }

  const errors: ParseError[] = [];
  const items: OrderItem[] = [];
  const seen = new Map<string, number>();
  let cancelled = 0;
  records.forEach((record, index) => {
    const line = index + 2;
    if (record['Order Status']?.trim().toLowerCase() === 'cancelled') {
      cancelled += 1;
      return;
    }
    const orderId = record['Order ID']?.trim();
    const orderDate = isoDay(record['Order Date']);
    const totalCents = cents(record['Total Amount']);
    if (!orderId || !orderDate || totalCents === null) {
      errors.push({ line, message: 'Needs an order id, an order date and a total amount' });
      return;
    }
    const asin = record.ASIN?.trim() ?? '';
    const shipDate = isoDay(record['Ship Date']);
    const base = [orderId, asin, shipDate ?? '', totalCents].join('|');
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    items.push({
      orderId,
      asin,
      productName: (record['Product Name']?.trim() || 'Amazon item').slice(0, 1024),
      orderDate,
      shipDate,
      currency: record.Currency?.trim().toUpperCase() ?? '',
      totalCents,
      quantity: Math.max(1, Number.parseInt(record['Original Quantity'] ?? '1', 10) || 1),
      paymentMethod: record['Payment Method Type']?.trim() ?? '',
      fingerprint: `${base}|${occurrence}`,
    });
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, items, cancelled };
};
