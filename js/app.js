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
const ICON = { soc: "🛡", web: "🌐", linux: "🐧", forensics: "🔍", crypto: "🔐", osint: "🛰" };
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
  { id: "first",   icon: "🚩", name: "Первый флаг",      desc: "Решить первое задание",              test: (s) => s.solved >= 1 },
  { id: "room1",   icon: "🚪", name: "Первая комната",   desc: "Пройти комнату целиком",             test: (s) => s.roomsDone >= 1 },
  { id: "room5",   icon: "🧭", name: "Исследователь",    desc: "Пройти 5 комнат",                    test: (s) => s.roomsDone >= 5 },
  { id: "all",     icon: "🎓", name: "Выпускник",        desc: "Пройти все комнаты",                 test: (s) => s.roomsTotal > 0 && s.roomsDone === s.roomsTotal },
  { id: "p100",    icon: "💯", name: "Сотня",            desc: "Набрать 100 очков",                  test: (s) => s.points >= 100 },
  { id: "p300",    icon: "⚡", name: "Три сотни",        desc: "Набрать 300 очков",                  test: (s) => s.points >= 300 },
  { id: "streak3", icon: "🔥", name: "В ритме",          desc: "Решать задания 3 дня подряд",        test: (s) => s.bestStreak >= 3 },
  { id: "streak7", icon: "📅", name: "Неделя без пропусков", desc: "Решать задания 7 дней подряд",   test: (s) => s.bestStreak >= 7 },
  { id: "night",   icon: "🌙", name: "Ночная смена",     desc: "Решить задание между 00:00 и 05:00", test: (s) => s.night },
  { id: "soc",     icon: "🛡", name: "Аналитик SOC",     desc: "Пройти все комнаты SOC",             test: (s) => s.catDone("soc") },
  { id: "web",     icon: "🌐", name: "Веб-детектив",     desc: "Пройти все веб-комнаты",             test: (s) => s.catDone("web") },
  { id: "linux",   icon: "🐧", name: "Пингвин",          desc: "Пройти все комнаты по Linux",        test: (s) => s.catDone("linux") },
  { id: "crypto",  icon: "🔐", name: "Шифровальщик",     desc: "Пройти все комнаты по криптографии", test: (s) => s.catDone("crypto") },
  { id: "forensics", icon: "🔍", name: "Криминалист",    desc: "Пройти все комнаты по форензике",    test: (s) => s.catDone("forensics") },
];

// ---------- данные ----------
async function loadProfile() {
  profile = null;
  if (!user) return;
  const { data } = await sb.from("profiles").select("username").eq("user_id", user.id).maybeSingle();
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
  return { rooms: rooms || [], tasks: tasks || [] };
}
// Сводка прогресса: по комнатам, очки, серия, значки
function summarize(rooms, tasks, solves) {
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
  s.badges = BADGES.map((b) => ({ ...b, earned: !!b.test(s) }));
  s.next = perRoom.find((p) => p.total && !p.complete) || null;
  return s;
}

