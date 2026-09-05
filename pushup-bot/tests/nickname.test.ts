import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkNickname } from '../src/domain/nickname.ts';

test('ник короче 3 символов не принимается', () => {
  const result = checkNickname('ab');
  assert.equal(result.ok, false);
});

test('ник длиннее 12 символов не принимается', () => {
  assert.equal(checkNickname('a'.repeat(13)).ok, false);
  assert.equal(checkNickname('a'.repeat(12)).ok, true);
});

test('кириллица, цифры, дефис и подчёркивание разрешены', () => {
  const result = checkNickname('Дядя_Фёдор-1');
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.nickname, 'Дядя_Фёдор-1');
});

test('пробелы схлопываются, спецсимволы отклоняются', () => {
  const spaced = checkNickname('  Vlad 88 ');
  assert.equal(spaced.ok && spaced.nickname, 'Vlad88');
  assert.equal(checkNickname('vlad!').ok, false);
});

test('занятый ник не принимается без учёта регистра', () => {
  assert.equal(checkNickname('Vlad', ['vlad']).ok, false);
  assert.equal(checkNickname('Vlad', ['Sergey']).ok, true);
});
