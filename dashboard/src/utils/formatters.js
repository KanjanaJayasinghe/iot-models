import { format, parseISO, isValid } from 'date-fns';

export function formatTimestamp(ts) {
  if (!ts) return '';
  try {
    const d = typeof ts === 'string' ? parseISO(ts) : new Date(ts);
    return isValid(d) ? format(d, 'HH:mm:ss') : ts;
  } catch {
    return ts;
  }
}
