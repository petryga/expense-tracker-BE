import { sequelize as sequelizeConfig } from './config/database';
import express from 'express';
import cors from 'cors';
import expensesRouter from './services/expenses';
import monthlyData from './services/monthlyData';
import incomeEntries from './services/incomeEntries';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/expenses', expensesRouter);
app.use('/monthlyData', monthlyData);
app.use('/income', incomeEntries);

sequelizeConfig
  .authenticate()
  .then(() => console.log('Database connection has been established successfully.'))
  .catch((err) => console.error('Unable to connect to the database:', err));

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
