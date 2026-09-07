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

/** Скриншот с одним днём — как будто участник прислал его в этот день. */
function отчёт(service: ChallengeService, code: string, userId: number, day: string, reps: number) {
  return service.submitScreenshot({
    code,
    userId,
    week: [{ weekday: new Date(`${day}T00:00:00Z`).getUTCDay(), reps }],
    weekStart: day,
    photoFileId: 'p',
  });
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

test('скриншот записывается в каждый челлендж и не удваивает день', async () => {
  const clock = new Clock('2026-09-01');
  const service = await makeService(clock);
  service.upsertUser(1, 1, 'Vlad');
  const first = создать(service, 1, 'Vlad1');
  const second = создать(service, 1, 'Vlad2');
  запустить(service, first, 2);
  запустить(service, second, 3);

  assert.equal(отчёт(service, first.id, 1, '2026-09-01', 10).ok, true);
  assert.equal(отчёт(service, second.id, 1, '2026-09-01', 12).ok, true);

  // Повторный скриншот того же дня не удваивает, а подтверждает значение.
  const repeat = отчёт(service, first.id, 1, '2026-09-01', 10);
  assert.equal(repeat.ok && repeat.value.summary.unchanged.length, 1);
  assert.equal(repeat.ok && repeat.value.summary.total, 10);

  // Исправленное значение заменяет прежнее.
  const corrected = отчёт(service, first.id, 1, '2026-09-01', 25);
  assert.equal(corrected.ok && corrected.value.summary.total, 25);
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
  отчёт(service, first.id, 1, '2026-09-01', 10);
  clock.set('2026-09-02');
  отчёт(service, second.id, 1, '2026-09-02', 10);
  clock.set('2026-09-03');
  const split = отчёт(service, first.id, 1, '2026-09-03', 10);
  assert.equal(split.ok && split.value.streak, 1);
  assert.deepEqual(split.ok && split.value.awarded, []);

  // А три дня подряд в одном челлендже — уже серия и бейдж.
  clock.set('2026-09-04');
  отчёт(service, first.id, 1, '2026-09-04', 10);
  clock.set('2026-09-05');
  const third = отчёт(service, first.id, 1, '2026-09-05', 10);
  assert.equal(third.ok && third.value.streak, 3);
  assert.deepEqual(third.ok && third.value.awarded, ['streak_3']);

  // Тот же бейдж второй раз не выдаётся, даже в другом челлендже.
  for (const day of ['2026-09-06', '2026-09-07', '2026-09-08']) {
    clock.set(day);
    const again = отчёт(service, second.id, 1, day, 10);
    assert.deepEqual(again.ok && again.value.awarded, []);
  }

  // Пропуск обнуляет серию.
  clock.set('2026-09-10');
  const afterGap = отчёт(service, first.id, 1, '2026-09-10', 10);
  assert.equal(afterGap.ok && afterGap.value.streak, 1);

  // Сводка для /badges: текущая серия — после пропуска снова 1, рекорд остаётся 3.
  assert.deepEqual(service.streaks(1), { current: 1, best: 3 });
});

test('один скриншот за неделю закрывает сразу несколько дней', async () => {
  const clock = new Clock('2026-09-06');
  const service = await makeService(clock);
  service.upsertUser(1, 1, 'Vlad');
  const challenge = создать(service, 1, 'Vlad', 14, 50);
  // Старт в понедельник этой недели.
  clock.set('2026-08-31');
  запустить(service, challenge, 2);
  clock.set('2026-09-06');

  // Скриншот вкладки Week: Пн 60, Ср 40, Сб 80 (0 — воскресенье).
  const result = service.submitScreenshot({
    code: challenge.id,
    userId: 1,
    week: [
      { weekday: 1, reps: 60 },
      { weekday: 3, reps: 40 },
      { weekday: 6, reps: 80 },
    ],
    weekStart: '2026-08-31',
    photoFileId: 'p',
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('нет результата');
  assert.deepEqual(result.value.summary.added.map((change) => change.day), [
    '2026-08-31',
    '2026-09-02',
    '2026-09-05',
  ]);
  assert.equal(result.value.summary.total, 180);

  // Та же неделя ещё раз: ничего не удвоилось.
  const again = service.submitScreenshot({
    code: challenge.id, userId: 1,
    week: [{ weekday: 1, reps: 60 }, { weekday: 3, reps: 40 }, { weekday: 6, reps: 80 }],
    weekStart: '2026-08-31', photoFileId: 'p',
  });
  assert.equal(again.ok && again.value.summary.total, 180);
  assert.equal(again.ok && again.value.summary.unchanged.length, 3);

  // Без заголовка периода дни ложатся на текущую неделю.
  const noHeader = service.submitScreenshot({
    code: challenge.id, userId: 1,
    week: [{ weekday: 5, reps: 30 }],
    weekStart: null, photoFileId: 'p',
  });
  assert.deepEqual(noHeader.ok && noHeader.value.summary.added.map((c) => c.day), ['2026-09-04']);
});

test('по истечении срока челлендж закрывается и раздаёт итоговые бейджи', async () => {
  const clock = new Clock('2026-09-01');
  const service = await makeService(clock);
  service.upsertUser(1, 1, 'Vlad');
  service.upsertUser(2, 2, 'Sergey');
  const challenge = создать(service, 1, 'Vlad', 2, 10); // цель 20
  запустить(service, challenge, 2);

  отчёт(service, challenge.id, 1, '2026-09-01', 15);
  отчёт(service, challenge.id, 2, '2026-09-01', 5);
  clock.set('2026-09-02');
  отчёт(service, challenge.id, 1, '2026-09-02', 15);

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
  отчёт(service, challenge.id, 1, '2026-09-01', 25);
  await service.save();

  const reopened = new Store(file);
  await reopened.load();
  const restored = new ChallengeService(reopened, { timezone: 'UTC', now: clock.now });
  const same = restored.challenge(challenge.id);
  assert.equal(same?.reports.length, 1);
  assert.equal(same?.reports[0]?.reps, 25);
  assert.equal(restored.user(1)?.displayName, 'Vlad');
});
