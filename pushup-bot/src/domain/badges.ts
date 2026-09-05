import { pluralRu } from './plural.ts';
import type { AwardedBadge, BadgeCode } from '../types.ts';

/** Пороги бейджей за серии дней подряд. */
export const STREAK_THRESHOLDS = [3, 7, 10, 14, 21, 30, 60, 100, 150, 200, 365] as const;

export interface BadgeMeta {
  code: BadgeCode;
  icon: string;
  /** Короткое имя для картинки: «Разогрев», «Чемпион». */
  short: string;
  title: string;
  description: string;
  /** Порог серии, если бейдж за дни подряд. */
  streak?: number;
}

const STREAK_TITLES: Record<number, string> = {
  3: 'Разогрев',
  7: 'Неделя',
  10: 'Десятка',
  14: 'Две недели',
  21: 'Привычка',
  30: 'Месяц',
  60: 'Два месяца',
  100: 'Сотня',
  150: 'Полторы сотни',
  200: 'Двести',
  365: 'Год',
};

const STREAK_ICONS: Record<number, string> = {
  3: '🔥',
  7: '🔥',
  10: '⚡',
  14: '⚡',
  21: '💪',
  30: '💪',
  60: '🥉',
  100: '🥈',
  150: '🥇',
  200: '💎',
  365: '👑',
};

export function streakBadgeCode(threshold: number): BadgeCode {
  return `streak_${threshold}`;
}

export const BADGES: BadgeMeta[] = [
  ...STREAK_THRESHOLDS.map((threshold) => ({
    code: streakBadgeCode(threshold),
    icon: STREAK_ICONS[threshold] ?? '🔥',
    short: STREAK_TITLES[threshold] ?? String(threshold),
    title: `${STREAK_TITLES[threshold] ?? threshold} · ${threshold} дн. подряд`,
    description: `${threshold} ${pluralRu(threshold, 'день', 'дня', 'дней')} подряд без пропусков`,
    streak: threshold,
  })),
  {
    code: 'champion', icon: '🏆', short: 'Чемпион', title: 'Чемпион',
    description: 'Победа в челлендже среди перевыполнивших план',
  },
  {
    code: 'finisher', icon: '🎖', short: 'Финишер', title: 'Финишер',
    description: 'Челлендж выполнен полностью',
  },
  { code: 'loser', icon: '💀', short: 'Лузер', title: 'Лузер', description: 'Челлендж провален' },
];

const BY_CODE = new Map(BADGES.map((badge) => [badge.code, badge]));

export function badgeMeta(code: BadgeCode): BadgeMeta {
  return BY_CODE.get(code) ?? { code, icon: '•', short: code, title: code, description: '' };
}

/** Бейджи за серии, которые заслужены серией такой длины. */
export function streakBadgesFor(streak: number): BadgeCode[] {
  return STREAK_THRESHOLDS.filter((threshold) => streak >= threshold).map(streakBadgeCode);
}

/**
 * Отбирает бейджи, которых у человека ещё нет.
 * Бейджи за серии выдаются один раз и остаются навсегда;
 * «финишер» / «чемпион» / «лузер» выдаются заново за каждый челлендж.
 */
export function newBadges(
  owned: readonly AwardedBadge[],
  candidates: readonly BadgeCode[],
  challengeId: string | null,
): BadgeCode[] {
  const result: BadgeCode[] = [];
  for (const code of candidates) {
    const repeatable = code === 'champion' || code === 'finisher' || code === 'loser';
    const has = owned.some(
      (badge) => badge.code === code && (!repeatable || badge.challengeId === challengeId),
    );
    if (!has && !result.includes(code)) result.push(code);
  }
  return result;
}
