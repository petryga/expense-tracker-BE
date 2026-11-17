import { sequelize } from '../config/database.js';
import { logger } from './logger.js';

// Readiness (Plan 1): can this instance serve requests, i.e. reach its
// database? Unlike /health (is the process up), this fails while the database
// is down or slow, so a host can hold traffic back until it recovers.
export const databaseReachable = async (
  timeoutMs = Number(process.env.READY_DB_TIMEOUT_MS) || 2000,
): Promise<boolean> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      sequelize.authenticate(),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('database check timed out')), timeoutMs);
      }),
    ]);
    return true;
  } catch (error) {
    // The type only: a connection error can carry the host or user name.
    logger.warn({ err: { name: (error as Error)?.name } }, 'Readiness check failed');
    return false;
  } finally {
    clearTimeout(timer);
  }
};
