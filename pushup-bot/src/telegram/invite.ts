import { MAX_PARTICIPANTS } from '../constants.ts';
import { target } from '../domain/challenge.ts';
import { days as daysRu } from '../domain/plural.ts';
import type { Challenge } from '../types.ts';

/**
 * Готовый текст вызова: отправляется отдельным сообщением, чтобы его можно было
 * переслать друзьям как есть. Без HTML — так он копируется и пересылается чисто.
 */
export function inviteText(challenge: Challenge, botUsername: string, freeSeats: number): string {
  const link = `https://t.me/${botUsername}?start=join_${challenge.id}`;
  return [
    `🔥 Вызов: «${challenge.title}»`,
    '',
    `💪 ${challenge.dailyGoal} отжиманий каждый день`,
    `📅 ${daysRu(challenge.days)} подряд`,
    `🎯 Цель за челлендж: ${target(challenge)} отжиманий`,
    `👥 Участников: ${challenge.participants.length} из ${MAX_PARTICIPANTS}` +
      (freeSeats > 0 ? ` (свободно ${freeSeats})` : ' (мест нет)'),
    '',
    'Как это работает: присылаешь боту скриншот вкладки Week из приложения —',
    'он сам считывает результаты по всем дням недели. Слать можно хоть каждый день,',
    'хоть раз в неделю: повторная отправка ничего не удваивает.',
    'У каждого свой столбик на общем графике, сразу видно, кто отстаёт.',
    '',
    `Принять вызов: ${link}`,
    `Если ссылка не открылась — напиши боту: /join ${challenge.id}`,
  ].join('\n');
}
