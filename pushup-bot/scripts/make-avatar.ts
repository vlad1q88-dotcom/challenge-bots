import { writeFileSync } from 'node:fs';
import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import { BOARD_COLORS } from '../src/constants.ts';
import { ensureFonts, fontOf } from '../src/render/fonts.ts';

// Куда класть картинки: по умолчанию рядом, в docs/.
const OUT = new URL('../docs/', import.meta.url).pathname;
const SIZE = 512;

function base(context: SKRSContext2D): void {
  const gradient = context.createLinearGradient(0, 0, SIZE, SIZE);
  gradient.addColorStop(0, '#16161B');
  gradient.addColorStop(1, '#08080A');
  context.fillStyle = gradient;
  context.fillRect(0, 0, SIZE, SIZE);
}

function bar(context: SKRSContext2D, x: number, width: number, height: number, colorIndex: number): void {
  const bottom = SIZE - 138;
  const top = bottom - height;
  const color = BOARD_COLORS[colorIndex]!;
  const gradient = context.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, color.light);
  gradient.addColorStop(1, color.dark);
  context.fillStyle = gradient;
  const radius = width / 2;
  context.beginPath();
  context.moveTo(x, bottom);
  context.lineTo(x, top + radius);
  context.arcTo(x, top, x + radius, top, radius);
  context.arcTo(x + width, top, x + width, top + radius, radius);
  context.lineTo(x + width, bottom);
  context.closePath();
  context.fill();
}

// Три варианта аватарки бота: запускать `node scripts/make-avatar.ts`.
// Вариант А: три столбика — три борда.
{
  const canvas = createCanvas(SIZE, SIZE);
  const context = canvas.getContext('2d');
  base(context);
  const width = 88;
  const gap = 34;
  const startX = (SIZE - (width * 3 + gap * 2)) / 2;
  [150, 250, 196].forEach((height, index) => bar(context, startX + index * (width + gap), width, height, index));
  writeFileSync(`${OUT}avatar-a.png`, canvas.toBuffer('image/png'));
}

// Вариант Б: кольцо прогресса и столбики внутри.
{
  const canvas = createCanvas(SIZE, SIZE);
  const context = canvas.getContext('2d');
  base(context);
  context.lineWidth = 30;
  context.lineCap = 'round';
  const radius = SIZE / 2 - 44;
  context.strokeStyle = '#1D1D23';
  context.beginPath();
  context.arc(SIZE / 2, SIZE / 2, radius, 0, Math.PI * 2);
  context.stroke();
  const ring = context.createLinearGradient(0, 0, SIZE, SIZE);
  ring.addColorStop(0, BOARD_COLORS[0]!.light);
  ring.addColorStop(1, BOARD_COLORS[0]!.dark);
  context.strokeStyle = ring;
  context.beginPath();
  context.arc(SIZE / 2, SIZE / 2, radius, -Math.PI / 2, Math.PI * 1.05);
  context.stroke();

  const width = 56;
  const gap = 26;
  const startX = (SIZE - (width * 3 + gap * 2)) / 2;
  [96, 168, 130].forEach((height, index) => bar(context, startX + index * (width + gap), width, height - 6, index));
  writeFileSync(`${OUT}avatar-b.png`, canvas.toBuffer('image/png'));
}

// Вариант В: столбики с медалью серии.
{
  ensureFonts();
  const canvas = createCanvas(SIZE, SIZE);
  const context = canvas.getContext('2d');
  base(context);
  const width = 84;
  const gap = 32;
  const startX = (SIZE - (width * 3 + gap * 2)) / 2;
  [140, 236, 184].forEach((height, index) => bar(context, startX + index * (width + gap), width, height, index));

  const cx = SIZE - 136;
  const cy = SIZE - 148;
  const medal = context.createLinearGradient(0, cy - 72, 0, cy + 72);
  medal.addColorStop(0, '#FFD98A');
  medal.addColorStop(1, '#C8912C');
  context.beginPath();
  context.arc(cx, cy, 72, 0, Math.PI * 2);
  context.fillStyle = '#0B0B0E';
  context.fill();
  context.beginPath();
  context.arc(cx, cy, 62, 0, Math.PI * 2);
  context.fillStyle = medal;
  context.fill();
  context.strokeStyle = '#E8B450';
  context.lineWidth = 5;
  context.stroke();
  context.beginPath();
  context.arc(cx, cy, 50, 0, Math.PI * 2);
  context.strokeStyle = 'rgba(0,0,0,0.18)';
  context.lineWidth = 3;
  context.stroke();
  context.font = fontOf(66, 'bold');
  context.fillStyle = '#2A1F06';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('7', cx, cy + 2);
  writeFileSync(`${OUT}avatar-c.png`, canvas.toBuffer('image/png'));
}
console.log('ok');
