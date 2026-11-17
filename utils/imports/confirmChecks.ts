import type { ImportedItem } from '../../models/ImportedItem.js';
import type { ImportedTransaction } from '../../models/ImportedTransaction.js';
import type { ParseError } from '../statementParsers/types.js';
import type { ConfirmDecision } from './confirm.js';

// Checks review decisions against the rows they name, before anything is
// saved: every problem is reported at once, and none is applied.
export const checkDecisions = (
  decisions: ConfirmDecision[],
  rowById: Map<string, ImportedTransaction>,
  itemsOf: (rowId: string) => ImportedItem[],
): ParseError[] => {
  const problems: ParseError[] = [];
  decisions.forEach((decision, index) => {
    const row = rowById.get(decision.id);
    const where = index + 1;
    if (!row)
      return problems.push({ line: where, message: `Row ${decision.id} is not in this import` });
    if (row.status !== 'draft')
      return problems.push({ line: where, message: `Row ${decision.id} was already reviewed` });
    const returnsSavedPurchase =
      row.kind === 'refund' && (!!row.matchedTransactionId || !!row.matchedItemId);
    if (decision.action === 'return' && !returnsSavedPurchase)
      return problems.push({
        line: where,
        message: `Row ${decision.id} has no saved purchase to return`,
      });
    if (decision.action === 'save' && returnsSavedPurchase)
      return problems.push({
        line: where,
        message: `Row ${decision.id} returns a purchase; choose return or skip`,
      });
    const rowItems = itemsOf(row.id);
    if (decision.action === 'save' && rowItems.length) {
      const given = new Map((decision.items ?? []).map((item) => [item.id, item]));
      const complete =
        given.size === rowItems.length &&
        rowItems.every((item) => given.get(item.id)?.category?.trim());
      if (!complete)
        return problems.push({
          line: where,
          message: `Row ${decision.id} needs a category for each of its items`,
        });
      return;
    }
    if (decision.action === 'save' && !decision.category?.trim())
      return problems.push({ line: where, message: `Row ${decision.id} needs a category` });
  });
  return problems;
};
