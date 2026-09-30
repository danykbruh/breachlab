// BreachLab — клиент. Маршруты в адресе после #:
// #/ · #/room/<slug> · #/tools · #/leaderboard · #/profile · #/login · #/signup · #/forgot · #/rules
(() => {
"use strict";
const cfg = window.BL_CONFIG || {};
const $main = document.getElementById("main");
if (!window.supabase || !cfg.supabaseUrl || cfg.supabaseUrl.includes("ВАШ")) {
  $main.innerHTML = "<h1>Нужна настройка</h1><p class='muted'>Впишите адрес и публичный ключ Supabase в js/config.js.</p>";
  return;
}
const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
let user = null, profile = null;
let filter = "all";                       // выбранная категория на главной
let query = "", sortBy = "order";         // поиск и сортировка комнат

// ---------- помощники ----------
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k instanceof Node ? k : String(k));
  return el;
}
const LABEL = { soc: "SOC", web: "Веб", linux: "Linux", forensics: "Форензика", crypto: "Криптография", osint: "OSINT",
                easy: "Легко", medium: "Средне", hard: "Сложно" };
// Иконки (SVG в стиле Lucide) — вместо эмодзи, чтобы выглядели одинаково на всех устройствах
const ICONS = {
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  terminal: '<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  radar: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  door: '<path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.56v16.16a1 1 0 0 1-1.24.97L5 20V5.56a2 2 0 0 1 1.52-1.94l4-1A2 2 0 0 1 13 4.56z"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36z"/>',
  cap: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/><path d="M22 10v6"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98"/><path d="m15.41 6.51-6.82 3.98"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.48 12.89 17 22l-5-3-5 3 1.52-9.11"/>',
  printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  calendarStar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m12 13 1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z"/>',
  medal: '<path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><circle cx="12" cy="17" r="5"/>',
};
function icon(name, size = 18) {
  const span = document.createElement("span");
  span.className = "ic"; span.setAttribute("aria-hidden", "true");
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;
  return span;
}
const ICON = { soc: "shield", web: "globe", linux: "terminal", forensics: "search", crypto: "lock", osint: "radar" };
const catIcon = (c, size) => icon(ICON[c] || "shield", size);
function md(text) {                     // markdown → безопасный HTML
  const div = h("div", { class: "md" });
  div.innerHTML = DOMPurify.sanitize(marked.parse(text || ""));
  div.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href");
    if (/^https?:/.test(href) || href.startsWith("rooms/")) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
  });
  return div;
}
function render(...nodes) {
  $main.replaceChildren(...nodes.filter((n) => n != null && n !== false));
  $main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
function setNav(name) {
  document.querySelectorAll("[data-nav]").forEach((a) =>
    a.dataset.nav === name ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  document.getElementById("navProfile").hidden = !user;
  document.getElementById("navLogin").hidden = !!user;
}
function fail(msg) { render(h("h1", {}, "Не получилось загрузить"), h("p", { class: "muted" }, msg || "Проверьте интернет и обновите страницу.")); }
const needLogin = (what) => h("div", { class: "card" }, h("p", {}, `Войдите, чтобы ${what}.`),
  h("a", { href: "#/login", class: "btn-small" }, "Войти"), " ", h("a", { href: "#/signup" }, "Регистрация"));
const plural = (n, one, few, many) => { const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many; };

// ---------- уровни и значки ----------
const LEVELS = [
  [0, "Новичок"], [30, "Стажёр"], [80, "Аналитик L1"], [160, "Аналитик L2"], [260, "Охотник за угрозами"],
  [400, "Эксперт"], [600, "Мастер"], [900, "Легенда"],
];
function levelOf(points) {
  let i = 0; while (i + 1 < LEVELS.length && points >= LEVELS[i + 1][0]) i++;
  const [from, name] = LEVELS[i], next = LEVELS[i + 1];
  return { n: i + 1, name, from, to: next ? next[0] : null,
           pct: next ? Math.round(((points - from) / (next[0] - from)) * 100) : 100 };
}
const localDay = (d) => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`; };
function streakOf(dates) {                                   // дни подряд, заканчивая сегодня или вчера
  const days = new Set(dates.map(localDay));
  const d = new Date(); let s = 0;
  if (!days.has(localDay(d))) d.setDate(d.getDate() - 1);
  while (days.has(localDay(d))) { s++; d.setDate(d.getDate() - 1); }
  return s;
}
function bestStreakOf(dates) {
  const days = [...new Set(dates.map(localDay))].map((k) => { const [y, m, d] = k.split("-").map(Number); return Date.UTC(y, m - 1, d) / 864e5; }).sort((a, b) => a - b);
  let best = 0, cur = 0, prev = null;
  for (const d of days) { cur = prev !== null && d - prev === 1 ? cur + 1 : 1; best = Math.max(best, cur); prev = d; }
  return best;
}
const BADGES = [
  { id: "first",   icon: "flag", name: "Первый флаг",      desc: "Решить первое задание",              test: (s) => s.solved >= 1 },
  { id: "room1",   icon: "door", name: "Первая комната",   desc: "Пройти комнату целиком",             test: (s) => s.roomsDone >= 1 },
  { id: "room5",   icon: "compass", name: "Исследователь",    desc: "Пройти 5 комнат",                    test: (s) => s.roomsDone >= 5 },
  { id: "all",     icon: "cap", name: "Выпускник",        desc: "Пройти все комнаты",                 test: (s) => s.roomsTotal > 0 && s.roomsDone === s.roomsTotal },
  { id: "p100",    icon: "target", name: "Сотня",            desc: "Набрать 100 очков",                  test: (s) => s.points >= 100 },
  { id: "p300",    icon: "zap", name: "Три сотни",        desc: "Набрать 300 очков",                  test: (s) => s.points >= 300 },
  { id: "streak3", icon: "flame", name: "В ритме",          desc: "Решать задания 3 дня подряд",        test: (s) => s.bestStreak >= 3 },
  { id: "streak7", icon: "calendar", name: "Неделя без пропусков", desc: "Решать задания 7 дней подряд",   test: (s) => s.bestStreak >= 7 },
  { id: "path1",   icon: "route", name: "Первый путь",      desc: "Пройти путь обучения целиком",       test: (s) => s.pathsDone >= 1 },
  { id: "paths",   icon: "medal", name: "Все дороги",       desc: "Пройти все пути обучения",           test: (s) => s.pathsTotal > 0 && s.pathsDone === s.pathsTotal },
  { id: "nohint",  icon: "bulb",  name: "Без подсказок",    desc: "Пройти сложную комнату, не открыв ни одной подсказки", test: (s) => s.hardNoHint },
  { id: "night",   icon: "moon", name: "Ночная смена",     desc: "Решить задание между 00:00 и 05:00", test: (s) => s.night },
  { id: "soc",     icon: "shield", name: "Аналитик SOC",     desc: "Пройти все комнаты SOC",             test: (s) => s.catDone("soc") },
  { id: "web",     icon: "globe", name: "Веб-детектив",     desc: "Пройти все веб-комнаты",             test: (s) => s.catDone("web") },
  { id: "linux",   icon: "terminal", name: "Пингвин",          desc: "Пройти все комнаты по Linux",        test: (s) => s.catDone("linux") },
  { id: "crypto",  icon: "lock", name: "Шифровальщик",     desc: "Пройти все комнаты по криптографии", test: (s) => s.catDone("crypto") },
  { id: "forensics", icon: "search", name: "Криминалист",    desc: "Пройти все комнаты по форензике",    test: (s) => s.catDone("forensics") },
];

// ---------- данные ----------
async function loadProfile() {
  profile = null;
  if (!user) return;
  const { data } = await sb.from("profiles").select("username,is_public").eq("user_id", user.id).maybeSingle();
  profile = data;
}
async function mySolves() {
  if (!user) return [];
  const { data } = await sb.from("solves").select("task_id,points,solved_at");
  return data || [];
}
async function loadCatalog() {
  const [{ data: rooms, error }, { data: tasks }] = await Promise.all([
    sb.from("rooms").select("id,slug,title,summary,category,difficulty,position").order("position"),
    sb.from("tasks").select("id,room_id,points"),
  ]);
  if (error) throw error;
  const { data: paths } = await sb.from("paths").select("slug,title,summary,room_slugs,position").order("position");
  return { rooms: rooms || [], tasks: tasks || [], paths: paths || [] };
}
// Сводка прогресса: по комнатам, очки, серия, значки
async function myHintTasks() {
  if (!user) return new Set();
  const { data } = await sb.from("hint_unlocks").select("task_id");
  return new Set((data || []).map((r) => r.task_id));
}
function pathProgress(path, perRoom) {
  const list = path.room_slugs.map((slug) => perRoom.find((p) => p.room.slug === slug)).filter(Boolean);
  const done = list.filter((p) => p.complete).length;
  return { path, list, done, total: list.length, complete: list.length > 0 && done === list.length };
}
function summarize(rooms, tasks, solves, paths = [], hinted = new Set()) {
  const solvedIds = new Set(solves.map((s) => s.task_id));
  const perRoom = rooms.map((r) => {
    const ids = tasks.filter((t) => t.room_id === r.id).map((t) => t.id);
    const done = ids.filter((id) => solvedIds.has(id)).length;
    return { room: r, total: ids.length, done, complete: ids.length > 0 && done === ids.length };
  });
  const dates = solves.map((s) => s.solved_at);
  const s = {
    perRoom, solvedIds,
    points: solves.reduce((a, r) => a + r.points, 0),
    solved: solves.length,
    roomsTotal: perRoom.filter((p) => p.total).length,
    roomsDone: perRoom.filter((p) => p.complete).length,
    streak: streakOf(dates), bestStreak: bestStreakOf(dates),
    night: dates.some((d) => new Date(d).getHours() < 5),
    catDone: (c) => { const list = perRoom.filter((p) => p.room.category === c && p.total); return list.length > 0 && list.every((p) => p.complete); },
  };
  s.perPath = paths.map((p) => pathProgress(p, perRoom));
  s.pathsTotal = s.perPath.length;
  s.pathsDone = s.perPath.filter((p) => p.complete).length;
  s.hardNoHint = perRoom.some((p) => p.complete && p.room.difficulty === "hard" &&
    !tasks.some((t) => t.room_id === p.room.id && hinted.has(t.id)));
  s.badges = BADGES.map((b) => ({ ...b, earned: !!b.test(s) }));
  s.next = perRoom.find((p) => p.total && !p.complete) || null;
  return s;
}

// ---------- главная ----------
async function viewRooms() {
  setNav("rooms");
  const [{ rooms, tasks, paths }, solves, stats, hinted, daily] = await Promise.all([
    loadCatalog(), mySolves(), sb.rpc("platform_stats").then((r) => r.data).catch(() => null), myHintTasks(),
    sb.rpc("daily_task").then((r) => r.data).catch(() => null),
  ]);
  const s = summarize(rooms, tasks, solves, paths, hinted);
  syncBadges(s, true);
  const cats = [...new Set(rooms.map((r) => r.category))];

  const grid = h("div", { class: "grid" });
  const DIFF = { easy: 1, medium: 2, hard: 3 };
  const search = h("input", { type: "search", class: "search", placeholder: "Поиск комнаты…", "aria-label": "Поиск комнаты", value: query, oninput: (e) => { query = e.target.value; draw(); } });
  const sortSel = h("select", { class: "sort", "aria-label": "Сортировка", onchange: (e) => { sortBy = e.target.value; draw(); } },
    [["order", "По порядку"], ["easy", "Сначала лёгкие"], ["hard", "Сначала сложные"], ...(user ? [["todo", "Сначала непройденные"]] : [])]
      .map(([v, t]) => h("option", { value: v, selected: v === sortBy }, t)));
  const empty = h("p", { class: "muted", hidden: true }, "Ничего не нашлось.");
  const draw = () => {
    const q = query.trim().toLowerCase();
    let list = s.perRoom.filter((p) => (filter === "all" || p.room.category === filter) &&
      (!q || (p.room.title + " " + p.room.summary).toLowerCase().includes(q)));
    if (sortBy === "easy") list = [...list].sort((a, b) => DIFF[a.room.difficulty] - DIFF[b.room.difficulty]);
    if (sortBy === "hard") list = [...list].sort((a, b) => DIFF[b.room.difficulty] - DIFF[a.room.difficulty]);
    if (sortBy === "todo") list = [...list].sort((a, b) => a.complete - b.complete);
    grid.replaceChildren(...list.map(roomCard));
    empty.hidden = list.length > 0;
    chips.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.cat === filter ? "true" : "false"));
  };
  const roomCard = ({ room: r, total, done, complete }) => {
    const pct = total ? Math.round((done / total) * 100) : 0;
    return h("a", { class: `card room${complete ? " complete" : ""}`, href: `#/room/${r.slug}` },
      h("div", { class: "room-top" },
        h("span", { class: "room-icon" }, catIcon(r.category, 20)),
        h("div", { class: "tags" }, h("span", { class: "tag" }, LABEL[r.category]), h("span", { class: `tag ${r.difficulty}` }, LABEL[r.difficulty]))),
      h("h3", {}, r.title),
      h("p", { class: "muted", style: "margin:0" }, r.summary),
      h("div", { class: "room-foot" },
        user ? h("div", { class: "bar", role: "img", "aria-label": `Решено ${done} из ${total}` }, h("i", { style: `width:${pct}%` })) : null,
        h("small", { class: "muted" }, user ? (complete ? h("span", { class: "ok-text" }, icon("check", 14), " Пройдена") : `${done} из ${total} ${plural(total, "задания", "заданий", "заданий")}`)
                                             : `${total} ${plural(total, "задание", "задания", "заданий")}`)));
  };
  const chips = h("div", { class: "chips", role: "group", "aria-label": "Фильтр по категориям" },
    [["all", "Все"], ...cats.map((c) => [c, LABEL[c]])].map(([c, label]) =>
      h("button", { type: "button", class: "chip", "data-cat": c, onclick: () => { filter = c; draw(); } }, c === "all" ? null : catIcon(c, 15), label)));
  if (!cats.includes(filter)) filter = "all";

  const top = user ? welcomeBack(s) : hero(stats);
  const dailyBox = daily ? dailyCard(daily) : null;
  const pathCards = s.perPath.length ? h("div", { class: "paths" }, s.perPath.map(pathCard)) : null;
  render(top, dailyBox,
    pathCards ? h("h2", {}, "Пути обучения") : null, pathCards,
    h("h2", { id: "rooms" }, "Комнаты"),
    h("div", { class: "toolbar" }, search, sortSel), chips,
    rooms.length ? grid : h("p", { class: "muted" }, "Комнат пока нет."), empty);
  draw();
}
// ---------- задание дня ----------
function dailyCard(d) {
  const left = () => { const now = new Date(); const msk = new Date(now.getTime() + (now.getTimezoneOffset() + 180) * 60000);
    const mins = 24 * 60 - (msk.getHours() * 60 + msk.getMinutes()); return `${Math.floor(mins / 60)} ч ${mins % 60} мин`; };
  return h("a", { class: `card daily${d.solved ? " done" : ""}`, href: `#/room/${d.room_slug}/${d.task_id}` },
    h("span", { class: "daily-icon" }, icon(d.solved ? "check" : "calendarStar", 26)),
    h("div", { class: "daily-body" },
      h("p", { class: "eyebrow", style: "margin:0 0 4px" }, "Задание дня", h("span", { class: "daily-bonus" }, `+${d.bonus} бонус`)),
      h("b", { class: "daily-q" }, d.question),
      h("small", { class: "muted" }, `${d.room_title} · ${d.points} очк.`, d.solved ? " · решено сегодня" : ` · новое через ${left()}`)),
    h("span", { class: "daily-go" }, d.solved ? icon("check", 18) : icon("arrow", 18)));
}

