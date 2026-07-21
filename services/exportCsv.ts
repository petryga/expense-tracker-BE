import { Router } from 'express';
import { randomUUID } from 'crypto';
import { unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Currency, Expense } from '../models/Expense.js';
import { createObjectCsvWriter } from 'csv-writer';
import { formatDate } from '../utils/exportUtils.js';

const router = Router();

router.get('/', async (req, res) => {
  // Unique per request so concurrent exports (different users, or the same
  // user firing two requests) never read or write each other's file.
  const exportPath = join(tmpdir(), `expenses-export-${randomUUID()}.csv`);

  try {
    const expenses = await Expense.findAll({ where: { userId: req.userId } });

    const csvWriter = createObjectCsvWriter({
      path: exportPath,
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

    res.download(exportPath, 'expenses.csv', (err) => {
      unlink(exportPath).catch(() => {});
      if (err) console.error('Failed to send CSV:', err);
    });
  } catch (error) {
    console.error('Failed to generate CSV:', error);
    res.status(500).send('Failed to export data as CSV.');
    unlink(exportPath).catch(() => {});
  }
});

export default router;
