import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createChallenge, joinChallenge } from '../src/domain/challenge.ts';
import { inviteText } from '../src/telegram/invite.ts';
import type { Challenge } from '../src/types.ts';

const NOW = new Date('2026-09-05T08:00:00Z');

function sample(): Challenge {
  const created = createChallenge({
    id: 'K7QM3P', title: 'Сентябрьские отжимания', ownerId: 1, ownerNickname: 'Vlad',
    dailyGoal: 60, days: 30, timezone: 'Asia/Almaty', colorIndex: 0, now: NOW,
  });
  if (!created.ok) throw new Error(created.error);
  joinChallenge(created.value, 2, 'Максимка', NOW);
  return created.value;
}

test('текст вызова содержит условия и ссылку-приглашение', () => {
  const text = inviteText(sample(), 'pushup_bot', 4);
  assert.match(text, /Сентябрьские отжимания/);
  assert.match(text, /60 отжиманий каждый день/);
  assert.match(text, /30 дней подряд/);
  assert.match(text, /1800 отжиманий/);
  assert.match(text, /Участников: 2 из 6 \(свободно 4\)/);
  assert.match(text, /Один скриншот в день/);
  assert.match(text, /https:\/\/t\.me\/pushup_bot\?start=join_K7QM3P/);
  assert.match(text, /\/join K7QM3P/);
  // Пересылается как обычный текст: разметка не нужна.
  assert.ok(!text.includes('<b>'));
});

test('когда мест нет, это видно в приглашении', () => {
  assert.match(inviteText(sample(), 'pushup_bot', 0), /мест нет/);
});
