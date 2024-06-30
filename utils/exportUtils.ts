import { format, parseISO } from 'date-fns';

export function formatDate(dateStr: string) {
  try {
    const date = parseISO(dateStr);
    if (dateStr.includes('T')) {
      return format(date, 'yyyy-MM-dd');
    } else {
      return dateStr;
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateStr;
  }
}
