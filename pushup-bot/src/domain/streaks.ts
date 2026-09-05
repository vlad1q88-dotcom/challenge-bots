import { addDays } from './dates.ts';

/** Текущая серия: сколько дней подряд заканчивая на `endDay` (включительно). */
export function currentStreak(days: readonly string[], endDay: string): number {
  const set = new Set(days);
  if (!set.has(endDay)) return 0;
  let streak = 0;
  let cursor = endDay;
  while (set.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Самая длинная серия за всю историю дней. */
export function bestStreak(days: readonly string[]): number {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of sorted) {
    run = previous !== null && addDays(previous, 1) === day ? run + 1 : 1;
    if (run > best) best = run;
    previous = day;
  }
  return best;
}