// ---------- уведомления о новых значках ----------
function toast(title, text, iconName = "award") {
  let box = document.getElementById("toasts");
  if (!box) { box = h("div", { id: "toasts", class: "toasts", role: "status", "aria-live": "polite" }); document.body.append(box); }
  const el = h("div", { class: "toast" }, h("span", { class: "toast-icon" }, icon(iconName, 22)),
    h("div", {}, h("b", {}, title), h("small", {}, text)),
    h("button", { type: "button", class: "toast-x", "aria-label": "Закрыть", onclick: () => close() }, "×"));
  const close = () => { el.classList.add("out"); setTimeout(() => el.remove(), 250); };
  box.append(el); setTimeout(close, 6000);
}
// Запоминаем полученные значки на устройстве; новые показываем уведомлением
function syncBadges(s, announce = false) {
  if (!user || !s) return;
  const key = `bl_badges_${user.id}`, earned = s.badges.filter((b) => b.earned).map((b) => b.id);
  let known = null;
  try { known = JSON.parse(localStorage.getItem(key) || "null"); } catch {}
  if (Array.isArray(known) && announce) {
    s.badges.filter((b) => b.earned && !known.includes(b.id)).forEach((b, i) =>
      setTimeout(() => toast(`Новый значок: ${b.name}`, b.desc, b.icon), i * 400));
    s.perPath.filter((p) => p.complete).forEach((p) => {
      if (!known.includes(`path:${p.path.slug}`)) toast(`Путь пройден: ${p.path.title}`, "Получите сертификат на странице пути", "medal");
    });
  }
  const all = [...earned, ...s.perPath.filter((p) => p.complete).map((p) => `path:${p.path.slug}`)];
  try { localStorage.setItem(key, JSON.stringify(all)); } catch {}
}
async function checkNewBadges() {
  try {
    const [{ rooms, tasks, paths }, solves, hinted] = await Promise.all([loadCatalog(), mySolves(), myHintTasks()]);
    syncBadges(summarize(rooms, tasks, solves, paths, hinted), true);
  } catch (e) { console.warn(e); }
}

