import { Router } from 'express';
import { Expense } from '../models/Expense';
import {
  createExpenseObject,
  updateMonthlyDataPost,
  updateMonthlyDataPut,
} from '../utils/expensesUtils';
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

    const totalAmount = expenseData.reduce((acc, expense) => {
      const amount = parseFloat(expense.amount);
      return acc + amount;
    }, 0);

    const data = {
      data: expenseData,
      expensesTotal: {
        totalAmountThisMonth: totalAmount.toFixed(2),
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
        const totalAmount = expenses.reduce((acc, expense) => {
          const amount = parseFloat(expense.amount);
          return acc + amount;
        }, 0);
        const data = {
          data: expenses,
          expensesTotal: {
            totalAmountSearchResults: totalAmount.toFixed(2),
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
        await updateMonthlyDataPost({ expense });
      }
      res.status(201).json(newExpenses);
      return;
    }

    const expense = createExpenseObject(req.body);
    const newExpense = await Expense.create(expense);
    await updateMonthlyDataPost({ expense: newExpense });

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
      await updateMonthlyDataPut({ expense });
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
    await updateMonthlyDataPut({ expense });
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
    await updateMonthlyDataPut({ expense });
    res.status(200).json(expense);
  } catch (error) {
    handleError(res, error, 'Failed to update expense');
  }
});

export default router;
