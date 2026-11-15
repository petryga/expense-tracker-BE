import { Op } from 'sequelize';
import { Category } from '../../models/Category.js';
import { ImportedTransaction } from '../../models/ImportedTransaction.js';
import { isDemoUser } from '../importAccess.js';
import { logger } from '../logger.js';
import { aiConfig, requestSuggestions } from './aiClient.js';

// The category names a user can pick on review: subcategories they can see
// (shared defaults plus their own), the same list the FE category picker shows.
const pickableCategories = async (userId: string | null) => {
  const visible = await Category.findAll({
    where: { [Op.or]: [{ isDefault: true }, { userId }] },
    attributes: ['name', 'parentCategoryId'],
  });
  return [...new Set(visible.filter((c) => c.parentCategoryId).map((c) => c.name))];
};

// Adds suggestions to the draft purchases of a fresh import. Runs after the
// upload transaction has committed, so a slow or broken AI service never holds
// the import up or fails it. Off for the demo user (it gets a cached sample
// result instead, later in Phase B).
export const suggestForImport = async (
  userId: string | null,
  batchId: string,
  requestId?: string,
) => {
  const config = aiConfig();
  if (!config || isDemoUser(userId)) return;

  try {
    const rows = await ImportedTransaction.findAll({
      where: { userId, batchId, kind: 'charge', status: 'draft' },
      attributes: ['id', 'description', 'amountCents'],
    });
    const categories = await pickableCategories(userId);
    const suggestions = await requestSuggestions(
      config,
      rows.map((r) => ({ id: r.id, text: r.description, amountCents: r.amountCents })),
      categories,
      requestId,
    );
    for (const [id, category] of suggestions) {
      await ImportedTransaction.update(
        { suggestedCategory: category, suggestionSource: 'model' },
        { where: { id, userId, status: 'draft' } },
      );
    }
  } catch (error) {
    // Suggestions are optional; the import itself has already been saved.
    logger.warn(
      { err: { message: (error as Error)?.message }, requestId },
      'Storing AI suggestions failed',
    );
  }
};
