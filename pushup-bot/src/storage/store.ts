import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Database } from '../types.ts';

const EMPTY: Database = { version: 1, challenges: [], users: [] };

/**
 * Простое JSON-хранилище: всё держим в памяти, на диск пишем атомарно
 * (временный файл + rename) и по одной записи за раз.
 */
export class Store {
  #file: string;
  #data: Database = structuredClone(EMPTY);
  #writing: Promise<void> = Promise.resolve();
  #dirty = false;

  constructor(file: string) {
    this.#file = file;
  }

  get data(): Database {
    return this.#data;
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.#file, 'utf8');
      const parsed = JSON.parse(raw) as Partial<Database>;
      this.#data = {
        version: parsed.version ?? 1,
        challenges: parsed.challenges ?? [],
        users: parsed.users ?? [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.#data = structuredClone(EMPTY);
      await this.save();
    }
  }

  /** Ставит запись в очередь; вызовы подряд не перетирают друг друга. */
  save(): Promise<void> {
    this.#dirty = true;
    this.#writing = this.#writing.then(() => this.#flush()).catch((error: unknown) => {
      console.error('Не удалось сохранить данные:', error);
    });
    return this.#writing;
  }

  async #flush(): Promise<void> {
    if (!this.#dirty) return;
    this.#dirty = false;
    const payload = JSON.stringify(this.#data, null, 2);
    await mkdir(dirname(this.#file), { recursive: true });
    const temporary = `${this.#file}.tmp`;
    await writeFile(temporary, payload, 'utf8');
    await rename(temporary, this.#file);
  }
}
