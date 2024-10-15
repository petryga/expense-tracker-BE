import { Router } from 'express';
import { Currency, Expense } from '../models/Expense';
import { createExpenseObject, putMonthlyData, postMonthlyData } from '../utils/expensesUtils';
import { Op } from 'sequelize';
import { handleError } from '../utils/common';

const router = Router();

router.get('/', async (req, res) => {
  const { search, yearMonth } = req.query as {
    search?: string;
    yearMonth?: string;
  };
  const expenses = await Expense.findAll({
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
    if (Array.isArray(req.body)) {
      const expenses = req.body.map(createExpenseObject);

      const newExpenses = await Expense.bulkCreate(expenses);

      for (const expense of newExpenses) {
        await postMonthlyData({ expense });
      }
      res.status(201).json(newExpenses);
      return;
    }

    const expense = createExpenseObject(req.body);
    const newExpense = await Expense.create(expense);
    await postMonthlyData({ expense: newExpense });

    res.status(201).json(newExpense);
  } catch (error) {
    handleError(res, error, 'Failed to create new expense');
  }
});

router.delete('/', async (req, res) => {
  const ids = req.body;
  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const expenses = await Expense.findAll({
      where: {
        id: ids,
      },
    });

    if (!expenses.length) {
      return res.status(404).json({ error: 'Expenses not found' });
    }

    await Expense.destroy({
      where: {
        id: ids,
      },
    });

    for (const expense of expenses) {
      await putMonthlyData({ expense });
    }
    res.status(204).send();
  } catch (error) {
    handleError(res, error, 'Failed to delete expenses');
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const expense = await Expense.findByPk(id);
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    await expense.destroy();
    await putMonthlyData({ expense });
    res.status(204).end();
  } catch (error) {
    handleError(res, error, 'Failed to delete expense');
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const updatedExpenseData = createExpenseObject(req.body);
    const expense = await Expense.findByPk(id);
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    await expense.update(updatedExpenseData);
    await putMonthlyData({ expense });
    res.status(200).json(expense);
  } catch (error) {
    handleError(res, error, 'Failed to update expense');
  }
});

export default router;
