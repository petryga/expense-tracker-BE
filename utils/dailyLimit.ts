// Daily quotas per user and kind (UTC days), in memory: a backstop against
// runaway AI cost, not an accounting record. They reset when the server
// restarts. Used for chat questions and for rows sent for categorization.
const used = new Map<string, { day: string; n: number }>();

// Takes `amount` from today's quota; false (and nothing taken) if it would
// go over `limit`.
export const takeQuota = (
  kind: string,
  userId: string | null,
  amount: number,
  limit: number,
  now = new Date(),
) => {
  const key = `${kind}:${userId ?? 'local'}`;
  const day = now.toISOString().slice(0, 10);
  const entry = used.get(key);
  const n = entry?.day === day ? entry.n : 0;
  if (n + amount > limit) return false;
  used.set(key, { day, n: n + amount });
  return true;
};

export const resetDailyLimits = () => used.clear();
