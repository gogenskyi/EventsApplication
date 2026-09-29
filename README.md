# EventsApplication — Події поруч

Кросплатформовий UGC-сервіс: користувачі публікують фото/відео подій, автоматично додають геолокацію, а інші бачать активність навколо себе на інтерактивній карті.

## Реалізовано в MVP

- mobile-first адаптивний UI за макетом;
- PWA: встановлення на телефон, service worker і offline app shell;
- Leaflet + OpenStreetMap інтерактивна карта;
- HTML5 Geolocation API + ручний вибір точки на карті;
- створення допису з камери або галереї;
- фото/відео upload з MIME та розміром файла, що контролюються сервером;
- PostgreSQL єдине джерело даних;
- реєстрація та вхід email/password;
- Google Sign-In з серверною перевіркою ID token;
- JWT session в HttpOnly cookie, без зберігання токена в localStorage;
- профіль, зміна імені та upload аватарки;
- пошук, категорії та пошук у радіусі навколо координат;
- «Я йду», «Відмовитись», «Прокласти маршрут»;
- Socket.IO для realtime подій та лічильника учасників;
- скарги на фейк/спам;
- trust status: new / verified / reported / hidden;
- moderator/admin API та `admin.html` для розгляду скарг;
- web push: підписка браузера, збереження координат підписки та сповіщення про нові події в радіусі 30 км;
- центр сповіщень у застосунку;
- єдиний API, який можна використовувати і вебклієнтом, і майбутнім нативним mobile client.

## Архітектура

`Web/PWA → Express API → PostgreSQL`

`                    ↘ Socket.IO → realtime clients`

`                    ↘ Web Push → nearby subscribers`

Для MVP медіа зберігаються в `uploads/`. Для production рекомендовано S3-compatible storage (AWS S3 / Cloudflare R2 / GCS) + CDN.

## Запуск локально

1. Node.js 20+ та PostgreSQL 15+.
2. Створити БД `events`.
3. Виконати `schema.sql`.
4. Скопіювати `.env.example` у `.env`.
5. Задати мінімум `DATABASE_URL` і довгий випадковий `JWT_SECRET`.
6. Для Google входу додати `GOOGLE_CLIENT_ID`.
7. Для web push згенерувати VAPID keys і додати `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
8. `npm install`.
9. `npm run dev`.
10. Відкрити `http://localhost:3000`.

## Google Login

Створіть OAuth Web Client у Google Cloud Console, додайте origin вашого сайту в дозволені JavaScript origins та вкажіть client ID у `.env`.

## Push

Web Push працює тільки в secure context (HTTPS; localhost є винятком для локальної розробки). Після запуску користувач входить в акаунт, відкриває сповіщення та натискає «Увімкнути push-сповіщення».

Подія створює in-app notification для підписаних користувачів у радіусі 30 км і, якщо VAPID налаштований, відправляє browser push.

## Безпека

- bcrypt hash для паролів;
- JWT тільки в HttpOnly cookie;
- SameSite cookie та Secure у production;
- параметризовані SQL-запити;
- серверна перевірка Google ID token;
- MIME/size whitelist для media та avatar uploads;
- moderator/admin endpoints захищені роллю;
- користувач не може сам виставити собі verified через public API.

## Структура

```text
index.html          web/PWA interface
style.css           responsive UI
script.js            map, feed, auth, events
notifications.js     PWA + push client
server.js            Express API + Socket.IO + Web Push
schema.sql           PostgreSQL schema
admin.html           moderation dashboard
manifest.webmanifest PWA metadata
sw.js                service worker
favicon.svg          app icon
config.js            public client configuration
.env.example         server configuration template
```

## Production roadmap

- S3/R2 + CDN для медіа;
- Redis adapter для Socket.IO при горизонтальному масштабуванні;
- rate limiting, CSRF strategy для cookie-auth, audit logs;
- image/video transcoding and thumbnails;
- повноцінна модерація та anti-spam/abuse detection;
- verified-user workflow;
- native Android/iOS client на тому самому API (Capacitor/React Native);
- Mapbox/Google Maps provider для production залежно від вимог до картографії.
