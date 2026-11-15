import type { TransactionKind } from './types.js';

// Wallet / processor prefixes the bank glues in front of the merchant.
const PREFIXES = [
  /^APLPAY\s+/,
  /^GOOGLE\s*PAY\s+/,
  /^PAYPAL\s*\*\s*/,
  /^SQ\s*\*\s*/,
  /^TST\s*\*\s*/,
  /^SP\s+/,
];
const STOPWORDS = new Set(['THE', 'A', 'AN']);
// Spellings of one merchant that must compare equal (the bank's own typo included).
const ALIASES: [RegExp, string][] = [
  [/^(AMAZON|AMZN|AMZ)/, 'AMAZON'],
  [/^WWW$/, ''],
];

const stripPrefixes = (text: string) => {
  let out = text;
  for (const prefix of PREFIXES) out = out.replace(prefix, '');
  return out;
};

// A coarse merchant key: the first meaningful word of the description, so
// "AMAZON.COM*AB12C", "AMAZON MARKEPLACE NA PA" and "AMZN Mktp CA" all give
// AMAZON. Used to pair refunds with purchases, where an exact amount match is
// also required, so coarse is fine. Not meant as a category feature.
export const merchantKey = (description: string): string => {
  const tokens = stripPrefixes(description.toUpperCase().trim())
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && !/\d/.test(t) && !STOPWORDS.has(t));
  for (const token of tokens) {
    let key = token;
    for (const [pattern, replacement] of ALIASES) {
      if (pattern.test(key)) {
        key = replacement;
        break;
      }
    }
    if (key) return key;
  }
  return description.toUpperCase().trim();
};

// What the expense row is called by default (editable on review). Lowercase,
// matching how expenses have been typed since July 2026.
export const displayDescription = (description: string): string =>
  stripPrefixes(description.toUpperCase().trim()).replace(/\s+/g, ' ').toLowerCase();

const PAYMENT = /AUTOPAY|PAYMENT\s*-\s*THANK\s*YOU|ONLINE\s+PAYMENT|PAYMENT\s+RECEIVED/i;
const REWARD = /REWARD|CASH\s*BACK|CASHBACK/i;

// Rules, not a model: which rows are spending at all.
export const classify = (description: string, amountCents: number): TransactionKind => {
  if (amountCents >= 0) return 'charge';
  if (PAYMENT.test(description)) return 'payment';
  if (REWARD.test(description)) return 'reward';
  return 'refund';
};
