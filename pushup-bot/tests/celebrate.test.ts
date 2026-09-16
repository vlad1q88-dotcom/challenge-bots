import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderCelebration } from '../src/render/celebrate.ts';

test('открытка именинника — анимированный GIF', () => {
  const gif = renderCelebration({ nickname: 'Максимка', colorIndex: 0 });
  assert.equal(gif.subarray(0, 6).toString('latin1'), 'GIF89a');
  // Ширина и высота лежат в заголовке little-endian.
  assert.equal(gif.readUInt16LE(6), 640);
  assert.equal(gif.readUInt16LE(8), 400);

  // Каждый кадр предваряется блоком управления графикой (0x21 0xF9).
  let frames = 0;
  for (let index = 0; index < gif.length - 1; index += 1) {
    if (gif[index] === 0x21 && gif[index + 1] === 0xf9) frames += 1;
  }
  assert.ok(frames >= 20, `кадров всего ${frames}`);
  assert.ok(gif.length < 2_000_000, `гифка тяжёлая: ${gif.length} байт`);
});

test('одинаковый ник даёт одинаковую открытку', () => {
  const first = renderCelebration({ nickname: 'Vlad', colorIndex: 1 });
  const second = renderCelebration({ nickname: 'Vlad', colorIndex: 1 });
  assert.deepEqual(first, second);
  // У другого ника конфетти ложится иначе.
  assert.notDeepEqual(first, renderCelebration({ nickname: 'Гоша', colorIndex: 1 }));
});
