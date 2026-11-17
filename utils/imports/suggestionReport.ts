// Suggested versus confirmed (PLANS.md, "A trustworthy accuracy number"):
// for purchases saved on review, how often the suggestion was the category
// they ended up with. Pure: the script feeds it rows from the database.

export interface OutcomeRow {
  kind: 'statement' | 'item';
  month: string; // YYYY-MM the purchase was posted
  suggested: string | null;
  source: string | null; // 'memory' | 'model' | null
  chosen: string; // the expense's category now
}

export interface Tally {
  saved: number;
  suggested: number;
  right: number;
  wrong: number;
  none: number;
}

export interface ReportLine extends Tally {
  label: string;
  // right / saved, with a 95% Wilson interval; null when nothing was saved.
  accuracy: Rate | null;
  // right / suggested: how often a suggestion shown was kept.
  precision: Rate | null;
}

export interface Rate {
  value: number;
  low: number;
  high: number;
}

export const wilson = (hits: number, n: number): Rate | null => {
  if (!n) return null;
  const z = 1.96;
  const p = hits / n;
  const denominator = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
  return { value: p, low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const tally = (rows: OutcomeRow[]): Tally => {
  const t = { saved: rows.length, suggested: 0, right: 0, wrong: 0, none: 0 };
  for (const row of rows) {
    if (!row.suggested) t.none += 1;
    else if (same(row.suggested, row.chosen)) t.right += 1;
    else t.wrong += 1;
  }
  t.suggested = t.right + t.wrong;
  return t;
};

const line = (label: string, rows: OutcomeRow[]): ReportLine => {
  const t = tally(rows);
  return {
    label,
    ...t,
    accuracy: wilson(t.right, t.saved),
    precision: wilson(t.right, t.suggested),
  };
};

export interface SuggestionReport {
  kind: 'statement' | 'item';
  months: ReportLine[];
  total: ReportLine;
  bySource: ReportLine[];
  // Most common wrong suggestions, "suggested -> chosen".
  misses: { from: string; to: string; count: number }[];
}

export const buildSuggestionReport = (rows: OutcomeRow[]): SuggestionReport[] =>
  (['statement', 'item'] as const)
    .map((kind) => {
      const ofKind = rows.filter((r) => r.kind === kind);
      const months = [...new Set(ofKind.map((r) => r.month))].sort();
      const sources = [...new Set(ofKind.map((r) => r.source).filter((s): s is string => !!s))];
      const missCounts = new Map<string, number>();
      for (const r of ofKind) {
        if (r.suggested && !same(r.suggested, r.chosen)) {
          const key = `${r.suggested}\u0000${r.chosen}`;
          missCounts.set(key, (missCounts.get(key) ?? 0) + 1);
        }
      }
      return {
        kind,
        months: months.map((m) =>
          line(
            m,
            ofKind.filter((r) => r.month === m),
          ),
        ),
        total: line('all', ofKind),
        bySource: sources.sort().map((s) =>
          line(
            s,
            ofKind.filter((r) => r.source === s),
          ),
        ),
        misses: [...missCounts]
          .map(([key, count]) => {
            const [from, to] = key.split('\u0000');
            return { from, to, count };
          })
          .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from)),
      };
    })
    .filter((report) => report.total.saved > 0);

const pct = (rate: Rate | null) =>
  rate
    ? `${(rate.value * 100).toFixed(1)}% (${Math.round(rate.low * 100)}-${Math.round(rate.high * 100)})`
    : '-';

export const formatSuggestionReport = (reports: SuggestionReport[], since: string) => {
  if (!reports.length) return `No purchases saved from imports since ${since} yet.`;
  const out = [
    `Suggested vs confirmed, purchases imported since ${since} (prompt freeze).`,
    'accuracy = suggestion kept / saved; precision = kept / suggested; 95% range in brackets.',
  ];
  for (const report of reports) {
    out.push('', report.kind === 'statement' ? 'Statement charges' : 'Amazon items');
    out.push(
      `${'month'.padEnd(10)}${'saved'.padStart(6)}${'right'.padStart(7)}${'wrong'.padStart(7)}${'none'.padStart(6)}   ${'accuracy'.padEnd(18)}precision`,
    );
    for (const l of [...report.months, report.total, ...report.bySource]) {
      out.push(
        `${l.label.padEnd(10)}${String(l.saved).padStart(6)}${String(l.right).padStart(7)}${String(l.wrong).padStart(7)}${String(l.none).padStart(6)}   ${pct(l.accuracy).padEnd(18)}${pct(l.precision)}`,
      );
    }
    if (report.misses.length) {
      out.push('Most common misses (suggested -> chosen):');
      for (const m of report.misses.slice(0, 8)) out.push(`  ${m.count} x ${m.from} -> ${m.to}`);
    }
  }
  return out.join('\n');
};