function pathCard(pp) {
  const pct = pp.total ? Math.round((pp.done / pp.total) * 100) : 0;
  return h("a", { class: `card path${pp.complete ? " complete" : ""}`, href: `#/path/${pp.path.slug}` },
    h("div", { class: "room-top" }, h("span", { class: "room-icon" }, icon(pp.complete ? "medal" : "route", 20)),
      h("span", { class: "tag" }, `${pp.total} ${plural(pp.total, "комната", "комнаты", "комнат")}`)),
    h("h3", {}, pp.path.title),
    h("p", { class: "muted", style: "margin:0" }, pp.path.summary),
    h("div", { class: "room-foot" },
      user ? h("div", { class: "bar" }, h("i", { style: `width:${pct}%` })) : null,
      h("small", { class: "muted" }, user ? (pp.complete ? h("span", { class: "ok-text" }, icon("check", 14), " Путь пройден") : `${pp.done} из ${pp.total} комнат`) : "Начать путь")));
}
// Кнопка «Получить сертификат»: сервер проверяет прохождение и выдаёт номер
function certButton(slug, existingId) {
  if (existingId) return h("a", { class: "btn-small", href: `#/cert/${existingId}` }, icon("award", 16), " Сертификат");
  const b = h("button", { type: "button", class: "ghost cert-btn", onclick: async () => {
    b.disabled = true; b.textContent = "Выдаю…";
    const { data, error } = await sb.rpc("issue_certificate", { p_path_slug: slug });
    if (error || !data?.id) { b.disabled = false; b.textContent = data?.error === "incomplete" ? `Осталось заданий: ${data.missing}` : "Не получилось, попробуйте ещё раз"; return; }
    location.hash = `#/cert/${data.id}`;
  } }, icon("award", 16), " Получить сертификат");
  return b;
}
const fmtDate = (d) => new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

async function viewCert(id) {
  setNav("");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return render(h("h1", {}, "Сертификат не найден"));
  const { data: c, error } = await sb.rpc("get_certificate", { p_id: id });
  if (error) return fail();
  if (!c) return render(h("h1", {}, "Сертификат не найден"), h("p", { class: "muted" }, "Проверьте номер сертификата."));
  const url = location.origin + location.pathname + `#/cert/${c.id}`;
  const msg = h("p", { class: "msg", role: "status" });
  document.title = `Сертификат — ${c.path_title} — BreachLab`;
  render(
    h("div", { class: "cert-actions no-print" },
      h("a", { href: `#/u/${encodeURIComponent(c.username)}`, class: "muted" }, `← Профиль ${c.username}`),
      h("div", { class: "actions" },
        h("button", { type: "button", class: "ghost", onclick: () => window.print() }, icon("printer", 16), " Сохранить в PDF"),
        h("button", { type: "button", class: "ghost", onclick: async () => { try { await navigator.clipboard.writeText(url); msg.className = "msg ok"; msg.textContent = "Ссылка скопирована."; } catch { prompt("Ссылка на сертификат:", url); } } }, icon("share", 16), " Ссылка"))),
    msg,
    h("article", { class: "cert" },
      h("div", { class: "cert-corner tl", "aria-hidden": "true" }), h("div", { class: "cert-corner br", "aria-hidden": "true" }),
      h("div", { class: "cert-logo" }, h("span", { class: "logo-mark" }, ">_"), " BreachLab"),
      h("p", { class: "cert-kicker" }, "Сертификат о прохождении"),
      h("h1", { class: "cert-path" }, c.path_title),
      h("p", { class: "cert-text" }, "Настоящим подтверждается, что"),
      h("p", { class: "cert-name" }, c.username),
      h("p", { class: "cert-text" }, `успешно прошёл(ла) путь обучения из ${c.rooms} ${plural(c.rooms, "комнаты", "комнат", "комнат")} и решил(а) все практические задания.`),
      h("div", { class: "cert-foot" },
        h("div", {}, h("small", {}, "Дата выдачи"), h("b", {}, fmtDate(c.issued_at))),
        h("div", { class: "cert-seal", "aria-hidden": "true" }, icon("award", 34)),
        h("div", {}, h("small", {}, "Номер"), h("b", { class: "mono" }, c.id.slice(0, 8).toUpperCase()))),
      h("p", { class: "cert-verify" }, "Проверить подлинность: ", h("span", { class: "mono" }, url))));
}

