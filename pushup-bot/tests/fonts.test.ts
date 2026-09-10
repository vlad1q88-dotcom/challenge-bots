import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { EMOJI_FAMILY, ensureFonts, emojiFont, FONT_FAMILY, fontOf } from '../src/render/fonts.ts';

test('шрифт лежит в репозитории', () => {
  for (const file of ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf', 'NotoColorEmoji-subset.ttf']) {
    assert.ok(existsSync(fileURLToPath(new URL(`../assets/fonts/${file}`, import.meta.url))), file);
  }
});

test('шрифт регистрируется и используется в подписях', () => {
  assert.equal(ensureFonts(), FONT_FAMILY);
  assert.ok(GlobalFonts.families.some((item) => item.family === FONT_FAMILY));
  assert.equal(fontOf(24), `24px ${FONT_FAMILY}`);
  assert.equal(fontOf(24, 'bold'), `bold 24px ${FONT_FAMILY}`);
});

test('эмодзи бейджей рисуются настоящим шрифтом', () => {
  assert.equal(emojiFont(40), `40px ${EMOJI_FAMILY}`);
  assert.ok(GlobalFonts.families.some((item) => item.family === EMOJI_FAMILY));

  const canvas = createCanvas(200, 100);
  const context = canvas.getContext('2d');
  context.font = emojiFont(64)!;
  // Медаль и палец вниз есть в вырезке шрифта, значит ширина не нулевая.
  assert.ok(context.measureText('🏅').width > 20);
  assert.ok(context.measureText('👎').width > 20);
});

test('кириллица рисуется реальными буквами, а не пустотой', () => {
  const canvas = createCanvas(400, 80);
  const context = canvas.getContext('2d');
  context.font = fontOf(40, 'bold');
  const cyrillic = context.measureText('Бейджи').width;
  const latin = context.measureText('Badges').width;
  assert.ok(cyrillic > 100, `кириллица схлопнулась: ${cyrillic}`);
  assert.ok(Math.abs(cyrillic - latin) < cyrillic * 0.5);
});
