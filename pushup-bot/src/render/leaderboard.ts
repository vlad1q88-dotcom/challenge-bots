import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import { BOARD_COLORS } from '../constants.ts';
import { pluralRu } from '../domain/plural.ts';
import type { ChallengeStatus } from '../types.ts';

export interface BoardRowView {
  nickname: string;
  total: number;
  reportedDays: number;
  streak: number;
  /** Доля от цели челленджа, может быть больше 1 при перевыполнении. */
  percent: number;
  place?: number;
  champion?: boolean;
  completed?: boolean;
  deficit?: number;
}

export interface BoardView {
  title: string;
  code: string;
  colorIndex: number;
  dailyGoal: number;
  days: number;
  target: number;
  dayNumber: number;
  daysLeft: number;
  status: ChallengeStatus;
  /** Доля цели, которую нужно было набрать к сегодняшнему дню. */
  pacePercent: number;
  todayLabel: string;
  rows: BoardRowView[];
}

const BACKGROUND = '#0B0B0E';
const TRACK = '#17171C';
const TRACK_EDGE = 'rgba(255,255,255,0.08)';
const TEXT = '#F2F2F5';
const MUTED = '#8A8A96';
const GHOST = '#3E3E49';

const FONT = 'sans-serif';
const COLUMN_WIDTHS: Record<number, number> = { 1: 170, 2: 150, 3: 126, 4: 110 };
const COLUMN_WIDTH_DEFAULT = 92;
const COLUMN_GAP = 26;
const PADDING = 44;
const TRACK_HEIGHT = 620;

function font(size: number, weight: 'bold' | 'normal' = 'normal'): string {
  return `${weight === 'bold' ? 'bold ' : ''}${size}px ${FONT}`;
}

function roundedRect(
  context: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.arcTo(x + width, y, x + width, y + r, r);
  context.lineTo(x + width, y + height - r);
  context.arcTo(x + width, y + height, x + width - r, y + height, r);
  context.lineTo(x + r, y + height);
  context.arcTo(x, y + height, x, y + height - r, r);
  context.lineTo(x, y + r);
  context.arcTo(x, y, x + r, y, r);
  context.closePath();
}

function statusLine(view: BoardView): string {
  if (view.status === 'open') {
    return 'Набор участников — челлендж ещё не запущен';
  }
  if (view.status === 'finished') {
    return 'Челлендж завершён — итоги';
  }
  if (view.status === 'cancelled') {
    return 'Челлендж отменён';
  }
  const left = view.daysLeft;
  return `День ${view.dayNumber} из ${view.days} · осталось ${left} ${pluralRu(left, 'день', 'дня', 'дней')}`;
}

/** Ник рисуется вертикально и неподвижно внутри дорожки столбика. */
function drawNickname(
  context: SKRSContext2D,
  nickname: string,
  x: number,
  columnWidth: number,
  trackTop: number,
  trackBottom: number,
  color: string,
): void {
  context.save();
  context.translate(x + columnWidth / 2, trackBottom - 26);
  context.rotate(-Math.PI / 2);
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.font = font(30, 'bold');
  context.fillStyle = color;
  const maxWidth = trackBottom - trackTop - 52;
  context.fillText(nickname, 0, 0, maxWidth);
  context.restore();
}

