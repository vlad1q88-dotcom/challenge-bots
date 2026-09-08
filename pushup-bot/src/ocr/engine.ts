import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createWorker, type Worker } from 'tesseract.js';
import type { OcrPage, OcrWord } from './screenshot.ts';

export interface OcrEngine {
  read(image: Buffer): Promise<OcrPage>;
  close(): Promise<void>;
}

/** Чтобы мелкие подписи читались, картинку доводим примерно до этой ширины. */
const TARGET_WIDTH = 1200;

/**
 * Готовит скриншот к распознаванию: увеличивает мелкие картинки и оставляет
 * только текст. Заливку столбиков убираем — иначе подпись, стоящая вплотную
 * к яркому столбику, слипается с ним в одно пятно и читается как мусор.
 */
async function prepare(image: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const picture = await loadImage(image);
  const factor = Math.min(3, Math.max(1, Math.round(TARGET_WIDTH / picture.width)));
  const width = picture.width * factor;
  const height = picture.height * factor;

  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(picture, 0, 0, width, height);

  const pixels = context.getImageData(0, 0, width, height);
  const { data } = pixels;

  // Тёмная тема или светлая: смотрим на среднюю яркость.
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
  }
  const darkTheme = sum / (data.length / 4) < 128;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const min = Math.min(r, g, b);
    const max = Math.max(r, g, b);
    // Текст почти серый: каналы близки. Цветные столбики отсеиваем по разбросу.
    const neutral = max - min < 48;
    // Порог берём с запасом: подписи дней бывают тускло-серыми.
    const isText = darkTheme ? neutral && min > 60 : neutral && max < 190;
    const value = isText ? 0 : 255;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  return { data: canvas.toBuffer('image/png'), width, height };
}

/** Языковые данные ставятся из npm, так что в рантайме сеть не нужна. */
function languagePath(): string {
  const require = createRequire(import.meta.url);
  return dirname(require.resolve('@tesseract.js-data/eng/4.0.0/eng.traineddata.gz'));
}

/**
 * Обёртка над tesseract.js: один воркер на процесс, задания выполняются
 * по очереди (воркер однопоточный), первый запуск поднимает его лениво.
 */
export function createOcrEngine(): OcrEngine {
  let worker: Promise<Worker> | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  function getWorker(): Promise<Worker> {
    worker ??= createWorker('eng', 1, {
      langPath: languagePath(),
      gzip: true,
      cacheMethod: 'none',
    });
    return worker;
  }

  function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const result = queue.then(job, job);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  return {
    read(image: Buffer): Promise<OcrPage> {
      return enqueue(async () => {
        const [picture, engine] = await Promise.all([prepare(image), getWorker()]);
        const { data } = await engine.recognize(picture.data, {}, { blocks: true });
        const words: OcrWord[] = [];
        let line = 0;
        for (const block of data.blocks ?? []) {
          for (const paragraph of block.paragraphs ?? []) {
            for (const row of paragraph.lines ?? []) {
              for (const word of row.words ?? []) {
                words.push({
                  text: word.text.trim(),
                  confidence: Math.round(word.confidence),
                  line,
                  x0: word.bbox.x0,
                  y0: word.bbox.y0,
                  x1: word.bbox.x1,
                  y1: word.bbox.y1,
                });
              }
              line += 1;
            }
          }
        }
        return { words, width: picture.width, height: picture.height };
      });
    },
    async close(): Promise<void> {
      if (!worker) return;
      const engine = await worker;
      worker = null;
      await engine.terminate();
    },
  };
}
