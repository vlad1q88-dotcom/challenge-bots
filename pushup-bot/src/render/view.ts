import { currentDayNumber, daysLeft, progress, target } from '../domain/challenge.ts';
import { formatDayRu } from '../domain/dates.ts';
import { days as daysRu } from '../domain/plural.ts';
import { bestStreak, currentStreak } from '../domain/streaks.ts';
import type { Challenge } from '../types.ts';
import type { BoardRowView, BoardView } from './leaderboard.ts';

export function buildBoardView(challenge: Challenge, today: string): BoardView {
  const goal = target(challenge);
  const dayNumber = currentDayNumber(challenge, today);

  let rows: BoardRowView[];
  if (challenge.status === 'finished' && challenge.results) {
    rows = challenge.results.rows.map((row) => ({
      nickname: row.nickname,
      total: row.total,
      reportedDays: row.reportedDays,
      streak: row.bestStreak,
      percent: goal > 0 ? row.total / goal : 0,
      place: row.place,
      champion: row.champion,
      completed: row.completed,
      deficit: row.deficit,
    }));
  } else {
    rows = progress(challenge, today)
      .map((row) => ({
        nickname: row.nickname,
        total: row.total,
        reportedDays: row.reportedDays,
        streak: row.streak,
        percent: row.percent,
      }))
      .sort((a, b) => b.total - a.total || a.nickname.localeCompare(b.nickname, 'ru'));
  }

  return {
    title: challenge.title,
    code: challenge.id,
    colorIndex: challenge.colorIndex,
    dailyGoal: challenge.dailyGoal,
    days: challenge.days,
    target: goal,
    dayNumber,
    daysLeft: daysLeft(challenge, today),
    status: challenge.status,
    pacePercent: challenge.days > 0 ? dayNumber / challenge.days : 0,
    todayLabel: formatDayRu(today),
    rows,
  };
}

/** Текстовая сводка под картинкой борда. */
export function boardCaption(challenge: Challenge, today: string): string {
  const goal = target(challenge);
  const lines: string[] = [`<b>${escapeHtml(challenge.title)}</b> · код <code>${challenge.id}</code>`];
  lines.push(`Цель: ${challenge.dailyGoal} в день × ${challenge.days} дн. = ${goal}`);

  if (challenge.status === 'open') {
    lines.push(`Набор: ${challenge.participants.length}/6 участников. Запуск — /begin ${challenge.id}`);
    lines.push(`Присоединиться: /join ${challenge.id}`);
    return lines.join('\n');
  }

  if (challenge.status === 'finished' && challenge.results) {
    lines.push('');
    for (const row of challenge.results.rows) {
      const mark = row.champion ? '🏆' : row.completed ? '🎖' : '💀';
      const tail = row.completed
        ? `выполнил${row.overachieved ? ` (+${row.total - row.target})` : ''}`
        : `не хватило ${row.deficit}`;
      lines.push(`${mark} ${row.place}. ${escapeHtml(row.nickname)} — ${row.total} · ${tail}`);
    }
    return lines.join('\n');
  }

  const rows = progress(challenge, today).sort((a, b) => b.total - a.total);
  lines.push(`День ${currentDayNumber(challenge, today)} из ${challenge.days}, осталось ${daysRu(daysLeft(challenge, today))}`);
  lines.push('');
  rows.forEach((row, index) => {
    const days = challenge.reports.filter((report) => report.userId === row.userId).map((report) => report.day);
    const streak = currentStreak(days, today);
    const record = bestStreak(days);
    lines.push(
      `${index + 1}. ${escapeHtml(row.nickname)} — ${row.total} (${Math.round(row.percent * 100)}%)` +
        ` · серия ${streak}${record > streak ? ` (рекорд ${record})` : ''}`,
    );
  });
  return lines.join('\n');
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
