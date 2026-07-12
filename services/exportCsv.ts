import { Router } from 'express';
import { Currency, Expense } from '../models/Expense';
import { createObjectCsvWriter } from 'csv-writer';
import { formatDate } from '../utils/exportUtils';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const expenses = await Expense.findAll({ where: { userId: req.userId } });

    const csvWriter = createObjectCsvWriter({
      path: 'output.csv',
      header: [
        { id: 'datePosted', title: 'Date Posted' },
        { id: 'category', title: 'Category' },
        { id: 'description', title: 'Description' },
        { id: 'amount', title: 'Amount' },
        { id: 'currency', title: 'Currency' },
        { id: 'account', title: 'Account' },
      ],
    });

    const formattedExpenses = expenses.map((expense) => ({
      ...expense,
      datePosted: formatDate(expense.datePosted),
      category: expense.category || 'Default Category',
      description: expense.description || 'No description',
      amount: expense.amount || 0,
      currency: expense.currency || Currency.CAD,
      account: expense.account || 'Default Account',
    }));

    await csvWriter.writeRecords(formattedExpenses);

    res.download('output.csv');
  } catch (error) {
    console.error('Failed to generate CSV:', error);
    res.status(500).send('Failed to export data as CSV.');
  }
});

export default router;
