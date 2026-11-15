// A synthetic Amex activity file for the public demo ("Import sample
// statement"). Written by hand: invented merchants, references and amounts, not
// derived from any real statement. It exercises every rule: charges, a card
// payment, a reward credit, a refund that cancels its purchase from the month
// before, and a partial refund that has to be decided by hand.
const HEADER =
  'Date,Description,Amount,Extended Details,Appears On Your Statement As,Address,City/State,Zip Code,Country,Reference,Category';

const ROWS = [
  [
    '10/02/2026',
    'GREENLEAF MARKET SPRINGFIELD',
    '86.42',
    'DEMO000001',
    'Merchandise & Supplies-Groceries',
  ],
  [
    '10/04/2026',
    'AMAZON.COM*DEMO1 AMZN.COM/BILL WA',
    '34.99',
    'DEMO000002',
    'Merchandise & Supplies-Internet Purchase',
  ],
  [
    '10/06/2026',
    'AplPay BEAN THERE CAFE SPRINGFIELD',
    '6.75',
    'DEMO000003',
    'Restaurant-Restaurant',
  ],
  ['10/09/2026', 'NORTHWIND TRANSIT FARE', '2.90', 'DEMO000004', 'Transportation-Other'],
  [
    '10/12/2026',
    'CONTOSO PHARMACY 0042',
    '18.20',
    'DEMO000005',
    'Merchandise & Supplies-Pharmacies',
  ],
  ['10/15/2026', 'AUTOPAY PAYMENT - THANK YOU', '-412.55', 'DEMO000006', ''],
  [
    '10/18/2026',
    'FABRIKAM OUTDOOR GEAR',
    '129.00',
    'DEMO000007',
    'Merchandise & Supplies-Sporting Goods',
  ],
  [
    '10/21/2026',
    'GREENLEAF MARKET SPRINGFIELD',
    '54.10',
    'DEMO000008',
    'Merchandise & Supplies-Groceries',
  ],
  [
    '10/25/2026',
    'STREAMFLIX SUBSCRIPTION',
    '15.99',
    'DEMO000009',
    'Entertainment-Other Entertainment',
  ],
  [
    '11/01/2026',
    'AMAZON MARKEPLACE NA PA',
    '-34.99',
    'DEMO000010',
    'Merchandise & Supplies-Internet Purchase',
  ],
  [
    '11/03/2026',
    'FABRIKAM OUTDOOR GEAR',
    '-40.00',
    'DEMO000011',
    'Merchandise & Supplies-Sporting Goods',
  ],
  ['11/05/2026', 'YOUR CASH REWARD/REFUND IS', '-7.25', 'DEMO000012', ''],
  [
    '11/06/2026',
    'AplPay BEAN THERE CAFE SPRINGFIELD',
    '6.75',
    'DEMO000013',
    'Restaurant-Restaurant',
  ],
  ['11/08/2026', 'LITWARE ELECTRIC UTILITY', '72.30', 'DEMO000014', 'Business Services-Utilities'],
];

export const SAMPLE_STATEMENT_NAME = 'sample-amex-activity.csv';

export const SAMPLE_STATEMENT_CSV = [
  HEADER,
  ...ROWS.map(([date, description, amount, reference, category]) =>
    [date, `"${description}"`, amount, '', '', '', '', '', '', `'${reference}`, category].join(','),
  ),
].join('\n');