// ---------- главная ----------
async function viewRooms() {
  setNav("rooms");
  const [{ rooms, tasks }, solves, stats] = await Promise.all([
    loadCatalog(), mySolves(), sb.rpc("platform_stats").then((r) => r.data).catch(() => null),
  ]);
  const s = summarize(rooms, tasks, solves);
  const cats = [...new Set(rooms.map((r) => r.category))];

  const grid = h("div", { class: "grid" });
  const draw = () => {
    grid.replaceChildren(...s.perRoom.filter((p) => filter === "all" || p.room.category === filter).map(roomCard));
    chips.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.cat === filter ? "true" : "false"));
  };
  const roomCard = ({ room: r, total, done, complete }) => {
    const pct = total ? Math.round((done / total) * 100) : 0;
    return h("a", { class: `card room${complete ? " complete" : ""}`, href: `#/room/${r.slug}` },
      h("div", { class: "room-top" },
        h("span", { class: "room-icon", "aria-hidden": "true" }, ICON[r.category] || "▣"),
        h("div", { class: "tags" }, h("span", { class: "tag" }, LABEL[r.category]), h("span", { class: `tag ${r.difficulty}` }, LABEL[r.difficulty]))),
      h("h3", {}, r.title),
      h("p", { class: "muted", style: "margin:0" }, r.summary),
      h("div", { class: "room-foot" },
        user ? h("div", { class: "bar", role: "img", "aria-label": `Решено ${done} из ${total}` }, h("i", { style: `width:${pct}%` })) : null,
        h("small", { class: "muted" }, user ? (complete ? "Пройдена ✓" : `${done} из ${total} ${plural(total, "задания", "заданий", "заданий")}`)
                                             : `${total} ${plural(total, "задание", "задания", "заданий")}`)));
  };
  const chips = h("div", { class: "chips", role: "group", "aria-label": "Фильтр по категориям" },
    [["all", "Все"], ...cats.map((c) => [c, `${ICON[c] || ""} ${LABEL[c]}`])].map(([c, label]) =>
      h("button", { type: "button", class: "chip", "data-cat": c, onclick: () => { filter = c; draw(); } }, label)));
  if (!cats.includes(filter)) filter = "all";

  const top = user ? welcomeBack(s) : hero(stats);
  render(top, h("h2", { id: "rooms" }, "Комнаты"), chips, rooms.length ? grid : h("p", { class: "muted" }, "Комнат пока нет."));
  draw();
}
function hero(stats) {
  const num = (v, label) => h("div", {}, h("b", {}, v ?? "—"), h("span", {}, label));
  return h("section", { class: "hero" },
    h("p", { class: "eyebrow" }, "> учебная платформа по кибербезопасности"),
    h("h1", {}, "Учись защищать, ", h("em", {}, "решая реальные задачи")),
    h("p", { class: "lead" }, "Разбирай логи взломанного сервера, фишинговые письма и уязвимые сайты. Теория, практика и флаги — прямо в браузере, бесплатно."),
    h("div", { class: "actions" }, h("a", { class: "btn", href: "#/signup" }, "Начать бесплатно"), h("a", { class: "btn ghost", href: "#rooms", onclick: (e) => { e.preventDefault(); document.getElementById("rooms").scrollIntoView({ behavior: "smooth" }); } }, "Смотреть комнаты ↓")),
    stats ? h("div", { class: "stats hero-stats" }, num(stats.rooms, "комнат"), num(stats.tasks, "заданий"), num(stats.players, "игроков"), num(stats.solves, "флагов найдено")) : null,
    h("div", { class: "steps" },
      h("div", { class: "step" }, h("b", {}, "01"), h("span", {}, "Читаешь короткую теорию")),
      h("div", { class: "step" }, h("b", {}, "02"), h("span", {}, "Разбираешь файлы и учебные сайты")),
      h("div", { class: "step" }, h("b", {}, "03"), h("span", {}, "Находишь флаг, получаешь очки и значки"))));
}
function welcomeBack(s) {
  const lv = levelOf(s.points);
  return h("section", { class: "card welcome" },
    h("div", { class: "welcome-row" },
      h("div", {},
        h("p", { class: "eyebrow" }, `Уровень ${lv.n} · ${lv.name}`),
        h("h1", { style: "margin:0" }, `Привет, ${profile?.username || "агент"}!`),
        h("p", { class: "muted", style: "margin:6px 0 0" }, `${s.points} очков · ${s.solved} ${plural(s.solved, "флаг", "флага", "флагов")}` + (s.streak ? ` · 🔥 ${s.streak} ${plural(s.streak, "день", "дня", "дней")} подряд` : ""))),
      s.next ? h("a", { class: "btn", href: `#/room/${s.next.room.slug}` }, s.next.done ? "Продолжить →" : "Следующая комната →") : h("span", { class: "tag easy" }, "Все комнаты пройдены")),
    h("div", { class: "bar xp", role: "img", "aria-label": `До следующего уровня ${lv.pct}%` }, h("i", { style: `width:${lv.pct}%` })),
    h("small", { class: "muted" }, lv.to ? `До уровня ${lv.n + 1}: ${lv.to - s.points} очк.` : "Максимальный уровень"),
    s.next ? h("p", { style: "margin:10px 0 0" }, h("span", { class: "muted" }, "Дальше: "), h("a", { href: `#/room/${s.next.room.slug}` }, s.next.room.title)) : null);
}

