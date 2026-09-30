"use strict";
const $ = s => document.querySelector(s);
const ICON = { concert: "🎵", street: "🏙", trash: "🔥", sport: "⚽", other: "✨" };
const LVIV = [49.8397, 24.0297];
const RADIUS = 3000; // metres
const REFRESH_MS = 30000;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Anonymous per-browser identity: lets the server know which posts are yours and who is "going".
// (Real accounts/login are the next step; this id is not a secret.)
const clientId = (() => {
  try { let id = localStorage.getItem("client-id"); if (!id) { id = crypto.randomUUID(); localStorage.setItem("client-id", id); } return id; }
  catch { return crypto.randomUUID(); }
})();

async function api(path, opts = {}) {
  const r = await fetch("/api" + path, { ...opts, headers: { "X-Client-Id": clientId, ...(opts.headers || {}) } });
  if (!r.ok) { let m = "Помилка сервера"; try { m = (await r.json()).error || m; } catch {} throw new Error(m); }
  return r.status === 204 ? null : r.json();
}

// ---- state
let posts = [], cat = "all", userPos = null, nearOnly = false, openId = null;
let draft = { lat: LVIV[0], lng: LVIV[1], set: false };

// ---- map
const map = L.map("map").setView(LVIV, 13);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);
const layer = L.layerGroup().addTo(map);
let userMarker = null, userCircle = null;

const dist = (a, b) => {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
};
const fmtDist = m => m < 1000 ? Math.round(m / 10) * 10 + " м" : (m / 1000).toFixed(1) + " км";
const ago = ts => {
  const m = Math.max(0, Math.round((Date.now() - ts) / 6e4));
  return m < 1 ? "щойно" : m < 60 ? m + " хв тому" : m < 1440 ? Math.round(m / 60) + " год тому" : Math.round(m / 1440) + " дн тому";
};
const isFresh = p => Date.now() - p.ts < 36e5;

function visible() {
  const s = $("#q").value.trim().toLowerCase();
  return posts
    .filter(p => cat === "all" || p.c === cat)
    .filter(p => !s || (p.t + " " + p.l + " " + p.d).toLowerCase().includes(s))
    .filter(p => !(nearOnly && userPos) || dist(userPos, [p.lat, p.lng]) <= RADIUS)
    .map(p => ({ p, m: userPos ? dist(userPos, [p.lat, p.lng]) : null }))
    .sort((a, b) => (a.m != null && b.m != null ? a.m - b.m : b.p.ts - a.p.ts));
}

function thumb(p) {
  if (p.url) return p.type.startsWith("video") ? `<video src="${esc(p.url)}" muted preload="metadata"></video>` : `<img src="${esc(p.url)}" alt="" loading="lazy">`;
  return ICON[p.c];
}

function render() {
  const items = visible();
  layer.clearLayers();
  items.forEach(({ p }) => {
    const icon = L.divIcon({ className: "", iconSize: [38, 38], iconAnchor: [4, 38],
      html: `<div class="pin ${isFresh(p) ? "fresh-pin" : ""}"><span>${ICON[p.c]}</span></div>` });
    L.marker([p.lat, p.lng], { icon, title: p.t }).on("click", () => openEvent(p.id)).addTo(layer);
  });
  $("#count").textContent = items.length ? `Подій: ${items.length}` : "Подій немає";
  $("#list").innerHTML = items.map(({ p, m }) => `
    <button class="card" data-id="${esc(p.id)}">
      <div class="thumb">${thumb(p)}</div>
      <div><h3>${esc(p.t)}</h3><p>${esc(p.l || "Без назви місця")}</p>
        <div class="meta">${isFresh(p) ? '<span class="fresh">Зараз</span>' : ""}<span>${ago(p.ts)}</span>${m != null ? `<span>${fmtDist(m)}</span>` : ""}<span>${p.n} підуть</span></div></div>
    </button>`).join("") || `<p class="hint">Нічого не знайдено. Змініть фільтр або додайте першу подію.</p>`;
}

async function load(quiet) {
  try { posts = await api("/events"); render(); }
  catch (e) { if (!quiet) toast("Не вдалося завантажити події: " + e.message); }
}

