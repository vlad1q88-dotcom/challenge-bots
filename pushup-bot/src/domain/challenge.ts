import {
  MAX_DAILY_GOAL,
  MAX_DAYS,
  MAX_PARTICIPANTS,
  MAX_REPS_PER_REPORT,
  MIN_DAILY_GOAL,
  MIN_DAYS,
} from '../constants.ts';
import type { Challenge, ChallengeResults, ParticipantResult, Report } from '../types.ts';
import { addDays, compareDays, dayNumber, diffDays } from './dates.ts';
import { bestStreak, currentStreak } from './streaks.ts';

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T>(error: string): Result<T> {
  return { ok: false, error };
}

/** Челлендж занимает слот лидер-борда: набор участников или идущий отсчёт. */
export function occupiesSlot(challenge: Challenge): boolean {
  return challenge.status === 'open' || challenge.status === 'active';
}

export function isParticipant(challenge: Challenge, userId: number): boolean {
  return challenge.participants.some((participant) => participant.userId === userId);
}

export function nicknameOf(challenge: Challenge, userId: number): string | null {
  return challenge.participants.find((participant) => participant.userId === userId)?.nickname ?? null;
}

export function target(challenge: Challenge): number {
  return challenge.dailyGoal * challenge.days;
}

export function reportsOf(challenge: Challenge, userId: number): Report[] {
  return challenge.reports.filter((report) => report.userId === userId);
}

export function totalReps(challenge: Challenge, userId: number): number {
  return reportsOf(challenge, userId).reduce((sum, report) => sum + report.reps, 0);
}

export function hasReportOn(challenge: Challenge, userId: number, day: string): boolean {
  return challenge.reports.some((report) => report.userId === userId && report.day === day);
}

/** Свободный цвет борда: 0 — оранжевый, 1 — зелёный, 2 — голубой. */
export function pickColorIndex(occupied: readonly Challenge[]): number {
  const used = new Set(occupied.map((challenge) => challenge.colorIndex));
  for (let index = 0; index < 3; index += 1) {
    if (!used.has(index)) return index;
  }
  return 0;
}

export interface CreateChallengeInput {
  id: string;
  title: string;
  ownerId: number;
  ownerNickname: string;
  dailyGoal: number;
  days: number;
  timezone: string;
  colorIndex: number;
  now: Date;
}

export function validateDays(days: number): Result<number> {
  if (!Number.isInteger(days) || days < MIN_DAYS || days > MAX_DAYS) {
    return fail(`Длительность — целое число от ${MIN_DAYS} до ${MAX_DAYS} дней.`);
  }
  return ok(days);
}

export function validateDailyGoal(dailyGoal: number): Result<number> {
  if (!Number.isInteger(dailyGoal) || dailyGoal < MIN_DAILY_GOAL || dailyGoal > MAX_DAILY_GOAL) {
    return fail(`Норма в день — целое число от ${MIN_DAILY_GOAL} до ${MAX_DAILY_GOAL} отжиманий.`);
  }
  return ok(dailyGoal);
}

export function createChallenge(input: CreateChallengeInput): Result<Challenge> {
  const days = validateDays(input.days);
  if (!days.ok) return days;
  const dailyGoal = validateDailyGoal(input.dailyGoal);
  if (!dailyGoal.ok) return dailyGoal;

  return ok({
    id: input.id,
    title: input.title.trim() || 'Челлендж по отжиманиям',
    ownerId: input.ownerId,
    createdAt: input.now.toISOString(),
    status: 'open',
    dailyGoal: dailyGoal.value,
    days: days.value,
    timezone: input.timezone,
    colorIndex: input.colorIndex,
    startDay: null,
    endDay: null,
    participants: [
      { userId: input.ownerId, nickname: input.ownerNickname, joinedAt: input.now.toISOString() },
    ],
    reports: [],
    results: null,
  });
}

export function joinChallenge(
  challenge: Challenge,
  userId: number,
  nickname: string,
  now: Date,
): Result<Challenge> {
  if (challenge.status !== 'open') {
    return fail('К этому челленджу уже нельзя присоединиться: набор закрыт.');
  }
  if (isParticipant(challenge, userId)) {
    return fail('Ты уже участвуешь в этом челлендже.');
  }
  if (challenge.participants.length >= MAX_PARTICIPANTS) {
    return fail(`В челлендже уже максимум участников (${MAX_PARTICIPANTS}).`);
  }
  challenge.participants.push({ userId, nickname, joinedAt: now.toISOString() });
  return ok(challenge);
}

export function startChallenge(challenge: Challenge, today: string): Result<Challenge> {
  if (challenge.status !== 'open') {
    return fail('Челлендж уже запущен или завершён.');
  }
  if (challenge.participants.length < 2) {
    return fail('Нужен хотя бы один соперник: позови участников по коду приглашения.');
  }
  challenge.status = 'active';
  challenge.startDay = today;
  challenge.endDay = addDays(today, challenge.days - 1);
  return ok(challenge);
}

