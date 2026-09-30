// Zero-dependency backend: Node >= 22.13 (built-in http + node:sqlite).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DATA = process.env.DATA_DIR || path.join(here, "data");
const UPLOADS = path.join(DATA, "uploads");
const PUBLIC = path.join(here, "public");
fs.mkdirSync(UPLOADS, { recursive: true });

const MAX_FILE = 50 * 1024 * 1024;
const MEDIA = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif",
  "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov" };
const EXT_TYPE = Object.fromEntries(Object.entries(MEDIA).map(([t, e]) => [e, t]));
const STATIC = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".ico": "image/x-icon", ".svg": "image/svg+xml", ".png": "image/png" };
const CATS = new Set(["concert", "street", "trash", "sport", "other"]);

// ---- database
const db = new DatabaseSync(path.join(DATA, "events.db"));
db.exec(`
  CREATE TABLE IF NOT EXISTS events(
    id TEXT PRIMARY KEY, title TEXT NOT NULL, descr TEXT NOT NULL, cat TEXT NOT NULL, place TEXT NOT NULL,
    lat REAL NOT NULL, lng REAL NOT NULL, ts INTEGER NOT NULL, author TEXT NOT NULL, media TEXT, mtype TEXT);
  CREATE TABLE IF NOT EXISTS going(event_id TEXT NOT NULL, client TEXT NOT NULL, PRIMARY KEY(event_id, client));
  CREATE INDEX IF NOT EXISTS events_ts ON events(ts DESC);
`);
if (db.prepare("SELECT COUNT(*) c FROM events").get().c === 0 && process.env.SEED !== "0") {
  const ins = db.prepare("INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,NULL,NULL)");
  const t = Date.now();
  [["Живий концерт у !FESTrepublic", "Львівські гурти грають просто зараз.", "concert", "вул. Старознесенська, 24–26", 49.8447, 24.036, 36e5],
   ["Вуличний арт-фестиваль", "Мурали, музика та відкриті майстер-класи.", "street", "Площа Ринок", 49.8419, 24.0315, 72e5],
   ["Аматорський футбольний матч", "Матч локальної команди. Вхід вільний.", "sport", "Стрийський парк", 49.8235, 24.0185, 18e5],
   ["Нічний вуличний баттл", "Спонтанний баттл, збирається натовп.", "trash", "просп. Свободи", 49.8412, 24.027, 9e5]]
    .forEach(([a, b, c, d, lat, lng, ago]) => ins.run(crypto.randomUUID(), a, b, c, d, lat, lng, t - ago, "seed"));
}
const q = {
  list: db.prepare(`SELECT e.*, (SELECT COUNT(*) FROM going g WHERE g.event_id=e.id) n,
      EXISTS(SELECT 1 FROM going g WHERE g.event_id=e.id AND g.client=?) going
      FROM events e ORDER BY ts DESC LIMIT 500`),
  one: db.prepare(`SELECT e.*, (SELECT COUNT(*) FROM going g WHERE g.event_id=e.id) n,
      EXISTS(SELECT 1 FROM going g WHERE g.event_id=e.id AND g.client=?) going FROM events e WHERE id=?`),
  insert: db.prepare("INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,NULL,NULL)"),
  setMedia: db.prepare("UPDATE events SET media=?, mtype=? WHERE id=?"),
  raw: db.prepare("SELECT * FROM events WHERE id=?"),
  del: db.prepare("DELETE FROM events WHERE id=?"),
  delGoing: db.prepare("DELETE FROM going WHERE event_id=?"),
  goOn: db.prepare("INSERT OR IGNORE INTO going VALUES(?,?)"),
  goOff: db.prepare("DELETE FROM going WHERE event_id=? AND client=?")
};
const view = (r, client) => ({ id: r.id, t: r.title, d: r.descr, c: r.cat, l: r.place, lat: r.lat, lng: r.lng, ts: r.ts,
  n: r.n, going: !!r.going, mine: r.author === client,
  url: r.media ? "/uploads/" + r.media : null, type: r.mtype || "" });

// ---- helpers
const json = (res, code, body) => { const s = JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(s), "Cache-Control": "no-store" });
  res.end(s); };
const fail = (code, msg) => Object.assign(new Error(msg), { code });
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    if (Number(req.headers["content-length"]) > limit) return reject(fail(413, "Файл завеликий"));
    const chunks = []; let size = 0;
    req.on("data", c => { size += c.length; if (size > limit) { reject(fail(413, "Файл завеликий")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
const hits = new Map(); // naive per-IP write limiter: 40 writes / minute
function limited(ip) { const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < 6e4); h.push(now); hits.set(ip, h); return h.length > 40; }
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.every(t => now - t > 6e4)) hits.delete(k); }, 6e4).unref();
const hav = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742000 * Math.asin(Math.sqrt(x)); };
const clean = (v, max) => typeof v === "string" ? v.trim().slice(0, max) : "";

// a file can vanish between stat() and read (e.g. event deleted): never let that crash the server
function stream(rs, res) { rs.on("error", () => res.destroy()); res.on("close", () => rs.destroy()); rs.pipe(res); }

