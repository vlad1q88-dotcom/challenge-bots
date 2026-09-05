import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addReport,
  createChallenge,
  finalize,
  isOver,
  joinChallenge,
  progress,
  startChallenge,
  target,
} from '../src/domain/challenge.ts';
import type { Challenge } from '../src/types.ts';

const NOW = new Date('2026-09-01T08:00:00Z');

function makeChallenge(days = 10, dailyGoal = 50): Challenge {
  const created = createChallenge({
    id: 'ABC123',
    title: 'Отжимания',
    ownerId: 1,
    ownerNickname: 'Vlad',
    dailyGoal,
    days,
    timezone: 'UTC',
    colorIndex: 0,
    now: NOW,
  });
  if (!created.ok) throw new Error(created.error);
  return created.value;
}

function join(challenge: Challenge, userId: number, nickname: string): void {
  const result = joinChallenge(challenge, userId, nickname, NOW);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
}

function report(challenge: Challenge, userId: number, day: string, reps: number) {
  return addReport({ challenge, userId, reps, day, photoFileId: 'photo', photoUniqueId: `${userId}-${day}`, now: NOW });
}

test('в челлендже не больше 6 участников', () => {
  const challenge = makeChallenge();
  for (let index = 2; index <= 6; index += 1) join(challenge, index, `nick${index}`);
  const seventh = joinChallenge(challenge, 7, 'seventh', NOW);
  assert.equal(seventh.ok, false);
  assert.equal(challenge.participants.length, 6);
});

test('срок и норма проверяются при создании', () => {
  const zeroDays = createChallenge({
    id: 'X', title: 't', ownerId: 1, ownerNickname: 'Vlad',
    dailyGoal: 50, days: 0, timezone: 'UTC', colorIndex: 0, now: NOW,
  });
  assert.equal(zeroDays.ok, false);
  const zeroGoal = createChallenge({
    id: 'X', title: 't', ownerId: 1, ownerNickname: 'Vlad',
    dailyGoal: 0, days: 10, timezone: 'UTC', colorIndex: 0, now: NOW,
  });
  assert.equal(zeroGoal.ok, false);
});

test('старт задаёт границы челленджа и требует соперника', () => {
  const alone = makeChallenge();
  assert.equal(startChallenge(alone, '2026-09-01').ok, false);

  const challenge = makeChallenge(10);
  join(challenge, 2, 'Sergey');
  const started = startChallenge(challenge, '2026-09-01');
  assert.equal(started.ok, true);
  assert.equal(challenge.startDay, '2026-09-01');
  assert.equal(challenge.endDay, '2026-09-10');
  assert.equal(target(challenge), 500);
});

test('второй отчёт за тот же день не принимается', () => {
  const challenge = makeChallenge();
  join(challenge, 2, 'Sergey');
  startChallenge(challenge, '2026-09-01');

  assert.equal(report(challenge, 1, '2026-09-01', 50).ok, true);
  const second = report(challenge, 1, '2026-09-01', 30);
  assert.equal(second.ok, false);
  assert.match(second.ok ? '' : second.error, /одного отчёта в день/i);
  assert.equal(challenge.reports.length, 1);

  // На следующий день — можно снова.
  assert.equal(report(challenge, 1, '2026-09-02', 70).ok, true);
});

test('один и тот же скриншот второй раз не проходит', () => {
  const challenge = makeChallenge();
  join(challenge, 2, 'Sergey');
  startChallenge(challenge, '2026-09-01');

  const first = addReport({
    challenge, userId: 1, reps: 50, day: '2026-09-01',
    photoFileId: 'file', photoUniqueId: 'same-shot', now: NOW,
  });
  assert.equal(first.ok, true);

  // Вчерашний скриншот на следующий день не засчитывается.
  const repeat = addReport({
    challenge, userId: 1, reps: 50, day: '2026-09-02',
    photoFileId: 'file', photoUniqueId: 'same-shot', now: NOW,
  });
  assert.equal(repeat.ok, false);

  // И чужой скриншот тоже: в челлендже он уже был.
  const stolen = addReport({
    challenge, userId: 2, reps: 50, day: '2026-09-02',
    photoFileId: 'file', photoUniqueId: 'same-shot', now: NOW,
  });
  assert.equal(stolen.ok, false);
});

