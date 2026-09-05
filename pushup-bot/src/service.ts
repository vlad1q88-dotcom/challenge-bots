import { MAX_ACTIVE_BOARDS, MAX_PARTICIPANTS } from './constants.ts';
import { newBadges, streakBadgesFor } from './domain/badges.ts';
import {
  addReport,
  createChallenge,
  fail,
  finalize,
  isOver,
  isParticipant,
  joinChallenge,
  occupiesSlot,
  ok,
  pickColorIndex,
  startChallenge,
  type Result,
} from './domain/challenge.ts';
import { todayKey } from './domain/dates.ts';
import { currentStreak } from './domain/streaks.ts';
import type { Store } from './storage/store.ts';
import type { BadgeCode, Challenge, Report, UserProfile } from './types.ts';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface FinishedChallenge {
  challenge: Challenge;
  awards: Map<number, BadgeCode[]>;
}

export interface ReportOutcome {
  challenge: Challenge;
  report: Report;
  awarded: BadgeCode[];
  streak: number;
}

export interface ServiceOptions {
  timezone: string;
  now?: () => Date;
}

export class ChallengeService {
  #store: Store;
  #timezone: string;
  #now: () => Date;

  constructor(store: Store, options: ServiceOptions) {
    this.#store = store;
    this.#timezone = options.timezone;
    this.#now = options.now ?? (() => new Date());
  }

  get timezone(): string {
    return this.#timezone;
  }

  now(): Date {
    return this.#now();
  }

