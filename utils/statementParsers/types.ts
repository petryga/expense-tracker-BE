export type TransactionKind = 'charge' | 'refund' | 'payment' | 'reward';

// One statement row, bank-independent. Amounts are integer cents, signed the
// way the card shows them: positive = charge, negative = credit.
export interface ParsedTransaction {
  line: number; // 1-based line in the file (header = 1), for error messages
  postedDate: string; // YYYY-MM-DD
  description: string; // as the bank printed it
  amountCents: number;
  reference: string; // the bank's transaction id
  kind: TransactionKind;
  merchantKey: string;
  fingerprint: string;
  raw: Record<string, string>;
}

export interface ParseError {
  line: number;
  message: string;
}

export type ParseResult =
  | { ok: true; transactions: ParsedTransaction[]; totalCents: number }
  | { ok: false; errors: ParseError[] };

// A bank parser is a pure function from file text to rows; v1 has Amex only.
export type StatementParser = (text: string) => ParseResult;
