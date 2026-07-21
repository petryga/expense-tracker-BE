import { Router } from 'express';
import { RecurringIncomeEntry } from '../models/RecurringIncomeEntry.js';
import { handleError } from '../utils/common.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const recurringIncomeEntries = await RecurringIncomeEntry.findAll({
      where: { userId: req.userId },
      order: [['category', 'ASC']],
    });

    res.json(recurringIncomeEntries);
  } catch (error) {
    handleError(res, error, 'Failed to get recurring income entries');
  }
});

// Explicit allow-list rather than `...req.body` — the FE assigns its own
// uuid client-side for optimistic UI, so `id` is a legitimate field to
// accept, but nothing else the client sends (e.g. a forged
// createdAt/updatedAt) should reach the database.
const pickRecurringIncomeFields = (body: Record<string, unknown>) => {
  const { id, description, category, amount, currency } = body;
  return { id, description, category, amount, currency };
};

router.post('/', async (req, res) => {
  try {
    const newRecurringIncomeEntry = await RecurringIncomeEntry.create({
      ...pickRecurringIncomeFields(req.body),
      userId: req.userId,
    });

    res.status(201).json(newRecurringIncomeEntry);
  } catch (error) {
    handleError(res, error, 'Failed to create new recurring income entry');
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const recurringIncomeEntry = await RecurringIncomeEntry.findOne({
      where: { id, userId: req.userId },
    });
    if (!recurringIncomeEntry) {
      return res.status(404).json({ error: 'Recurring income entry not found' });
    }

    const updatedRecurringIncomeEntry = await recurringIncomeEntry.update({
      ...pickRecurringIncomeFields(req.body),
      userId: req.userId,
    });

    res.json(updatedRecurringIncomeEntry);
  } catch (error) {
    handleError(res, error, 'Failed to update recurring income entry');
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const recurringIncomeEntry = await RecurringIncomeEntry.findOne({
      where: { id, userId: req.userId },
    });
    if (!recurringIncomeEntry) {
      return res.status(404).json({ error: 'Recurring income entry not found' });
    }

    await recurringIncomeEntry.destroy();

    res.status(204).end();
  } catch (error) {
    handleError(res, error, 'Failed to delete recurring income entry');
  }
});

export default router;
