# challenge-bots

Телеграм-боты для челленджей: лидер-борды, отчёты скриншотами, бейджи.

| Бот | Что делает |
| --- | --- |
| [pushup-bot](pushup-bot/) | Челлендж по отжиманиям: до 6 участников, до 3 лидер-бордов одновременно, ежедневный отчёт скриншотом (число распознаётся автоматически), бейджи за серии и итоги челленджа |

Каждый бот — самостоятельный пакет в своей подпапке со своим `package.json`,
зависимостями и инструкцией по запуску.

## Запуск

```bash
git clone https://github.com/vlad1q88-dotcom/challenge-bots.git
cd challenge-bots/pushup-bot
npm ci
cp .env.example .env    # вписать токен от @BotFather
npm start
```

Пошаговая инструкция со всеми подробностями — [pushup-bot/docs/deploy.md](pushup-bot/docs/deploy.md).