// ---- event details
function openEvent(id, recenter = true) {
  const p = posts.find(x => x.id === id); if (!p) return;
  openId = id;
  const media = p.url ? (p.type.startsWith("video")
    ? `<video class="media" src="${esc(p.url)}" controls playsinline></video>`
    : `<img class="media" src="${esc(p.url)}" alt="${esc(p.t)}">`) : "";
  $("#ev").innerHTML = `${media}<h2>${esc(p.t)}</h2>
    <p class="hint">${ICON[p.c]} ${esc(p.l || "")} · ${ago(p.ts)}${userPos ? " · " + fmtDist(dist(userPos, [p.lat, p.lng])) : ""}</p>
    ${p.d && p.d !== p.t ? `<p>${esc(p.d)}</p>` : ""}
    <div class="actions">
      <button id="go" class="${p.going ? "on" : ""}">${p.going ? "✓ Я піду" : "Піду"} (${p.n})</button>
      <a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank" rel="noopener">Маршрут</a>
      ${p.mine ? '<button id="del">Видалити</button>' : ""}
    </div>`;
  $("#go").onclick = async e => {
    e.target.disabled = true;
    try { const u = await api(`/events/${id}/going`, { method: "POST", body: JSON.stringify({ going: !p.going }) });
      posts = posts.map(x => x.id === id ? u : x); openEvent(id, false); render(); }
    catch (err) { toast(err.message); e.target.disabled = false; }
  };
  if (p.mine) $("#del").onclick = async () => {
    if (!confirm("Видалити цю подію?")) return;
    try { await api(`/events/${id}`, { method: "DELETE" }); posts = posts.filter(x => x.id !== id); $("#event").close(); render(); toast("Подію видалено"); }
    catch (err) { toast(err.message); }
  };
  if (recenter) map.panTo([p.lat, p.lng]);
  if (!$("#event").open) $("#event").showModal();
}
$("#event").addEventListener("close", () => { openId = null; $("#ev").innerHTML = ""; });

// ---- location
function locate(cb) {
  if (!navigator.geolocation) return toast("Браузер не підтримує геолокацію");
  navigator.geolocation.getCurrentPosition(pos => cb([pos.coords.latitude, pos.coords.longitude]),
    () => toast("Не вдалося визначити локацію. Дозвольте доступ у браузері."), { enableHighAccuracy: true, timeout: 10000 });
}
$("#loc").onclick = () => locate(pos => {
  userPos = pos;
  userMarker && userMarker.remove(); userCircle && userCircle.remove();
  userCircle = L.circle(pos, { radius: RADIUS, color: "#5b3df5", weight: 1, fillOpacity: .06 }).addTo(map);
  userMarker = L.circleMarker(pos, { radius: 7, color: "#fff", weight: 2, fillColor: "#5b3df5", fillOpacity: 1 }).addTo(map);
  map.fitBounds(userCircle.getBounds());
  $("#near").disabled = false;
  render(); toast("Показуємо події поруч");
});
$("#near").onchange = e => { nearOnly = e.target.checked; render(); };

// ---- create
const setCoords = () => $("#coords").textContent = `Позначка: ${draft.lat.toFixed(4)}, ${draft.lng.toFixed(4)}`;
function openCreate() {
  if (!draft.set) { const c = userPos || [map.getCenter().lat, map.getCenter().lng]; draft.lat = c[0]; draft.lng = c[1]; }
  setCoords(); $("#create").showModal();
}
$("#add").onclick = () => { draft.set = false; openCreate(); };
$("#here").onclick = () => locate(p => { draft = { lat: p[0], lng: p[1], set: true }; setCoords(); });
$("#pick").onclick = () => {
  $("#create").close(); document.body.classList.add("pick"); toast("Торкніться мапи, щоб поставити позначку");
  map.once("click", e => { document.body.classList.remove("pick"); draft = { lat: e.latlng.lat, lng: e.latlng.lng, set: true }; openCreate(); });
};
$("#publish").onclick = async e => {
  const btn = e.target, d = $("#desc").value.trim(), f = $("#file").files[0];
  if (!d && !f) return toast("Додайте опис або фото чи відео");
  if (f && f.size > 50 * 1024 * 1024) return toast("Файл завеликий (максимум 50 МБ)");
  btn.disabled = true; btn.textContent = f ? "Завантаження…" : "Публікація…";
  let created = null;
  try {
    created = await api("/events", { method: "POST", body: JSON.stringify({ d, c: $("#cat").value, l: $("#place").value.trim(), lat: draft.lat, lng: draft.lng }) });
    if (f) created = await api(`/events/${created.id}/media`, { method: "PUT", headers: { "Content-Type": f.type }, body: f });
    posts.unshift(created);
    $("#desc").value = ""; $("#place").value = ""; $("#file").value = ""; draft = { lat: LVIV[0], lng: LVIV[1], set: false };
    $("#create").close(); render(); map.setView([created.lat, created.lng], 16); toast("Опубліковано");
  } catch (err) {
    if (created) api(`/events/${created.id}`, { method: "DELETE" }).catch(() => {}); // don't leave a half-posted event
    toast(err.message);
  } finally { btn.disabled = false; btn.textContent = "Опублікувати"; }
};

// ---- wiring
$("#chips").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  cat = b.dataset.c; document.querySelectorAll("#chips button").forEach(x => x.classList.toggle("on", x === b)); render();
};
$("#q").oninput = render;
$("#list").onclick = e => { const c = e.target.closest(".card"); if (c) openEvent(c.dataset.id); };
document.querySelectorAll(".x").forEach(x => x.onclick = () => x.closest("dialog").close());
let tt; function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 2600); }

load();
// keep the map live: new events from other users appear without a reload
setInterval(() => { if (!document.hidden && !$("#create").open && !$("#event").open) load(true); }, REFRESH_MS);
