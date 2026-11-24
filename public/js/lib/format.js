// Dates travel as "YYYY-MM-DD" text. They are formatted in UTC so the
// day never shifts with the viewer's time zone.
const longDate = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function formatDate(isoDate) {
  if (!isoDate) return '';
  return longDate.format(new Date(`${isoDate}T00:00:00Z`));
}

// Today's date where the user is, as YYYY-MM-DD.
export function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function formatPercent(value) {
  return value === null || value === undefined ? 'No classes yet' : `${value}%`;
}

export function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

const ordinals = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
export function periodLabel(period) {
  return `${ordinals[period] || period} class of the day`;
}

export const STATUS_LABELS = Object.freeze({ present: 'Present', absent: 'Absent', late: 'Late', excused: 'Excused' });
