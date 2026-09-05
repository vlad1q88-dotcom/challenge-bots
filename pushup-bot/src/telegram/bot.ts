import type { Bot, Context } from 'grammy';
import { InlineKeyboard, InputFile } from 'grammy';
import { MAX_ACTIVE_BOARDS, MAX_PARTICIPANTS, BOARD_COLORS } from '../constants.ts';
import { BADGES, badgeMeta } from '../domain/badges.ts';
import {
  currentDayNumber,
  hasReportOn,
  isParticipant,
  nicknameOf,
  target,
  totalReps,
  validateDailyGoal,
  validateDays,
} from '../domain/challenge.ts';
import { checkNickname } from '../domain/nickname.ts';
import { bestStreak, currentStreak } from '../domain/streaks.ts';
import { days as daysRu } from '../domain/plural.ts';
import { createOcrEngine, type OcrEngine } from '../ocr/engine.ts';
import { FAILURE_HINTS, readDailyReps } from '../ocr/screenshot.ts';
import { renderBadgeCard, type BadgeCardRow } from '../render/badges.ts';
import { renderBoard } from '../render/leaderboard.ts';
import { boardCaption, buildBoardView, escapeHtml } from '../render/view.ts';
import type { ChallengeService, FinishedChallenge } from '../service.ts';
import { inviteText } from './invite.ts';
import type { BadgeCode, Challenge } from '../types.ts';
import { HELP, RULES } from './texts.ts';

type Session =
  | { kind: 'new'; step: 'title' | 'days' | 'goal' | 'nick'; title?: string; days?: number; goal?: number }
  | { kind: 'join'; step: 'code' | 'nick'; code?: string }
  | { kind: 'nick'; code: string };

/** Распознанный отчёт, который ждёт выбора челленджа. */
interface PendingReport {
  reps: number;
  photoFileId: string;
  photoUniqueId: string;
  codes: string[];
}

export interface WireOptions {
  /** Движок распознавания; в тестах подменяется заглушкой. */
  ocr?: OcrEngine;
}