async function viewPublic(username) {
  setNav("");
  const [{ data: pr, error }, { rooms, tasks, paths }] = await Promise.all([sb.rpc("public_profile", { p_username: username }), loadCatalog()]);
  if (error) return fail();
  if (!pr) return render(h("h1", {}, "Игрок не найден"), h("a", { href: "#/leaderboard" }, "← К рейтингу"));
  if (pr.hidden) return render(h("h1", {}, pr.username), h("p", { class: "muted" }, "Игрок скрыл свой профиль."));
  const s = summarize(rooms, tasks, pr.solves || [], paths);
  const lv = levelOf(s.points);
  const certs = new Map((pr.certificates || []).map((c) => [c.path_slug, c.id]));
  const earned = s.badges.filter((b) => b.earned && b.id !== "nohint");
  const url = location.origin + location.pathname + `#/u/${encodeURIComponent(pr.username)}`;
  const msg = h("p", { class: "msg", role: "status" });
  const isMe = profile && profile.username === pr.username;
  document.title = `${pr.username} — BreachLab`;
  render(
    h("section", { class: "card profile-head" },
      h("div", { class: "avatar", "aria-hidden": "true" }, pr.username.slice(0, 2).toUpperCase()),
      h("div", { style: "flex:1;min-width:200px" },
        h("p", { class: "eyebrow" }, `Уровень ${lv.n} · ${lv.name}`),
        h("h1", { style: "margin:0" }, pr.username),
        h("small", { class: "muted" }, `На BreachLab с ${fmtDate(pr.joined)}`)),
      h("button", { type: "button", class: "ghost", onclick: async () => { try { await navigator.clipboard.writeText(url); msg.className = "msg ok"; msg.textContent = "Ссылка на профиль скопирована."; } catch { prompt("Ссылка на профиль:", url); } } }, icon("share", 16), " Поделиться")),
    msg,
    isMe && pr.is_public === false ? h("p", { class: "hint" }, "Профиль скрыт: другие его не видят. Включить можно в настройках профиля.") : null,
    h("div", { class: "stats" },
      h("div", {}, h("b", {}, s.points), h("span", {}, "очков")),
      h("div", {}, h("b", {}, s.solved), h("span", {}, "флагов")),
      h("div", {}, h("b", {}, `${s.roomsDone}/${s.roomsTotal}`), h("span", {}, "комнат")),
      h("div", {}, h("b", {}, `${s.pathsDone}/${s.pathsTotal}`), h("span", {}, "путей")),
      h("div", {}, h("b", {}, certs.size), h("span", {}, plural(certs.size, "сертификат", "сертификата", "сертификатов")))),
    certs.size ? h("h2", {}, "Сертификаты") : null,
    certs.size ? h("div", { class: "cert-list" }, s.perPath.filter((p) => certs.has(p.path.slug)).map((p) =>
      h("a", { class: "card cert-mini", href: `#/cert/${certs.get(p.path.slug)}` }, h("span", { class: "room-icon" }, icon("award", 20)),
        h("div", {}, h("b", {}, p.path.title), h("small", { class: "muted" }, "Открыть сертификат →"))))) : null,
    h("h2", {}, "Значки"),
    earned.length ? h("div", { class: "badges" }, earned.map((b) =>
      h("div", { class: "badge earned", title: b.desc }, h("span", { class: "b-icon" }, icon(b.icon, 26)), h("b", {}, b.name), h("small", {}, b.desc))))
      : h("p", { class: "muted" }, "Пока нет значков."),
    h("h2", {}, "Пути обучения"),
    h("div", { class: "progress-list" }, s.perPath.map((p) => {
      const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
      return h("a", { class: "prog-row", href: `#/path/${p.path.slug}` }, icon(p.complete ? "medal" : "route", 16),
        h("span", { class: "prog-title" }, p.path.title), h("div", { class: "bar" }, h("i", { style: `width:${pct}%` })),
        p.complete ? h("span", { class: "ok-text" }, icon("check", 16)) : h("small", { class: "muted" }, `${p.done}/${p.total}`));
    })));
}

async function viewPath(slug) {
  setNav("rooms");
  const [{ rooms, tasks, paths }, solves] = await Promise.all([loadCatalog(), mySolves()]);
  const path = paths.find((p) => p.slug === slug);
  if (!path) return render(h("h1", {}, "Путь не найден"), h("a", { href: "#/" }, "← На главную"));
  const s = summarize(rooms, tasks, solves, [path]);
  const pp = s.perPath[0];
  const pct = pp.total ? Math.round((pp.done / pp.total) * 100) : 0;
  const nextIdx = pp.list.findIndex((p) => !p.complete);
  render(
    h("a", { href: "#/", class: "muted" }, "← Все комнаты"),
    h("p", { class: "eyebrow", style: "margin-top:14px" }, icon("route", 14), " Путь обучения"),
    h("h1", {}, path.title),
    h("p", { class: "muted" }, path.summary),
    h("div", { class: "room-progress" }, h("div", { class: "bar" }, h("i", { style: `width:${pct}%` })),
      h("small", { class: "muted" }, user ? `Пройдено ${pp.done} из ${pp.total} комнат` : "Войдите, чтобы отслеживать прогресс")),
    pp.complete && user ? h("div", { class: "done-banner" }, icon("medal", 20), h("b", {}, " Путь пройден! "), certButton(path.slug)) : null,
    h("ol", { class: "path-steps" }, pp.list.map((p, i) => h("li", { class: `path-step${p.complete ? " done" : ""}${i === nextIdx ? " next" : ""}` },
      h("span", { class: "step-dot", "aria-hidden": "true" }, p.complete ? icon("check", 14) : String(i + 1)),
      h("a", { class: "card path-room", href: `#/room/${p.room.slug}` },
        h("div", { class: "tags" }, h("span", { class: "tag" }, catIcon(p.room.category, 12), ` ${LABEL[p.room.category]}`), h("span", { class: `tag ${p.room.difficulty}` }, LABEL[p.room.difficulty])),
        h("h3", {}, p.room.title),
        h("small", { class: "muted" }, p.complete ? "Пройдена" : i === nextIdx ? `Следующая · ${p.done} из ${p.total} заданий` : `${p.total} заданий`))))));
}
function hero(stats) {
  const num = (v, label) => h("div", {}, h("b", {}, v ?? "—"), h("span", {}, label));
  return h("section", { class: "hero" },
    h("div", { class: "hero-grid" },
    h("div", { class: "hero-text" },
    h("p", { class: "eyebrow" }, h("span", { class: "dot", "aria-hidden": "true" }), "учебная платформа по кибербезопасности"),
    h("h1", {}, "Учись защищать, ", h("em", {}, "решая реальные задачи")),
    h("p", { class: "lead" }, "Разбирай логи взломанного сервера, фишинговые письма и уязвимые сайты. Теория, практика и флаги — прямо в браузере, бесплатно."),
    h("div", { class: "actions" }, h("a", { class: "btn", href: "#/signup" }, "Начать бесплатно"), h("a", { class: "btn ghost", href: "#rooms", onclick: (e) => { e.preventDefault(); document.getElementById("rooms").scrollIntoView({ behavior: "smooth" }); } }, "Смотреть комнаты ↓")),),
    h("div", { class: "hero-visual", "aria-hidden": "true" }, h("canvas", { id: "hero3d" }), h("div", { class: "hero-visual-label" }, h("span", { class: "dot" }), "учебная карта атак"))),
    stats ? h("div", { class: "stats hero-stats" }, num(stats.rooms, "комнат"), num(stats.tasks, "заданий"), num(stats.players, "игроков"), num(stats.solves, "флагов найдено")) : null,
    h("div", { class: "steps" },
      h("div", { class: "step" }, h("b", {}, "01"), h("span", {}, "Читаешь короткую теорию")),
      h("div", { class: "step" }, h("b", {}, "02"), h("span", {}, "Разбираешь файлы и учебные сайты")),
      h("div", { class: "step" }, h("b", {}, "03"), h("span", {}, "Находишь флаг, получаешь очки и значки"))));
}
function welcomeBack(s) {
  const lv = levelOf(s.points);
  return h("section", { class: "card welcome" },
    h("div", { class: "welcome-grid" },
      h("div", { class: "welcome-main" },
        h("p", { class: "eyebrow" }, `Уровень ${lv.n} · ${lv.name}`),
        h("h1", { style: "margin:0" }, `Привет, ${profile?.username || "агент"}!`),
        h("p", { class: "muted", style: "margin:6px 0 0" }, `${s.points} очков · ${s.solved} ${plural(s.solved, "флаг", "флага", "флагов")}`, s.streak ? h("span", { class: "streak" }, " · ", icon("flame", 15), ` ${s.streak} ${plural(s.streak, "день", "дня", "дней")} подряд`) : null),
        h("div", { class: "bar xp", role: "img", "aria-label": `До следующего уровня ${lv.pct}%` }, h("i", { style: `width:${lv.pct}%` })),
        h("small", { class: "muted" }, lv.to ? `До уровня ${lv.n + 1}: ${lv.to - s.points} очк.` : "Максимальный уровень"),
        s.next ? h("p", { style: "margin:14px 0 16px" }, h("span", { class: "muted" }, "Дальше: "), h("a", { href: `#/room/${s.next.room.slug}` }, s.next.room.title)) : null,
        s.next ? h("a", { class: "btn", href: `#/room/${s.next.room.slug}` }, s.next.done ? "Продолжить " : "Следующая комната ", icon("arrow", 16))
               : h("span", { class: "tag easy" }, "Все комнаты пройдены")),
      h("div", { class: "welcome-visual", "aria-hidden": "true" }, h("canvas", { id: "hero3d" }))));
}

