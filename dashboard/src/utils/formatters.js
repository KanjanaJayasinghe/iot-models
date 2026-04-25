import { format, parseISO, isValid } from 'date-fns';

function parseDbTimestamp(ts) {
  const match = /^(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2}):(\d{2})$/.exec(ts);
  if (!match) return null;

  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  );
}

export function formatTimestamp(ts) {
  if (!ts) return '';
  try {
    const d = typeof ts === 'string'
      ? (parseDbTimestamp(ts) || parseISO(ts))
      : new Date(ts);
    return isValid(d) ? format(d, 'HH:mm:ss') : ts;
  } catch {
    return ts;
  }
}
