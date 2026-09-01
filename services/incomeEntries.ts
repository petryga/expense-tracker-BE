import { Router } from 'express';
import { IncomeEntry } from '../models/IncomeEntry.js';
import {
  createIncomeEntryObject,
  postMonthlyData,
  putMonthlyData,
} from '../utils/incomeEntriesUtils.js';
import { sequelize } from '../config/database.js';
import { handleError } from '../utils/common.js';

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

      const newIncomeEntries = await sequelize.transaction(async (transaction) => {
        const created = await IncomeEntry.bulkCreate(incomeEntries, { transaction });

        for (const incomeEntry of created) {
          await postMonthlyData({ incomeEntry, transaction });
        }
        return created;
      });

      res.status(201).json(newIncomeEntries);
      return;
    }

    const income = createIncomeEntryObject(req.body, userId);
    const newIncomeEntry = await sequelize.transaction(async (transaction) => {
      const created = await IncomeEntry.create(income, { transaction });
      await postMonthlyData({ incomeEntry: created, transaction });
      return created;
    });

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

    const updatedIncomeEntry = await sequelize.transaction(async (transaction) => {
      const updated = await incomeEntry.update(createIncomeEntryObject(req.body, req.userId), {
        transaction,
      });
      await putMonthlyData({ incomeEntry: updated, transaction });
      return updated;
    });

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

    await sequelize.transaction(async (transaction) => {
      await incomeEntry.destroy({ transaction });
      await putMonthlyData({ incomeEntry, transaction });
    });

    res.status(204).end();
  } catch (error) {
    handleError(res, error, 'Failed to delete income entry');
  }
});

export default router;