// ---------- комната ----------
async function viewRoom(slug, focusId) {
  setNav("rooms");
  const { data: room, error } = await sb.from("rooms").select("id,title,summary,body_md,category,difficulty,files,position").eq("slug", slug).maybeSingle();
  if (error) return fail();
  if (!room) return render(h("h1", {}, "Комната не найдена"), h("a", { href: "#/" }, "← Все комнаты"));
  const [{ data: tasks }, solves, { data: nextRooms }, daily] = await Promise.all([
    sb.from("tasks").select("id,position,question,has_hint,answer_mask,points,choices").eq("room_id", room.id).order("position"),
    mySolves(),
    sb.from("rooms").select("slug,title").gt("position", room.position).order("position").limit(1),
    sb.rpc("daily_task").then((r) => r.data).catch(() => null),
  ]);
  const solved = new Set(solves.map((s) => s.task_id));
  const hints = new Map();
  if (user) { const { data: hs } = await sb.rpc("room_hints", { p_room_id: room.id }); (hs || []).forEach((x) => hints.set(x.task_id, x.hint)); }
  const list = tasks || [];
  const total = list.length, maxPts = list.reduce((a, t) => a + t.points, 0);
  const progress = h("div", { class: "room-progress" });
  const banner = h("div", { class: "done-banner", hidden: true },
    icon("trophy", 20), h("b", {}, " Комната пройдена!"), " ",
    nextRooms?.[0] ? h("a", { href: `#/room/${nextRooms[0].slug}` }, `Дальше: ${nextRooms[0].title} →`) : h("a", { href: "#/profile" }, "Посмотреть значки →"));
  const update = () => {
    const done = list.filter((t) => solved.has(t.id)).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    progress.replaceChildren(h("div", { class: "bar" }, h("i", { style: `width:${pct}%` })),
      h("small", { class: "muted" }, user ? `Решено ${done} из ${total} · ${maxPts} очков в комнате` : `${total} заданий · ${maxPts} очков`));
    banner.hidden = !(user && total && done === total);
  };
  const cards = list.map((t) => taskCard(t, solved.has(t.id), () => { solved.add(t.id); update(); checkNewBadges(); }, hints.get(t.id), daily?.task_id === t.id));
  const files = Array.isArray(room.files) && room.files.length
    ? h("div", { class: "files" }, h("span", { class: "muted" }, "Файлы комнаты:"), room.files.map((f) => h("a", { class: "btn-small", href: f.url, download: "" }, icon("download", 16), ` ${f.name}`))) : null;
  render(
    h("a", { href: "#/", class: "muted" }, "← Все комнаты"),
    h("div", { class: "tags", style: "margin-top:12px" }, h("span", { class: "tag" }, catIcon(room.category, 12), ` ${LABEL[room.category]}`), h("span", { class: `tag ${room.difficulty}` }, LABEL[room.difficulty])),
    h("h1", { style: "margin-top:8px" }, room.title),
    h("p", { class: "muted" }, room.summary),
    progress,
    md(room.body_md), files,
    h("h2", {}, "Задания"),
    user ? null : needLogin("отвечать на задания и получать очки"),
    ...cards, banner);
  update();
  const target = focusId && document.getElementById(`task-${focusId}`);
  if (target) { target.classList.add("focus"); setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "center" }), 150); }
}