  today(timezone: string = this.#timezone): string {
    return todayKey(timezone, this.#now());
  }

  save(): Promise<void> {
    return this.#store.save();
  }

  // --- Пользователи -------------------------------------------------------

  upsertUser(userId: number, chatId: number, displayName: string): UserProfile {
    const existing = this.#store.data.users.find((user) => user.userId === userId);
    if (existing) {
      existing.chatId = chatId;
      existing.displayName = displayName;
      return existing;
    }
    const created: UserProfile = { userId, chatId, displayName, badges: [] };
    this.#store.data.users.push(created);
    return created;
  }

  user(userId: number): UserProfile | undefined {
    return this.#store.data.users.find((user) => user.userId === userId);
  }

  /** Все дни, за которые человек отчитался хотя бы в одном челлендже. */
  reportDays(userId: number): string[] {
    const days = new Set<string>();
    for (const challenge of this.#store.data.challenges) {
      for (const report of challenge.reports) {
        if (report.userId === userId) days.add(report.day);
      }
    }
    return [...days];
  }

  awardBadges(userId: number, codes: readonly BadgeCode[], challengeId: string | null): BadgeCode[] {
    const user = this.user(userId);
    if (!user) return [];
    const fresh = newBadges(user.badges, codes, challengeId);
    const at = this.#now().toISOString();
    for (const code of fresh) {
      user.badges.push({ code, awardedAt: at, challengeId });
    }
    return fresh;
  }

  // --- Челленджи ----------------------------------------------------------

  challenge(code: string): Challenge | undefined {
    const id = code.trim().toUpperCase();
    return this.#store.data.challenges.find((challenge) => challenge.id === id);
  }

  challengesOf(userId: number): Challenge[] {
    return this.#store.data.challenges.filter((challenge) => isParticipant(challenge, userId));
  }

  /** Челленджи, которые занимают слоты лидер-бордов (набор или идут). */
  boardsOf(userId: number): Challenge[] {
    return this.challengesOf(userId).filter(occupiesSlot);
  }

  activeOf(userId: number): Challenge[] {
    return this.challengesOf(userId).filter((challenge) => challenge.status === 'active');
  }

  #generateCode(): string {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      let code = '';
      for (let index = 0; index < 6; index += 1) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!this.challenge(code)) return code;
    }
    throw new Error('Не удалось сгенерировать код приглашения');
  }

  create(input: {
    ownerId: number;
    title: string;
    days: number;
    dailyGoal: number;
    nickname: string;
    timezone?: string;
  }): Result<Challenge> {
    const boards = this.boardsOf(input.ownerId);
    if (boards.length >= MAX_ACTIVE_BOARDS) {
      return fail(
        `У тебя уже ${boards.length} лидер-борда — это максимум (${MAX_ACTIVE_BOARDS}). ` +
          'Заверши или отмени один из них, чтобы начать новый.',
      );
    }
    const created = createChallenge({
      id: this.#generateCode(),
      title: input.title,
      ownerId: input.ownerId,
      ownerNickname: input.nickname,
      dailyGoal: input.dailyGoal,
      days: input.days,
      timezone: input.timezone ?? this.#timezone,
      colorIndex: pickColorIndex(boards),
      now: this.#now(),
    });
    if (!created.ok) return created;
    this.#store.data.challenges.push(created.value);
    return created;
  }

  join(code: string, userId: number, nickname: string): Result<Challenge> {
    const challenge = this.challenge(code);
    if (!challenge) return fail('Челлендж с таким кодом не найден.');
    const boards = this.boardsOf(userId);
    if (!isParticipant(challenge, userId) && boards.length >= MAX_ACTIVE_BOARDS) {
      return fail(
        `У тебя уже ${boards.length} лидер-борда — это максимум (${MAX_ACTIVE_BOARDS}). ` +
          'Заверши или отмени один из них, чтобы принять новый вызов.',
      );
    }
    return joinChallenge(challenge, userId, nickname, this.#now());
  }

  start(code: string, userId: number): Result<Challenge> {
    const challenge = this.challenge(code);
    if (!challenge) return fail('Челлендж с таким кодом не найден.');
    if (challenge.ownerId !== userId) return fail('Запустить челлендж может только его инициатор.');
    return startChallenge(challenge, this.today(challenge.timezone));
  }

  cancel(code: string, userId: number): Result<Challenge> {
    const challenge = this.challenge(code);
    if (!challenge) return fail('Челлендж с таким кодом не найден.');
    if (challenge.ownerId !== userId) return fail('Отменить челлендж может только его инициатор.');
    if (challenge.status !== 'open') return fail('Отменить можно только челлендж, который ещё не запущен.');
    challenge.status = 'cancelled';
    return ok(challenge);
  }

  leave(code: string, userId: number): Result<Challenge> {
    const challenge = this.challenge(code);
    if (!challenge) return fail('Челлендж с таким кодом не найден.');
    if (challenge.status !== 'open') return fail('Выйти можно только до старта челленджа.');
    if (challenge.ownerId === userId) return fail('Инициатор не может выйти — отмени челлендж командой /cancel.');
    if (!isParticipant(challenge, userId)) return fail('Ты не участвуешь в этом челлендже.');
    challenge.participants = challenge.participants.filter((participant) => participant.userId !== userId);
    return ok(challenge);
  }

  setNickname(code: string, userId: number, nickname: string): Result<Challenge> {
    const challenge = this.challenge(code);
    if (!challenge) return fail('Челлендж с таким кодом не найден.');
    const participant = challenge.participants.find((item) => item.userId === userId);
    if (!participant) return fail('Ты не участвуешь в этом челлендже.');
    participant.nickname = nickname;
    return ok(challenge);
  }

  freeSlots(userId: number): number {
    return Math.max(MAX_ACTIVE_BOARDS - this.boardsOf(userId).length, 0);
  }

  freeSeats(challenge: Challenge): number {
    return Math.max(MAX_PARTICIPANTS - challenge.participants.length, 0);
  }

  // --- Отчёты -------------------------------------------------------------

  submitReport(input: {
    code: string;
    userId: number;
    reps: number;
    photoFileId: string;
    photoUniqueId?: string;
    source?: 'ocr' | 'manual';
  }): Result<ReportOutcome> {
    const challenge = this.challenge(input.code);
    if (!challenge) return fail('Челлендж с таким кодом не найден.');
    const day = this.today(challenge.timezone);
    const added = addReport({
      challenge,
      userId: input.userId,
      reps: input.reps,
      day,
      photoFileId: input.photoFileId,
      photoUniqueId: input.photoUniqueId ?? '',
      source: input.source,
      now: this.#now(),
    });
    if (!added.ok) return added;

    const streak = currentStreak(this.reportDays(input.userId), day);
    const awarded = this.awardBadges(input.userId, streakBadgesFor(streak), null);
    return ok({ challenge, report: added.value, awarded, streak });
  }

  // --- Финиш --------------------------------------------------------------

  /** Закрывает челленджи, у которых закончился срок, и раздаёт итоговые бейджи. */
  finishDue(): FinishedChallenge[] {
    const finished: FinishedChallenge[] = [];
    for (const challenge of this.#store.data.challenges) {
      if (!isOver(challenge, this.today(challenge.timezone))) continue;
      finished.push(this.finish(challenge));
    }
    return finished;
  }

  finish(challenge: Challenge): FinishedChallenge {
    challenge.results = finalize(challenge, this.#now());
    challenge.status = 'finished';
    const awards = new Map<number, BadgeCode[]>();
    for (const row of challenge.results.rows) {
      const codes: BadgeCode[] = [];
      if (row.completed) codes.push('finisher');
      else codes.push('loser');
      if (row.champion) codes.push('champion');
      awards.set(row.userId, this.awardBadges(row.userId, codes, challenge.id));
    }
    return { challenge, awards };
  }
}
