import { sequelize as sequelizeConfig } from './config/database';
import express from 'express';
import cors from 'cors';
import expensesRouter from './services/expenses';
import monthlyData from './services/monthlyData';
import incomeEntries from './services/incomeEntries';
import exportCsV from './services/exportCsv';
import recurringExpenses from './services/recurringExpenses';
import recurringIncomeEntries from './services/recurringIncomeEntries';
import categories from './services/categories';
import demo from './services/demo';
import { requireAuth } from './middleware/auth';

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
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
app.use('/demo', demo);

sequelizeConfig
  .authenticate()
  .then(() => console.log('Database connection has been established successfully.'))
  .catch((err) => console.error('Unable to connect to the database:', err));

app.listen(Number(port), host, () => {
  console.log(`Server running at http://${host}:${port}`);
});
