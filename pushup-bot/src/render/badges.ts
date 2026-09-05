import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import { badgeMeta } from '../domain/badges.ts';
import type { BadgeCode } from '../types.ts';

export interface BadgePalette {
  ring: string;
  light: string;
  dark: string;
  ink: string;
}

const LOCKED: BadgePalette = { ring: 'rgba(255,255,255,0.10)', light: '#17171C', dark: '#121216', ink: '#3E3E49' };

const TIERS: { upTo: number; palette: BadgePalette }[] = [
  { upTo: 7, palette: { ring: '#C8802F', light: '#E9A25A', dark: '#A75F1C', ink: '#2A1607' } },
  { upTo: 21, palette: { ring: '#AEB6C2', light: '#D6DCE4', dark: '#8892A0', ink: '#181C22' } },
  { upTo: 60, palette: { ring: '#E8B450', light: '#FFD98A', dark: '#C8912C', ink: '#2A1F06' } },
  { upTo: 200, palette: { ring: '#38BDF8', light: '#82DAFF', dark: '#1189C9', ink: '#04212F' } },
  { upTo: Infinity, palette: { ring: '#A78BFA', light: '#C9B6FF', dark: '#7B57E8', ink: '#170B33' } },
];

const SPECIAL: Partial<Record<BadgeCode, BadgePalette>> = {
  champion: { ring: '#FFD25A', light: '#FFE49A', dark: '#DDA412', ink: '#2C1F02' },
  finisher: { ring: '#37D67A', light: '#7BE9AA', dark: '#1B9E56', ink: '#04240F' },
  loser: { ring: '#FF6B6B', light: '#FF9C9C', dark: '#C93B3B', ink: '#2C0808' },
};

export function badgePalette(code: BadgeCode, earned = true): BadgePalette {
  if (!earned) return LOCKED;
  const special = SPECIAL[code];
  if (special) return special;
  const streak = badgeMeta(code).streak ?? 0;
  return (TIERS.find((tier) => streak <= tier.upTo) ?? TIERS[TIERS.length - 1]!).palette;
}

function trophy(context: SKRSContext2D, cx: number, cy: number, size: number, color: string): void {
  const width = size * 0.5;
  const top = cy - size * 0.3;
  const bowl = cy + size * 0.08;
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineCap = 'round';

  // Ручки по бокам чаши.
  context.lineWidth = Math.max(2, size * 0.07);
  for (const side of [-1, 1]) {
    context.beginPath();
    context.arc(cx + (side * width) / 2, top + size * 0.1, size * 0.16, -Math.PI / 2, Math.PI / 2, side < 0);
    context.stroke();
  }

  // Чаша.
  context.beginPath();
  context.moveTo(cx - width / 2, top);
  context.lineTo(cx + width / 2, top);
  context.lineTo(cx + width * 0.34, bowl - size * 0.06);
  context.quadraticCurveTo(cx, bowl + size * 0.12, cx - width * 0.34, bowl - size * 0.06);
  context.closePath();
  context.fill();

  // Ножка.
  context.lineWidth = Math.max(2, size * 0.09);
  context.beginPath();
  context.moveTo(cx, bowl + size * 0.1);
  context.lineTo(cx, cy + size * 0.28);
  context.stroke();

  // Основание.
  context.lineWidth = Math.max(2, size * 0.11);
  context.beginPath();
  context.moveTo(cx - width * 0.42, cy + size * 0.33);
  context.lineTo(cx + width * 0.42, cy + size * 0.33);
  context.stroke();
}

function checkMark(context: SKRSContext2D, cx: number, cy: number, size: number, color: string): void {
  context.strokeStyle = color;
  context.lineWidth = Math.max(2, size * 0.13);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(cx - size * 0.3, cy + size * 0.02);
  context.lineTo(cx - size * 0.06, cy + size * 0.26);
  context.lineTo(cx + size * 0.32, cy - size * 0.26);
  context.stroke();
}

function slash(context: SKRSContext2D, cx: number, cy: number, size: number, color: string): void {
  context.strokeStyle = color;
  context.lineWidth = Math.max(2, size * 0.13);
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(cx - size * 0.28, cy + size * 0.28);
  context.lineTo(cx + size * 0.28, cy - size * 0.28);
  context.stroke();
}

