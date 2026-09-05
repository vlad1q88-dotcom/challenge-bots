import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { readDailyReps, readPeriod, type OcrPage, type OcrWord } from '../src/ocr/screenshot.ts';

/** Слова, которые OCR реально вернул на скриншоте приложения (неделя 31 авг — 6 сен 2026). */
const words = JSON.parse(
  readFileSync(new URL('./fixtures/week-screenshot.json', import.meta.url), 'utf8'),
) as OcrWord[];
const page: OcrPage = { words, width: 1170, height: 2532 };

test('со скриншота читается число за сегодня', () => {
  // 05.09.2026 — суббота, над её столбиком стоит 5.
  const result = readDailyReps(page, '2026-09-05');
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value.reps, 5);
  assert.equal(result.ok && result.value.weekdayLabel, 'Sat');
});

test('пустой день не превращается в отчёт', () => {
  // В четверг столбика нет: строку «1 set · 5 reps total» брать нельзя.
  const thursday = readDailyReps(page, '2026-09-03');
  assert.equal(thursday.ok, false);
  assert.equal(thursday.ok === false && thursday.reason, 'no-bar-label');

  // Понедельник — тоже пусто, и «326» из шапки профиля не должно приехать в отчёт.
  const monday = readDailyReps(page, '2026-08-31');
  assert.equal(monday.ok === false && monday.reason, 'no-bar-label');
});

test('скриншот другой недели не принимается', () => {
  const nextWeek = readDailyReps(page, '2026-09-12');
  assert.equal(nextWeek.ok, false);
  assert.equal(nextWeek.ok === false && nextWeek.reason, 'other-week');
  assert.equal(readPeriod(words, '2026-09-05'), 'current');
  assert.equal(readPeriod(words, '2026-08-25'), 'other');
});

test('без недельной оси парсер честно отказывается', () => {
  const noAxis: OcrPage = {
    ...page,
    words: words.filter((word) => !/^(mon|tue|wed|thu|fri|sat|sun)$/i.test(word.text)),
  };
  const result = readDailyReps(noAxis, '2026-09-05');
  assert.equal(result.ok === false && result.reason, 'no-week-axis');
});

test('русские подписи дней недели тоже читаются', () => {
  const ru: OcrPage = {
    ...page,
    words: words.map((word) => {
      const map: Record<string, string> = { Mon: 'Пн', Tue: 'Вт', Wed: 'Ср', Thu: 'Чт', Fri: 'Пт', Sat: 'Сб', Sun: 'Вс' };
      return map[word.text] ? { ...word, text: map[word.text]! } : word;
    }),
  };
  const result = readDailyReps(ru, '2026-09-05');
  assert.equal(result.ok && result.value.reps, 5);
});
