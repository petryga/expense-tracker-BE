import { Router } from 'express';
import { Currency, Expense } from '../models/Expense.js';
import { createExpenseObject } from '../utils/expensesUtils.js';
import { Op } from 'sequelize';
import { handleError } from '../utils/common.js';

const router = Router();

const sumByCurrency = (expenses: Expense[]) => {
  let cad = 0;
  let usd = 0;
  for (const expense of expenses) {
    const amount = parseFloat(expense.amount);
    if (expense.currency === Currency.CAD) cad += amount;
    else if (expense.currency === Currency.USD) usd += amount;
  }
  return { cad: cad.toFixed(2), usd: usd.toFixed(2) };
};

router.get('/', async (req, res) => {
  const { search, yearMonth } = req.query as {
    search?: string;
    yearMonth?: string;
  };
  const userId = req.userId;

  try {
    if (yearMonth) {
      // Filtered in SQL so asking for one month only loads that month. A
      // malformed value matches nothing (empty month), as it always has.
      const match = /^(\d{4})-(\d{1,2})$/.exec(yearMonth);
      const month = match ? Number(match[2]) : 0;
      const expenses =
        match && month >= 1 && month <= 12
          ? await Expense.findAll({
              where: { userId, year: Number(match[1]), month },
              order: [['datePosted', 'DESC']],
            })
          : [];

      const { cad, usd } = sumByCurrency(expenses);
      res.json({
        data: expenses,
        expensesTotal: { totalAmountThisMonthCad: cad, totalAmountThisMonthUsd: usd },
      });
      return;
    }

    if (search) {
      const expenses = await Expense.findAll({
        where: {
          userId,
          [Op.or]: [
            { description: { [Op.iLike]: `%${search}%` } },
            { category: { [Op.iLike]: `%${search}%` } },
          ],
        },
        order: [['datePosted', 'DESC']],
      });

      const { cad, usd } = sumByCurrency(expenses);
      res.json({
        data: expenses,
        expensesTotal: { totalAmountSearchResultsCad: cad, totalAmountSearchResultsUsd: usd },
      });
      return;
    }

    // No grand total here: it used to add CAD and USD amounts together as if
    // they were one currency, so the number meant nothing (and no page used it).
    const expenses = await Expense.findAll({
      where: { userId },
      order: [['datePosted', 'DESC']],
    });
    res.json({ data: expenses, expensesTotal: {} });
  } catch (error) {
    handleError(res, error, 'Failed to fetch expenses');
  }
});

router.post('/', async (req, res) => {
  try {
    const userId = req.userId;
    if (Array.isArray(req.body)) {
      const expenses = req.body.map((item) => createExpenseObject(item, userId));

      const newExpenses = await Expense.bulkCreate(expenses);

      res.status(201).json(newExpenses);
      return;
    }

    const expense = createExpenseObject(req.body, userId);
    const newExpense = await Expense.create(expense);

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

    await Expense.destroy({
      where: {
        id: ids,
        userId,
      },
    });
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
    const expense = await Expense.findOne({ where: { id, userId: req.userId } });
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    await expense.destroy();
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
    const expense = await Expense.findOne({ where: { id, userId: req.userId } });
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const updatedExpenseData = createExpenseObject(req.body, req.userId);
    await expense.update(updatedExpenseData);
    res.status(200).json(expense);
  } catch (error) {
    handleError(res, error, 'Failed to update expense');
  }
});

export default router;