// ---------- комната ----------
async function viewRoom(slug) {
  setNav("rooms");
  const { data: room, error } = await sb.from("rooms").select("id,title,summary,body_md,category,difficulty,files,position").eq("slug", slug).maybeSingle();
  if (error) return fail();
  if (!room) return render(h("h1", {}, "Комната не найдена"), h("a", { href: "#/" }, "← Все комнаты"));
  const [{ data: tasks }, solves, { data: nextRooms }] = await Promise.all([
    sb.from("tasks").select("id,position,question,hint,answer_mask,points").eq("room_id", room.id).order("position"),
    mySolves(),
    sb.from("rooms").select("slug,title").gt("position", room.position).order("position").limit(1),
  ]);
  const solved = new Set(solves.map((s) => s.task_id));
  const list = tasks || [];
  const total = list.length, maxPts = list.reduce((a, t) => a + t.points, 0);
  const progress = h("div", { class: "room-progress" });
  const banner = h("div", { class: "done-banner", hidden: true },
    h("b", {}, "🎉 Комната пройдена!"), " ",
    nextRooms?.[0] ? h("a", { href: `#/room/${nextRooms[0].slug}` }, `Дальше: ${nextRooms[0].title} →`) : h("a", { href: "#/profile" }, "Посмотреть значки →"));
  const update = () => {
    const done = list.filter((t) => solved.has(t.id)).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    progress.replaceChildren(h("div", { class: "bar" }, h("i", { style: `width:${pct}%` })),
      h("small", { class: "muted" }, user ? `Решено ${done} из ${total} · ${maxPts} очков в комнате` : `${total} заданий · ${maxPts} очков`));
    banner.hidden = !(user && total && done === total);
  };
  const cards = list.map((t) => taskCard(t, solved.has(t.id), () => { solved.add(t.id); update(); }));
  const files = Array.isArray(room.files) && room.files.length
    ? h("div", { class: "files" }, h("span", { class: "muted" }, "Файлы комнаты:"), room.files.map((f) => h("a", { class: "btn-small", href: f.url, download: "" }, `⬇ ${f.name}`))) : null;
  render(
    h("a", { href: "#/", class: "muted" }, "← Все комнаты"),
    h("div", { class: "tags", style: "margin-top:12px" }, h("span", { class: "tag" }, `${ICON[room.category] || ""} ${LABEL[room.category]}`), h("span", { class: `tag ${room.difficulty}` }, LABEL[room.difficulty])),
    h("h1", { style: "margin-top:8px" }, room.title),
    h("p", { class: "muted" }, room.summary),
    progress,
    md(room.body_md), files,
    h("h2", {}, "Задания"),
    user ? null : needLogin("отвечать на задания и получать очки"),
    ...cards, banner);
  update();
}

