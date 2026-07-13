import { Router } from 'express';
import { resetDemoUserData } from '../utils/demoData.js';
import { handleError } from '../utils/common.js';

const router = Router();

router.post('/reset', async (req, res) => {
  if (!process.env.DEMO_USER_ID || req.userId !== process.env.DEMO_USER_ID) {
    res.status(204).end();
    return;
  }

  try {
    await resetDemoUserData(req.userId);
    res.status(204).end();
  } catch (error: any) {
    handleError(res, error, 'Failed to reset demo data');
  }
});

export default router;
