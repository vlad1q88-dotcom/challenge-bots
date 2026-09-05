/**
 * День челленджа — это календарная дата в часовом поясе челленджа,
 * записанная как YYYY-MM-DD. Все сравнения и арифметика идут по строкам/UTC,
 * чтобы переход на летнее время не сдвигал границы дня.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function dayKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return parts;
}

export function todayKey(timezone: string, now: Date = new Date()): string {
  return dayKey(now, timezone);
}

export function isDayKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time)) return false;
  return new Date(time).toISOString().slice(0, 10) === value;
}

function toUtc(day: string): number {
  const time = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(time)) throw new Error(`Некорректная дата: ${day}`);
  return time;
}

export function addDays(day: string, amount: number): string {
  return new Date(toUtc(day) + amount * DAY_MS).toISOString().slice(0, 10);
}

/** Сколько дней от a до b (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

export function compareDays(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Номер дня челленджа (1-based) для указанной даты. */
export function dayNumber(startDay: string, day: string): number {
  return diffDays(startDay, day) + 1;
}

export function formatDayRu(day: string): string {
  const [year, month, date] = day.split('-');
  return `${date}.${month}.${year}`;
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