const hintCost = (pts) => Math.max(1, Math.round(pts * 0.3));
function taskCard(t, isSolved, onSolved, unlockedHint, isDaily) {
  const msg = h("p", { class: "msg", role: "status" });
  const locked = !user || isSolved;
  const choices = Array.isArray(t.choices) && t.choices.length ? t.choices : null;
  const group = `task-${t.id}`;
  const input = choices ? null : h("input", { type: "text", class: "mono", placeholder: t.answer_mask || "Ответ", "aria-label": `Ответ на задание ${t.position}`,
                             maxlength: "200", autocomplete: "off", autocapitalize: "off", spellcheck: "false", disabled: locked });
  const radios = choices ? h("div", { class: "choices", role: "radiogroup", "aria-label": `Варианты ответа на задание ${t.position}` },
    choices.map((c) => h("label", { class: "choice" }, h("input", { type: "radio", name: group, value: c, disabled: locked, onchange: () => { msg.textContent = ""; } }), h("span", {}, c)))) : null;
  const getAnswer = () => choices ? (radios.querySelector("input:checked")?.value || "") : input.value.trim();
  const disableAll = () => { if (input) input.disabled = true; radios?.querySelectorAll("input").forEach((r) => (r.disabled = true)); };
  const btn = h("button", { type: "submit", disabled: locked }, isSolved ? "Решено ✓" : "Проверить");
  const card = h("div", { class: `task${isSolved ? " solved" : ""}${isDaily ? " is-daily" : ""}`, id: `task-${t.id}` });
  const form = h("form", { class: `answer${choices ? " answer-choices" : ""}`, onsubmit: async (e) => {
    e.preventDefault();
    const answer = getAnswer();
    if (!answer) { msg.className = "msg err"; msg.textContent = choices ? "Выберите вариант." : "Введите ответ."; (input || radios.querySelector("input"))?.focus(); return; }
    btn.disabled = true; msg.className = "msg"; msg.textContent = "Проверяю…";
    const { data, error } = await sb.rpc("submit_answer", { p_task_id: t.id, p_answer: answer });
    btn.disabled = false;
    if (error) { msg.className = "msg err"; msg.textContent = "Не получилось проверить. Попробуйте ещё раз."; return; }
    if (data.error === "rate_limited") { msg.className = "msg err"; msg.textContent = "Слишком много попыток — подождите минуту."; return; }
    if (data.error) { msg.className = "msg err"; msg.textContent = "Задание недоступно."; return; }
    if (data.correct) {
      card.classList.add("solved", "pop"); disableAll(); btn.disabled = true; btn.textContent = "Решено ✓";
      hintBtn?.remove();
      msg.className = "msg ok"; msg.textContent = data.already ? "Уже решено." : `Верно! +${data.points} очков${data.daily_bonus ? ` (с бонусом задания дня +${data.daily_bonus})` : ""}${data.hint_used ? " (с подсказкой)" : ""}.`;
      onSolved && onSolved();
    } else {
      msg.className = "msg err"; msg.textContent = "Неверно. Попробуйте ещё."; input?.select();
      card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
    }
  } }, input || radios, btn);

  // Подсказка: бесплатно после решения, до решения — за часть очков
  const cost = hintCost(t.points);
  const hintBox = h("p", { class: "hint", hidden: !unlockedHint }, unlockedHint ? [icon("bulb", 15), " ", unlockedHint] : null);
  let hintBtn = null;
  if (t.has_hint && !unlockedHint && user) {
    hintBtn = h("button", { type: "button", class: "link hint-btn", onclick: async () => {
      if (!isSolved && !card.classList.contains("solved") && hintBtn.dataset.confirm !== "1") {
        hintBtn.dataset.confirm = "1"; hintBtn.textContent = `Точно открыть? За это задание будет на ${cost} очк. меньше`; return;
      }
      hintBtn.disabled = true;
      const { data, error } = await sb.rpc("unlock_hint", { p_task_id: t.id });
      if (error || !data?.hint) { hintBtn.disabled = false; msg.className = "msg err"; msg.textContent = "Не получилось открыть подсказку."; return; }
      hintBox.replaceChildren(icon("bulb", 15), " ", data.hint); hintBox.hidden = false; hintBtn.remove();
      if (!card.classList.contains("solved")) pts.textContent = `${t.points - cost} очк.`;
    } }, isSolved ? "Показать подсказку" : `Подсказка (−${cost} очк.)`);
  }
  const pts = h("span", { class: "pts" }, `${unlockedHint && !isSolved ? t.points - cost : t.points} очк.`);
  card.append(...[
    isDaily ? h("span", { class: "daily-flag" }, icon("calendarStar", 14), " Задание дня · +10 бонус") : null,
    h("div", { class: "q" }, h("div", {}, h("span", { class: "num" }, `#${t.position} `), t.question), pts),
    form, msg, hintBtn, hintBox].filter(Boolean));
  return card;
}

// ---------- инструменты ----------
const utf8 = { enc: (s) => new TextEncoder().encode(s), dec: (b) => new TextDecoder("utf-8", { fatal: false }).decode(b) };
const TOOLS = {
  "b64-enc": { name: "Base64 → закодировать", run: (s) => { let bin = ""; utf8.enc(s).forEach((b) => (bin += String.fromCharCode(b))); return btoa(bin); } },
  "b64-dec": { name: "Base64 → раскодировать", run: (s) => { const bin = atob(s.replace(/\s+/g, "")); return utf8.dec(Uint8Array.from(bin, (c) => c.charCodeAt(0))); } },
  "hex-enc": { name: "Hex → закодировать", run: (s) => [...utf8.enc(s)].map((b) => b.toString(16).padStart(2, "0")).join("") },
  "hex-dec": { name: "Hex → раскодировать", run: (s) => { const c = s.replace(/0x|[\s:,-]/gi, ""); if (!/^([0-9a-f]{2})*$/i.test(c)) throw new Error("не hex"); return utf8.dec(Uint8Array.from(c.match(/../g) || [], (x) => parseInt(x, 16))); } },
  "rot13":   { name: "ROT13", run: (s) => s.replace(/[a-z]/gi, (c) => { const b = c <= "Z" ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b); }) },
  "url-enc": { name: "URL → закодировать", run: (s) => encodeURIComponent(s) },
  "url-dec": { name: "URL → раскодировать", run: (s) => decodeURIComponent(s.replace(/\+/g, " ")) },
  "sha256":  { name: "SHA-256", run: async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", utf8.enc(s)))].map((b) => b.toString(16).padStart(2, "0")).join("") },
  "sha1":    { name: "SHA-1", run: async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-1", utf8.enc(s)))].map((b) => b.toString(16).padStart(2, "0")).join("") },
  "reverse": { name: "Перевернуть строку", run: (s) => [...s].reverse().join("") },
  "rot-all": { name: "Цезарь: все сдвиги", run: (s) => Array.from({ length: 25 }, (_, i) => {
      const n = i + 1; return `${String(n).padStart(2, " ")}: ` + s.replace(/[a-z]/gi, (c) => { const b = c <= "Z" ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + n) % 26) + b); }); }).join("\n") },
  "xor":     { name: "XOR (hex + ключ)", key: true, run: (s, key) => {
      const c = s.replace(/0x|[\s:,-]/gi, ""); if (!/^([0-9a-f]{2})+$/i.test(c)) throw new Error("не hex");
      const k = parseInt(String(key).replace(/^0x/i, ""), 16); if (!(k >= 0 && k <= 255)) throw new Error("ключ");
      return utf8.dec(Uint8Array.from(c.match(/../g), (x) => parseInt(x, 16) ^ k)); } },
  "sha-lines": { name: "SHA-256 каждой строки", run: async (s) => {
      const out = []; for (const line of s.split(/\r?\n/).filter(Boolean).slice(0, 500)) {
        out.push([...new Uint8Array(await crypto.subtle.digest("SHA-256", utf8.enc(line)))].map((b) => b.toString(16).padStart(2, "0")).join("") + "  " + line); }
      return out.join("\n"); } },
};
function viewTools() {
  setNav("tools");
  const input = h("textarea", { class: "mono", rows: "5", placeholder: "Вставьте текст…", "aria-label": "Исходный текст", spellcheck: "false" });
  const output = h("textarea", { class: "mono", rows: "5", readonly: true, "aria-label": "Результат", placeholder: "Здесь появится результат" });
  const msg = h("p", { class: "msg", role: "status" });
  let current = "b64-dec";
  const keyIn = h("input", { type: "text", class: "mono", value: "00", maxlength: "4", "aria-label": "Ключ XOR (hex)", style: "max-width:140px" });
  const keyBox = h("label", { class: "tool-label", hidden: true }, "Ключ XOR — один байт в hex (00–ff)", keyIn);
  keyIn.addEventListener("input", () => run());
  const run = async () => {
    keyBox.hidden = !TOOLS[current].key;
    msg.textContent = ""; msg.className = "msg";
    if (!input.value) { output.value = ""; return; }
    try { output.value = await TOOLS[current].run(input.value, keyIn.value || "00"); }
    catch { output.value = ""; msg.className = "msg err"; msg.textContent = "Не получилось: проверьте, что текст в правильном формате."; }
  };
  const buttons = h("div", { class: "chips", role: "group", "aria-label": "Преобразование" },
    Object.entries(TOOLS).map(([id, t]) => h("button", { type: "button", class: "chip", "data-tool": id, "aria-pressed": id === current ? "true" : "false",
      onclick: (e) => { current = id; buttons.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.tool === id ? "true" : "false")); run(); } }, t.name)));
  input.addEventListener("input", run);
  render(h("h1", {}, "Инструменты"),
    h("p", { class: "muted" }, "Кодировки и хеши прямо в браузере. Текст никуда не отправляется — всё считается на вашем устройстве."),
    buttons, keyBox,
    h("label", { class: "tool-label" }, "Исходный текст", input),
    h("label", { class: "tool-label" }, "Результат", output), msg,
    h("div", { class: "answer" },
      h("button", { type: "button", class: "ghost", onclick: () => { input.value = output.value; run(); } }, "↑ Результат во вход"),
      h("button", { type: "button", class: "ghost", onclick: async () => { try { await navigator.clipboard.writeText(output.value); msg.className = "msg ok"; msg.textContent = "Скопировано."; } catch { output.select(); } } }, "Копировать")),
    h("div", { class: "card", style: "margin-top:20px" }, md(`
**Как узнать кодировку на глаз**

- \`SGVsbG8=\` — **Base64**: латиница, цифры, \`+ /\` и \`=\` в конце
- \`48656c6c6f\` — **hex**: только \`0–9\` и \`a–f\`, чётная длина
- \`Uryyb\` — **ROT13**: похоже на текст, но буквы «перемешаны»
- \`%D0%9F%D1%80\` — **URL-кодирование**: знаки \`%\` и две hex-цифры
- 64 hex-символа — скорее всего **SHA-256**, 40 — **SHA-1**, 32 — **MD5**

**XOR с одним байтом:** если известно начало текста (например, \`BL{\`), ключ = первый байт шифра XOR код буквы \`B\` (0x42).`)));
}

