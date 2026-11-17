// Questions per user per day (UTC), in memory: a backstop against runaway
// cost, not an accounting record. It resets when the server restarts.
const counts = new Map<string, { day: string; n: number }>();

export const takeQuestion = (userId: string | null, limit: number, now = new Date()) => {
  const key = userId ?? 'local';
  const day = now.toISOString().slice(0, 10);
  const entry = counts.get(key);
  const n = entry?.day === day ? entry.n : 0;
  if (n >= limit) return false;
  counts.set(key, { day, n: n + 1 });
  return true;
};

export const resetDailyLimits = () => counts.clear();
