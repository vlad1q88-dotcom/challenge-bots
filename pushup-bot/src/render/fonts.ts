import { fileURLToPath } from 'node:url';
import { GlobalFonts } from '@napi-rs/canvas';

/**
 * Шрифт кладём в репозиторий и регистрируем явно: системный sans-serif
 * на Windows может оказаться без кириллицы, и подписи превращаются в квадраты.
 */
export const FONT_FAMILY = 'BoardSans';
/** Цветные эмодзи: вырезка из Noto Color Emoji только с нужными символами. */
export const EMOJI_FAMILY = 'BoardEmoji';

const FILES = ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf'];
const EMOJI_FILE = 'NotoColorEmoji-subset.ttf';

let family = 'sans-serif';
let emoji: string | null = null;
let ready = false;

export function ensureFonts(): string {
  if (ready) return family;
  ready = true;
  try {
    for (const file of FILES) {
      const path = fileURLToPath(new URL(`../../assets/fonts/${file}`, import.meta.url));
      GlobalFonts.registerFromPath(path, FONT_FAMILY);
    }
    if (GlobalFonts.families.some((item) => item.family === FONT_FAMILY)) {
      family = FONT_FAMILY;
    } else {
      console.warn('Шрифт борда не зарегистрировался, рисую системным.');
    }

    GlobalFonts.registerFromPath(fileURLToPath(new URL(`../../assets/fonts/${EMOJI_FILE}`, import.meta.url)), EMOJI_FAMILY);
    if (GlobalFonts.families.some((item) => item.family === EMOJI_FAMILY)) emoji = EMOJI_FAMILY;
  } catch (error) {
    console.warn('Не удалось загрузить шрифт борда, рисую системным:', error);
  }
  return family;
}

/** Шрифт для цветных эмодзи или null, если он не подгрузился. */
export function emojiFont(size: number): string | null {
  ensureFonts();
  return emoji ? `${Math.round(size)}px ${emoji}` : null;
}

/** Строка для context.font: размер, начертание и наш шрифт. */
export function fontOf(size: number, weight: 'bold' | 'normal' = 'normal'): string {
  return `${weight === 'bold' ? 'bold ' : ''}${Math.round(size)}px ${ensureFonts()}`;
}
