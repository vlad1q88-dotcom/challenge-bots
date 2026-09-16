import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Bot } from 'grammy';
import type { OcrEngine } from '../src/ocr/engine.ts';
import { ChallengeService } from '../src/service.ts';
import { Store } from '../src/storage/store.ts';
import { wire } from '../src/telegram/bot.ts';

/** Поднимает бота с поддельным API: сообщения складываем в массив. */
async function harness() {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'join-')), 'db.json'));
  await store.load();
  const service = new ChallengeService(store, { timezone: 'UTC', now: () => new Date('2026-09-16T10:00:00Z') });
  const ocr: OcrEngine = { async read() { throw new Error('не нужен'); }, async close() {} };

  const bot = new Bot('1:fake');
  // Поля botInfo меняются от версии к версии Bot API, в тесте важен только username.
  bot.botInfo = { id: 1, is_bot: true, first_name: 'B', username: 'pushup_bot' } as typeof bot.botInfo;
  const sent: { chatId: number; text: string }[] = [];
  bot.api.config.use(async (_prev, method, payload: Record<string, unknown>) => {
    const text = (payload.text ?? payload.caption ?? '') as string;
    if (method !== 'deleteMessage' && text) sent.push({ chatId: payload.chat_id as number, text });
    return { ok: true, result: { message_id: 1, date: 0, chat: { id: 0, type: 'private' } } } as never;
  });
  wire(bot, service, { ocr });

  let update = 0;
  async function say(userId: number, text: string): Promise<void> {
    update += 1;
    const entities = text.startsWith('/')
      ? [{ type: 'bot_command' as const, offset: 0, length: text.split(' ')[0]!.length }]
      : undefined;
    await bot.handleUpdate({
      update_id: update,
      message: {
        message_id: update, date: 0, chat: { id: userId, type: 'private' },
        from: { id: userId, is_bot: false, first_name: `U${userId}` }, text, entities,
      },
    } as never);
  }
  const lastTo = (userId: number): string => sent.filter((item) => item.chatId === userId).at(-1)?.text ?? '';
  return { service, say, lastTo, sent };
}

async function createChallenge(say: (userId: number, text: string) => Promise<void>): Promise<void> {
  await say(1, '/new');
  await say(1, 'Тест');
  await say(1, '30');
  await say(1, '60');
  await say(1, 'Vlad');
}

test('дата рождения — обязательный шаг: вызов принят только после неё', async () => {
  const { service, say, lastTo } = await harness();
  await createChallenge(say);
  await say(1, '16.09');
  const code = service.challengesOf(1)[0]!.id;

  await say(2, `/join ${code}`);
  await say(2, 'Максимка');
  assert.match(lastTo(2), /день рождения/i);
  // Участника ещё нет: сначала дата.
  assert.equal(service.challenge(code)?.participants.length, 1);

  await say(2, '3 марта');
  assert.match(lastTo(2), /Вызов принят/);
  assert.equal(service.user(2)?.birthday, '03-03');
  assert.equal(service.challenge(code)?.participants.length, 2);
});

test('непонятная дата переспрашивается, вступление ждёт', async () => {
  const { service, say, lastTo } = await harness();
  await createChallenge(say);
  await say(1, '16.09');
  const code = service.challengesOf(1)[0]!.id;

  await say(3, `/join ${code}`);
  await say(3, 'Гоша');
  await say(3, 'потом как-нибудь');
  assert.match(lastTo(3), /Нужен день и месяц/);
  assert.equal(service.challenge(code)?.participants.length, 1);

  await say(3, '01.12');
  assert.match(lastTo(3), /Вызов принят/);
  assert.equal(service.challenge(code)?.participants.some((item) => item.nickname === 'Гоша'), true);
});

test('у кого дата уже есть, тот вступает сразу после ника', async () => {
  const { service, say, sent } = await harness();
  await createChallenge(say);
  await say(1, '16.09');
  const code = service.challengesOf(1)[0]!.id;

  // Второй участник указал дату в первом челлендже.
  await say(2, `/join ${code}`);
  await say(2, 'Максимка');
  await say(2, '03.03');

  sent.length = 0;
  await say(2, '/new');
  await say(2, 'Второй');
  await say(2, '10');
  await say(2, '30');
  await say(2, 'Макс2');
  // Дату не переспрашивают, челлендж создаётся сразу после ника.
  assert.equal(sent.some((item) => /день рождения/i.test(item.text)), false);
  assert.equal(service.challengesOf(2).length, 2);
});

test('создание челленджа тоже требует дату', async () => {
  const { service, say, lastTo } = await harness();
  await createChallenge(say);
  assert.match(lastTo(1), /день рождения/i);
  // Челлендж ещё не создан.
  assert.equal(service.challengesOf(1).length, 0);

  await say(1, '16.09');
  assert.equal(service.challengesOf(1).length, 1);
  assert.equal(service.user(1)?.birthday, '09-16');
});
