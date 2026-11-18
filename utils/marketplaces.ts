import type { Transaction } from 'sequelize';
import { Marketplace } from '../models/Marketplace.js';

// A new expense whose description starts with one of the user's marketplaces
// ("eBay - phone case", "POSHMARK ORDER") gets it as its merchant, spelled as
// in Settings. The name must end there or be followed by something other
// than a letter or digit, so "Ebayer Books" is not eBay. The longest name
// wins when two fit.
export const merchantFor = (description: string, marketplaces: string[]): string | null => {
  const text = description.trim().toLowerCase();
  let best: string | null = null;
  for (const name of marketplaces) {
    const prefix = name.trim().toLowerCase();
    if (!prefix || !text.startsWith(prefix)) continue;
    const next = text.charAt(prefix.length);
    if (next && /[\p{L}\p{N}]/u.test(next)) continue;
    if (!best || prefix.length > best.trim().length) best = name.trim();
  }
  return best;
};

// For an expense typed in the app: the marketplace becomes the merchant and
// comes off the description, with a dash after it ("eBay - Phone Case" ->
// "Phone Case", merchant eBay). What is left starts with a capital; a
// description that was only the name keeps it, spelled as in Settings.
// Imported rows keep the bank's text and only get the merchant.
export const splitMarketplace = (
  description: string,
  marketplaces: string[],
): { description: string; merchant: string | null } => {
  const merchant = merchantFor(description, marketplaces);
  if (!merchant) return { description, merchant: null };
  const rest = description
    .trim()
    .slice(merchant.length)
    .replace(/^\s*-?\s*/, '')
    .trim();
  if (!rest) return { description: merchant, merchant };
  return { description: rest.charAt(0).toUpperCase() + rest.slice(1), merchant };
};

export const marketplaceNames = async (userId: string | null, transaction?: Transaction) =>
  (await Marketplace.findAll({ where: { userId }, attributes: ['name'], transaction })).map(
    (m) => m.name,
  );
