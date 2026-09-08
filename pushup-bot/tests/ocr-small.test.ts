import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCanvas } from '@napi-rs/canvas';
import { createOcrEngine } from '../src/ocr/engine.ts';
import { readWeek } from '../src/ocr/screenshot.ts';

/**
 * Скриншот с телефона в масштабе 591×1280: мелкие подписи, тёмная тема,
 * числа стоят вплотную над яркими столбиками. Раньше на таком бот видел
 * только первый столбик.
 */
function phoneScreenshot(values: readonly number[]): Buffer {
  const canvas = createCanvas(591, 1280);
  const c = canvas.getContext('2d');
  c.fillStyle = '#000000';
  c.fillRect(0, 0, 591, 1280);
  c.textAlign = 'center';

  c.fillStyle = '#FFFFFF';
  c.font = 'bold 30px sans-serif';
  c.fillText('Vlad', 295, 165);
  c.font = '22px sans-serif';
  c.fillStyle = '#9A9AA0';
  c.fillText('482', 305, 205);
  c.font = '18px sans-serif';
  c.fillText('Sep 7 - Sep 13', 295, 455);

  c.textAlign = 'left';
  c.fillStyle = '#FFFFFF';
  c.font = 'bold 21px sans-serif';
  c.fillText('Best day', 60, 545);
  c.fillText('Best set', 337, 545);
  c.font = 'bold 34px sans-serif';
  c.fillStyle = '#37D67A';
  c.fillText('60', 128, 630);
  c.fillStyle = '#FFFFFF';
  c.fillText('15', 405, 630);

  c.textAlign = 'center';
  c.fillStyle = '#9A9AA0';
  c.font = '15px sans-serif';
  c.fillText(`8 sets · ${values.reduce((a, b) => a + b, 0)} reps total`, 295, 727);

  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const axisY = 1088;
  labels.forEach((label, index) => {
    const x = 83 + index * 70.5;
    const value = values[index] ?? 0;
    if (value > 0) {
      const height = value * 3.9;
      c.fillStyle = '#E8613A';
      c.fillRect(x - 24, axisY - 22 - height, 48, height);
      c.fillStyle = '#FFFFFF';
      c.font = '15px sans-serif';
      c.fillText(String(value), x, axisY - 32 - height);
    }
    c.fillStyle = value > 0 ? '#FFFFFF' : '#7A7A82';
    c.font = '16px sans-serif';
    c.fillText(label, x, axisY + 8);
  });
  return canvas.toBuffer('image/png');
}

test('мелкий скриншот с телефона: читаются все столбики', { timeout: 60_000 }, async () => {
  const engine = createOcrEngine();
  try {
    const page = await engine.read(phoneScreenshot([60, 45, 0, 0, 0, 0, 0]));
    const result = readWeek(page, '2026-09-08');
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.deepEqual(
      result.value.days.map((day) => [day.label, day.reps]),
      [['Mon', 60], ['Tue', 45]],
    );
    // «60» из карточки Best day и «105 reps total» в дни не попадают.
    assert.equal(result.value.days.length, 2);
    assert.equal(result.value.weekStart, '2026-09-07');
  } finally {
    await engine.close();
  }
});

test('дни добавляются в течение недели', { timeout: 60_000 }, async () => {
  const engine = createOcrEngine();
  try {
    // Через два дня на графике появились ещё столбики.
    const page = await engine.read(phoneScreenshot([60, 45, 70, 55, 0, 0, 0]));
    const result = readWeek(page, '2026-09-10');
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(
      result.value.days.map((day) => [day.label, day.reps]),
      [['Mon', 60], ['Tue', 45], ['Wed', 70], ['Thu', 55]],
    );
  } finally {
    await engine.close();
  }
});
