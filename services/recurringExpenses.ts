import { Router } from 'express';
import { RecurringExpense } from '../models/RecurringExpense';
import { handleError } from '../utils/common';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const recurringExpenses = await RecurringExpense.findAll({
      where: { userId: req.userId },
      order: [['dayOfMonth', 'ASC']],
    });

    res.json(recurringExpenses);
  } catch (error) {
    handleError(res, error, 'Failed to get recurring expenses');
  }
});

router.post('/', async (req, res) => {
  try {
    const newRecurringExpense = await RecurringExpense.create({
      ...req.body,
      userId: req.userId,
    });

    res.status(201).json(newRecurringExpense);
  } catch (error) {
    handleError(res, error, 'Failed to create new recurring expense');
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const recurringExpense = await RecurringExpense.findOne({ where: { id, userId: req.userId } });
    if (!recurringExpense) {
      return res.status(404).json({ error: 'Recurring expense not found' });
    }

    const updatedRecurringExpense = await recurringExpense.update({
      ...req.body,
      userId: req.userId,
    });

    res.json(updatedRecurringExpense);
  } catch (error) {
    handleError(res, error, 'Failed to update recurring expense');
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const recurringExpense = await RecurringExpense.findOne({ where: { id, userId: req.userId } });
    if (!recurringExpense) {
      return res.status(404).json({ error: 'Recurring expense not found' });
    }

    await recurringExpense.destroy();

    res.status(204).end();
  } catch (error) {
    handleError(res, error, 'Failed to delete recurring expense');
  }
});

export default router;
