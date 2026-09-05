import { fileURLToPath } from 'node:url';
import { isValidTimezone } from './domain/dates.ts';

export interface Config {
  token: string;
  timezone: string;
  dataFile: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const token = env.BOT_TOKEN?.trim();
  if (!token) {
    throw new Error('Не задан BOT_TOKEN. Скопируй .env.example в .env и вставь токен от @BotFather.');
  }
  const timezone = env.CHALLENGE_TIMEZONE?.trim() || 'Asia/Almaty';
  if (!isValidTimezone(timezone)) {
    throw new Error(`Неизвестный часовой пояс CHALLENGE_TIMEZONE: ${timezone}`);
  }
  return {
    token,
    timezone,
    dataFile: env.DATA_FILE?.trim() || fileURLToPath(new URL('../data/db.json', import.meta.url)),
  };
}
