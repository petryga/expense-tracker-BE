import { Router } from 'express';
import { resetDemoUserData } from '../utils/demoData.js';
import { handleError } from '../utils/common.js';

const router = Router();

// The FE hits this on every sign-in. Reseeding is a real chunk of DB writes, so
// debounce it: back-to-back demo logins (or a script) don't each trigger a full
// wipe-and-reseed. In-memory is fine — a server restart just allows one more.
const RESET_DEBOUNCE_MS = 60_000;
let lastResetAt = 0;

router.post('/reset', async (req, res) => {
  if (!process.env.DEMO_USER_ID || req.userId !== process.env.DEMO_USER_ID) {
    res.status(204).end();
    return;
  }

  if (Date.now() - lastResetAt < RESET_DEBOUNCE_MS) {
    res.status(204).end();
    return;
  }

  try {
    await resetDemoUserData(req.userId);
    lastResetAt = Date.now();
    res.status(204).end();
  } catch (error) {
    handleError(res, error, 'Failed to reset demo data');
  }
});

export default router;
