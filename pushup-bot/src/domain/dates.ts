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

/** День недели: 0 — воскресенье, как у Date#getUTCDay. */
export function weekdayOf(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** Понедельник недели, в которую попадает день. */
export function mondayOf(day: string): string {
  return addDays(day, -((weekdayOf(day) + 6) % 7));
}

/** Дата нужного дня недели внутри недели, начинающейся с этого понедельника. */
export function dateOfWeekday(monday: string, weekday: number): string {
  return addDays(monday, (weekday + 6) % 7);
}

export function formatDayRu(day: string): string {
  const [year, month, date] = day.split('-');
  return `${date}.${month}.${year}`;
}

/** Разбирает «16.09», «16.09.1990», «16 сентября» → MM-DD. */
export function parseBirthday(raw: string): string | null {
  const digits = raw.trim().match(/^(\d{1,2})\s*[.,/\-\s]\s*(\d{1,2})(?:\s*[.,/\-\s]\s*\d{2,4})?$/);
  if (digits) {
    const date = Number(digits[1]);
    const month = Number(digits[2]);
    return isRealDate(month, date) ? format(month, date) : null;
  }
  const MONTHS = [
    'янв', 'фев', 'мар', 'апр', 'ма', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
  ];
  const words = raw.trim().toLowerCase().match(/^(\d{1,2})\s+([а-яё]+)/);
  if (words) {
    const date = Number(words[1]);
    const month = MONTHS.findIndex((alias) => (words[2] ?? '').startsWith(alias)) + 1;
    if (month > 0 && isRealDate(month, date)) return format(month, date);
  }
  return null;
}

function isRealDate(month: number, date: number): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(date)) return false;
  if (month < 1 || month > 12 || date < 1) return false;
  // 2024 — високосный, поэтому 29 февраля проходит.
  return date <= new Date(Date.UTC(2024, month, 0)).getUTCDate();
}

function format(month: number, date: number): string {
  return `${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
}

/** Совпадает ли день челленджа (YYYY-MM-DD) с днём рождения (MM-DD). */
export function isBirthday(day: string, birthday: string | undefined): boolean {
  return birthday !== undefined && day.slice(5) === birthday;
}

export function formatBirthdayRu(birthday: string): string {
  const [month, date] = birthday.split('-');
  return `${date}.${month}`;
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
