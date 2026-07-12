import { Router } from 'express';
import { resetDemoUserData } from '../utils/demoData';
import { handleError } from '../utils/common';

const router = Router();

router.post('/reset', async (req, res) => {
  if (!process.env.DEMO_USER_ID || req.userId !== process.env.DEMO_USER_ID) {
    res.status(204).end();
    return;
  }

  try {
    await resetDemoUserData(req.userId);
    res.status(204).end();
  } catch (error) {
    handleError(res, error, 'Failed to reset demo data');
  }
});

export default router;
