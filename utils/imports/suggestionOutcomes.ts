import { randomUUID } from 'node:crypto';
import type { Transaction } from 'sequelize';
import { SuggestionOutcome } from '../../models/SuggestionOutcome.js';

// Records what was suggested for a purchase as it is saved. The category it
// was saved under is not stored: the report reads it from the expense, so a
// later fix in the expenses grid counts, and a deleted expense drops out.
export const recordOutcome = async (
  outcome: {
    userId: string | null;
    kind: 'statement' | 'item';
    ref: string;
    postedDate: string;
    suggestedCategory: string | null;
    suggestionSource: string | null;
    expenseId: string;
    importedAt: Date;
  },
  transaction: Transaction,
) => {
  await SuggestionOutcome.destroy({
    where: { userId: outcome.userId, kind: outcome.kind, ref: outcome.ref },
    transaction,
  });
  await SuggestionOutcome.create(
    {
      id: randomUUID(),
      ...outcome,
      // A pending or failed suggestion is no suggestion.
      suggestedCategory: outcome.suggestedCategory || null,
      suggestionSource: outcome.suggestedCategory ? outcome.suggestionSource : null,
    },
    { transaction },
  );
};
