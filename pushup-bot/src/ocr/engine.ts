import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { loadImage } from '@napi-rs/canvas';
import { createWorker, type Worker } from 'tesseract.js';
import type { OcrPage, OcrWord } from './screenshot.ts';

export interface OcrEngine {
  read(image: Buffer): Promise<OcrPage>;
  close(): Promise<void>;
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
        const [picture, engine] = await Promise.all([loadImage(image), getWorker()]);
        const { data } = await engine.recognize(image, {}, { blocks: true });
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