function taskCard(t, isSolved, onSolved) {
  const msg = h("p", { class: "msg", role: "status" });
  const input = h("input", { type: "text", class: "mono", placeholder: t.answer_mask || "Ответ", "aria-label": `Ответ на задание ${t.position}`,
                             maxlength: "200", autocomplete: "off", autocapitalize: "off", spellcheck: "false", disabled: !user || isSolved });
  const btn = h("button", { type: "submit", disabled: !user || isSolved }, isSolved ? "Решено ✓" : "Проверить");
  const card = h("div", { class: `task${isSolved ? " solved" : ""}` });
  const form = h("form", { class: "answer", onsubmit: async (e) => {
    e.preventDefault();
    const answer = input.value.trim();
    if (!answer) { input.focus(); return; }
    btn.disabled = true; msg.className = "msg"; msg.textContent = "Проверяю…";
    const { data, error } = await sb.rpc("submit_answer", { p_task_id: t.id, p_answer: answer });
    btn.disabled = false;
    if (error) { msg.className = "msg err"; msg.textContent = "Не получилось проверить. Попробуйте ещё раз."; return; }
    if (data.error === "rate_limited") { msg.className = "msg err"; msg.textContent = "Слишком много попыток — подождите минуту."; return; }
    if (data.error) { msg.className = "msg err"; msg.textContent = "Задание недоступно."; return; }
    if (data.correct) {
      card.classList.add("solved", "pop"); input.disabled = true; btn.disabled = true; btn.textContent = "Решено ✓";
      msg.className = "msg ok"; msg.textContent = data.already ? "Уже решено." : `Верно! +${data.points} очков.`;
      onSolved && onSolved();
    } else {
      msg.className = "msg err"; msg.textContent = "Неверно. Попробуйте ещё."; input.select();
      card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
    }
  } }, input, btn);
  const hintBox = t.hint ? h("p", { class: "hint", hidden: true }, "Подсказка: " + t.hint) : null;
  card.append(...[
    h("div", { class: "q" }, h("div", {}, h("span", { class: "num" }, `#${t.position} `), t.question), h("span", { class: "pts" }, `${t.points} очк.`)),
    form, msg,
    hintBox ? h("button", { type: "button", class: "link", onclick: (e) => { hintBox.hidden = false; e.target.remove(); } }, "Показать подсказку") : null,
    hintBox].filter(Boolean));
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
};
function viewTools() {
  setNav("tools");
  const input = h("textarea", { class: "mono", rows: "5", placeholder: "Вставьте текст…", "aria-label": "Исходный текст", spellcheck: "false" });
  const output = h("textarea", { class: "mono", rows: "5", readonly: true, "aria-label": "Результат", placeholder: "Здесь появится результат" });
  const msg = h("p", { class: "msg", role: "status" });
  let current = "b64-dec";
  const run = async () => {
    msg.textContent = ""; msg.className = "msg";
    if (!input.value) { output.value = ""; return; }
    try { output.value = await TOOLS[current].run(input.value); }
    catch { output.value = ""; msg.className = "msg err"; msg.textContent = "Не получилось: проверьте, что текст в правильном формате."; }
  };
  const buttons = h("div", { class: "chips", role: "group", "aria-label": "Преобразование" },
    Object.entries(TOOLS).map(([id, t]) => h("button", { type: "button", class: "chip", "data-tool": id, "aria-pressed": id === current ? "true" : "false",
      onclick: (e) => { current = id; buttons.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.tool === id ? "true" : "false")); run(); } }, t.name)));
  input.addEventListener("input", run);
  render(h("h1", {}, "Инструменты"),
    h("p", { class: "muted" }, "Кодировки и хеши прямо в браузере. Текст никуда не отправляется — всё считается на вашем устройстве."),
    buttons,
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
- 64 hex-символа — скорее всего **SHA-256**, 40 — **SHA-1**, 32 — **MD5**`)));
}

// ---------- рейтинг ----------
async function viewLeaderboard() {
  setNav("leaderboard");
  const { data, error } = await sb.rpc("leaderboard", { p_limit: 50 });
  if (error) return fail();
  const medal = ["🥇", "🥈", "🥉"];
  const rows = (data || []).map((r, i) => h("tr", { class: profile && r.username === profile.username ? "me" : null },
    h("td", { class: "n" }, medal[i] || i + 1), h("td", {}, r.username, h("small", { class: "lvl" }, levelOf(r.points).name)),
    h("td", { class: "p" }, r.solved), h("td", { class: "p" }, r.points)));
  render(h("h1", {}, "Рейтинг"),
    rows.length ? h("table", { class: "lb" }, h("thead", {}, h("tr", {}, h("th", {}, "#"), h("th", {}, "Игрок"), h("th", { style: "text-align:right" }, "Флагов"), h("th", { style: "text-align:right" }, "Очки"))), h("tbody", {}, rows))
                : h("p", { class: "muted" }, "Пока никто не решил ни одного задания. Станьте первым!"));
}

// ---------- профиль ----------
async function viewProfile() {
  setNav("profile");
  if (!user) return render(h("h1", {}, "Профиль"), needLogin("увидеть свой прогресс"));
  const [, { rooms, tasks }, solves] = await Promise.all([loadProfile(), loadCatalog(), mySolves()]);
  const s = summarize(rooms, tasks, solves);
  const lv = levelOf(s.points);
  const earned = s.badges.filter((b) => b.earned).length;

  const nameMsg = h("p", { class: "msg", role: "status" });
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
      h("div", {}, h("b", {}, `🔥 ${s.streak}`), h("span", {}, "дней подряд")),
      h("div", {}, h("b", {}, `${earned}/${s.badges.length}`), h("span", {}, "значков"))),
    h("h2", {}, "Значки"),
    h("div", { class: "badges" }, s.badges.map((b) =>
      h("div", { class: `badge${b.earned ? " earned" : ""}`, title: b.desc },
        h("span", { class: "b-icon", "aria-hidden": "true" }, b.icon), h("b", {}, b.name), h("small", {}, b.earned ? b.desc : `🔒 ${b.desc}`)))),
    h("h2", {}, "Прогресс по комнатам"),
    h("div", { class: "progress-list" }, s.perRoom.filter((p) => p.total).map((p) => {
      const pct = Math.round((p.done / p.total) * 100);
      return h("a", { class: "prog-row", href: `#/room/${p.room.slug}` },
        h("span", { "aria-hidden": "true" }, ICON[p.room.category] || "▣"),
        h("span", { class: "prog-title" }, p.room.title),
        h("div", { class: "bar" }, h("i", { style: `width:${pct}%` })),
        h("small", { class: "muted" }, p.complete ? "✓" : `${p.done}/${p.total}`));
    })),
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
async function route() {
  const hash = location.hash.startsWith("#/") ? location.hash.slice(2) : "";
  const [page, arg] = hash.split("/");
  try {
    if (page === "room" && arg) await viewRoom(decodeURIComponent(arg));
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
