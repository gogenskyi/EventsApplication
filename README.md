# EventsApplication — Події поруч

Кросплатформовий UGC-сервіс для публікації подій навколо користувача: фото/відео, категорія, геолокація, карта, пошук, фільтри та взаємодія «Я йду / Відмовитись / Маршрут».

## Що вже реалізовано

- адаптивний mobile-first UI за макетом;
- інтерактивна карта та визначення геолокації через HTML5 Geolocation API;
- створення події з фото/відео з галереї або камери;
- автоматичні координати або ручне встановлення точки на карті;
- PostgreSQL: користувачі, події, відвідування та скарги;
- реєстрація/email + пароль і cookie-based JWT session;
- Google Sign-In endpoint через Google Identity Services;
- профіль та зміна імені;
- пошук і фільтрація за категоріями;
- real-time оновлення подій та лічильника «йдуть» через Socket.IO;
- скарги на фейк/спам;
- прокладання маршруту через Google Maps;
- підготовлена конфігурація для Mapbox/Google та push-сповіщень.

## Архітектура

`Browser / Mobile Web → Express API → PostgreSQL`

`                         ↘ Socket.IO → realtime clients`

Медіа для MVP зберігаються в `uploads/`. Для production їх варто перенести в S3-compatible storage (S3/R2/GCS) і додати CDN.

## Запуск

1. Встановити Node.js 20+ та PostgreSQL 15+.
2. Створити БД `events`.
3. Виконати `schema.sql`.
4. Скопіювати `.env.example` у `.env` та задати `DATABASE_URL` і довгий `JWT_SECRET`.
5. Виконати `npm install`.
6. Запустити `npm run dev`.
7. Відкрити `http://localhost:3000`.

### Google Login

Створіть OAuth Web Client у Google Cloud Console, додайте `http://localhost:3000` до дозволених JavaScript origins та вставте Client ID у `GOOGLE_CLIENT_ID` у `.env` і `config.js`.

### Карта

Поточний MVP використовує Leaflet + OpenStreetMap, щоб карта працювала без ключа. Для production Mapbox можна підключити через `config.js` (`MAPBOX_TOKEN`) та замінити tile provider.

## Безпека

- пароль зберігається тільки як bcrypt hash;
- JWT лежить у `HttpOnly` cookie, а не в localStorage;
- SQL запити параметризовані;
- медіа має обмеження 100 MB та whitelist MIME types;
- Google ID token перевіряється сервером перед створенням сесії.

## Наступний production-рівень

S3/R2 + CDN для медіа, Redis для масштабування Socket.IO, повноцінні web-push/VAPID, rate limiting, модерація/anti-spam, адміністративна панель, verified-user flow, PWA install/offline cache та окремий Capacitor/React Native mobile client.
