import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { readPeriodStart, readWeek, type OcrPage, type OcrWord } from '../src/ocr/screenshot.ts';

/** Слова, которые OCR реально вернул на скриншоте приложения (неделя 31 авг — 6 сен 2026). */
const words = JSON.parse(
  readFileSync(new URL('./fixtures/week-screenshot.json', import.meta.url), 'utf8'),
) as OcrWord[];
const page: OcrPage = { words, width: 1170, height: 2532 };

test('со скриншота читаются все столбики недели', () => {
  const result = readWeek(page, '2026-09-05');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  // На графике заполнена только суббота: 5 отжиманий.
  assert.deepEqual(
    result.value.days.map((day) => [day.label, day.reps]),
    [['Sat', 5]],
  );
});

test('заголовок периода даёт начало недели', () => {
  const result = readWeek(page, '2026-09-05');
  assert.equal(result.ok && result.value.weekStart, '2026-08-31');
  assert.equal(readPeriodStart(words, '2026-09-05'), '2026-08-31');
  // Год подбирается по близости к сегодняшнему дню.
  assert.equal(readPeriodStart(words, '2027-09-05'), '2027-08-31');
});

test('сумма из строки «1 set · 5 reps total» не попадает в столбики', () => {
  const result = readWeek(page, '2026-09-05');
  assert.equal(result.ok && result.value.days.length, 1);
  // Ни четверга (под строкой сводки), ни понедельника (под счётчиком профиля) быть не должно.
  assert.equal(result.ok && result.value.days.some((day) => day.weekday === 4), false);
  assert.equal(result.ok && result.value.days.some((day) => day.weekday === 1), false);
});

test('без недельной оси парсер честно отказывается', () => {
  const noAxis: OcrPage = {
    ...page,
    words: words.filter((word) => !/^(mon|tue|wed|thu|fri|sat|sun)$/i.test(word.text)),
  };
  const result = readWeek(noAxis, '2026-09-05');
  assert.equal(result.ok === false && result.reason, 'no-week-axis');
});

test('пустой график — не отчёт', () => {
  const noBars: OcrPage = { ...page, words: words.filter((word) => word.text !== '5') };
  const result = readWeek(noBars, '2026-09-05');
  assert.equal(result.ok === false && result.reason, 'no-bars');
});

test('русские подписи дней недели тоже читаются', () => {
  const map: Record<string, string> = { Mon: 'Пн', Tue: 'Вт', Wed: 'Ср', Thu: 'Чт', Fri: 'Пт', Sat: 'Сб', Sun: 'Вс' };
  const ru: OcrPage = {
    ...page,
    words: words.map((word) => (map[word.text] ? { ...word, text: map[word.text]! } : word)),
  };
  const result = readWeek(ru, '2026-09-05');
  assert.equal(result.ok && result.value.days[0]?.reps, 5);
  assert.equal(result.ok && result.value.days[0]?.weekday, 6);
});
