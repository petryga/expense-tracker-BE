import { parseISO } from 'date-fns';

export function formatDate(dateStr: string) {
  try {
    const date = parseISO(dateStr);
    if (dateStr.includes('T')) {
      // Slice the UTC ISO string instead of using date-fns' format(), which
      // renders in the local timezone and can roll a UTC-midnight timestamp
      // back to the previous day.
      return date.toISOString().slice(0, 10);
    } else {
      return dateStr;
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateStr;
  }
}
