import { describe, expect, it } from 'vitest';
import { merchantFor, splitMarketplace } from './marketplaces.js';

const MINE = ['Poshmark', 'Vinted', 'eBay', 'AliExpress', 'Amazon'];

describe('merchantFor', () => {
  it('names the marketplace a description starts with, spelled as in Settings', () => {
    expect(merchantFor('eBay - Test Phone Case', MINE)).toBe('eBay');
    expect(merchantFor('POSHMARK ORDER TEST01', MINE)).toBe('Poshmark');
    expect(merchantFor('  vinted test jacket', MINE)).toBe('Vinted');
    expect(merchantFor('AMAZON.COM*TEST0002', MINE)).toBe('Amazon');
    expect(merchantFor('AliExpress', MINE)).toBe('AliExpress');
  });

  it('needs the name to end where a word ends', () => {
    expect(merchantFor('Ebayer Test Books', MINE)).toBeNull();
    expect(merchantFor('Vintedge Test Shop', MINE)).toBeNull();
  });

  it('only looks at the start of the description', () => {
    expect(merchantFor('Test Cable from eBay', MINE)).toBeNull();
  });

  it('prefers the longest name when two fit', () => {
    expect(merchantFor('Amazon Fresh Test Order', ['Amazon', 'Amazon Fresh'])).toBe('Amazon Fresh');
  });

  it('finds nothing with no marketplaces', () => {
    expect(merchantFor('eBay - Test', [])).toBeNull();
  });
});

describe('splitMarketplace', () => {
  it('moves the marketplace to the merchant and drops it, with any dash, from the name', () => {
    expect(splitMarketplace('eBay - Test Phone Case', MINE)).toEqual({
      description: 'Test Phone Case',
      merchant: 'eBay',
    });
    expect(splitMarketplace('poshmark test lulu pants', MINE)).toEqual({
      description: 'Test lulu pants',
      merchant: 'Poshmark',
    });
    expect(splitMarketplace('AMAZON-test lamp', MINE)).toEqual({
      description: 'Test lamp',
      merchant: 'Amazon',
    });
  });

  it('keeps a description that was only the name, spelled as in Settings', () => {
    expect(splitMarketplace('aliexpress', MINE)).toEqual({
      description: 'AliExpress',
      merchant: 'AliExpress',
    });
    expect(splitMarketplace('Vinted - ', MINE)).toEqual({
      description: 'Vinted',
      merchant: 'Vinted',
    });
  });

  it('leaves anything else alone', () => {
    expect(splitMarketplace('Corner Test Cafe', MINE)).toEqual({
      description: 'Corner Test Cafe',
      merchant: null,
    });
  });
});
