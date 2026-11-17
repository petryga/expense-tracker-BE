import { ImportedTransaction } from '../../models/ImportedTransaction.js';
import { pickableCategories } from './suggest.js';

// Category suggestions for the demo's sample statement (PLANS.md, "Two
// environments"). Computed once by the AI service (Claude Haiku 5.5, with the
// categorization prompt frozen on 2026-11-17) against the demo account's
// starter categories, and shipped here: the public demo shows real model
// suggestions without calling any model, so it costs nothing and works with
// no AI service deployed. The Amazon charge is left blank, as the model
// does for a general marketplace. Keyed by the sample's statement reference.
export const SAMPLE_SUGGESTIONS: Record<string, string | null> = {
  DEMO000001: 'Groceries',
  DEMO000002: null,
  DEMO000003: 'Coffee Shops',
  DEMO000004: 'Public Transport',
  DEMO000005: 'Pharmacy',
  DEMO000007: 'Hobbies',
  DEMO000008: 'Groceries',
  DEMO000009: 'Subscriptions',
  DEMO000013: 'Coffee Shops',
  DEMO000014: 'Electricity',
};

// Applies them to the draft charges of a sample import. A category the demo
// user no longer has is left out, like any other suggestion.
export const applySampleSuggestions = async (userId: string | null, batchId: string) => {
  const rows = await ImportedTransaction.findAll({
    where: { userId, batchId, kind: 'charge', status: 'draft' },
  });
  const categories = new Set(await pickableCategories(userId));
  for (const row of rows) {
    const category = row.reference ? SAMPLE_SUGGESTIONS[row.reference] : undefined;
    if (category === undefined) continue;
    await row.update(
      category && categories.has(category)
        ? { suggestedCategory: category, suggestionSource: 'model', suggestionStatus: 'done' }
        : { suggestionStatus: 'none' },
    );
  }
};
