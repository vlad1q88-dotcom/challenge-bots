import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ChallengeService } from '../src/service.ts';
import { Store } from '../src/storage/store.ts';

async function makeService(): Promise<ChallengeService> {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'pushup-tz-')), 'db.json'));
  await store.load();
  return new ChallengeService(store, { timezone: 'Asia/Almaty', now: () => new Date('2026-09-05T19:30:00Z') });
}

test('инициатор меняет часовой пояс челленджа до старта', async () => {
  const service = await makeService();
  service.upsertUser(1, 1, 'Vlad');
  const created = service.create({ ownerId: 1, title: 'Тест', days: 5, dailyGoal: 10, nickname: 'Vlad' });
  if (!created.ok) throw new Error(created.error);
  const challenge = created.value;
  assert.equal(challenge.timezone, 'Asia/Almaty');

  // 19:30 UTC — в Алматы уже следующий день, в Москве ещё нет.
  assert.equal(service.today('Asia/Almaty'), '2026-09-06');
  assert.equal(service.today('Europe/Moscow'), '2026-09-05');

  assert.equal(service.setTimezone(challenge.id, 1, 'Europe/Moscow').ok, true);
  assert.equal(challenge.timezone, 'Europe/Moscow');

  // Чужой пояс не поменяет, выдуманный не пройдёт.
  assert.equal(service.setTimezone(challenge.id, 2, 'Asia/Almaty').ok, false);
  assert.equal(service.setTimezone(challenge.id, 1, 'Марс/Олимп').ok, false);

  // После старта — уже нельзя.
  assert.equal(service.join(challenge.id, 2, 'Sergey').ok, true);
  assert.equal(service.start(challenge.id, 1).ok, true);
  const late = service.setTimezone(challenge.id, 1, 'Asia/Almaty');
  assert.equal(late.ok, false);
  assert.match(late.ok ? '' : late.error, /до старта/);
});
