import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createChallenge, finalize, joinChallenge, startChallenge, syncReports } from '../src/domain/challenge.ts';
import { renderBoard } from '../src/render/leaderboard.ts';
import { buildBoardView } from '../src/render/view.ts';
import { parseReps } from '../src/telegram/bot.ts';
import type { Challenge } from '../src/types.ts';

const NOW = new Date('2026-09-05T09:00:00Z');
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function sample(): Challenge {
  const created = createChallenge({
    id: 'K7QM3P', title: 'Отжимания 60/день', ownerId: 1, ownerNickname: 'Vlad',
    dailyGoal: 10, days: 5, timezone: 'UTC', colorIndex: 1, now: NOW,
  });
  if (!created.ok) throw new Error(created.error);
  const challenge = created.value;
  joinChallenge(challenge, 2, 'Максимка', NOW);
  startChallenge(challenge, '2026-09-01');
  syncReports({
    challenge,
    userId: 1,
    entries: [{ day: '2026-09-01', reps: 10 }, { day: '2026-09-02', reps: 15 }],
    today: '2026-09-03',
    photoFileId: 'p',
    photoUniqueId: 'p1',
    now: NOW,
  });
  syncReports({
    challenge,
    userId: 2,
    entries: [{ day: '2026-09-02', reps: 60 }],
    today: '2026-09-03',
    photoFileId: 'p',
    photoUniqueId: 'p2',
    now: NOW,
  });
  return challenge;
}

test('борд собирается из состояния челленджа', () => {
  const view = buildBoardView(sample(), '2026-09-03');
  assert.equal(view.target, 50);
  assert.equal(view.dayNumber, 3);
  assert.equal(view.daysLeft, 3);
  assert.equal(view.pacePercent, 3 / 5);
  // Столбики отсортированы: лидер слева.
  assert.deepEqual(view.rows.map((row) => row.nickname), ['Максимка', 'Vlad']);
  assert.equal(view.rows[0]?.percent, 60 / 50);
  assert.equal(view.rows[1]?.total, 25);
});

test('картинка борда рендерится в PNG', () => {
  const png = renderBoard(buildBoardView(sample(), '2026-09-03'));
  assert.ok(png.length > 1000);
  assert.deepEqual(png.subarray(0, 4), PNG_MAGIC);
});

test('итоговый борд рендерится после финиша', () => {
  const challenge = sample();
  challenge.results = finalize(challenge, NOW);
  challenge.status = 'finished';
  const view = buildBoardView(challenge, '2026-09-06');
  assert.equal(view.rows[0]?.champion, true);
  assert.equal(view.rows[1]?.deficit, 25);
  assert.deepEqual(renderBoard(view).subarray(0, 4), PNG_MAGIC);
});

test('число отжиманий вытаскивается из подписи к скриншоту', () => {
  assert.equal(parseReps('45'), 45);
  assert.equal(parseReps('сделал 45 отжиманий'), 45);
  assert.equal(parseReps('45 reps total'), 45);
  assert.equal(parseReps('без числа'), null);
  assert.equal(parseReps(''), null);
});
