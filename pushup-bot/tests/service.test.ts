import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ChallengeService } from '../src/service.ts';
import { Store } from '../src/storage/store.ts';
import type { Challenge } from '../src/types.ts';

class Clock {
  #day: string;
  constructor(day: string) {
    this.#day = day;
  }
  set(day: string): void {
    this.#day = day;
  }
  now = (): Date => new Date(`${this.#day}T12:00:00Z`);
}

async function makeService(clock: Clock): Promise<ChallengeService> {
  const directory = mkdtempSync(join(tmpdir(), 'pushup-bot-'));
  const store = new Store(join(directory, 'db.json'));
  await store.load();
  return new ChallengeService(store, { timezone: 'UTC', now: clock.now });
}

function создать(service: ChallengeService, ownerId: number, nickname: string, days = 5, goal = 10): Challenge {
  const created = service.create({ ownerId, title: `Челлендж ${nickname}`, days, dailyGoal: goal, nickname });
  if (!created.ok) throw new Error(created.error);
  return created.value;
}

function запустить(service: ChallengeService, challenge: Challenge, rivalId: number): void {
  const joined = service.join(challenge.id, rivalId, `rival${rivalId}`);
  assert.equal(joined.ok, true, joined.ok ? '' : joined.error);
  const started = service.start(challenge.id, challenge.ownerId);
  assert.equal(started.ok, true, started.ok ? '' : started.error);
}

test('одновременно не больше трёх лидер-бордов', async () => {
  const clock = new Clock('2026-09-01');
  const service = await makeService(clock);
  service.upsertUser(1, 1, 'Vlad');

  const first = создать(service, 1, 'Vlad1');
  const second = создать(service, 1, 'Vlad2');
  const third = создать(service, 1, 'Vlad3');
  assert.deepEqual([first.colorIndex, second.colorIndex, third.colorIndex], [0, 1, 2]);

  const fourth = service.create({ ownerId: 1, title: 'Ещё', days: 5, dailyGoal: 10, nickname: 'Vlad4' });
  assert.equal(fourth.ok, false);

  // Чужой вызов тоже не принять, пока слоты заняты.
  const foreign = создать(service, 2, 'Sergey');
  const joined = service.join(foreign.id, 1, 'Vlad5');
  assert.equal(joined.ok, false);

  // Освободили слот — цвет переиспользуется.
  assert.equal(service.cancel(second.id, 1).ok, true);
  const replacement = создать(service, 1, 'Vlad6');
  assert.equal(replacement.colorIndex, 1);
});

test('в один день можно отчитаться в каждый челлендж, но только один раз', async () => {
  const clock = new Clock('2026-09-01');
  const service = await makeService(clock);
  service.upsertUser(1, 1, 'Vlad');
  const first = создать(service, 1, 'Vlad1');
  const second = создать(service, 1, 'Vlad2');
  запустить(service, first, 2);
  запустить(service, second, 3);

  assert.equal(service.submitReport({ code: first.id, userId: 1, reps: 10, photoFileId: 'p' }).ok, true);
  assert.equal(service.submitReport({ code: second.id, userId: 1, reps: 12, photoFileId: 'p' }).ok, true);
  assert.equal(service.submitReport({ code: first.id, userId: 1, reps: 5, photoFileId: 'p' }).ok, false);
});

