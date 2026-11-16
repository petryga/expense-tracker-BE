// Splits a charge into parts that add up to it exactly (PLANS.md, Phase D,
// decision 8). Parts are proportional to the weights; whatever rounding leaves
// over goes on the largest part. A matched charge already equals the sum of
// its items, so then every part is just its item's total.
export const splitCents = (totalCents: number, weights: number[]): number[] => {
  if (!weights.length) return [];
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum === totalCents) return [...weights];
  const parts = weights.map((w) =>
    weightSum === 0 ? 0 : Math.round((totalCents * w) / weightSum),
  );
  if (weightSum === 0) parts[0] = totalCents;
  const largest = parts.indexOf(Math.max(...parts));
  parts[largest] += totalCents - parts.reduce((a, b) => a + b, 0);
  return parts;
};
