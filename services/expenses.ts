import { Router } from 'express';
import { Currency, Expense } from '../models/Expense.js';
import { createExpenseObject, putMonthlyData, postMonthlyData } from '../utils/expensesUtils.js';
import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { handleError } from '../utils/common.js';


const router = Router();

router.get('/', async (req, res) => {
  const { search, yearMonth } = req.query as {
    search?: string;
    yearMonth?: string;
  };
  const userId = req.userId;
  const expenses = await Expense.findAll({
    where: { userId },
    order: [['datePosted', 'DESC']],
  });

  if (yearMonth) {
    const [year, month] = yearMonth.split('-');
    const expenseData = expenses.filter((expense) => {
      return expense.year === parseInt(year) && expense.month === parseInt(month);
    });

    const totalAmountCad = expenseData.reduce((acc, expense) => {
      if (expense.currency === Currency.CAD) {
        const amount = parseFloat(expense.amount);
        return acc + amount;
      }
      return acc;
    }, 0);

    const totalAmountUsd = expenseData.reduce((acc, expense) => {
      if (expense.currency === Currency.USD) {
        const amount = parseFloat(expense.amount);
        return acc + amount;
      }
      return acc;
    }, 0);

    const data = {
      data: expenseData,
      expensesTotal: {
        totalAmountThisMonthCad: totalAmountCad.toFixed(2),
        totalAmountThisMonthUsd: totalAmountUsd.toFixed(2),
      },
    };

    res.json(data);
    return;
  }

  if (search) {
    Expense.findAll({
      where: {
        userId,
        [Op.or]: [
          {
            description: {
              [Op.iLike]: `%${search}%`,
            },
          },
          {
            category: {
              [Op.iLike]: `%${search}%`,
            },
          },
        ],
      },
    })
      .then((expenses) => {
        const totalAmountCad = expenses.reduce((acc, expense) => {
          if (expense.currency === Currency.CAD) {
            const amount = parseFloat(expense.amount);
            return acc + amount;
          }
          return acc;
        }, 0);

        const totalAmountUsd = expenses.reduce((acc, expense) => {
          if (expense.currency === Currency.USD) {
            const amount = parseFloat(expense.amount);
            return acc + amount;
          }
          return acc;
        }, 0);

        const data = {
          data: expenses,
          expensesTotal: {
            totalAmountSearchResultsCad: totalAmountCad.toFixed(2),
            totalAmountSearchResultsUsd: totalAmountUsd.toFixed(2),
          },
        };
        res.json(data);
      })
      .catch((error) => {
        console.error('Error fetching expenses:', error);
        res.status(400).json({ error: 'Failed to fetch expenses' });
      });
    return;
  }

  const totalAmount = expenses.reduce((acc, expense) => {
    const amount = parseFloat(expense.amount);
    return acc + amount;
  }, 0);
  const data = {
    data: expenses,
    expensesTotal: {
      totalAmountAllTime: totalAmount.toFixed(2),
    },
  };
  res.json(data);
});

router.post('/', async (req, res) => {
  try {
    const userId = req.userId;
    if (Array.isArray(req.body)) {
      const expenses = req.body.map((item) => createExpenseObject(item, userId));

      const newExpenses = await sequelize.transaction(async (transaction) => {
        const created = await Expense.bulkCreate(expenses, { transaction });

        for (const expense of created) {
          await postMonthlyData({ expense, transaction });
        }
        return created;
      });

      res.status(201).json(newExpenses);
      return;
    }

    const expense = createExpenseObject(req.body, userId);
    const newExpense = await sequelize.transaction(async (transaction) => {
      const created = await Expense.create(expense, { transaction });
      await postMonthlyData({ expense: created, transaction });
      return created;
    });

    res.status(201).json(newExpense);
  } catch (error: any) {
    handleError(res, error, 'Failed to create new expense');
  }
});

router.delete('/', async (req, res) => {
  const ids = req.body;
  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const userId = req.userId;
    const expenses = await Expense.findAll({
      where: {
        id: ids,
        userId,
      },
    });

    if (!expenses.length) {
      return res.status(404).json({ error: 'Expenses not found' });
    }

    await sequelize.transaction(async (transaction) => {
      await Expense.destroy({
        where: {
          id: ids,
          userId,
        },
        transaction,
      });

      for (const expense of expenses) {
        await putMonthlyData({ expense, transaction });
      }
    });
    res.status(204).send();
  } catch (error: any) {
    handleError(res, error, 'Failed to delete expenses');
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const expense = await Expense.findOne({ where: { id, userId: req.userId } });
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    await sequelize.transaction(async (transaction) => {
      await expense.destroy({ transaction });
      await putMonthlyData({ expense, transaction });
    });
    res.status(204).end();
  } catch (error: any) {
    handleError(res, error, 'Failed to delete expense');
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const expense = await Expense.findOne({ where: { id, userId: req.userId } });
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const updatedExpenseData = createExpenseObject(req.body, req.userId);
    await sequelize.transaction(async (transaction) => {
      await expense.update(updatedExpenseData, { transaction });
      await putMonthlyData({ expense, transaction });
    });
    res.status(200).json(expense);
  } catch (error: any) {
    handleError(res, error, 'Failed to update expense');
  }
});

export default router;