// ---------- рейтинг ----------
async function viewLeaderboard() {
  setNav("leaderboard");
  const { data, error } = await sb.rpc("leaderboard", { p_limit: 50 });
  if (error) return fail();
  const rows = (data || []).map((r, i) => h("tr", { class: profile && r.username === profile.username ? "me" : null },
    h("td", { class: `n${i < 3 ? " top" + (i + 1) : ""}` }, i + 1), h("td", {}, h("a", { class: "lb-name", href: `#/u/${encodeURIComponent(r.username)}` }, r.username), h("small", { class: "lvl" }, levelOf(r.points).name)),
    h("td", { class: "p" }, r.solved), h("td", { class: "p" }, r.points)));
  render(h("h1", {}, "Рейтинг"),
    rows.length ? h("table", { class: "lb" }, h("thead", {}, h("tr", {}, h("th", {}, "#"), h("th", {}, "Игрок"), h("th", { style: "text-align:right" }, "Флагов"), h("th", { style: "text-align:right" }, "Очки"))), h("tbody", {}, rows))
                : h("p", { class: "muted" }, "Пока никто не решил ни одного задания. Станьте первым!"));
}

// ---------- профиль ----------
async function viewProfile() {
  setNav("profile");
  if (!user) return render(h("h1", {}, "Профиль"), needLogin("увидеть свой прогресс"));
  const [, { rooms, tasks, paths }, solves, hinted, { data: myCerts }] = await Promise.all([loadProfile(), loadCatalog(), mySolves(), myHintTasks(),
    sb.from("certificates").select("id,path_slug")]);
  const certs = new Map((myCerts || []).map((c) => [c.path_slug, c.id]));
  const s = summarize(rooms, tasks, solves, paths, hinted);
  syncBadges(s, true);
  const lv = levelOf(s.points);
  const earned = s.badges.filter((b) => b.earned).length;

  const nameMsg = h("p", { class: "msg", role: "status" });
  const pubMsg = h("p", { class: "msg", role: "status" });
  const nameIn = h("input", { type: "text", value: profile?.username || "", maxlength: "20", "aria-label": "Имя в рейтинге" });
  const delMsg = h("p", { class: "msg err", role: "status" });
  render(
    h("section", { class: "card profile-head" },
      h("div", { class: "avatar", "aria-hidden": "true" }, (profile?.username || "?").slice(0, 2).toUpperCase()),
      h("div", { style: "flex:1;min-width:200px" },
        h("p", { class: "eyebrow" }, `Уровень ${lv.n} · ${lv.name}`),
        h("h1", { style: "margin:0" }, profile?.username || "Профиль"),
        h("div", { class: "bar xp", role: "img", "aria-label": `Прогресс уровня ${lv.pct}%` }, h("i", { style: `width:${lv.pct}%` })),
        h("small", { class: "muted" }, lv.to ? `${s.points} / ${lv.to} очков до уровня ${lv.n + 1}` : `${s.points} очков · максимальный уровень`))),
    h("div", { class: "stats" },
      h("div", {}, h("b", {}, s.points), h("span", {}, "очков")),
      h("div", {}, h("b", {}, s.solved), h("span", {}, "флагов")),
      h("div", {}, h("b", {}, `${s.roomsDone}/${s.roomsTotal}`), h("span", {}, "комнат")),
      h("div", {}, h("b", {}, icon("flame", 22), ` ${s.streak}`), h("span", {}, "дней подряд")),
      h("div", {}, h("b", {}, `${earned}/${s.badges.length}`), h("span", {}, "значков"))),
    h("h2", {}, "Значки"),
    h("div", { class: "badges" }, s.badges.map((b) =>
      h("div", { class: `badge${b.earned ? " earned" : ""}`, title: b.desc },
        h("span", { class: "b-icon" }, icon(b.earned ? b.icon : "lock", 26)), h("b", {}, b.name), h("small", {}, b.desc)))),
    s.perPath.length ? h("h2", {}, "Пути обучения и сертификаты") : null,
    s.perPath.length ? h("div", { class: "paths" }, s.perPath.map((pp) => {
      const card = pathCard(pp);
      return pp.complete ? h("div", { class: "path-wrap" }, card, certButton(pp.path.slug, certs.get(pp.path.slug))) : card;
    })) : null,
    h("h2", {}, "Прогресс по комнатам"),
    h("div", { class: "progress-list" }, s.perRoom.filter((p) => p.total).map((p) => {
      const pct = Math.round((p.done / p.total) * 100);
      return h("a", { class: "prog-row", href: `#/room/${p.room.slug}` },
        catIcon(p.room.category, 16),
        h("span", { class: "prog-title" }, p.room.title),
        h("div", { class: "bar" }, h("i", { style: `width:${pct}%` })),
        p.complete ? h("span", { class: "ok-text", "aria-label": "Пройдена" }, icon("check", 16)) : h("small", { class: "muted" }, `${p.done}/${p.total}`));
    })),
    h("h2", {}, "Публичный профиль"),
    h("p", { class: "muted", style: "margin-top:0" }, "Страница с твоим уровнем, значками и сертификатами — ей можно поделиться, например в резюме."),
    h("div", { class: "answer", style: "align-items:center" },
      profile?.username ? h("a", { class: "btn-small", href: `#/u/${encodeURIComponent(profile.username)}` }, icon("share", 16), " Открыть мой профиль") : null,
      h("label", { class: "check toggle" },
        h("input", { type: "checkbox", checked: profile?.is_public !== false, onchange: async (e) => {
          const { error } = await sb.rpc("set_profile_public", { p_public: e.target.checked });
          pubMsg.className = error ? "msg err" : "msg ok";
          pubMsg.textContent = error ? "Не получилось сохранить." : e.target.checked ? "Профиль виден всем." : "Профиль скрыт.";
          if (!error && profile) profile.is_public = e.target.checked;
        } }), h("span", {}, "Показывать профиль всем"))),
    pubMsg,
    h("h2", {}, "Имя в рейтинге"),
    h("form", { class: "answer", onsubmit: async (e) => {
      e.preventDefault();
      const { data } = await sb.rpc("set_username", { p_username: nameIn.value.trim() });
      if (data?.ok) { nameMsg.className = "msg ok"; nameMsg.textContent = "Сохранено."; await loadProfile(); }
      else { nameMsg.className = "msg err"; nameMsg.textContent = data?.error === "taken" ? "Это имя уже занято." : "3–20 символов: латиница, цифры, _"; }
    } }, nameIn, h("button", { type: "submit" }, "Сохранить")), nameMsg,
    h("h2", {}, "Аккаунт"),
    h("p", { class: "muted" }, user.email),
    h("div", { class: "answer" },
      h("button", { class: "ghost", onclick: async () => { await sb.auth.signOut(); location.hash = "#/"; } }, "Выйти"),
      h("button", { class: "danger", onclick: async () => {
        if (prompt("Аккаунт и весь прогресс будут удалены навсегда. Введите слово УДАЛИТЬ:") !== "УДАЛИТЬ") return;
        const { error } = await sb.rpc("delete_my_account");
        if (error) { delMsg.textContent = "Не получилось удалить аккаунт."; return; }
        await sb.auth.signOut().catch(() => {}); location.hash = "#/";
      } }, "Удалить аккаунт")), delMsg);
}

