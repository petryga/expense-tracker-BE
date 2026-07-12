import { Router } from 'express';
import { IncomeEntry } from '../models/IncomeEntry';
import {
  createIncomeEntryObject,
  postMonthlyData,
  putMonthlyData,
} from '../utils/incomeEntriesUtils';
import { handleError } from '../utils/common';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const incomeEntries = await IncomeEntry.findAll({
      where: { userId: req.userId },
      order: [
        ['date', 'DESC'],
        ['category', 'ASC'],
      ],
    });

    res.json(incomeEntries);
  } catch (error) {
    handleError(res, error, 'Failed to get income entries');
  }
});

router.post('/', async (req, res) => {
  try {
    const userId = req.userId;
    if (Array.isArray(req.body)) {
      const incomeEntries = req.body.map((item) => createIncomeEntryObject(item, userId));

      const newIncomeEntries = await IncomeEntry.bulkCreate(incomeEntries);

      for (const incomeEntry of newIncomeEntries) {
        await postMonthlyData({ incomeEntry });
      }
      res.status(201).json(newIncomeEntries);
      return;
    }

    const income = createIncomeEntryObject(req.body, userId);
    const newIncomeEntry = await IncomeEntry.create(income);
    await postMonthlyData({ incomeEntry: newIncomeEntry });

    res.status(201).json(newIncomeEntry);
  } catch (error) {
    handleError(res, error, 'Failed to create new income entry');
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const incomeEntry = await IncomeEntry.findOne({ where: { id, userId: req.userId } });
    if (!incomeEntry) {
      return res.status(404).json({ error: 'Income entry not found' });
    }

    const updatedIncomeEntry = await incomeEntry.update({ ...req.body, userId: req.userId });
    await putMonthlyData({ incomeEntry: updatedIncomeEntry });

    res.json(updatedIncomeEntry);
  } catch (error) {
    handleError(res, error, 'Failed to update income entry');
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const incomeEntry = await IncomeEntry.findOne({ where: { id, userId: req.userId } });
    if (!incomeEntry) {
      return res.status(404).json({ error: 'Income entry not found' });
    }

    await putMonthlyData({ incomeEntry });
    await incomeEntry.destroy();

    res.status(204).end();
  } catch (error) {
    handleError(res, error, 'Failed to delete income entry');
  }
});

export default router;
