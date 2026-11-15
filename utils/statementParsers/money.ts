// Parses "1,350.00", "-39.35", "$12" into integer cents without going through
// floating point. Returns null for anything else.
export const parseCents = (value: string): number | null => {
  const cleaned = value.trim().replace(/[$,\s]/g, '');
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const cents = Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0'));
  return match[1] ? -cents : cents;
};

export const centsToAmount = (cents: number): string => {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
};