function sendFile(req, res, file, type, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return json(res, 404, { error: "Не знайдено" });
    const h = { "Content-Type": type, "X-Content-Type-Options": "nosniff", "Accept-Ranges": "bytes", "Cache-Control": cache };
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (m) { // range support so videos can seek (required by Safari)
      const s = m[1] === "" ? st.size - Number(m[2]) : Number(m[1]);
      const e = m[1] === "" || m[2] === "" ? st.size - 1 : Math.min(Number(m[2]), st.size - 1);
      if (!(s >= 0 && s <= e)) { res.writeHead(416, { "Content-Range": `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { ...h, "Content-Range": `bytes ${s}-${e}/${st.size}`, "Content-Length": e - s + 1 });
      return stream(fs.createReadStream(file, { start: s, end: e }), res);
    }
    res.writeHead(200, { ...h, "Content-Length": st.size });
    stream(fs.createReadStream(file), res);
  });
}

// ---- api
async function api(req, res, url) {
  const client = req.headers["x-client-id"] || "";
  if (!/^[0-9a-f-]{36}$/.test(client)) throw fail(400, "Потрібен X-Client-Id");
  const parts = url.pathname.split("/").filter(Boolean); // ["api","events",id?,action?]
  if (parts[1] !== "events") throw fail(404, "Не знайдено");
  const id = parts[2], action = parts[3];
  const write = req.method !== "GET";
  if (write && limited(req.socket.remoteAddress)) throw fail(429, "Забагато запитів, зачекайте хвилину");

  if (!id && req.method === "GET") {
    let rows = q.list.all(client);
    const lat = parseFloat(url.searchParams.get("lat")), lng = parseFloat(url.searchParams.get("lng")), rad = parseFloat(url.searchParams.get("radius"));
    if ([lat, lng, rad].every(Number.isFinite)) rows = rows.filter(r => hav(lat, lng, r.lat, r.lng) <= rad);
    return json(res, 200, rows.map(r => view(r, client)));
  }
  if (!id && req.method === "POST") {
    let b; try { b = JSON.parse((await readBody(req, 20_000)).toString() || "{}"); } catch (e) { if (e.code) throw e; throw fail(400, "Некоректний JSON"); }
    const descr = clean(b.d, 1000), title = clean(b.t, 80) || descr.split("\n")[0].slice(0, 80) || "Нова подія";
    if (!CATS.has(b.c)) throw fail(400, "Невідома категорія");
    if (!(Math.abs(b.lat) <= 90 && Math.abs(b.lng) <= 180) || typeof b.lat !== "number" || typeof b.lng !== "number") throw fail(400, "Некоректні координати");
    const nid = crypto.randomUUID();
    q.insert.run(nid, title, descr, b.c, clean(b.l, 120), b.lat, b.lng, Date.now(), client);
    return json(res, 201, view(q.one.get(client, nid), client));
  }
  const row = id && q.raw.get(id);
  if (!row) throw fail(404, "Подію не знайдено");

  if (action === "media" && req.method === "PUT") {
    if (row.author !== client) throw fail(403, "Це не ваша подія");
    const type = (req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (!MEDIA[type]) throw fail(415, "Підтримуються JPEG, PNG, WebP, GIF, MP4, WebM, MOV");
    const body = await readBody(req, MAX_FILE);
    if (!body.length) throw fail(400, "Порожній файл");
    const name = row.id + MEDIA[type];
    if (row.media && row.media !== name) fs.rmSync(path.join(UPLOADS, row.media), { force: true });
    fs.writeFileSync(path.join(UPLOADS, name), body);
    q.setMedia.run(name, type, id);
    return json(res, 200, view(q.one.get(client, id), client));
  }
  if (action === "going" && req.method === "POST") {
    let b; try { b = JSON.parse((await readBody(req, 1000)).toString() || "{}"); } catch { throw fail(400, "Некоректний JSON"); }
    (b.going ? q.goOn : q.goOff).run(id, client);
    return json(res, 200, view(q.one.get(client, id), client));
  }
  if (!action && req.method === "DELETE") {
    if (row.author !== client) throw fail(403, "Це не ваша подія");
    if (row.media) fs.rmSync(path.join(UPLOADS, row.media), { force: true });
    q.delGoing.run(id); q.del.run(id);
    res.writeHead(204); return res.end();
  }
  throw fail(405, "Метод не підтримується");
}

// ---- server
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (req.method !== "GET" && req.method !== "HEAD") throw fail(405, "Метод не підтримується");
    if (url.pathname.startsWith("/uploads/")) {
      const name = decodeURIComponent(url.pathname.slice(9));
      if (!/^[0-9a-f-]{36}\.\w+$/.test(name) || !EXT_TYPE[path.extname(name)]) throw fail(404, "Не знайдено");
      return sendFile(req, res, path.join(UPLOADS, name), EXT_TYPE[path.extname(name)], "public, max-age=86400");
    }
    const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const file = path.join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC + path.sep) || !STATIC[path.extname(file)]) throw fail(404, "Не знайдено");
    sendFile(req, res, file, STATIC[path.extname(file)], "no-cache");
  } catch (e) {
    if (!e.code || e.code >= 500 || typeof e.code !== "number") console.error(e);
    if (!res.headersSent) json(res, typeof e.code === "number" ? e.code : 500, { error: typeof e.code === "number" ? e.message : "Внутрішня помилка сервера" });
  }
}).listen(PORT, () => console.log(`Events app: http://localhost:${PORT}`));
