import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, dayKey, dayNumber, diffDays, formatDayRu, isDayKey } from '../src/domain/dates.ts';

test('день считается по часовому поясу челленджа', () => {
  const late = new Date('2026-09-05T22:30:00Z');
  assert.equal(dayKey(late, 'UTC'), '2026-09-05');
  assert.equal(dayKey(late, 'Europe/Moscow'), '2026-09-06');
  assert.equal(dayKey(late, 'America/Los_Angeles'), '2026-09-05');
});

test('арифметика по дням не ломается на переходе месяца и года', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(diffDays('2026-01-01', '2026-12-31'), 364);
  assert.equal(dayNumber('2026-09-01', '2026-09-01'), 1);
  assert.equal(dayNumber('2026-09-01', '2026-09-30'), 30);
});

test('переход на летнее время не сдвигает границы дня', () => {
  // В ночь на 29.03.2026 Европа переводит часы вперёд.
  assert.equal(diffDays('2026-03-28', '2026-03-30'), 2);
  assert.equal(addDays('2026-03-28', 1), '2026-03-29');
});

test('валидация и формат дат', () => {
  assert.ok(isDayKey('2026-02-28'));
  assert.ok(!isDayKey('2026-02-30'));
  assert.ok(!isDayKey('05.09.2026'));
  assert.equal(formatDayRu('2026-09-05'), '05.09.2026');
});
