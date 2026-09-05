import assert from 'node:assert/strict';
import { test } from 'node:test';
import { days, pluralRu } from '../src/domain/plural.ts';

test('склонение по числу', () => {
  assert.equal(pluralRu(1, 'день', 'дня', 'дней'), 'день');
  assert.equal(pluralRu(2, 'день', 'дня', 'дней'), 'дня');
  assert.equal(pluralRu(5, 'день', 'дня', 'дней'), 'дней');
  assert.equal(pluralRu(11, 'день', 'дня', 'дней'), 'дней');
  assert.equal(pluralRu(21, 'день', 'дня', 'дней'), 'день');
  assert.equal(pluralRu(0, 'день', 'дня', 'дней'), 'дней');
  assert.equal(days(3), '3 дня');
});
