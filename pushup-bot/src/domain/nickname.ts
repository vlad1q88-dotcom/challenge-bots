import { NICKNAME_MAX, NICKNAME_MIN } from '../constants.ts';

export type NicknameCheck = { ok: true; nickname: string } | { ok: false; error: string };

const ALLOWED = /^[\p{L}\p{N}_-]+$/u;

export function normalizeNickname(raw: string): string {
  return raw.trim().replace(/\s+/g, '');
}

export function checkNickname(raw: string, taken: readonly string[] = []): NicknameCheck {
  const nickname = normalizeNickname(raw);
  // Считаем видимые символы, чтобы эмодзи и суррогатные пары не ломали длину.
  const length = [...nickname].length;
  if (length < NICKNAME_MIN) {
    return { ok: false, error: `Ник слишком короткий: минимум ${NICKNAME_MIN} символа.` };
  }
  if (length > NICKNAME_MAX) {
    return { ok: false, error: `Ник слишком длинный: максимум ${NICKNAME_MAX} символов.` };
  }
  if (!ALLOWED.test(nickname)) {
    return { ok: false, error: 'В нике можно использовать только буквы, цифры, дефис и подчёркивание.' };
  }
  const clash = taken.some((item) => item.toLowerCase() === nickname.toLowerCase());
  if (clash) {
    return { ok: false, error: 'Такой ник в этом челлендже уже занят, выбери другой.' };
  }
  return { ok: true, nickname };
}
