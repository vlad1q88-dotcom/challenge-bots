export type ChallengeStatus = 'open' | 'active' | 'finished' | 'cancelled';

export interface Participant {
  userId: number;
  nickname: string;
  joinedAt: string;
}

export interface Report {
  userId: number;
  /** День в часовом поясе челленджа, YYYY-MM-DD. */
  day: string;
  reps: number;
  at: string;
  photoFileId: string;
  /** Идентификатор самого файла: один скриншот нельзя засчитать в челлендж дважды. */
  photoUniqueId: string;
  /** Как получено число: распознано со скриншота или проставлено вручную. */
  source: 'ocr' | 'manual';
}

export interface ParticipantResult {
  userId: number;
  nickname: string;
  total: number;
  target: number;
  /** Выполнил план челленджа целиком. */
  completed: boolean;
  /** Сколько отжиманий не хватило до цели (0, если выполнил). */
  deficit: number;
  /** Перевыполнил план. */
  overachieved: boolean;
  champion: boolean;
  place: number;
  reportedDays: number;
  bestStreak: number;
}

export interface ChallengeResults {
  finishedAt: string;
  rows: ParticipantResult[];
}

export interface Challenge {
  /** Короткий код-приглашение, он же id. */
  id: string;
  title: string;
  ownerId: number;
  createdAt: string;
  status: ChallengeStatus;
  /** Норма отжиманий в день. */
  dailyGoal: number;
  /** Длительность в днях. */
  days: number;
  timezone: string;
  /** Цвет борда: 0 — оранжевый, 1 — зелёный, 2 — голубой. */
  colorIndex: number;
  startDay: string | null;
  endDay: string | null;
  participants: Participant[];
  reports: Report[];
  results: ChallengeResults | null;
}

export type BadgeCode =
  | `streak_${number}`
  | 'champion'
  | 'finisher'
  | 'loser';

export interface AwardedBadge {
  code: BadgeCode;
  awardedAt: string;
  challengeId: string | null;
}

export interface UserProfile {
  userId: number;
  /** Чат с ботом, куда шлём борды и уведомления. */
  chatId: number;
  displayName: string;
  badges: AwardedBadge[];
}

export interface Database {
  version: number;
  challenges: Challenge[];
  users: UserProfile[];
}
