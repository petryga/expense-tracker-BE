import { sequelize as sequelizeConfig } from './config/database.js';
import express from 'express';
import cors from 'cors';
import expensesRouter from './services/expenses.js';
import monthlyData from './services/monthlyData.js';
import incomeEntries from './services/incomeEntries.js';
import exportCsV from './services/exportCsv.js';
import recurringExpenses from './services/recurringExpenses.js';
import recurringIncomeEntries from './services/recurringIncomeEntries.js';
import categories from './services/categories.js';
import accounts from './services/accounts.js';
import demo from './services/demo.js';
import { requireAuth } from './middleware/auth.js';

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';

const allowedOrigins = (
  process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173'
)
  .split(',')
  .map((origin) => origin.trim());

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Unauthenticated on purpose — hosting platforms ping this to check the
// container is up, before any user has a token to send.
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.use(requireAuth);

app.use('/expenses', expensesRouter);
app.use('/monthlyData', monthlyData);
app.use('/income', incomeEntries);
app.use('/export', exportCsV);
app.use('/recurringExpenses', recurringExpenses);
app.use('/recurringIncome', recurringIncomeEntries);
app.use('/categories', categories);
app.use('/accounts', accounts);
app.use('/demo', demo);

sequelizeConfig
  .authenticate()
  .then(() => console.log('Database connection has been established successfully.'))
  .catch((err) => console.error('Unable to connect to the database:', err));

app.listen(Number(port), host, () => {
  console.log(`Server running at http://${host}:${port}`);
});
