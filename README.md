# LifeQuest

Геймифицированный ежедневник: квесты, привычки, сферы жизни, финансы (доходы/расходы/сбережения/долги), достижения.

Данные хранятся в `localStorage` браузера — остаются на том устройстве, где открыт сайт. Между устройствами данные не синхронизируются сами — используй экспорт/импорт JSON в Настройках, чтобы перенести прогресс.

## Локальный запуск

```bash
npm install
npm run dev
```
Откроется на `http://localhost:5173`.

## Сборка

```bash
npm run build
```
Результат — статические файлы в папке `dist/`. Это обычный статический сайт: HTML+CSS+JS, бэкенд не нужен.

---

## Вариант 1: через git — Vercel / Netlify

1. Залей репозиторий на GitHub (или GitLab/Bitbucket):
   ```bash
   git add -A
   git commit -m "LifeQuest v1.0"
   git remote add origin <ссылка на твой пустой репозиторий>
   git push -u origin main
   ```
2. На [vercel.com](https://vercel.com) или [netlify.com](https://netlify.com) — «Add new project» → «Import Git Repository» → выбрать репозиторий.
3. Настройки сборки определятся автоматически (Vite): команда сборки `npm run build`, папка `dist`. Жать «Deploy» не нужно ничего менять руками.
4. Получишь постоянную ссылку вида `lifequest-xxxx.vercel.app`. Каждый `git push` дальше будет пересобирать сайт автоматически.

## Вариант 2: свой сервер на Ubuntu 24.04 (через git)

Предполагается, что на сервере уже есть nginx и Node.js 20+.

```bash
# на сервере
git clone <ссылка на твой репозиторий> lifequest-app
cd lifequest-app
npm install
npm run build
sudo mkdir -p /var/www/lifequest
sudo cp -r dist/* /var/www/lifequest/
```

Конфиг nginx (`/etc/nginx/sites-available/lifequest`):
```nginx
server {
    listen 80;
    server_name your-domain-or-ip;
    root /var/www/lifequest;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/lifequest /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Обновление после изменений в коде — на сервере:
```bash
cd lifequest-app && git pull && npm run build && sudo cp -r dist/* /var/www/lifequest/
```

HTTPS проще всего добавить через `certbot --nginx` (Let's Encrypt), если есть свой домен.

## Структура проекта

```
src/App.jsx      — всё приложение (один файл, как и в артефакте Claude)
src/main.jsx     — точка входа React
src/index.css    — подключение Tailwind
tailwind.config.js, postcss.config.js, vite.config.js — конфигурация сборки
```

Дальнейшие правки — это правки одного файла `src/App.jsx`, всё остальное трогать не нужно.
