/**
 * Аватарка из готовой картинки: вырезает белую фигуру, увеличивает её,
 * обводит чёрным контуром и ставит на фон из столбиков бордов.
 *
 * Запуск: node scripts/make-avatar-from-icon.ts <путь-к-картинке> [<файл-результата>]
 */
import { writeFileSync } from 'node:fs';
import { createCanvas, loadImage, type Canvas } from '@napi-rs/canvas';
import { BOARD_COLORS } from '../src/constants.ts';

const SIZE = 512;
const source = process.argv[2];
const target = process.argv[3] ?? new URL('../docs/avatar-icon.png', import.meta.url).pathname;
if (!source) {
  console.error('Укажи путь к картинке: node scripts/make-avatar-from-icon.ts icon.jpg');
  process.exit(1);
}

/** Белое пятно на картинке: все каналы яркие и без цветового перекоса. */
function whiteMask(pixels: Uint8ClampedArray, count: number): Uint8Array {
  const mask = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    const r = pixels[i * 4]!;
    const g = pixels[i * 4 + 1]!;
    const b = pixels[i * 4 + 2]!;
    const min = Math.min(r, g, b);
    const max = Math.max(r, g, b);
    mask[i] = min > 150 && max - min < 60 ? 1 : 0;
  }
  return mask;
}

function morph(data: Uint8Array, width: number, height: number, keep: number): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          sum += data[ny * width + nx]!;
        }
      }
      out[y * width + x] = sum >= keep ? 1 : 0;
    }
  }
  return out;
}

/** Перекрашивает непрозрачные пиксели спрайта в один цвет. */
function tint(sprite: Canvas, color: string): Canvas {
  const canvas = createCanvas(sprite.width, sprite.height);
  const context = canvas.getContext('2d');
  context.drawImage(sprite, 0, 0);
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = color;
  context.fillRect(0, 0, sprite.width, sprite.height);
  return canvas;
}

const picture = await loadImage(source);
const width = picture.width;
const height = picture.height;
const probe = createCanvas(width, height);
const probeContext = probe.getContext('2d');
probeContext.drawImage(picture, 0, 0);

// Вырезаем фигуру и чистим шум от JPEG.
const mask = morph(morph(whiteMask(probeContext.getImageData(0, 0, width, height).data, width * height), width, height, 6), width, height, 3);

let minX = width;
let minY = height;
let maxX = 0;
let maxY = 0;
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    if (!mask[y * width + x]) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
}
if (maxX <= minX) {
  console.error('Не нашёл белую фигуру на картинке.');
  process.exit(1);
}

const cut = createCanvas(width, height);
const cutContext = cut.getContext('2d');
const image = cutContext.createImageData(width, height);
for (let i = 0; i < width * height; i += 1) {
  image.data[i * 4] = 255;
  image.data[i * 4 + 1] = 255;
  image.data[i * 4 + 2] = 255;
  image.data[i * 4 + 3] = mask[i] === 1 ? 255 : 0;
}
cutContext.putImageData(image, 0, 0);

// Увеличиваем со сглаживанием, потом режем полупрозрачность — края остаются чёткими.
const cropWidth = maxX - minX + 1;
const cropHeight = maxY - minY + 1;
const spriteWidth = 322;
const spriteHeight = Math.round((cropHeight / cropWidth) * spriteWidth);
const sprite = createCanvas(spriteWidth, spriteHeight);
const spriteContext = sprite.getContext('2d');
spriteContext.imageSmoothingEnabled = true;
spriteContext.imageSmoothingQuality = 'high';
spriteContext.drawImage(cut, minX, minY, cropWidth, cropHeight, 0, 0, spriteWidth, spriteHeight);
const spriteData = spriteContext.getImageData(0, 0, spriteWidth, spriteHeight);
for (let i = 0; i < spriteWidth * spriteHeight; i += 1) {
  const alpha = spriteData.data[i * 4 + 3]!;
  spriteData.data[i * 4] = 255;
  spriteData.data[i * 4 + 1] = 255;
  spriteData.data[i * 4 + 2] = 255;
  // Мягкие края сохраняем, но подтягиваем, чтобы силуэт не выглядел размытым.
  spriteData.data[i * 4 + 3] = Math.max(0, Math.min(255, Math.round((alpha - 60) * 2.2)));
}
spriteContext.putImageData(spriteData, 0, 0);

// Собираем аватарку.
const canvas = createCanvas(SIZE, SIZE);
const context = canvas.getContext('2d');
const background = context.createLinearGradient(0, 0, SIZE, SIZE);
background.addColorStop(0, '#16161B');
background.addColorStop(1, '#08080A');
context.fillStyle = background;
context.fillRect(0, 0, SIZE, SIZE);

const barWidth = 96;
const gap = 22;
const startX = (SIZE - (barWidth * 3 + gap * 2)) / 2;
const bottom = SIZE - 72;
[152, 236, 196].forEach((barHeight, index) => {
  const color = BOARD_COLORS[index]!;
  const x = startX + index * (barWidth + gap);
  const gradient = context.createLinearGradient(0, bottom - barHeight, 0, bottom);
  gradient.addColorStop(0, color.light);
  gradient.addColorStop(1, color.dark);
  context.fillStyle = gradient;
  context.beginPath();
  context.roundRect(x, bottom - barHeight, barWidth, barHeight, [barWidth / 2, barWidth / 2, 10, 10]);
  context.fill();
});

const figureX = (SIZE - spriteWidth) / 2;
const figureY = (SIZE - spriteHeight) / 2 + 12;
const outline = tint(sprite, '#000000');
const thickness = 10;
for (let step = 0; step < 48; step += 1) {
  const angle = (step / 48) * Math.PI * 2;
  context.drawImage(outline, figureX + Math.cos(angle) * thickness, figureY + Math.sin(angle) * thickness);
}
context.drawImage(sprite, figureX, figureY);

writeFileSync(target, canvas.toBuffer('image/png'));
console.log(`готово: ${target} (фигура ${spriteWidth}×${spriteHeight})`);
