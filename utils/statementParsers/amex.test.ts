import { describe, expect, it } from 'vitest';
import { parseAmex } from './amex.js';

// Synthetic rows shaped like the detailed Amex export. No real statement data in tests.
const HEADER =
  'Date,Description,Amount,Extended Details,Appears On Your Statement As,Address,City/State,Zip Code,Country,Reference,Category';

const FILE = `${HEADER}
11/14/2026,AMAZON.COM*AB12C,39.35,"AB12C
AMAZON.COM",AMAZON.COM,"410 TERRY AVE
N",SEATTLE WA,98109,UNITED STATES,'320263180012345678,Merchandise & Supplies-Internet Purchase
11/13/2026,AUTOPAY PAYMENT - THANK YOU,-500.00,AUTOPAY,AUTOPAY PAYMENT - THANK YOU,,,,,'320263170000000001,
11/12/2026,YOUR CASH REWARD/REFUND IS,-12.40,,,,,,,'320263160000000002,
11/10/2026,AMAZON MARKEPLACE NA PA,-24.99,,,,,,,'320263140000000003,Merchandise & Supplies-Internet Purchase
11/09/2026,"PAYPAL *BIGBOX STORE 5550100","1,204.10",,,,,,,'320263130000000004,
11/09/2026,STARBUCKS 0123 AUSTIN TX,5.25,,,,,,,'320263130000000005,Restaurant-Restaurant
11/09/2026,STARBUCKS 0123 AUSTIN TX,5.25,,,,,,,'320263130000000006,Restaurant-Restaurant
`;

const parsedOk = (text: string) => {
  const result = parseAmex(text);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result;
};

describe('parseAmex', () => {
  it('parses into cents, ISO dates and kinds, multi-line cells included', () => {
    expect(parsedOk(FILE).transactions.map((t) => [t.postedDate, t.amountCents, t.kind])).toEqual([
      ['2026-11-14', 3935, 'charge'],
      ['2026-11-13', -50000, 'payment'],
      ['2026-11-12', -1240, 'reward'],
      ['2026-11-10', -2499, 'refund'],
      ['2026-11-09', 120410, 'charge'],
      ['2026-11-09', 525, 'charge'],
      ['2026-11-09', 525, 'charge'],
    ]);
  });

  it('reconciles: the total is the exact sum of every row', () => {
    expect(parsedOk(FILE).totalCents).toBe(3935 - 50000 - 1240 - 2499 + 120410 + 525 + 525);
  });

  it('keys each row by its Reference, so two identical coffees stay two rows', () => {
    const { transactions } = parsedOk(FILE);
    expect(transactions[0]).toMatchObject({
      reference: '320263180012345678',
      fingerprint: 'amex:ref:320263180012345678',
      merchantKey: 'AMAZON',
    });
    expect(transactions[0].raw.Category).toBe('Merchandise & Supplies-Internet Purchase');
    expect(new Set(transactions.map((t) => t.fingerprint)).size).toBe(transactions.length);
  });

  it('strips a byte-order mark', () => {
    expect(parseAmex('﻿' + FILE).ok).toBe(true);
  });

  it('rejects the basic export, which has no Reference', () => {
    const result = parseAmex('Date,Description,Amount\n11/01/2026,COFFEE,4.00\n');
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          line: 1,
          message:
            'Missing column(s): Reference. Use the detailed activity export from Amex, which includes Reference.',
        },
      ],
    });
  });

  it('rejects the whole file with line numbers when any row is bad', () => {
    const result = parseAmex(`Date,Description,Amount,Reference
13/40/2026,BAD DATE,1.00,'1
11/01/2026,BAD AMOUNT,1.2.3,'2
11/01/2026,,4.00,'3
11/02/2026,NO REFERENCE,4.00,
11/02/2026,REPEATED REFERENCE,4.00,'5
11/02/2026,REPEATED REFERENCE,4.00,'5
`);
    expect(result).toEqual({
      ok: false,
      errors: [
        { line: 2, message: 'Invalid date "13/40/2026" (expected MM/DD/YYYY)' },
        { line: 3, message: 'Invalid amount "1.2.3"' },
        { line: 4, message: 'Missing description' },
        { line: 5, message: 'Missing Reference' },
        { line: 7, message: 'Reference 5 appears twice in the file' },
      ],
    });
  });
});
