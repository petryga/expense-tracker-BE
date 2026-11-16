import { describe, expect, it } from 'vitest';
import { classify, displayDescription, merchantKey } from './merchant.js';
import { centsToAmount, parseCents } from './money.js';

describe('merchantKey', () => {
  it.each([
    ['AMAZON.COM*AB12C', 'AMAZON'],
    ['AMAZON MARKEPLACE NA PA', 'AMAZON'],
    ['AMAZON MARKETPLACE NAMZN.COM/B', 'AMAZON'],
    ['AMZN Mktp CA', 'AMAZON'],
    ['AplPay WHOLE FOODS MKT AUSTIN TX', 'WHOLE'],
    ['PAYPAL *BIGBOX STORE 5550100', 'BIGBOX'],
    ['SP ROSEBUD SPRINGFIELD IL', 'ROSEBUD'],
    ['THE HOME DEPOT #123', 'HOME'],
    ['7-ELEVEN 1234', 'ELEVEN'],
    ['1234 5678', '1234 5678'],
  ])('%s -> %s', (description, key) => {
    expect(merchantKey(description)).toBe(key);
  });
});

describe('classify', () => {
  it('uses rules: positive is a charge, card payments and rewards are not refunds', () => {
    expect(classify('ANYTHING', 100)).toBe('charge');
    expect(classify('AUTOPAY PAYMENT - THANK YOU', -100)).toBe('payment');
    expect(classify('ONLINE PAYMENT - THANK YOU', -100)).toBe('payment');
    expect(classify('YOUR CASH REWARD/REFUND IS', -100)).toBe('reward');
    expect(classify('AMAZON MARKEPLACE NA PA', -100)).toBe('refund');
  });
});

describe('displayDescription', () => {
  it('drops the wallet prefix and lowercases', () => {
    expect(displayDescription('AplPay  WHOLE FOODS MKT')).toBe('whole foods mkt');
  });
});

describe('money', () => {
  it.each([
    ['39.35', 3935],
    ['-1,350.00', -135000],
    ['$12', 1200],
    ['0.1', 10],
    ['0.07', 7],
  ])('parseCents(%s) = %d', (input, cents) => expect(parseCents(input)).toBe(cents));

  it.each(['', 'abc', '1.234', '--1'])('parseCents(%s) is null', (input) =>
    expect(parseCents(input)).toBeNull(),
  );

  it('formats cents back without float error', () => {
    expect(centsToAmount(3935)).toBe('39.35');
    expect(centsToAmount(-7)).toBe('-0.07');
    expect(centsToAmount(120410)).toBe('1204.10');
  });
});