export interface AddReportInput {
  challenge: Challenge;
  userId: number;
  reps: number;
  day: string;
  photoFileId: string;
  photoUniqueId: string;
  now: Date;
  source?: 'ocr' | 'manual';
}

export function addReport(input: AddReportInput): Result<Report> {
  const { challenge, userId, reps, day, photoFileId, photoUniqueId, now } = input;
  if (challenge.status !== 'active') {
    return fail('Челлендж ещё не запущен или уже завершён — отчёт не принят.');
  }
  if (!isParticipant(challenge, userId)) {
    return fail('Ты не участвуешь в этом челлендже.');
  }
  if (!Number.isInteger(reps) || reps < 1 || reps > MAX_REPS_PER_REPORT) {
    return fail(`Количество отжиманий — целое число от 1 до ${MAX_REPS_PER_REPORT}.`);
  }
  if (challenge.startDay && compareDays(day, challenge.startDay) < 0) {
    return fail('Челлендж ещё не начался.');
  }
  if (challenge.endDay && compareDays(day, challenge.endDay) > 0) {
    return fail('Челлендж уже закончился.');
  }
  // Главное правило: один отчёт в день, второй за тот же день не принимается.
  if (hasReportOn(challenge, userId, day)) {
    return fail('За сегодня отчёт уже принят. Больше одного отчёта в день нельзя.');
  }
  // Один и тот же скриншот второй раз в этот челлендж не проходит.
  if (photoUniqueId && challenge.reports.some((item) => item.photoUniqueId === photoUniqueId)) {
    return fail('Этот скриншот уже засчитан в этом челлендже. Нужен свежий.');
  }
  const report: Report = {
    userId,
    day,
    reps,
    at: now.toISOString(),
    photoFileId,
    photoUniqueId,
    source: input.source ?? 'ocr',
  };
  challenge.reports.push(report);
  return ok(report);
}

export interface ProgressRow {
  userId: number;
  nickname: string;
  total: number;
  reportedDays: number;
  streak: number;
  best: number;
  percent: number;
}

export function progress(challenge: Challenge, today: string): ProgressRow[] {
  const goal = target(challenge);
  return challenge.participants.map((participant) => {
    const days = reportsOf(challenge, participant.userId).map((report) => report.day);
    const total = totalReps(challenge, participant.userId);
    return {
      userId: participant.userId,
      nickname: participant.nickname,
      total,
      reportedDays: new Set(days).size,
      streak: currentStreak(days, today),
      best: bestStreak(days),
      percent: goal > 0 ? total / goal : 0,
    };
  });
}

/** Номер текущего дня челленджа (1..days), обрезанный по границам. */
export function currentDayNumber(challenge: Challenge, today: string): number {
  if (!challenge.startDay) return 0;
  return Math.min(Math.max(dayNumber(challenge.startDay, today), 0), challenge.days);
}

export function daysLeft(challenge: Challenge, today: string): number {
  if (!challenge.endDay) return challenge.days;
  return Math.max(diffDays(today, challenge.endDay) + 1, 0);
}

export function isOver(challenge: Challenge, today: string): boolean {
  return challenge.status === 'active' && challenge.endDay !== null && compareDays(today, challenge.endDay) > 0;
}

/** Подводит итоги: кто выполнил план, кому сколько не хватило, кто чемпион. */
export function finalize(challenge: Challenge, now: Date): ChallengeResults {
  const goal = target(challenge);
  const rows: ParticipantResult[] = challenge.participants.map((participant) => {
    const days = reportsOf(challenge, participant.userId).map((report) => report.day);
    const total = totalReps(challenge, participant.userId);
    return {
      userId: participant.userId,
      nickname: participant.nickname,
      total,
      target: goal,
      completed: total >= goal,
      deficit: Math.max(goal - total, 0),
      overachieved: total > goal,
      champion: false,
      place: 0,
      reportedDays: new Set(days).size,
      bestStreak: bestStreak(days),
    };
  });

  rows.sort((a, b) => b.total - a.total || a.nickname.localeCompare(b.nickname, 'ru'));
  rows.forEach((row, index) => {
    const previous = rows[index - 1];
    row.place = previous && previous.total === row.total ? previous.place : index + 1;
  });

  // За звание чемпиона борются только перевыполнившие план; при равенстве — оба чемпионы.
  const overachievers = rows.filter((row) => row.overachieved);
  if (overachievers.length > 0) {
    const best = Math.max(...overachievers.map((row) => row.total));
    for (const row of overachievers) {
      if (row.total === best) row.champion = true;
    }
  }

  return { finishedAt: now.toISOString(), rows };
}
