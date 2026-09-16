import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import gifenc from 'gifenc';
import { BOARD_COLORS } from '../constants.ts';
import { emojiFont, fontOf } from './fonts.ts';

const { applyPalette, GIFEncoder, quantize } = gifenc;

const WIDTH = 640;
const HEIGHT = 400;
const FRAMES = 30;
const DELAY = 50; // мс на кадр — 1,5 секунды на круг

const CONFETTI_COLORS = ['#FF7A2F', '#37D67A', '#38BDF8', '#FFD25A', '#FF9FD0', '#A78BFA', '#FFFFFF'];

interface Piece {
  x: number;
  size: number;
  color: string;
  /** Сколько раз пролетит кадр сверху вниз за цикл. */
  falls: number;
  offset: number;
  sway: number;
  swayTurns: number;
  turns: number;
  angle: number;
  ribbon: boolean;
}

/** Детерминированный генератор: одинаковая открытка при одинаковом нике. */
function seeded(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

function build(random: () => number): Piece[] {
  const pieces: Piece[] = [];
  for (let index = 0; index < 90; index += 1) {
    const ribbon = index % 3 === 0;
    pieces.push({
      x: random() * WIDTH,
      size: ribbon ? 16 + random() * 26 : 7 + random() * 9,
      color: CONFETTI_COLORS[Math.floor(random() * CONFETTI_COLORS.length)] ?? '#FFFFFF',
      falls: 1 + Math.floor(random() * 2),
      offset: random(),
      sway: 10 + random() * 40,
      swayTurns: 1 + Math.floor(random() * 2),
      turns: 1 + Math.floor(random() * 3),
      angle: random() * Math.PI * 2,
      ribbon,
    });
  }
  return pieces;
}

/** Серпантин — волнистая лента, конфетти — прямоугольник. */
function drawPiece(context: SKRSContext2D, piece: Piece, progress: number): void {
  const span = HEIGHT + 120;
  const y = ((piece.offset + progress * piece.falls) % 1) * span - 60;
  const x = piece.x + Math.sin(progress * piece.swayTurns * Math.PI * 2 + piece.angle) * piece.sway;

  context.save();
  context.translate(x, y);
  context.rotate(piece.angle + progress * piece.turns * Math.PI * 2);
  context.fillStyle = piece.color;
  if (piece.ribbon) {
    context.beginPath();
    for (let step = 0; step <= 6; step += 1) {
      const t = step / 6;
      context.lineTo(Math.sin(t * Math.PI * 2) * 6, (t - 0.5) * piece.size * 2);
    }
    context.lineWidth = 4;
    context.strokeStyle = piece.color;
    context.stroke();
  } else {
    context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
  }
  context.restore();
}

export interface CelebrationView {
  nickname: string;
  /** Цвет борда, к которому относится поздравление. */
  colorIndex: number;
  title?: string;
  subtitle?: string;
}

/** Анимированная открытка с конфетти и серпантином — GIF на полтора круга. */
export function renderCelebration(view: CelebrationView): Buffer {
  const color = BOARD_COLORS[view.colorIndex % BOARD_COLORS.length] ?? BOARD_COLORS[0];
  const seed = [...view.nickname].reduce((sum, char) => sum + char.codePointAt(0)!, 7);
  const pieces = build(seeded(seed));

  const canvas = createCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext('2d');
  const encoder = GIFEncoder();

  for (let frame = 0; frame < FRAMES; frame += 1) {
    const progress = frame / FRAMES;

    // Фон ровный: градиент в 128 цветов GIF ложится полосами.
    context.fillStyle = '#0D0D11';
    context.fillRect(0, 0, WIDTH, HEIGHT);

    for (const piece of pieces) drawPiece(context, piece, progress);

    // Торт слегка «дышит», чтобы картинка не выглядела статичной.
    const cake = emojiFont(96 + Math.sin(progress * Math.PI * 2) * 6);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    if (cake) {
      context.font = cake;
      context.fillText('🎂', WIDTH / 2, 132);
    }

    context.font = fontOf(46, 'bold');
    context.fillStyle = '#F2F2F5';
    context.fillText(view.title ?? 'С днём рождения!', WIDTH / 2, 236, WIDTH - 60);

    context.font = fontOf(34, 'bold');
    context.fillStyle = color.base;
    context.fillText(view.nickname, WIDTH / 2, 292, WIDTH - 80);

    context.font = fontOf(22);
    context.fillStyle = '#8A8A96';
    context.fillText(view.subtitle ?? 'Норма выполнена — бейдж «Именинник» твой', WIDTH / 2, 344, WIDTH - 60);

    const { data } = context.getImageData(0, 0, WIDTH, HEIGHT);
    const palette = quantize(data, 128);
    encoder.writeFrame(applyPalette(data, palette), WIDTH, HEIGHT, { palette, delay: DELAY });
  }

  encoder.finish();
  return Buffer.from(encoder.bytes());
}
