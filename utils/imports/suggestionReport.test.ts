import { describe, expect, it } from 'vitest';
import {
  buildSuggestionReport,
  formatSuggestionReport,
  wilson,
  type OutcomeRow,
} from './suggestionReport.js';

const row = (o: Partial<OutcomeRow>): OutcomeRow => ({
  kind: 'statement',
  month: '2026-11',
  suggested: 'Groceries',
  source: 'model',
  chosen: 'Groceries',
  ...o,
});

describe('wilson', () => {
  it('gives a 95% range that narrows with more rows', () => {
    const small = wilson(8, 10)!;
    expect(small.value).toBe(0.8);
    expect(small.low).toBeCloseTo(0.49, 2);
    expect(small.high).toBeCloseTo(0.943, 2);
    const large = wilson(80, 100)!;
    expect(large.high - large.low).toBeLessThan(small.high - small.low);
    expect(wilson(0, 0)).toBeNull();
    expect(wilson(5, 5)!.high).toBe(1);
  });
});

describe('buildSuggestionReport', () => {
  const rows = [
    row({}),
    row({ chosen: 'groceries ' }), // same category, other spelling
    row({ suggested: 'Eating Out', chosen: 'Coffee Shops' }),
    row({ suggested: null, source: null, chosen: 'Home' }),
    row({ month: '2026-12', source: 'memory', suggested: 'Home', chosen: 'Home' }),
    row({ month: '2026-12', suggested: 'Eating Out', chosen: 'Coffee Shops' }),
    row({ kind: 'item', suggested: 'Hobbies', chosen: 'Home' }),
  ];
  const [statements, items] = buildSuggestionReport(rows);

  it('counts right, wrong and no suggestion per month and overall', () => {
    expect(
      statements.months.map(({ label, saved, right, wrong, none }) => ({
        label,
        saved,
        right,
        wrong,
        none,
      })),
    ).toEqual([
      { label: '2026-11', saved: 4, right: 2, wrong: 1, none: 1 },
      { label: '2026-12', saved: 2, right: 1, wrong: 1, none: 0 },
    ]);
    expect(statements.total).toMatchObject({ saved: 6, suggested: 5, right: 3 });
    expect(statements.total.accuracy!.value).toBe(0.5);
    expect(statements.total.precision!.value).toBe(0.6);
  });

  it('splits by where the suggestion came from, and lists the misses', () => {
    expect(statements.bySource.map((l) => [l.label, l.right, l.suggested])).toEqual([
      ['memory', 1, 1],
      ['model', 2, 4],
    ]);
    expect(statements.misses).toEqual([{ from: 'Eating Out', to: 'Coffee Shops', count: 2 }]);
  });

  it('keeps Amazon items apart, and leaves out a kind with nothing saved', () => {
    expect(items.kind).toBe('item');
    expect(items.total).toMatchObject({ saved: 1, wrong: 1 });
    expect(buildSuggestionReport([row({})]).map((r) => r.kind)).toEqual(['statement']);
  });

  it('formats a readable table, and says so when there is nothing yet', () => {
    const text = formatSuggestionReport(buildSuggestionReport(rows), '2026-11-17');
    expect(text).toContain('Statement charges');
    expect(text).toContain('50.0% (');
    expect(text).toContain('2 x Eating Out -> Coffee Shops');
    expect(formatSuggestionReport([], '2026-11-17')).toBe(
      'No purchases saved from imports since 2026-11-17 yet.',
    );
  });
});
