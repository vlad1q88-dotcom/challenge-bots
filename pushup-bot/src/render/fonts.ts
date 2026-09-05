import { fileURLToPath } from 'node:url';
import { GlobalFonts } from '@napi-rs/canvas';

/**
 * Шрифт кладём в репозиторий и регистрируем явно: системный sans-serif
 * на Windows может оказаться без кириллицы, и подписи превращаются в квадраты.
 */
export const FONT_FAMILY = 'BoardSans';

const FILES = ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf'];

let family = 'sans-serif';
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
  } catch (error) {
    console.warn('Не удалось загрузить шрифт борда, рисую системным:', error);
  }
  return family;
}

/** Строка для context.font: размер, начертание и наш шрифт. */
export function fontOf(size: number, weight: 'bold' | 'normal' = 'normal'): string {
  return `${weight === 'bold' ? 'bold ' : ''}${Math.round(size)}px ${ensureFonts()}`;
}
