import { parse } from 'csv-parse/sync';
import { classify, merchantKey } from './merchant.js';
import { parseCents } from './money.js';
import type { ParseError, ParsedTransaction, StatementParser } from './types.js';

// Amex activity export, the detailed layout: Date, Description, Amount,
// Extended Details, address fields, Reference (a unique transaction id) and
// Amex's own Category. Reference is required: it is what makes re-uploading an
// overlapping date range safe. The basic three-column export has no id and is
// rejected. Every column is kept in `raw`.
const REQUIRED = ['Date', 'Description', 'Amount', 'Reference'];

const toIsoDate = (value: string): string | null => {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [month, day, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

// Amex prefixes the reference with an apostrophe so spreadsheets keep it as text.
const cleanReference = (value: string | undefined) => {
  const cleaned = (value ?? '').trim().replace(/^'/, '');
  return cleaned || null;
};

export const parseAmex: StatementParser = (text) => {
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

  if (records.length === 0)
    return { ok: false, errors: [{ line: 0, message: 'The file has no transactions' }] };
  const missing = REQUIRED.filter((column) => !(column in records[0]));
  if (missing.length) {
    const hint = missing.includes('Reference')
      ? ' Use the detailed activity export from Amex, which includes Reference.'
      : '';
    return {
      ok: false,
      errors: [{ line: 1, message: `Missing column(s): ${missing.join(', ')}.${hint}` }],
    };
  }

  const errors: ParseError[] = [];
  const transactions: ParsedTransaction[] = [];
  const references = new Set<string>();
  let totalCents = 0;

  records.forEach((record, index) => {
    // csv-parse counts records, not physical lines (descriptions can span lines),
    // so this is the record number; header is record 1.
    const line = index + 2;
    const postedDate = toIsoDate(record.Date ?? '');
    const amountCents = parseCents(record.Amount ?? '');
    const description = (record.Description ?? '').replace(/\s+/g, ' ').trim();
    const reference = cleanReference(record.Reference);
    if (!postedDate)
      errors.push({ line, message: `Invalid date "${record.Date ?? ''}" (expected MM/DD/YYYY)` });
    if (amountCents === null)
      errors.push({ line, message: `Invalid amount "${record.Amount ?? ''}"` });
    if (!description) errors.push({ line, message: 'Missing description' });
    if (!reference) errors.push({ line, message: 'Missing Reference' });
    else if (references.has(reference))
      errors.push({ line, message: `Reference ${reference} appears twice in the file` });
    if (!postedDate || amountCents === null || !description || !reference) return;
    references.add(reference);

    totalCents += amountCents;
    transactions.push({
      line,
      postedDate,
      description,
      amountCents,
      reference,
      kind: classify(description, amountCents),
      merchantKey: merchantKey(description),
      fingerprint: `amex:ref:${reference}`,
      raw: record,
    });
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, transactions, totalCents };
};
