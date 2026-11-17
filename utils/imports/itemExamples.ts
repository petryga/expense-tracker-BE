import { Op } from 'sequelize';
import { Expense } from '../../models/Expense.js';
import { ImportedItem } from '../../models/ImportedItem.js';
import type { ItemExample } from './aiClient.js';

// What the user filed each saved order item under, for the AI service's
// retrieval (PLANS.md, Phase C; decision 16). The category is read from the
// expense as it is now, so a later edit in the expenses grid counts, and an
// item whose expense was deleted is no longer an example.
export const pastItemChoices = async (userId: string | null): Promise<ItemExample[]> => {
  const items = await ImportedItem.findAll({
    where: { userId, expenseId: { [Op.ne]: null } },
    attributes: ['id', 'description', 'expenseId'],
    order: [['updatedAt', 'DESC']],
  });
  if (!items.length) return [];
  const expenses = await Expense.findAll({
    where: { userId, id: items.map((i) => i.expenseId as string) },
    attributes: ['id', 'category'],
  });
  const categoryOf = new Map(expenses.map((e) => [e.id, e.category]));
  return items.flatMap((item) => {
    const category = categoryOf.get(item.expenseId as string);
    // "Uncategorized" is a placeholder, not a choice.
    if (!category || category === 'Uncategorized') return [];
    return [{ source: item.id, text: item.description.slice(0, 512), category }];
  });
};
