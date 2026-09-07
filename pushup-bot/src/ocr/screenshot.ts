/**
 * Разбор скриншота из приложения-счётчика: находим на недельном графике
 * столбик за сегодня и читаем подпись над ним. Здесь только чистые функции —
 * на вход идут слова с координатами, которые вернул OCR.
 */

export interface OcrWord {
  text: string;
  confidence: number;
  /** Номер строки, в которую OCR объединил слова. */
  line: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrPage {
  words: OcrWord[];
  width: number;
  height: number;
}

export type ReadFailure = 'no-week-axis' | 'no-bars' | 'unrealistic';

export interface DayRead {
  /** День недели: 0 — воскресенье, как у Date#getUTCDay. */
  weekday: number;
  /** Подпись столбика на графике. */
  label: string;
  reps: number;
  confidence: number;
}

export interface WeekRead {
  days: DayRead[];
  /** Понедельник недели со скриншота, если удалось прочитать заголовок периода. */
  weekStart: string | null;
}

export type ReadResult = { ok: true; value: WeekRead } | { ok: false; reason: ReadFailure };

/** Сокращения дней недели: индекс совпадает с Date#getUTCDay. */
const WEEKDAYS: readonly (readonly string[])[] = [
  ['sun', 'вс', 'вск'],
  ['mon', 'пн', 'пон'],
  ['tue', 'вт', 'втр'],
  ['wed', 'ср', 'срд'],
  ['thu', 'чт', 'чтв'],
  ['fri', 'пт', 'птн'],
  ['sat', 'сб', 'сбт'],
];

const MONTHS: readonly (readonly string[])[] = [
  ['jan', 'янв'],
  ['feb', 'фев'],
  ['mar', 'мар'],
  ['apr', 'апр'],
  ['may', 'мая', 'май'],
  ['jun', 'июн'],
  ['jul', 'июл'],
  ['aug', 'авг'],
  ['sep', 'sept', 'сен'],
  ['oct', 'окт'],
  ['nov', 'ноя'],
  ['dec', 'дек'],
];

const MAX_REPS = 5000;

function letters(value: string): string {
  return value.toLowerCase().replace(/[^a-zа-яё]/g, '').replace(/ё/g, 'е');
}

function weekdayIndexOf(text: string): number | null {
  const normalized = letters(text);
  if (normalized.length < 2) return null;
  for (let index = 0; index < WEEKDAYS.length; index += 1) {
    if (WEEKDAYS[index]!.some((alias) => normalized.startsWith(alias))) return index;
  }
  return null;
}

function monthIndexOf(token: string): number | null {
  const normalized = letters(token);
  if (normalized.length < 3) return null;
  for (let index = 0; index < MONTHS.length; index += 1) {
    if (MONTHS[index]!.some((alias) => normalized.startsWith(alias))) return index;
  }
  return null;
}

function centerX(word: OcrWord): number {
  return (word.x0 + word.x1) / 2;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : sorted[middle] ?? 0;
}

function linesOf(words: readonly OcrWord[]): Map<number, OcrWord[]> {
  const lines = new Map<number, OcrWord[]>();
  for (const word of words) {
    const bucket = lines.get(word.line);
    if (bucket) bucket.push(word);
    else lines.set(word.line, [word]);
  }
  return lines;
}

function isNumber(text: string): boolean {
  return /^\d{1,4}$/.test(text.trim());
}

/**
 * Диапазон в заголовке скриншота («Aug 31 - Sep 6», «31 авг – 6 сен»).
 * Возвращает первый день диапазона или null, если заголовок не распознан.
 */
export function readPeriodStart(words: readonly OcrWord[], today: string): string | null {
  const year = new Date(`${today}T00:00:00Z`).getUTCFullYear();

  for (const line of linesOf(words).values()) {
    const tokens = line
      .map((word) => word.text)
      .join(' ')
      .toLowerCase()
      .split(/[^a-zа-яё0-9]+/)
      .filter(Boolean);

    const pairs: { month: number; date: number }[] = [];
    for (let index = 0; index < tokens.length; index += 1) {
      const month = monthIndexOf(tokens[index] ?? '');
      if (month === null) continue;
      const before = Number(tokens[index - 1]);
      const after = Number(tokens[index + 1]);
      const date = Number.isInteger(after) && after >= 1 && after <= 31
        ? after
        : Number.isInteger(before) && before >= 1 && before <= 31
          ? before
          : null;
      if (date !== null) pairs.push({ month, date });
    }
    if (pairs.length < 1) continue;

    const from = pairs[0]!;
    // Год выбираем так, чтобы дата оказалась ближе всего к сегодняшнему дню.
    let best: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const offset of [-1, 0, 1]) {
      const candidate = new Date(Date.UTC(year + offset, from.month, from.date));
      const distance = Math.abs(candidate.getTime() - Date.parse(`${today}T00:00:00Z`));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate.toISOString().slice(0, 10);
      }
    }
    // Полгода в сторону — уже не наш скриншот.
    if (best && bestDistance < 200 * 24 * 60 * 60 * 1000) return best;
  }
  return null;
}

