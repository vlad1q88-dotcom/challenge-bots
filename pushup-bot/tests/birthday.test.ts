import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { isBirthday, parseBirthday } from '../src/domain/dates.ts';
import { ChallengeService } from '../src/service.ts';
import { Store } from '../src/storage/store.ts';
import type { Challenge } from '../src/types.ts';

test('дата рождения разбирается в разных написаниях', () => {
  assert.equal(parseBirthday('16.09'), '09-16');
  assert.equal(parseBirthday('16.09.1990'), '09-16');
  assert.equal(parseBirthday('16/9'), '09-16');
  assert.equal(parseBirthday(' 16 сентября '), '09-16');
  assert.equal(parseBirthday('29.02'), '02-29');
  assert.equal(parseBirthday('31.02'), null);
  assert.equal(parseBirthday('16.13'), null);
  assert.equal(parseBirthday('завтра'), null);
});

test('день челленджа сверяется с днём рождения', () => {
  assert.equal(isBirthday('2026-09-16', '09-16'), true);
  assert.equal(isBirthday('2027-09-16', '09-16'), true);
  assert.equal(isBirthday('2026-09-17', '09-16'), false);
  assert.equal(isBirthday('2026-09-16', undefined), false);
});

class Clock {
  #day: string;
  constructor(day: string) { this.#day = day; }
  set(day: string): void { this.#day = day; }
  now = (): Date => new Date(`${this.#day}T12:00:00Z`);
}

async function setup(clock: Clock): Promise<{ service: ChallengeService; challenge: Challenge }> {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'bday-')), 'db.json'));
  await store.load();
  const service = new ChallengeService(store, { timezone: 'UTC', now: clock.now });
  service.upsertUser(1, 1, 'Именинник');
  service.upsertUser(2, 2, 'Соперник');
  const created = service.create({ ownerId: 1, title: 'Тест', days: 30, dailyGoal: 60, nickname: 'Vlad' });
  if (!created.ok) throw new Error(created.error);
  service.join(created.value.id, 2, 'Rival');
  service.start(created.value.id, 1);
  return { service, challenge: created.value };
}

function report(service: ChallengeService, code: string, userId: number, day: string, reps: number) {
  return service.submitScreenshot({
    code, userId,
    week: [{ weekday: new Date(`${day}T00:00:00Z`).getUTCDay(), reps }],
    weekStart: day, photoFileId: 'p',
  });
}

test('норма в день рождения даёт бейдж 🎂', async () => {
  const clock = new Clock('2026-09-16');
  const { service, challenge } = await setup(clock);
  assert.equal(service.setBirthday(1, '16.09').ok, true);

  const result = report(service, challenge.id, 1, '2026-09-16', 60);
  assert.equal(result.ok && result.value.awarded.includes('birthday'), true);

  // Второй раз в том же челлендже торт не повторяется.
  const again = report(service, challenge.id, 1, '2026-09-16', 70);
  assert.equal(again.ok && again.value.awarded.includes('birthday'), false);

  // На борде торт стоит первым, до медалей за серии.
  assert.deepEqual(service.badgeCodes(1, challenge)[0], 'birthday');
});

test('недобор нормы в день рождения бейджа не даёт', async () => {
  const clock = new Clock('2026-09-16');
  const { service, challenge } = await setup(clock);
  service.setBirthday(1, '16.09');

  const short = report(service, challenge.id, 1, '2026-09-16', 45);
  assert.equal(short.ok && short.value.awarded.includes('birthday'), false);

  // Дожал до нормы и прислал скриншот снова — теперь торт заслужен.
  const full = report(service, challenge.id, 1, '2026-09-16', 60);
  assert.equal(full.ok && full.value.awarded.includes('birthday'), true);
});

test('дату можно указать задним числом: помогает повторный скриншот', async () => {
  const clock = new Clock('2026-09-16');
  const { service, challenge } = await setup(clock);

  // Сначала отчитался, дня рождения бот ещё не знал.
  const before = report(service, challenge.id, 1, '2026-09-16', 60);
  assert.equal(before.ok && before.value.awarded.includes('birthday'), false);

  service.setBirthday(1, '16.09');
  // Тот же скриншот ещё раз: день не изменился, но торт выдаётся.
  const after = report(service, challenge.id, 1, '2026-09-16', 60);
  assert.equal(after.ok && after.value.summary.unchanged.length, 1);
  assert.equal(after.ok && after.value.awarded.includes('birthday'), true);
});

test('инициатор ставит дату участнику, и торт прилетает сразу', async () => {
  const clock = new Clock('2026-09-16');
  const { service, challenge } = await setup(clock);

  // Соперник уже отчитался за свой день рождения, но бот о дате не знал.
  report(service, challenge.id, 2, '2026-09-16', 75);
  assert.deepEqual(service.user(2)?.badges.map((badge) => badge.code), []);

  const result = service.setBirthdayFor(1, challenge.id, 'Rival', '16.09');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.birthday, '09-16');
  assert.deepEqual(result.value.awarded, ['birthday']);
  assert.equal(service.user(2)?.birthday, '09-16');
  assert.deepEqual(service.badgeCodes(2, challenge)[0], 'birthday');

  // Повторно тот же бейдж не выдаётся, и бот об этом знает.
  const again = service.setBirthdayFor(1, challenge.id, 'Rival', '16.09');
  assert.deepEqual(again.ok && again.value.awarded, []);
  assert.equal(again.ok && again.value.already, true);
});

test('если норма ещё не выполнена, торт ждёт отчёта', async () => {
  const clock = new Clock('2026-09-16');
  const { service, challenge } = await setup(clock);
  report(service, challenge.id, 2, '2026-09-16', 30); // норма 60

  const result = service.setBirthdayFor(1, challenge.id, 'Rival', '16.09');
  assert.deepEqual(result.ok && result.value.awarded, []);

  // Дожал норму — бейдж пришёл вместе с отчётом.
  const done = report(service, challenge.id, 2, '2026-09-16', 60);
  assert.equal(done.ok && done.value.awarded.includes('birthday'), true);
});

test('чужую дату ставит только инициатор и только своему участнику', async () => {
  const clock = new Clock('2026-09-16');
  const { service, challenge } = await setup(clock);

  // Не инициатор.
  assert.equal(service.setBirthdayFor(2, challenge.id, 'Vlad', '16.09').ok, false);
  // Неизвестный ник.
  const unknown = service.setBirthdayFor(1, challenge.id, 'Петя', '16.09');
  assert.equal(unknown.ok, false);
  assert.match(unknown.ok ? '' : unknown.error, /нет участника/);
  // Кривая дата.
  assert.equal(service.setBirthdayFor(1, challenge.id, 'Rival', '31.02').ok, false);
});

test('у соперника без дня рождения торта нет', async () => {
  const clock = new Clock('2026-09-16');
  const { service, challenge } = await setup(clock);
  const result = report(service, challenge.id, 2, '2026-09-16', 90);
  assert.equal(result.ok && result.value.awarded.includes('birthday'), false);
  assert.deepEqual(service.badgeCodes(2, challenge), []);
});