test('отчёт вне срока и от чужого не принимается', () => {
  const challenge = makeChallenge();
  join(challenge, 2, 'Sergey');
  startChallenge(challenge, '2026-09-01');

  assert.equal(report(challenge, 1, '2026-08-31', 50).ok, false);
  assert.equal(report(challenge, 1, '2026-09-11', 50).ok, false);
  assert.equal(report(challenge, 99, '2026-09-02', 50).ok, false);
  assert.equal(report(challenge, 1, '2026-09-02', 0).ok, false);
});

test('в день можно сделать больше нормы', () => {
  const challenge = makeChallenge(10, 50);
  join(challenge, 2, 'Sergey');
  startChallenge(challenge, '2026-09-01');
  assert.equal(report(challenge, 1, '2026-09-01', 200).ok, true);

  const rows = progress(challenge, '2026-09-01');
  const vlad = rows.find((row) => row.userId === 1);
  assert.equal(vlad?.total, 200);
  assert.equal(vlad?.percent, 200 / 500);
  assert.equal(vlad?.streak, 1);
});

test('итоги: финишеры, чемпион среди перевыполнивших и недобор', () => {
  const challenge = makeChallenge(2, 50); // цель 100
  join(challenge, 2, 'Sergey');
  join(challenge, 3, 'Юля');
  startChallenge(challenge, '2026-09-01');

  report(challenge, 1, '2026-09-01', 90);
  report(challenge, 1, '2026-09-02', 60); // 150 — перевыполнил
  report(challenge, 2, '2026-09-01', 50);
  report(challenge, 2, '2026-09-02', 70); // 120 — перевыполнил, но меньше
  report(challenge, 3, '2026-09-01', 30); // 30 — провал

  const results = finalize(challenge, new Date('2026-09-03T08:00:00Z'));
  const [first, second, third] = results.rows;

  assert.equal(first?.nickname, 'Vlad');
  assert.equal(first?.champion, true);
  assert.equal(first?.completed, true);
  assert.equal(first?.place, 1);

  assert.equal(second?.nickname, 'Sergey');
  assert.equal(second?.champion, false);
  assert.equal(second?.completed, true);

  assert.equal(third?.nickname, 'Юля');
  assert.equal(third?.completed, false);
  assert.equal(third?.deficit, 70);
  assert.equal(third?.place, 3);
});

test('ровно выполнивший план — финишер, но не чемпион', () => {
  const challenge = makeChallenge(2, 50);
  join(challenge, 2, 'Sergey');
  startChallenge(challenge, '2026-09-01');
  report(challenge, 1, '2026-09-01', 50);
  report(challenge, 1, '2026-09-02', 50);

  const results = finalize(challenge, NOW);
  const vlad = results.rows.find((row) => row.nickname === 'Vlad');
  assert.equal(vlad?.completed, true);
  assert.equal(vlad?.overachieved, false);
  assert.equal(vlad?.champion, false);
});

test('при равной сумме перевыполнившие делят звание чемпиона', () => {
  const challenge = makeChallenge(1, 50);
  join(challenge, 2, 'Sergey');
  startChallenge(challenge, '2026-09-01');
  report(challenge, 1, '2026-09-01', 80);
  report(challenge, 2, '2026-09-01', 80);

  const results = finalize(challenge, NOW);
  assert.deepEqual(results.rows.map((row) => row.champion), [true, true]);
  assert.deepEqual(results.rows.map((row) => row.place), [1, 1]);
});

test('челлендж считается законченным на следующий день после endDay', () => {
  const challenge = makeChallenge(3);
  join(challenge, 2, 'Sergey');
  startChallenge(challenge, '2026-09-01');
  assert.equal(isOver(challenge, '2026-09-03'), false);
  assert.equal(isOver(challenge, '2026-09-04'), true);
});
