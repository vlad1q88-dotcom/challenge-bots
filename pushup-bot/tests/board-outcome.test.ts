import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createChallenge, finalize, joinChallenge, startChallenge, syncReports } from '../src/domain/challenge.ts';
import { buildBoardView } from '../src/render/view.ts';
import type { BadgeCode, Challenge } from '../src/types.ts';

const NOW = new Date('2026-09-05T09:00:00Z');

function finished(): Challenge {
  const created = createChallenge({
    id: 'ABC123', title: 'Тест', ownerId: 1, ownerNickname: 'Vlad',
    dailyGoal: 50, days: 2, timezone: 'UTC', colorIndex: 0, now: NOW,
  });
  if (!created.ok) throw new Error(created.error);
  const challenge = created.value;
  joinChallenge(challenge, 2, 'Максимка', NOW);
  joinChallenge(challenge, 3, 'Гоша', NOW);
  startChallenge(challenge, '2026-09-01');

  const put = (userId: number, day: string, reps: number) =>
    syncReports({ challenge, userId, entries: [{ day, reps }], today: '2026-09-02',
      photoFileId: 'p', photoUniqueId: `${userId}${day}`, now: NOW });
  put(1, '2026-09-01', 60);
  put(1, '2026-09-02', 60); // 120 — перевыполнил, чемпион
  put(2, '2026-09-01', 50);
  put(2, '2026-09-02', 50); // 100 — ровно план, финишер
  put(3, '2026-09-01', 30); // 30 — провал

  challenge.results = finalize(challenge, NOW);
  challenge.status = 'finished';
  return challenge;
}

test('на итоговом борде у каждого стоит бейдж исхода', () => {
  const challenge = finished();
  // У Vlad в коллекции есть и старые серии — они идут после итогового бейджа.
  const badges: Record<number, BadgeCode[]> = { 1: ['streak_7', 'streak_3'], 2: [], 3: [] };
  const view = buildBoardView(challenge, '2026-09-03', (userId) => badges[userId] ?? []);

  const byNick = new Map(view.rows.map((row) => [row.nickname, row.badges ?? []]));
  assert.deepEqual(byNick.get('Vlad'), ['champion', 'streak_7', 'streak_3']);
  assert.deepEqual(byNick.get('Максимка'), ['finisher']);
  assert.deepEqual(byNick.get('Гоша'), ['loser']);
});

test('пока челлендж идёт, итоговых бейджей на борде нет', () => {
  const challenge = finished();
  challenge.status = 'active';
  challenge.results = null;
  const view = buildBoardView(challenge, '2026-09-02', () => ['streak_3', 'champion'] as BadgeCode[]);
  for (const row of view.rows) {
    assert.deepEqual(row.badges, ['streak_3']);
  }
});
