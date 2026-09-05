import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Bot } from 'grammy';
import { loadConfig } from './config.ts';
import { createOcrEngine } from './ocr/engine.ts';
import { ChallengeService } from './service.ts';
import { Store } from './storage/store.ts';
import { wire } from './telegram/bot.ts';

const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

function fatal(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  fatal(`Нужен Node.js 22.18 или новее (сейчас ${process.versions.node}): бот запускается прямо из TypeScript.`);
}

const config = (() => {
  try {
    return loadConfig();
  } catch (error) {
    return fatal(error instanceof Error ? error.message : String(error));
  }
})();
const store = new Store(config.dataFile);
await store.load();

const service = new ChallengeService(store, { timezone: config.timezone });
const bot = new Bot(config.token);
const ocr = createOcrEngine();
wire(bot, service, { ocr });

const commands = [
  { command: 'new', description: 'бросить вызов' },
  { command: 'join', description: 'принять вызов по коду' },
  { command: 'begin', description: 'запустить челлендж' },
  { command: 'board', description: 'показать лидер-борд' },
  { command: 'boards', description: 'мои челленджи' },
  { command: 'badges', description: 'мои бейджи' },
  { command: 'nick', description: 'сменить ник' },
  { command: 'rules', description: 'правила и бейджи' },
  { command: 'help', description: 'помощь' },
  { command: 'cancel', description: 'прервать диалог' },
];

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void bot
      .stop()
      .then(() => service.save())
      .then(() => ocr.close());
  });
}

console.log('Подключаюсь к Телеграму…');
try {
  await bot.api.setMyCommands(commands);
  await bot.start({
    onStart: (info) =>
      console.log(
        `✅ Бот @${info.username} запущен. Часовой пояс челленджей: ${config.timezone}. Данные: ${config.dataFile}`,
      ),
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  fatal(
    /401|unauthorized/i.test(message)
      ? 'Телеграм не принял токен. Проверь BOT_TOKEN в .env — его выдаёт @BotFather.'
      : `Не удалось подключиться к Телеграму: ${message}. Проверь интернет и доступ к api.telegram.org.`,
  );
}