/** Медаль: круг с цифрой серии или со знаком чемпиона / финишера / лузера. */
export function drawBadge(
  context: SKRSContext2D,
  code: BadgeCode,
  cx: number,
  cy: number,
  radius: number,
  earned: boolean,
): void {
  const palette = badgePalette(code, earned);
  const meta = badgeMeta(code);

  const gradient = context.createLinearGradient(0, cy - radius, 0, cy + radius);
  gradient.addColorStop(0, palette.light);
  gradient.addColorStop(1, palette.dark);
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.fillStyle = gradient;
  context.fill();
  context.lineWidth = Math.max(2, radius * 0.07);
  context.strokeStyle = palette.ring;
  context.stroke();

  if (earned) {
    // Внутреннее кольцо, чтобы медаль читалась как медаль.
    context.beginPath();
    context.arc(cx, cy, radius * 0.82, 0, Math.PI * 2);
    context.strokeStyle = 'rgba(0,0,0,0.18)';
    context.lineWidth = Math.max(1, radius * 0.05);
    context.stroke();
  }

  const ink = earned ? palette.ink : palette.ink;
  if (meta.streak) {
    const label = String(meta.streak);
    const size = radius * (label.length > 2 ? 0.78 : label.length > 1 ? 0.92 : 1.05);
    context.font = `bold ${Math.round(size)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = ink;
    context.fillText(label, cx, cy + radius * 0.02);
    return;
  }
  if (code === 'champion') trophy(context, cx, cy, radius * 1.5, ink);
  else if (code === 'finisher') checkMark(context, cx, cy, radius, ink);
  else slash(context, cx, cy, radius, ink);
}

export interface BadgeCardRow {
  code: BadgeCode;
  earned: boolean;
  /** Подпись под названием: дата получения или что осталось сделать. */
  note: string;
}

export interface BadgeCardView {
  name: string;
  earnedCount: number;
  total: number;
  streak: number;
  best: number;
  rows: BadgeCardRow[];
}

const BACKGROUND = '#0B0B0E';
const TEXT = '#F2F2F5';
const MUTED = '#8A8A96';
const DIM = '#5A5A66';

export function renderBadgeCard(view: BadgeCardView): Buffer {
  const columns = 4;
  const cell = { width: 214, height: 208 };
  const padding = 40;
  const rows = Math.ceil(view.rows.length / columns);
  const width = padding * 2 + columns * cell.width;
  const header = 168;
  const height = header + rows * cell.height + 96;

  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, width, height);

  context.textAlign = 'left';
  context.fillStyle = TEXT;
  context.font = 'bold 40px sans-serif';
  context.fillText(`Бейджи · ${view.name}`, padding, 66, width - padding * 2);
  context.fillStyle = MUTED;
  context.font = '23px sans-serif';
  context.fillText(`Получено ${view.earnedCount} из ${view.total}`, padding, 104);
  context.font = '21px sans-serif';
  context.fillText(
    `Серия сейчас: ${view.streak} · рекорд: ${view.best}`,
    padding,
    136,
  );

  view.rows.forEach((row, index) => {
    const column = index % columns;
    const line = Math.floor(index / columns);
    const centerX = padding + column * cell.width + cell.width / 2;
    const top = header + line * cell.height;
    const meta = badgeMeta(row.code);

    drawBadge(context, row.code, centerX, top + 58, 46, row.earned);

    context.textAlign = 'center';
    context.fillStyle = row.earned ? TEXT : DIM;
    context.font = 'bold 21px sans-serif';
    context.fillText(meta.short, centerX, top + 138, cell.width - 20);
    context.fillStyle = row.earned ? MUTED : DIM;
    context.font = '18px sans-serif';
    context.fillText(row.note, centerX, top + 166, cell.width - 20);
  });

  context.textAlign = 'left';
  context.fillStyle = MUTED;
  context.font = '18px sans-serif';
  context.fillText('Серии считаются по дням, когда был отчёт хотя бы в одном челлендже', padding, height - 34);
  return canvas.toBuffer('image/png');
}
