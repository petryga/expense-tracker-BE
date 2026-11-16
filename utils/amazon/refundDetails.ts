import { parse } from 'csv-parse/sync';
import { parseCents } from '../statementParsers/money.js';
import type { ParseError } from '../statementParsers/types.js';

// Amazon's "Refund Details.csv": one row per refund, with the order it was
// for. It has no item, only an order and an amount; it is used to tell apart
// items of the same price in different orders.
export interface OrderRefund {
  orderId: string;
  amountCents: number;
  refundDate: string; // YYYY-MM-DD
  fingerprint: string;
}

export const REFUND_COLUMNS = ['Order ID', 'Refund Amount', 'Refund Date'];

export const parseRefundDetails = (
  text: string,
): { ok: true; refunds: OrderRefund[] } | { ok: false; errors: ParseError[] } => {
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
  const missing = REFUND_COLUMNS.filter((c) => records.length && !(c in records[0]));
  if (!records.length || missing.length)
    return {
      ok: false,
      errors: [{ line: 1, message: `Missing column(s): ${missing.join(', ') || 'all'}` }],
    };

  const seen = new Map<string, number>();
  const refunds: OrderRefund[] = [];
  for (const record of records) {
    const orderId = record['Order ID']?.trim();
    const amountCents = parseCents(record['Refund Amount'] ?? '');
    const refundDate = /^(\d{4}-\d{2}-\d{2})/.exec(record['Refund Date']?.trim() ?? '')?.[1];
    // Refunds not paid out yet have no date: nothing to match on the card.
    if (!orderId || amountCents === null || !refundDate) continue;
    const base = `${orderId}|${amountCents}|${refundDate}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    refunds.push({ orderId, amountCents, refundDate, fingerprint: `${base}|${n}` });
  }
  return { ok: true, refunds };
};
