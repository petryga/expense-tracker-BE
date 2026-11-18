// Sends one test error to Sentry with the app's settings, to check SENTRY_DSN
// works: npx tsx scripts/sentry-test-error.ts
import * as Sentry from '@sentry/node';
import '../instrument.js';
import { reportError } from '../utils/sentry.js';

if (!Sentry.isInitialized()) {
  console.error('Sentry is off: set SENTRY_DSN in .env.');
  process.exit(1);
}
reportError(new Error('Sentry test error (sent on purpose)'), 'sentry-test', '/sentry-test');
const sent = await Sentry.flush(5000);
console.log(sent ? `Sent; event id ${Sentry.lastEventId()}` : 'Not sent within 5s');
