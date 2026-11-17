import { describe, expect, it } from 'vitest';
import { parseAmex } from '../statementParsers/amex.js';
import { SAMPLE_STATEMENT_CSV } from '../sampleStatement.js';
import { SAMPLE_SUGGESTIONS } from './sampleSuggestions.js';

describe('SAMPLE_SUGGESTIONS', () => {
  it('has an answer for every charge in the sample statement, and nothing else', () => {
    const parsed = parseAmex(SAMPLE_STATEMENT_CSV);
    if (!parsed.ok) throw new Error('the sample statement does not parse');
    const charges = parsed.transactions.filter((t) => t.kind === 'charge').map((t) => t.reference);
    // If the sample changes, recompute the suggestions (see the file's comment).
    expect(Object.keys(SAMPLE_SUGGESTIONS).sort()).toEqual([...charges].sort());
  });
});
