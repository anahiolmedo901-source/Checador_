export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const BUSINESS_TIME_ZONE = 'America/Mexico_City';

export function businessTodayDate(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return new Date(value('year'), value('month') - 1, value('day'), 12);
}

/** Creates a Date whose local fields show the wall-clock time in the business zone. */
export function toBusinessWallDate(instant: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return new Date(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'));
}

/** Converts a wall-clock Date from the picker into an instant in the business zone. */
export function fromBusinessWallDate(wallDate: Date): Date {
  const target = Date.UTC(wallDate.getFullYear(), wallDate.getMonth(), wallDate.getDate(), wallDate.getHours(), wallDate.getMinutes(), wallDate.getSeconds());
  let guess = target;
  for (let pass = 0; pass < 3; pass += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(guess));
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const seen = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'));
    const delta = target - seen;
    guess += delta;
    if (delta === 0) break;
  }
  return new Date(guess);
}

/** Date window for new operational/scheduled dates: today through 3 calendar months. */
export function dateEntryBounds(now = new Date()): { minDate: Date; maxDate: Date } {
  const minDate = businessTodayDate(now);
  const day = minDate.getDate();
  const maxDate = new Date(minDate.getFullYear(), minDate.getMonth() + 3, 1);
  const lastDay = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0).getDate();
  maxDate.setDate(Math.min(day, lastDay));
  return { minDate, maxDate };
}

export function isDateEntryAllowed(value: string, now = new Date()): boolean {
  const { minDate, maxDate } = dateEntryBounds(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  if (toDateKey(date) !== value) return false;
  const key = toDateKey(date);
  return key >= toDateKey(minDate) && key <= toDateKey(maxDate);
}
