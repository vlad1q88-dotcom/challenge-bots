/** Максимум участников в одном челлендже, включая инициатора. */
export const MAX_PARTICIPANTS = 6;

/** Максимум одновременных лидер-бордов у одного человека. */
export const MAX_ACTIVE_BOARDS = 3;

export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 12;

export const MIN_DAYS = 1;
export const MAX_DAYS = 365;

export const MIN_DAILY_GOAL = 1;
export const MAX_DAILY_GOAL = 5000;

/** Разумный потолок на один отчёт, чтобы отсечь опечатки. */
export const MAX_REPS_PER_REPORT = 5000;

/** Яркие цвета бордов: первый — оранжевый, второй — зелёный, третий — голубой. */
export const BOARD_COLORS = [
  { name: 'оранжевый', base: '#FF7A2F', light: '#FF9F5A', dark: '#E4551A' },
  { name: 'зелёный', base: '#37D67A', light: '#66E79B', dark: '#17A857' },
  { name: 'голубой', base: '#38BDF8', light: '#6FD4FF', dark: '#0E93D4' },
] as const;
