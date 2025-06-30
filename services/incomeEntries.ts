import { Router } from 'express';
import { IncomeEntry } from '../models/IncomeEntry';
import {
  createIncomeEntryObject,
  postMonthlyData,
  putMonthlyData,
} from '../utils/incomeEntriesUtils';
import { handleError } from '../utils/common';

const router = Router();

router.get('/', async (_, res) => {
  try {
    const incomeEntries = await IncomeEntry.findAll({
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
    if (Array.isArray(req.body)) {
      const incomeEntries = req.body.map(createIncomeEntryObject);

      const newIncomeEntries = await IncomeEntry.bulkCreate(incomeEntries);

      for (const incomeEntry of newIncomeEntries) {
        await postMonthlyData({ incomeEntry });
      }
      res.status(201).json(newIncomeEntries);
      return;
    }

    const income = createIncomeEntryObject(req.body);
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
    const incomeEntry = await IncomeEntry.findByPk(id);
    if (!incomeEntry) {
      return res.status(404).json({ error: 'Income entry not found' });
    }

    const updatedIncomeEntry = await incomeEntry.update(req.body);
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
    const incomeEntry = await IncomeEntry.findByPk(id);
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
