import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bestStreak, currentStreak } from '../src/domain/streaks.ts';

test('текущая серия считается назад от указанного дня', () => {
  const days = ['2026-09-01', '2026-09-02', '2026-09-04', '2026-09-05'];
  assert.equal(currentStreak(days, '2026-09-05'), 2);
  assert.equal(currentStreak(days, '2026-09-02'), 2);
  // Пропуск обнуляет серию.
  assert.equal(currentStreak(days, '2026-09-06'), 0);
});

test('лучшая серия за всю историю', () => {
  const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-06', '2026-09-07'];
  assert.equal(bestStreak(days), 3);
  assert.equal(bestStreak([]), 0);
  assert.equal(bestStreak(['2026-09-01', '2026-09-01']), 1);
});
