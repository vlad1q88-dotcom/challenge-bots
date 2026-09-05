# Запуск бота: пошагово

## 1. Создать бота в Телеграме

1. Открой [@BotFather](https://t.me/BotFather) и отправь `/newbot`.
2. Введи название (например `Отжимания`) и username — он должен заканчиваться на `bot`
   (например `pushup_leaderboard_bot`).
3. BotFather пришлёт токен вида `8123456789:AAH...`. Это пароль от бота — никому не
   показывай и не клади в git.

Полезно сразу настроить у BotFather: `/setdescription` — короткое описание,
`/setuserpic` — аватарку. Команды бот регистрирует сам при запуске.

## 2. Подготовить машину

Нужен **Node.js 22.18 или новее** (бот запускается прямо из TypeScript, без сборки).

```bash
node -v      # должно быть v22.18+ или v24
```

Если версия старая или Node нет:

* **Ubuntu/Debian:** `curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt install -y nodejs`
* **macOS:** `brew install node`
* **Windows:** установщик с [nodejs.org](https://nodejs.org) (LTS).

Памяти нужно от 1 ГБ: распознавание скриншота держит воркер примерно на 250 МБ.

## 3. Скачать код и поставить зависимости

```bash
git clone https://github.com/vlad1q88-dotcom/challenge-bots.git
cd challenge-bots/pushup-bot
npm ci
```

Папку можно назвать иначе — тогда последним аргументом у `git clone` укажи своё имя,
например `git clone …/challenge-bots.git boty` и дальше `cd boty/pushup-bot`.

`npm ci` ставит в том числе языковые данные для распознавания, поэтому в работе
интернет нужен только для самого Телеграма.

## 4. Прописать токен

```bash
cp .env.example .env
nano .env          # или любой редактор
```

```env
BOT_TOKEN=8123456789:AAH...      # токен от BotFather
CHALLENGE_TIMEZONE=Europe/Moscow # по этому поясу считается «день» челленджа
DATA_FILE=./data/db.json         # файл с данными, создастся сам
```

## 5. Запустить

```bash
npm start
```

В консоли должно появиться:

```
✅ Бот @pushup_leaderboard_bot запущен. Часовой пояс челленджей: Europe/Moscow.
```

Пока команда работает — бот в сети. Остановить: `Ctrl+C`.

## 6. Проверить в Телеграме

1. Найди бота по username и нажми **Start**.
2. `/new` → название → срок (например `30`) → норма (например `60`) → ник.
3. Бот пришлёт код приглашения. Соперник открывает **личный чат с ботом**, жмёт Start
   и отправляет `/join КОД`, затем выбирает свой ник.
4. Инициатор запускает: `/begin КОД` (нужен минимум один соперник, максимум 6 человек).
5. Каждый день присылай боту скриншот вкладки **Week** из приложения-счётчика —
   число за сегодня бот прочитает сам и разошлёт всем обновлённый борд.

> Важно: бот рассылает борды в **личные чаты**. Каждый участник должен хотя бы раз
> написать боту напрямую (Start или `/join`), иначе ему некуда слать лидер-борд.

## 7. Держать бота включённым (Linux, systemd)

Чтобы бот не выключался вместе с терминалом и поднимался после перезагрузки:

```bash
sudo nano /etc/systemd/system/pushup-bot.service
```

```ini
[Unit]
Description=Pushup challenge leaderboard bot
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/ВАШ_ПОЛЬЗОВАТЕЛЬ/challenge-bots/pushup-bot
ExecStart=/usr/bin/node src/index.ts
EnvironmentFile=/home/ВАШ_ПОЛЬЗОВАТЕЛЬ/challenge-bots/pushup-bot/.env
Restart=always
RestartSec=5
User=ВАШ_ПОЛЬЗОВАТЕЛЬ

[Install]
WantedBy=multi-user.target
```

Путь к Node проверь командой `which node` — если он не `/usr/bin/node`, подставь свой.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now pushup-bot
systemctl status pushup-bot        # состояние
journalctl -u pushup-bot -f        # логи
```

## 8. Обновления и бэкап

```bash
cd challenge-bots/pushup-bot
git pull
npm ci
sudo systemctl restart pushup-bot
```

Все данные — в одном файле `pushup-bot/data/db.json` (участники, отчёты, бейджи). Бэкап:

```bash
cp data/db.json ~/pushup-backup-$(date +%F).json
```

## Если что-то пошло не так

| Симптом | Что делать |
| --- | --- |
| `Unknown file extension ".ts"` | старый Node — нужен 22.18+ (`node -v`) |
| `Телеграм не принял токен` | опечатка в `BOT_TOKEN`, возьми токен у BotFather заново |
| `Не удалось подключиться к Телеграму` | нет интернета или блокируется `api.telegram.org` |
| Бот не отвечает в группе | он рассчитан на личные чаты: напиши ему напрямую |
| `❌ Не вижу недельный график` | пришли скриншот вкладки **Week** целиком, без обрезки |
| `❌ Это скриншот другой недели` | пролистай график на текущую неделю |
| Второй отчёт за день | так и задумано: один отчёт в день, чтобы не догонять задним числом |
