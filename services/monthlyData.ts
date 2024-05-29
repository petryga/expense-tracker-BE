import { Router } from 'express';
import { MonthlyData } from '../models/MonthlyData';

const router = Router();

router.get('/', async (_, res) => {
  const monthlyData = await MonthlyData.findAll();

  if (!monthlyData) {
    res.status(404).json({ error: 'Monthly data not found' });
    return;
  }

  res.json(monthlyData);
});

export default router;