/**
 * Читает все столбики недельного графика: для каждой подписи дня недели
 * ищет ближайшее число над ней. Столбики без подписи считаются «нет данных».
 */
export function readWeek(page: OcrPage, today: string): ReadResult {
  const { words } = page;

  const weekdayWords = words
    .map((word) => ({ word, index: weekdayIndexOf(word.text) }))
    .filter((item): item is { word: OcrWord; index: number } => item.index !== null && item.word.confidence >= 50);

  if (weekdayWords.length < 3) return { ok: false, reason: 'no-week-axis' };

  // Ось дней недели — самый плотный ряд подписей по вертикали.
  const rows: { word: OcrWord; index: number }[][] = [];
  for (const item of weekdayWords) {
    const itemCenter = (item.word.y0 + item.word.y1) / 2;
    const row = rows.find((candidate) => {
      const first = candidate[0]!.word;
      return Math.abs((first.y0 + first.y1) / 2 - itemCenter) <= 24;
    });
    if (row) row.push(item);
    else rows.push(item ? [item] : []);
  }
  const axis = rows.sort((a, b) => b.length - a.length)[0] ?? [];
  if (axis.length < 3) return { ok: false, reason: 'no-week-axis' };

  const centers = axis.map((item) => centerX(item.word)).sort((a, b) => a - b);
  const gaps = centers.slice(1).map((value, index) => value - (centers[index] ?? 0));
  const step = median(gaps) || page.width / 8;
  const axisTop = Math.min(...axis.map((item) => item.word.y0));

  // Верх графика: строка-сводка вида «1 set · 5 reps total», иначе половина экрана.
  const lines = linesOf(words);
  let chartTop = axisTop - page.height * 0.5;
  for (const line of lines.values()) {
    const text = line.map((word) => word.text).join(' ').toLowerCase();
    if (!/(reps|total|set|отжим|подход|всего)/.test(text)) continue;
    const bottom = Math.max(...line.map((word) => word.y1));
    if (bottom < axisTop && bottom > chartTop) chartTop = bottom;
  }

  // Подписи столбиков: числа, рядом с которыми нет слов. Так строка-сводка
  // («1 set · 5 reps total») отсекается, а случайный мусор от OCR где-то
  // сбоку — уже нет.
  const labels = [...lines.values()]
    .flatMap((line) =>
      line
        .filter((word) => isNumber(word.text))
        .filter((word) => {
          const neighbours = line.filter((other) => other !== word && !isNumber(other.text));
          return !neighbours.some((other) => {
            const gap = Math.max(word.x0 - other.x1, other.x0 - word.x1);
            return gap < step * 0.5;
          });
        }),
    )
    .filter((word) => word.confidence >= 40 && word.y1 < axisTop - 8 && word.y0 > chartTop);

  const days: DayRead[] = [];
  for (const column of axis) {
    const target = centerX(column.word);
    const found = labels
      .filter((word) => Math.abs(centerX(word) - target) <= step * 0.55)
      .sort((a, b) => Math.abs(centerX(a) - target) - Math.abs(centerX(b) - target))[0];
    if (!found) continue;
    const reps = Number(found.text);
    if (!Number.isInteger(reps) || reps < 1 || reps > MAX_REPS) continue;
    days.push({ weekday: column.index, label: column.word.text, reps, confidence: found.confidence });
  }

  if (days.length === 0) return { ok: false, reason: 'no-bars' };

  return { ok: true, value: { days, weekStart: readPeriodStart(words, today) } };
}

export const FAILURE_HINTS: Record<ReadFailure, string> = {
  'no-week-axis':
    'Не вижу недельный график. Открой в приложении вкладку <b>Week</b> — на скриншоте должны быть подписи дней (Mon…Sun) и столбики.',
  'no-bars':
    'На графике нет ни одного столбика с числом. Сделай подход, обнови экран и пришли скриншот снова.',
  'unrealistic': 'Не смог разобрать числа над столбиками. Пришли скриншот покрупнее, без обрезки графика.',
};