test('серия считается внутри челленджа и не собирается из разных', async () => {
  const clock = new Clock('2026-09-01');
  const service = await makeService(clock);
  service.upsertUser(1, 1, 'Vlad');
  const first = создать(service, 1, 'Vlad1', 10);
  const second = создать(service, 1, 'Vlad2', 10);
  запустить(service, first, 2);
  запустить(service, second, 3);

  // Три дня подряд, но по очереди в разные челленджи — серии не выходит.
  service.submitReport({ code: first.id, userId: 1, reps: 10, photoFileId: 'p' });
  clock.set('2026-09-02');
  service.submitReport({ code: second.id, userId: 1, reps: 10, photoFileId: 'p' });
  clock.set('2026-09-03');
  const split = service.submitReport({ code: first.id, userId: 1, reps: 10, photoFileId: 'p' });
  assert.equal(split.ok && split.value.streak, 1);
  assert.deepEqual(split.ok && split.value.awarded, []);

  // А три дня подряд в одном челлендже — уже серия и бейдж.
  clock.set('2026-09-04');
  service.submitReport({ code: first.id, userId: 1, reps: 10, photoFileId: 'p' });
  clock.set('2026-09-05');
  const third = service.submitReport({ code: first.id, userId: 1, reps: 10, photoFileId: 'p' });
  assert.equal(third.ok && third.value.streak, 3);
  assert.deepEqual(third.ok && third.value.awarded, ['streak_3']);

  // Тот же бейдж второй раз не выдаётся, даже в другом челлендже.
  for (const day of ['2026-09-06', '2026-09-07', '2026-09-08']) {
    clock.set(day);
    const again = service.submitReport({ code: second.id, userId: 1, reps: 10, photoFileId: 'p' });
    assert.deepEqual(again.ok && again.value.awarded, []);
  }

  // Пропуск обнуляет серию.
  clock.set('2026-09-10');
  const afterGap = service.submitReport({ code: first.id, userId: 1, reps: 10, photoFileId: 'p' });
  assert.equal(afterGap.ok && afterGap.value.streak, 1);

  // Сводка для /badges: текущая серия — после пропуска снова 1, рекорд остаётся 3.
  assert.deepEqual(service.streaks(1), { current: 1, best: 3 });
});

test('по истечении срока челлендж закрывается и раздаёт итоговые бейджи', async () => {
  const clock = new Clock('2026-09-01');
  const service = await makeService(clock);
  service.upsertUser(1, 1, 'Vlad');
  service.upsertUser(2, 2, 'Sergey');
  const challenge = создать(service, 1, 'Vlad', 2, 10); // цель 20
  запустить(service, challenge, 2);

  service.submitReport({ code: challenge.id, userId: 1, reps: 15, photoFileId: 'p' });
  service.submitReport({ code: challenge.id, userId: 2, reps: 5, photoFileId: 'p' });
  clock.set('2026-09-02');
  service.submitReport({ code: challenge.id, userId: 1, reps: 15, photoFileId: 'p' });

  assert.deepEqual(service.finishDue(), []);

  clock.set('2026-09-03');
  const finished = service.finishDue();
  assert.equal(finished.length, 1);
  assert.equal(challenge.status, 'finished');

  const winner = challenge.results?.rows.find((row) => row.userId === 1);
  const loser = challenge.results?.rows.find((row) => row.userId === 2);
  assert.equal(winner?.champion, true);
  assert.equal(loser?.deficit, 15);
  assert.deepEqual(finished[0]?.awards.get(1), ['finisher', 'champion']);
  assert.deepEqual(finished[0]?.awards.get(2), ['loser']);

  // Слот освободился.
  assert.equal(service.freeSlots(1), 3);
  // Второй проход ничего не закрывает повторно.
  assert.deepEqual(service.finishDue(), []);
});

test('данные переживают перезапуск', async () => {
  const clock = new Clock('2026-09-01');
  const directory = mkdtempSync(join(tmpdir(), 'pushup-bot-'));
  const file = join(directory, 'db.json');

  const store = new Store(file);
  await store.load();
  const service = new ChallengeService(store, { timezone: 'UTC', now: clock.now });
  service.upsertUser(1, 1, 'Vlad');
  const challenge = создать(service, 1, 'Vlad');
  запустить(service, challenge, 2);
  service.submitReport({ code: challenge.id, userId: 1, reps: 25, photoFileId: 'p' });
  await service.save();

  const reopened = new Store(file);
  await reopened.load();
  const restored = new ChallengeService(reopened, { timezone: 'UTC', now: clock.now });
  const same = restored.challenge(challenge.id);
  assert.equal(same?.reports.length, 1);
  assert.equal(same?.reports[0]?.reps, 25);
  assert.equal(restored.user(1)?.displayName, 'Vlad');
});
