import { Router } from 'express';
import { getMonthlyTotals } from '../utils/monthlyTotals.js';
import { handleError } from '../utils/common.js';

const router = Router();

// Totals are summed from the expenses/income tables on every request; there is
// no stored copy to keep in sync (see utils/monthlyTotals.ts).
router.get('/', async (req, res) => {
  try {
    res.json(await getMonthlyTotals(req.userId));
  } catch (error) {
    handleError(res, error, 'Failed to get monthly data');
  }
});

export default router;