export function wire(bot: Bot, service: ChallengeService, options: WireOptions = {}): void {
  const sessions = new Map<number, Session>();
  const pendingReports = new Map<number, PendingReport>();
  const ocr = options.ocr ?? createOcrEngine();

  // --- вспомогательное --------------------------------------------------

  function userId(ctx: Context): number {
    const id = ctx.from?.id;
    if (id === undefined) throw new Error('Сообщение без отправителя');
    return id;
  }

  function remember(ctx: Context): void {
    const from = ctx.from;
    const chatId = ctx.chat?.id;
    if (!from || chatId === undefined) return;
    const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || `id${from.id}`;
    service.upsertUser(from.id, chatId, name);
  }

  async function sendBoardTo(chatId: number, challenge: Challenge, note?: string): Promise<void> {
    const today = service.today(challenge.timezone);
    const png = renderBoard(
      buildBoardView(challenge, today, (id) => service.user(id)?.badges.map((badge) => badge.code) ?? []),
    );
    const caption = [note, boardCaption(challenge, today)].filter(Boolean).join('\n\n');
    await bot.api.sendPhoto(chatId, new InputFile(png, `board-${challenge.id}.png`), {
      caption: caption.slice(0, 1024),
      parse_mode: 'HTML',
    });
  }

  async function broadcastBoard(challenge: Challenge, note: string, skipUserId?: number): Promise<void> {
    for (const participant of challenge.participants) {
      if (participant.userId === skipUserId) continue;
      const chatId = service.user(participant.userId)?.chatId;
      if (chatId === undefined) continue;
      try {
        await sendBoardTo(chatId, challenge, note);
      } catch (error) {
        console.error(`Не удалось отправить борд участнику ${participant.userId}:`, error);
      }
    }
  }

  async function broadcastText(challenge: Challenge, text: string, skipUserId?: number): Promise<void> {
    for (const participant of challenge.participants) {
      if (participant.userId === skipUserId) continue;
      const chatId = service.user(participant.userId)?.chatId;
      if (chatId === undefined) continue;
      try {
        await bot.api.sendMessage(chatId, text, { parse_mode: 'HTML' });
      } catch (error) {
        console.error(`Не удалось отправить сообщение участнику ${participant.userId}:`, error);
      }
    }
  }

  function badgeLine(codes: readonly BadgeCode[]): string {
    if (codes.length === 0) return '';
    const list = codes.map((code) => {
      const meta = badgeMeta(code);
      return `${meta.icon} ${meta.title}`;
    });
    return `\n\n🏅 Новый бейдж: ${list.join(', ')}`;
  }

  function describeChallenge(challenge: Challenge, viewerId: number): string {
    const color = BOARD_COLORS[challenge.colorIndex % BOARD_COLORS.length] ?? BOARD_COLORS[0];
    const today = service.today(challenge.timezone);
    const nick = nicknameOf(challenge, viewerId) ?? '—';
    const head = `<b>${escapeHtml(challenge.title)}</b> · <code>${challenge.id}</code> · ${color.name}`;
    if (challenge.status === 'open') {
      return (
        `${head}\nНабор: ${challenge.participants.length}/${MAX_PARTICIPANTS} · ник ${escapeHtml(nick)}` +
        `\nПояс: ${challenge.timezone} · приглашение: /invite ${challenge.id}` +
        `\nЗапуск: /begin ${challenge.id}`
      );
    }
    if (challenge.status === 'active') {
      const done = totalReps(challenge, viewerId);
      const goal = target(challenge);
      return (
        `${head}\nДень ${currentDayNumber(challenge, today)} из ${challenge.days} · ` +
        `${done}/${goal} (${Math.round((done / goal) * 100)}%) · ник ${escapeHtml(nick)}` +
        (hasReportOn(challenge, viewerId, today) ? '\n✅ отчёт за сегодня принят' : '\n⏳ отчёта за сегодня нет')
      );
    }
    const row = challenge.results?.rows.find((item) => item.userId === viewerId);
    const verdict = row
      ? row.champion
        ? `🏆 чемпион, ${row.total}`
        : row.completed
          ? `🎖 выполнено, ${row.total}`
          : `💀 не хватило ${row.deficit}`
      : '—';
    return `${head}\n${challenge.status === 'finished' ? 'Завершён' : 'Отменён'} · ${verdict}`;
  }

  function pickKeyboard(prefix: string, challenges: readonly Challenge[]): InlineKeyboard {
    const keyboard = new InlineKeyboard();
    for (const challenge of challenges) {
      keyboard.text(`${challenge.title} (${challenge.id})`, `${prefix}:${challenge.id}`).row();
    }
    return keyboard;
  }

  /** Достаёт челлендж по коду из аргумента команды или по единственному подходящему. */
  function resolveChallenge(
    ctx: Context,
    argument: string,
    candidates: readonly Challenge[],
  ): { challenge?: Challenge; error?: string } {
    const code = argument.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
    if (code) {
      const challenge = service.challenge(code);
      if (!challenge) return { error: 'Челлендж с таким кодом не найден.' };
      if (!isParticipant(challenge, userId(ctx))) return { error: 'Ты не участвуешь в этом челлендже.' };
      return { challenge };
    }
    if (candidates.length === 1) return { challenge: candidates[0] };
    if (candidates.length === 0) return { error: 'Подходящих челленджей нет.' };
    return {};
  }

  async function submitReport(
    ctx: Context,
    code: string,
    reps: number,
    photo: { fileId: string; uniqueId: string },
  ): Promise<void> {
    const id = userId(ctx);
    const outcome = service.submitReport({
      code,
      userId: id,
      reps,
      photoFileId: photo.fileId,
      photoUniqueId: photo.uniqueId,
    });
    if (!outcome.ok) {
      await ctx.reply(outcome.error);
      return;
    }
    await service.save();

    const { challenge, streak, awarded } = outcome.value;
    const today = service.today(challenge.timezone);
    const nick = nicknameOf(challenge, id) ?? 'ты';
    const done = totalReps(challenge, id);
    const goal = target(challenge);
    const left = Math.max(goal - done, 0);

    const note =
      `✅ Отчёт принят: <b>${reps}</b> отжиманий.\n` +
      `Всего ${done} из ${goal}` +
      (left > 0 ? ` · осталось ${left}` : ' · план выполнен 🎉') +
      `\nСерия: ${daysRu(streak)} подряд` +
      badgeLine(awarded);

    await sendBoardTo(ctx.chat?.id ?? id, challenge, note);
    await broadcastBoard(
      challenge,
      `📣 <b>${escapeHtml(nick)}</b>: +${reps} (всего ${done} из ${goal}), день ${currentDayNumber(challenge, today)} из ${challenge.days}`,
      id,
    );
  }

  async function announceFinished(finished: readonly FinishedChallenge[]): Promise<void> {
    for (const item of finished) {
      const { challenge, awards } = item;
      for (const participant of challenge.participants) {
        const chatId = service.user(participant.userId)?.chatId;
        if (chatId === undefined) continue;
        const codes = awards.get(participant.userId) ?? [];
        try {
          await sendBoardTo(chatId, challenge, `🏁 <b>Челлендж завершён!</b>${badgeLine(codes)}`);
        } catch (error) {
          console.error(`Не удалось отправить итоги участнику ${participant.userId}:`, error);
        }
      }
    }
  }

  // --- команды ----------------------------------------------------------

  bot.command(['start', 'help'], async (ctx) => {
    remember(ctx);
    await service.save();
    // Переход по ссылке-приглашению: t.me/бот?start=join_КОД
    const payload = (ctx.match ?? '').trim();
    if (payload.toLowerCase().startsWith('join_')) {
      await startJoin(ctx, payload.slice(5).toUpperCase());
      return;
    }
    await ctx.reply(HELP, { parse_mode: 'HTML' });
  });

  /** Отдельным сообщением — чтобы переслать друзьям как есть. */
  async function sendInvite(ctx: Context, challenge: Challenge): Promise<void> {
    const username = ctx.me.username;
    await ctx.reply('👇 Перешли это сообщение соперникам:');
    await ctx.reply(inviteText(challenge, username, service.freeSeats(challenge)), {
      link_preview_options: { is_disabled: true },
    });
  }

  bot.command('invite', async (ctx) => {
    remember(ctx);
    const id = userId(ctx);
    const open = service.challengesOf(id).filter((challenge) => challenge.status === 'open');
    const resolved = resolveChallenge(ctx, ctx.match ?? '', open);
    if (resolved.error) {
      await ctx.reply(resolved.error);
      return;
    }
    if (!resolved.challenge) {
      await ctx.reply('К какому челленджу приглашение?', { reply_markup: pickKeyboard('inv', open) });
      return;
    }
    await sendInvite(ctx, resolved.challenge);
  });

  bot.command('tz', async (ctx) => {
    remember(ctx);
    const id = userId(ctx);
    const parts = (ctx.match ?? '').trim().split(/\s+/).filter(Boolean);
    const open = service.challengesOf(id).filter(
      (challenge) => challenge.status === 'open' && challenge.ownerId === id,
    );
    if (parts.length < 2) {
      const current = open.map((challenge) => `<code>${challenge.id}</code> — ${challenge.timezone}`);
      await ctx.reply(
        (current.length > 0 ? `Часовой пояс челленджей:\n${current.join('\n')}\n\n` : '') +
          'Сменить: <code>/tz КОД Asia/Almaty</code>\n' +
          'По этому поясу считается граница дня — до старта его ещё можно поменять.',
        { parse_mode: 'HTML' },
      );
      return;
    }
    const changed = service.setTimezone(parts[0]!.toUpperCase(), id, parts[1]!);
    if (!changed.ok) {
      await ctx.reply(changed.error);
      return;
    }
    await service.save();
    await ctx.reply(
      `Готово: день челленджа «${escapeHtml(changed.value.title)}» теперь считается по ${changed.value.timezone}. ` +
        `Сейчас там ${service.today(changed.value.timezone).split('-').reverse().join('.')}.`,
      { parse_mode: 'HTML' },
    );
  });

  bot.command('rules', async (ctx) => {
    remember(ctx);
    await ctx.reply(RULES, { parse_mode: 'HTML' });
  });

  bot.command('cancel', async (ctx) => {
    sessions.delete(userId(ctx));
    await ctx.reply('Ок, отменил. Что дальше — /help');
  });

  bot.command('new', async (ctx) => {
    remember(ctx);
    const free = service.freeSlots(userId(ctx));
    if (free === 0) {
      await ctx.reply(
        `У тебя уже ${MAX_ACTIVE_BOARDS} лидер-борда — это максимум. ` +
          'Дождись завершения одного из них или отмени: /boards',
      );
      return;
    }
    sessions.set(userId(ctx), { kind: 'new', step: 'title' });
    await ctx.reply(
      'Бросаем вызов! Как назовём челлендж?\n' +
        'Напиши название (или «-», чтобы взять стандартное).\nПрервать: /cancel',
    );
  });

  bot.command('join', async (ctx) => {
    remember(ctx);
    const code = (ctx.match ?? '').trim().toUpperCase();
    if (!code) {
      sessions.set(userId(ctx), { kind: 'join', step: 'code' });
      await ctx.reply('Пришли код приглашения (6 символов). Прервать: /cancel');
      return;
    }
    await startJoin(ctx, code);
  });

  async function startJoin(ctx: Context, code: string): Promise<void> {
    const id = userId(ctx);
    const challenge = service.challenge(code);
    if (!challenge) {
      await ctx.reply('Челлендж с таким кодом не найден. Проверь код и пришли ещё раз.');
      return;
    }
    if (isParticipant(challenge, id)) {
      await ctx.reply('Ты уже в этом челлендже. Лидер-борд: /board ' + challenge.id);
      return;
    }
    if (challenge.status !== 'open') {
      await ctx.reply('К этому челленджу уже нельзя присоединиться: набор закрыт.');
      return;
    }
    if (service.freeSeats(challenge) === 0) {
      await ctx.reply(`В челлендже уже максимум участников (${MAX_PARTICIPANTS}).`);
      return;
    }
    if (service.freeSlots(id) === 0) {
      await ctx.reply(`У тебя уже ${MAX_ACTIVE_BOARDS} лидер-борда — это максимум. Освободи слот: /boards`);
      return;
    }
    sessions.set(id, { kind: 'join', step: 'nick', code: challenge.id });
    await ctx.reply(
      `Вызов: <b>${escapeHtml(challenge.title)}</b>\n` +
        `${challenge.dailyGoal} отжиманий в день × ${challenge.days} дн. = ${target(challenge)}\n` +
        `Участников: ${challenge.participants.length}/${MAX_PARTICIPANTS}\n\n` +
        'Выбери ник (3–12 символов), он будет стоять внутри твоего столбика. Прервать: /cancel',
      { parse_mode: 'HTML' },
    );
  }

  bot.command('begin', async (ctx) => {
    remember(ctx);
    const id = userId(ctx);
    const open = service.challengesOf(id).filter((challenge) => challenge.status === 'open' && challenge.ownerId === id);
    const resolved = resolveChallenge(ctx, ctx.match ?? '', open);
    if (resolved.error) {
      await ctx.reply(resolved.error);
      return;
    }
    if (!resolved.challenge) {
      await ctx.reply('Какой челлендж запускаем?', { reply_markup: pickKeyboard('begin', open) });
      return;
    }
    await runBegin(ctx, resolved.challenge.id);
  });

  async function runBegin(ctx: Context, code: string): Promise<void> {
    const started = service.start(code, userId(ctx));
    if (!started.ok) {
      await ctx.reply(started.error);
      return;
    }
    await service.save();
    const challenge = started.value;
    await broadcastBoard(
      challenge,
      `🚀 <b>Челлендж начался!</b>\n${challenge.dailyGoal} отжиманий в день, ${challenge.days} дн.\n` +
        'Каждый день — скриншот из приложения с числом отжиманий. Один отчёт в день.',
    );
  }

  bot.command(['board', 'boards', 'my'], async (ctx) => {
    remember(ctx);
    const id = userId(ctx);
    const command = ctx.message?.text?.slice(1).split(/[@\s]/)[0];
    const mine = service.challengesOf(id);

    if (command === 'boards' || command === 'my') {
      if (mine.length === 0) {
        await ctx.reply('У тебя пока нет челленджей. Бросить вызов: /new, принять: /join КОД');
        return;
      }
      const boards = mine.filter((challenge) => challenge.status === 'open' || challenge.status === 'active');
      const rest = mine.filter((challenge) => !boards.includes(challenge)).slice(-5);
      const parts = [
        `<b>Твои лидер-борды: ${boards.length}/${MAX_ACTIVE_BOARDS}</b>`,
        ...boards.map((challenge) => describeChallenge(challenge, id)),
      ];
      if (rest.length > 0) {
        parts.push('<b>Архив</b>', ...rest.map((challenge) => describeChallenge(challenge, id)));
      }
      await ctx.reply(parts.join('\n\n'), { parse_mode: 'HTML' });
      return;
    }

    const candidates = mine.filter((challenge) => challenge.status !== 'cancelled');
    const resolved = resolveChallenge(ctx, ctx.match ?? '', candidates);
    if (resolved.error) {
      await ctx.reply(resolved.error);
      return;
    }
    if (!resolved.challenge) {
      await ctx.reply('Какой борд показать?', { reply_markup: pickKeyboard('brd', candidates) });
      return;
    }
    await sendBoardTo(ctx.chat?.id ?? id, resolved.challenge);
  });

  bot.command('nick', async (ctx) => {
    remember(ctx);
    const id = userId(ctx);
    const parts = (ctx.match ?? '').trim().split(/\s+/).filter(Boolean);
    const boards = service.boardsOf(id);
    if (boards.length === 0) {
      await ctx.reply('Нет активных челленджей, ник менять негде.');
      return;
    }
    if (parts.length >= 2) {
      await applyNickname(ctx, parts[0]!.toUpperCase(), parts.slice(1).join(' '));
      return;
    }
    const resolved = resolveChallenge(ctx, parts[0] ?? '', boards);
    if (resolved.error) {
      await ctx.reply(resolved.error);
      return;
    }
    if (!resolved.challenge) {
      await ctx.reply('Ник в каком челлендже меняем?', { reply_markup: pickKeyboard('nick', boards) });
      return;
    }
    sessions.set(id, { kind: 'nick', code: resolved.challenge.id });
    await ctx.reply('Какой ник ставим? (3–12 символов). Прервать: /cancel');
  });

  async function applyNickname(ctx: Context, code: string, raw: string): Promise<void> {
    const id = userId(ctx);
    const challenge = service.challenge(code);
    if (!challenge) {
      await ctx.reply('Челлендж с таким кодом не найден.');
      return;
    }
    const taken = challenge.participants
      .filter((participant) => participant.userId !== id)
      .map((participant) => participant.nickname);
    const check = checkNickname(raw, taken);
    if (!check.ok) {
      await ctx.reply(check.error);
      return;
    }
    const updated = service.setNickname(challenge.id, id, check.nickname);
    if (!updated.ok) {
      await ctx.reply(updated.error);
      return;
    }
    sessions.delete(id);
    await service.save();
    await ctx.reply(`Готово, теперь ты <b>${escapeHtml(check.nickname)}</b>.`, { parse_mode: 'HTML' });
  }

  bot.command('leave', async (ctx) => {
    remember(ctx);
    const id = userId(ctx);
    const open = service.challengesOf(id).filter((challenge) => challenge.status === 'open');
    const resolved = resolveChallenge(ctx, ctx.match ?? '', open);
    if (resolved.error || !resolved.challenge) {
      await ctx.reply(resolved.error ?? 'Укажи код: /leave КОД');
      return;
    }
    const left = service.leave(resolved.challenge.id, id);
    if (!left.ok) {
      await ctx.reply(left.error);
      return;
    }
    await service.save();
    await ctx.reply('Ок, ты вышел из челленджа.');
    await broadcastText(left.value, `↩️ Участник вышел из челленджа <b>${escapeHtml(left.value.title)}</b>.`, id);
  });

  bot.command('delete', async (ctx) => {
    remember(ctx);
    const id = userId(ctx);
    const own = service.challengesOf(id).filter((challenge) => challenge.status === 'open' && challenge.ownerId === id);
    const resolved = resolveChallenge(ctx, ctx.match ?? '', own);
    if (resolved.error || !resolved.challenge) {
      await ctx.reply(resolved.error ?? 'Укажи код: /delete КОД');
      return;
    }
    const cancelled = service.cancel(resolved.challenge.id, id);
    if (!cancelled.ok) {
      await ctx.reply(cancelled.error);
      return;
    }
    await service.save();
    await ctx.reply('Челлендж отменён, слот освободился.');
    await broadcastText(cancelled.value, `❌ Челлендж <b>${escapeHtml(cancelled.value.title)}</b> отменён инициатором.`, id);
  });

  bot.command('badges', async (ctx) => {
    remember(ctx);
    const id = userId(ctx);
    const user = service.user(id);
    const reported = service.reportDays(id);
    const streak = currentStreak(reported, service.today());
    const record = bestStreak(reported);

    const owned = new Map<string, string>();
    for (const badge of user?.badges ?? []) owned.set(badge.code, badge.awardedAt);

    const rows: BadgeCardRow[] = BADGES.map((meta) => {
      const awardedAt = owned.get(meta.code);
      if (awardedAt) {
        return { code: meta.code, earned: true, note: awardedAt.slice(0, 10).split('-').reverse().join('.') };
      }
      if (meta.streak) {
        const left = meta.streak - streak;
        return {
          code: meta.code,
          earned: false,
          note: streak > 0 ? `ещё ${daysRu(left)}` : `серия ${daysRu(meta.streak)}`,
        };
      }
      const hints: Record<string, string> = {
        champion: 'за победу',
        finisher: 'за выполнение',
        loser: 'за провал',
      };
      return { code: meta.code, earned: false, note: hints[meta.code] ?? 'не получен' };
    });

    const png = renderBadgeCard({
      name: user?.displayName ?? 'ты',
      earnedCount: owned.size,
      total: rows.length,
      streak,
      best: record,
      rows,
    });
    const earnedNames = rows
      .filter((row) => row.earned)
      .map((row) => `${badgeMeta(row.code).icon} ${badgeMeta(row.code).title}`);
    await ctx.replyWithPhoto(new InputFile(png, 'badges.png'), {
      caption:
        owned.size === 0
          ? 'Бейджей пока нет. Первый — за 3 дня подряд.'
          : `<b>Твои бейджи (${owned.size})</b>\n${earnedNames.join('\n')}`,
      parse_mode: 'HTML',
    });
  });

  // --- отчёты -----------------------------------------------------------

  /** Скачивает фото из Телеграма, чтобы прогнать его через OCR. */
  async function downloadPhoto(fileId: string): Promise<Buffer> {
    const file = await bot.api.getFile(fileId);
    if (!file.file_path) throw new Error('Телеграм не отдал путь к файлу');
    const response = await fetch(`https://api.telegram.org/file/bot${bot.token}/${file.file_path}`);
    if (!response.ok) throw new Error(`Телеграм ответил ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  bot.on('message:photo', async (ctx) => {
    remember(ctx);
    const id = userId(ctx);
    const sizes = ctx.message.photo;
    const largest = sizes[sizes.length - 1];
    const photo = { fileId: largest?.file_id ?? '', uniqueId: largest?.file_unique_id ?? '' };

    const active = service.activeOf(id);
    if (active.length === 0) {
      const waiting = service.boardsOf(id).filter((challenge) => challenge.status === 'open');
      await ctx.reply(
        waiting.length > 0
          ? `Челлендж ещё не запущен — ждём команду /begin ${waiting[0]!.id} от инициатора.`
          : 'Нет активных челленджей. Бросить вызов: /new, принять: /join КОД',
      );
      return;
    }
    const pending = active.filter(
      (challenge) => !hasReportOn(challenge, id, service.today(challenge.timezone)),
    );
    if (pending.length === 0) {
      await ctx.reply('За сегодня отчёты уже приняты во всех твоих челленджах. Больше одного отчёта в день нельзя.');
      return;
    }

    const status = await ctx.reply('🔍 Читаю скриншот…').catch(() => null);
    const clearStatus = async (): Promise<void> => {
      if (!status) return;
      await ctx.api.deleteMessage(status.chat.id, status.message_id).catch(() => undefined);
    };

    let reps: number;
    try {
      const page = await ocr.read(await downloadPhoto(photo.fileId));
      const read = readDailyReps(page, service.today(pending[0]!.timezone));
      if (!read.ok) {
        await clearStatus();
        await ctx.reply(`❌ ${FAILURE_HINTS[read.reason]}`, { parse_mode: 'HTML' });
        return;
      }
      reps = read.value.reps;
    } catch (error) {
      console.error('Не удалось распознать скриншот:', error);
      await clearStatus();
      await ctx.reply('Не смог обработать картинку. Пришли скриншот ещё раз — обычным фото, не файлом.');
      return;
    }
    await clearStatus();

    if (pending.length === 1) {
      await submitReport(ctx, pending[0]!.id, reps, photo);
      return;
    }

    // Один скриншот — один рабочий день, поэтому его можно засчитать сразу во все борды.
    pendingReports.set(id, { reps, photoFileId: photo.fileId, photoUniqueId: photo.uniqueId, codes: pending.map((challenge) => challenge.id) });
    const keyboard = new InlineKeyboard().text(`Во все челленджи (${pending.length})`, 'rep:*').row();
    for (const challenge of pending) {
      keyboard.text(`${challenge.title} (${challenge.id})`, `rep:${challenge.id}`).row();
    }
    await ctx.reply(`Распознал <b>${reps}</b> отжиманий за сегодня. Куда засчитать?`, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  });

  bot.on('callback_query:data', async (ctx) => {
    remember(ctx);
    const id = userId(ctx);
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery();

    if (data.startsWith('rep:')) {
      const target = data.slice(4);
      const report = pendingReports.get(id);
      if (!report) {
        await ctx.reply('Этот отчёт уже неактуален — пришли скриншот заново.');
        return;
      }
      pendingReports.delete(id);
      const photo = { fileId: report.photoFileId, uniqueId: report.photoUniqueId };
      const codes = target === '*' ? report.codes : [target];
      for (const code of codes) {
        await submitReport(ctx, code, report.reps, photo);
      }
      return;
    }
    if (data.startsWith('brd:')) {
      const code = data.slice(4);
      const challenge = service.challenge(code);
      if (challenge) await sendBoardTo(ctx.chat?.id ?? id, challenge);
      return;
    }
    if (data.startsWith('begin:')) {
      await runBegin(ctx, data.slice(6));
      return;
    }
    if (data.startsWith('inv:')) {
      const challenge = service.challenge(data.slice(4));
      if (challenge) await sendInvite(ctx, challenge);
      return;
    }
    if (data.startsWith('nick:')) {
      sessions.set(id, { kind: 'nick', code: data.slice(5) });
      await ctx.reply('Какой ник ставим? (3–12 символов). Прервать: /cancel');
    }
  });

  // --- диалоги ----------------------------------------------------------

  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) {
      await ctx.reply('Не знаю такую команду. Список: /help');
      return;
    }
    remember(ctx);
    const id = userId(ctx);
    const session = sessions.get(id);
    if (!session) {
      await ctx.reply(
        'Чтобы отчитаться, пришли скриншот недельного графика из приложения — число за сегодня бот прочитает сам.\nКоманды: /help',
      );
      return;
    }

    if (session.kind === 'nick') {
      await applyNickname(ctx, session.code, text);
      return;
    }

    if (session.kind === 'join') {
      if (session.step === 'code') {
        await startJoin(ctx, text.toUpperCase());
        return;
      }
      const challenge = service.challenge(session.code ?? '');
      if (!challenge) {
        sessions.delete(id);
        await ctx.reply('Челлендж не найден, начни заново: /join КОД');
        return;
      }
      const check = checkNickname(text, challenge.participants.map((participant) => participant.nickname));
      if (!check.ok) {
        await ctx.reply(check.error);
        return;
      }
      const joined = service.join(challenge.id, id, check.nickname);
      if (!joined.ok) {
        sessions.delete(id);
        await ctx.reply(joined.error);
        return;
      }
      sessions.delete(id);
      await service.save();
      await ctx.reply(
        `Вызов принят, ты в игре под ником <b>${escapeHtml(check.nickname)}</b>.\n` +
          `Ждём старта от инициатора. Лидер-борд: /board ${challenge.id}`,
        { parse_mode: 'HTML' },
      );
      await broadcastText(
        challenge,
        `➕ <b>${escapeHtml(check.nickname)}</b> принял вызов «${escapeHtml(challenge.title)}» ` +
          `(${challenge.participants.length}/${MAX_PARTICIPANTS}).` +
          (challenge.ownerId === id ? '' : `\nЗапустить челлендж: /begin ${challenge.id}`),
        id,
      );
      return;
    }

    // Мастер создания челленджа.
    if (session.step === 'title') {
      const title = text === '-' ? 'Челлендж по отжиманиям' : text.slice(0, 40);
      sessions.set(id, { ...session, step: 'days', title });
      await ctx.reply('Сколько дней идёт челлендж? Пришли число (например, 30).');
      return;
    }
    if (session.step === 'days') {
      const days = parseReps(text);
      const valid = days === null ? { ok: false as const, error: 'Нужно число дней.' } : validateDays(days);
      if (!valid.ok) {
        await ctx.reply(valid.error);
        return;
      }
      sessions.set(id, { ...session, step: 'goal', days: valid.value });
      await ctx.reply('Сколько отжиманий в день? Пришли число (например, 60).');
      return;
    }
    if (session.step === 'goal') {
      const goal = parseReps(text);
      const valid = goal === null ? { ok: false as const, error: 'Нужно число отжиманий.' } : validateDailyGoal(goal);
      if (!valid.ok) {
        await ctx.reply(valid.error);
        return;
      }
      sessions.set(id, { ...session, step: 'nick', goal: valid.value });
      const total = valid.value * (session.days ?? 0);
      await ctx.reply(
        `Итого цель: ${valid.value} × ${session.days} = <b>${total}</b> отжиманий.\n` +
          'Теперь выбери свой ник (3–12 символов) — он будет стоять внутри твоего столбика.',
        { parse_mode: 'HTML' },
      );
      return;
    }

    const check = checkNickname(text);
    if (!check.ok) {
      await ctx.reply(check.error);
      return;
    }
    const created = service.create({
      ownerId: id,
      title: session.title ?? 'Челлендж по отжиманиям',
      days: session.days ?? 30,
      dailyGoal: session.goal ?? 50,
      nickname: check.nickname,
    });
    if (!created.ok) {
      sessions.delete(id);
      await ctx.reply(created.error);
      return;
    }
    sessions.delete(id);
    await service.save();
    const challenge = created.value;
    const color = BOARD_COLORS[challenge.colorIndex % BOARD_COLORS.length] ?? BOARD_COLORS[0];
    await ctx.reply(
      `Вызов брошен! Борд <b>${escapeHtml(challenge.title)}</b> (${color.name}).\n\n` +
        `Цель: ${challenge.dailyGoal} в день × ${challenge.days} дн. = <b>${target(challenge)}</b>\n` +
        `Код приглашения: <code>${challenge.id}</code>\n` +
        `Свободных мест: ${service.freeSeats(challenge)} из ${MAX_PARTICIPANTS - 1}\n` +
        `День считается по ${challenge.timezone} — до старта пояс можно сменить: /tz ${challenge.id} Asia/Almaty\n\n` +
        `Когда все соберутся — запускай: /begin ${challenge.id}`,
      { parse_mode: 'HTML' },
    );
    await sendInvite(ctx, challenge);
  });

  bot.catch((error) => {
    console.error('Ошибка обработчика:', error);
  });

  // Финиш челленджей, у которых закончился срок.
  const finishTimer = setInterval(() => {
    void (async () => {
      const finished = service.finishDue();
      if (finished.length === 0) return;
      await service.save();
      await announceFinished(finished);
    })();
  }, 60_000);
  finishTimer.unref();
}

/** Достаёт первое целое число из текста: «45», «45 отжиманий», «сделал 45». */
export function parseReps(text: string): number | null {
  const match = /\d+/.exec(text.replace(/\s+/g, ' '));
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isSafeInteger(value) ? value : null;
}
