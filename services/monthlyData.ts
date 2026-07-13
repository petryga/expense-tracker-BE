import { Router } from 'express';
import { MonthlyData } from '../models/MonthlyData.js';

const router = Router();

router.get('/', async (req, res) => {
  const monthlyData = await MonthlyData.findAll({ where: { userId: req.userId } });

  if (!monthlyData) {
    res.status(404).json({ error: 'Monthly data not found' });
    return;
  }

  const sortedByMonth = [...monthlyData].sort((a, b) => {
    const aMonth = a.yearMonth.split('-')[1].padStart(2, '0');
    const bMonth = b.yearMonth.split('-')[1].padStart(2, '0');
    return parseInt(aMonth) - parseInt(bMonth);
  });

  res.json(sortedByMonth);
});

export default router;
