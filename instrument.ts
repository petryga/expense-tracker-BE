// Imported first by index.ts, so Sentry is set up before anything else loads.
import dotenv from 'dotenv';
import { initSentry } from './utils/sentry.js';

dotenv.config();
initSentry();