// ---------- вход и регистрация ----------
function authForm(mode) {
  setNav("login");
  if (user && mode !== "newpass") { location.hash = "#/profile"; return; }
  const msg = h("p", { class: "msg", role: "status" });
  const email = h("input", { type: "email", required: true, autocomplete: "email" });
  const pass = h("input", { type: "password", required: true, minlength: "8", autocomplete: mode === "login" ? "current-password" : "new-password" });
  const uname = h("input", { type: "text", required: true, pattern: "[A-Za-z0-9_]{3,20}", maxlength: "20", autocomplete: "username" });
  const agree = h("input", { type: "checkbox", required: true });
  const redirect = location.origin + location.pathname;
  const title = { login: "Вход", signup: "Регистрация", forgot: "Восстановление пароля", newpass: "Новый пароль" }[mode];
  const fields = ({
    login: () => [h("label", {}, "Почта", email), h("label", {}, "Пароль", pass)],
    signup: () => [h("label", {}, "Имя в рейтинге (латиница, цифры, _)", uname), h("label", {}, "Почта", email), h("label", {}, "Пароль (от 8 символов)", pass),
             h("label", { class: "check" }, agree, h("span", {}, "Принимаю ", h("a", { href: "#/rules", target: "_blank" }, "правила и политику конфиденциальности")))],
    forgot: () => [h("label", {}, "Почта", email)],
    newpass: () => [h("label", {}, "Новый пароль (от 8 символов)", pass)],
  })[mode]();
  const btn = h("button", { type: "submit" }, { login: "Войти", signup: "Зарегистрироваться", forgot: "Отправить ссылку", newpass: "Сохранить пароль" }[mode]);
  const form = h("form", { class: "form card", onsubmit: async (e) => {
    e.preventDefault(); btn.disabled = true; msg.className = "msg"; msg.textContent = "…";
    let r;
    if (mode === "login") r = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
    if (mode === "signup") r = await sb.auth.signUp({ email: email.value.trim(), password: pass.value,
      options: { emailRedirectTo: redirect, data: { username: uname.value.trim() } } });
    if (mode === "forgot") r = await sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: redirect });
    if (mode === "newpass") r = await sb.auth.updateUser({ password: pass.value });
    btn.disabled = false;
    if (r.error) { msg.className = "msg err"; msg.textContent = /invalid login/i.test(r.error.message) ? "Неверная почта или пароль." : "Ошибка: " + r.error.message; return; }
    msg.className = "msg ok";
    if (mode === "login") location.hash = "#/";
    if (mode === "signup") msg.textContent = "Готово! Проверьте почту и подтвердите адрес — потом войдите.";
    if (mode === "forgot") msg.textContent = "Если такой аккаунт есть, мы отправили письмо со ссылкой.";
    if (mode === "newpass") { msg.textContent = "Пароль изменён."; setTimeout(() => (location.hash = "#/"), 800); }
  } }, ...fields, btn, msg);
  const links = {
    login: [h("a", { href: "#/signup" }, "Регистрация"), " · ", h("a", { href: "#/forgot" }, "Забыли пароль?")],
    signup: [h("a", { href: "#/login" }, "Уже есть аккаунт? Войти")],
    forgot: [h("a", { href: "#/login" }, "← Ко входу")], newpass: [],
  }[mode];
  render(h("div", { class: "auth-wrap" }, h("h1", {}, title), form, h("p", {}, ...links)));
}

function viewRules() {
  setNav("");
  render(h("h1", {}, "Правила и конфиденциальность"), md(`
## Правила
1. Навыки из комнат применяются **только** к учебным материалам BreachLab.
2. Атаковать чужие сайты, сети и устройства без письменного разрешения владельца запрещено — это нарушение закона (в России — ст. 272–274 УК РФ).
3. Не публикуйте готовые ответы — это лишает других пользы от обучения.
4. Нарушение правил — блокировка аккаунта.

## Какие данные мы храним
- Почта и пароль (пароль — в виде хеша, мы его не видим) — для входа.
- Имя в рейтинге — видно всем в разделе «Рейтинг».
- Решённые задания и попытки ответов — для прогресса, рейтинга и защиты от перебора.

Страница «Инструменты» работает полностью на вашем устройстве: введённый туда текст никуда не отправляется.

Данные хранятся в Supabase. Удалить аккаунт и все данные можно в профиле.`));
}

// ---------- маршрутизатор ----------
const DEFAULT_TITLE = document.title;
async function route() {
  document.title = DEFAULT_TITLE;
  const hash = location.hash.startsWith("#/") ? location.hash.slice(2) : "";
  const [page, arg, arg2] = hash.split("/");
  try {
    if (page === "room" && arg) await viewRoom(decodeURIComponent(arg), arg2 && /^\d+$/.test(arg2) ? Number(arg2) : null);
    else if (page === "path" && arg) await viewPath(decodeURIComponent(arg));
    else if (page === "u" && arg) await viewPublic(decodeURIComponent(arg));
    else if (page === "cert" && arg) await viewCert(decodeURIComponent(arg));
    else if (page === "tools") viewTools();
    else if (page === "leaderboard") await viewLeaderboard();
    else if (page === "profile") await viewProfile();
    else if (["login", "signup", "forgot", "newpass"].includes(page)) authForm(page);
    else if (page === "rules") viewRules();
    else await viewRooms();
  } catch (e) { console.error(e); fail(); }
}
window.addEventListener("hashchange", () => { if (location.hash !== "#rooms") route(); });
sb.auth.onAuthStateChange(async (event, session) => {
  const prev = user?.id;
  user = session?.user || null;
  if (event === "PASSWORD_RECOVERY") { location.hash = "#/newpass"; return; }
  if (event === "INITIAL_SESSION" || prev !== user?.id) {
    setTimeout(async () => { await loadProfile(); route(); }, 0);   // вне колбэка, чтобы не блокировать auth
  }
});
})();