export function renderBoard(view: BoardView): Buffer {
  const color = BOARD_COLORS[view.colorIndex % BOARD_COLORS.length] ?? BOARD_COLORS[0];
  const count = Math.max(view.rows.length, 1);
  const columnWidth = COLUMN_WIDTHS[count] ?? COLUMN_WIDTH_DEFAULT;
  const plotWidth = count * columnWidth + (count - 1) * COLUMN_GAP;
  const width = Math.max(760, plotWidth + PADDING * 2);
  const headerHeight = 232;
  const footerHeight = view.status === 'finished' ? 146 : 122;
  const height = headerHeight + TRACK_HEIGHT + footerHeight + PADDING;

  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');

  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, width, height);

  // Шапка.
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillStyle = TEXT;
  context.font = font(38, 'bold');
  context.fillText(view.title, PADDING, 66, width - PADDING * 2);

  context.fillStyle = MUTED;
  context.font = font(23);
  context.fillText(
    `${view.dailyGoal} в день · ${view.days} ${pluralRu(view.days, 'день', 'дня', 'дней')} · цель ${view.target}`,
    PADDING,
    104,
  );

  context.fillStyle = color.base;
  context.font = font(23, 'bold');
  context.fillText(statusLine(view), PADDING, 140);

  const trackTop = headerHeight;
  const trackBottom = trackTop + TRACK_HEIGHT;
  const startX = Math.round((width - plotWidth) / 2);

  view.rows.forEach((row, index) => {
    const x = startX + index * (columnWidth + COLUMN_GAP);
    const filled = Math.min(row.percent, 1);
    const fillHeight = Math.round(TRACK_HEIGHT * filled);
    const fillTop = trackBottom - fillHeight;

    // Дорожка во всю высоту — это 100% цели челленджа.
    roundedRect(context, x, trackTop, columnWidth, TRACK_HEIGHT, 18);
    context.fillStyle = TRACK;
    context.fill();
    context.strokeStyle = TRACK_EDGE;
    context.lineWidth = 2;
    context.stroke();

    // Ник — неподвижно, на всю дорожку.
    drawNickname(context, row.nickname, x, columnWidth, trackTop, trackBottom, GHOST);

    if (fillHeight > 0) {
      context.save();
      roundedRect(context, x, trackTop, columnWidth, TRACK_HEIGHT, 18);
      context.clip();
      const gradient = context.createLinearGradient(0, fillTop, 0, trackBottom);
      gradient.addColorStop(0, color.light);
      gradient.addColorStop(1, color.dark);
      context.fillStyle = gradient;
      context.fillRect(x, fillTop, columnWidth, fillHeight);
      // Тот же ник поверх заливки — тёмным, чтобы читался на ярком.
      context.beginPath();
      context.rect(x, fillTop, columnWidth, fillHeight);
      context.clip();
      drawNickname(context, row.nickname, x, columnWidth, trackTop, trackBottom, 'rgba(11,11,14,0.82)');
      context.restore();
    }

    if (row.percent > 1) {
      // Перевыполнение: подсвечиваем контур дорожки.
      roundedRect(context, x - 3, trackTop - 3, columnWidth + 6, TRACK_HEIGHT + 6, 21);
      context.strokeStyle = color.light;
      context.lineWidth = 3;
      context.stroke();
    }

    // Цифры над столбиком.
    context.textAlign = 'center';
    const centerX = x + columnWidth / 2;
    context.fillStyle = row.percent > 0 ? color.base : MUTED;
    context.font = font(30, 'bold');
    context.fillText(String(row.total), centerX, trackTop - 42);
    context.fillStyle = MUTED;
    context.font = font(19);
    context.fillText(`${Math.round(row.percent * 100)}%`, centerX, trackTop - 16);

    // Подписи под столбиком.
    let labelY = trackBottom + 34;
    context.fillStyle = TEXT;
    context.font = font(20, 'bold');
    context.fillText(`${row.reportedDays}/${view.days}`, centerX, labelY);
    labelY += 26;
    context.fillStyle = MUTED;
    context.font = font(18);
    context.fillText(
      row.streak > 0 ? `серия ${row.streak}` : 'нет серии',
      centerX,
      labelY,
    );

    if (view.status === 'finished') {
      labelY += 28;
      if (row.champion) {
        context.fillStyle = '#FFD25A';
        context.font = font(19, 'bold');
        context.fillText('ЧЕМПИОН', centerX, labelY);
      } else if (row.completed) {
        context.fillStyle = color.base;
        context.font = font(19, 'bold');
        context.fillText('ФИНИШЕР', centerX, labelY);
      } else {
        context.fillStyle = '#FF6B6B';
        context.font = font(19, 'bold');
        context.fillText(`−${row.deficit ?? 0}`, centerX, labelY);
      }
    }
  });

  // Линия плана на сегодня — поверх столбиков, сразу видно, кто отстаёт.
  if (view.status === 'active' && view.pacePercent > 0 && view.pacePercent < 1) {
    const paceY = trackBottom - TRACK_HEIGHT * view.pacePercent;
    context.save();
    context.strokeStyle = 'rgba(255,255,255,0.45)';
    context.setLineDash([10, 9]);
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(PADDING, paceY);
    context.lineTo(width - PADDING, paceY);
    context.stroke();
    context.restore();

    const label = 'план на сегодня';
    context.font = font(18);
    const labelWidth = context.measureText(label).width;
    const labelX = width - PADDING - labelWidth - 12;
    context.fillStyle = 'rgba(11,11,14,0.78)';
    roundedRect(context, labelX - 8, paceY - 30, labelWidth + 20, 26, 8);
    context.fill();
    context.textAlign = 'left';
    context.fillStyle = '#C9C9D2';
    context.fillText(label, labelX, paceY - 12);
  }

  // Подвал.
  context.textAlign = 'left';
  context.fillStyle = MUTED;
  context.font = font(18);
  context.fillText(
    `код ${view.code} · ${view.todayLabel} · один отчёт в день`,
    PADDING,
    height - 26,
  );
  context.textAlign = 'right';
  context.fillStyle = color.base;
  context.fillText(`борд · ${color.name}`, width - PADDING, height - 26);

  return canvas.toBuffer('image/png');
}
