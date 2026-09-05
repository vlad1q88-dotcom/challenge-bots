import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCanvas } from '@napi-rs/canvas';
import { createOcrEngine } from '../src/ocr/engine.ts';
import { readDailyReps } from '../src/ocr/screenshot.ts';

/** Синтетический скриншот приложения: тёмная тема, недельный график со столбиками. */
function fakeScreenshot(values: readonly number[]): Buffer {
  const canvas = createCanvas(1170, 2100);
  const context = canvas.getContext('2d');
  context.fillStyle = '#000000';
  context.fillRect(0, 0, 1170, 2100);
  context.fillStyle = '#FFFFFF';
  context.textAlign = 'center';

  context.font = '44px sans-serif';
  context.fillText('Aug 31 - Sep 6', 585, 300);
  context.font = '38px sans-serif';
  context.fillStyle = '#AAAAAA';
  context.fillText(`1 set - ${values.reduce((sum, value) => sum + value, 0)} reps total`, 585, 520);

  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const axisY = 1900;
  labels.forEach((label, index) => {
    const x = 150 + index * 145;
    const value = values[index] ?? 0;
    if (value > 0) {
      const height = 40 + value * 8;
      context.fillStyle = '#FF7A2F';
      context.fillRect(x - 40, axisY - 40 - height, 80, height);
      context.fillStyle = '#FFFFFF';
      context.font = '40px sans-serif';
      context.fillText(String(value), x, axisY - 70 - height);
    }
    context.fillStyle = '#9A9AA0';
    context.font = '38px sans-serif';
    context.fillText(label, x, axisY + 40);
  });
  return canvas.toBuffer('image/png');
}

test('полный проход: картинка → OCR → число за сегодня', { timeout: 60_000 }, async () => {
  const engine = createOcrEngine();
  try {
    const page = await engine.read(fakeScreenshot([0, 0, 42, 0, 0, 0, 0]));

    // 02.09.2026 — среда, столбик 42.
    const wednesday = readDailyReps(page, '2026-09-02');
    assert.equal(wednesday.ok, true);
    assert.equal(wednesday.ok && wednesday.value.reps, 42);

    // 03.09.2026 — четверг, столбика нет: сумму «42 reps total» брать нельзя.
    const thursday = readDailyReps(page, '2026-09-03');
    assert.equal(thursday.ok === false && thursday.reason, 'no-bar-label');
  } finally {
    await engine.close();
  }
});
