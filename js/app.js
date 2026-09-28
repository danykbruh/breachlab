// BreachLab — клиент. Маршруты в адресе после #: #/ · #/room/<slug> · #/leaderboard · #/profile · #/login …
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
function md(text) {                     // markdown → безопасный HTML
  const div = h("div", { class: "md" });
  div.innerHTML = DOMPurify.sanitize(marked.parse(text || ""));
  div.querySelectorAll("a[href^='http']").forEach((a) => { a.target = "_blank"; a.rel = "noopener noreferrer"; });
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

async function loadProfile() {
  profile = null;
  if (!user) return;
  const { data } = await sb.from("profiles").select("username").eq("user_id", user.id).maybeSingle();
  profile = data;
}
async function mySolves() {
  if (!user) return new Set();
  const { data } = await sb.from("solves").select("task_id");
  return new Set((data || []).map((r) => r.task_id));
}

// ---------- страницы ----------
async function viewRooms() {
  setNav("rooms");
  const [{ data: rooms, error }, { data: tasks }] = await Promise.all([
    sb.from("rooms").select("id,slug,title,summary,category,difficulty").order("position"),
    sb.from("tasks").select("id,room_id"),
  ]);
  if (error) return fail();
  const solved = await mySolves();
  const grid = h("div", { class: "grid" });
  for (const r of rooms) {
    const ids = (tasks || []).filter((t) => t.room_id === r.id).map((t) => t.id);
    const done = ids.filter((id) => solved.has(id)).length;
    const pct = ids.length ? Math.round((done / ids.length) * 100) : 0;
    grid.append(h("a", { class: "card", href: `#/room/${r.slug}` },
      h("div", { class: "tags" }, h("span", { class: "tag" }, LABEL[r.category]), h("span", { class: `tag ${r.difficulty}` }, LABEL[r.difficulty])),
      h("h3", {}, r.title),
      h("p", { class: "muted", style: "margin:0" }, r.summary),
      user ? h("div", {}, h("div", { class: "bar", role: "img", "aria-label": `Решено ${done} из ${ids.length}` }, h("i", { style: `width:${pct}%` })),
                          h("small", { class: "muted" }, `${done} из ${ids.length} заданий`)) : null));
  }
  render(h("h1", {}, "Комнаты"),
    h("p", { class: "muted" }, "Теория и практические задания. Решайте по порядку или выбирайте интересное."),
    rooms.length ? grid : h("p", { class: "muted" }, "Комнат пока нет."));
}

async function viewRoom(slug) {
  setNav("rooms");
  const { data: room, error } = await sb.from("rooms").select("id,title,summary,body_md,category,difficulty,files").eq("slug", slug).maybeSingle();
  if (error) return fail();
  if (!room) return render(h("h1", {}, "Комната не найдена"), h("a", { href: "#/" }, "← Все комнаты"));
  const { data: tasks } = await sb.from("tasks").select("id,position,question,hint,answer_mask,points").eq("room_id", room.id).order("position");
  const solved = await mySolves();
  const list = (tasks || []).map((t) => taskCard(t, solved.has(t.id)));
  const files = Array.isArray(room.files) && room.files.length
    ? h("div", { class: "files" }, room.files.map((f) => h("a", { class: "btn-small", href: f.url, download: "" }, `⬇ ${f.name}`))) : null;
  render(
    h("a", { href: "#/", class: "muted" }, "← Все комнаты"),
    h("div", { class: "tags", style: "margin-top:12px" }, h("span", { class: "tag" }, LABEL[room.category]), h("span", { class: `tag ${room.difficulty}` }, LABEL[room.difficulty])),
    h("h1", { style: "margin-top:8px" }, room.title),
    h("p", { class: "muted" }, room.summary),
    md(room.body_md), files,
    h("h2", {}, "Задания"),
    user ? null : needLogin("отвечать на задания и получать очки"),
    ...list);
}

function taskCard(t, isSolved) {
  const msg = h("p", { class: "msg", role: "status" });
  const input = h("input", { type: "text", class: "mono", placeholder: t.answer_mask || "Ответ", "aria-label": `Ответ на задание ${t.position}`,
                             maxlength: "200", autocomplete: "off", spellcheck: "false", disabled: !user || isSolved });
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
      card.classList.add("solved"); input.disabled = true; btn.disabled = true; btn.textContent = "Решено ✓";
      msg.className = "msg ok"; msg.textContent = data.already ? "Уже решено." : `Верно! +${data.points} очков.`;
    } else { msg.className = "msg err"; msg.textContent = "Неверно. Попробуйте ещё."; input.select(); }
  } }, input, btn);
  const hintBox = t.hint ? h("p", { class: "hint", hidden: true }, "Подсказка: " + t.hint) : null;
  card.append(...[
    h("div", { class: "q" }, h("div", {}, h("span", { class: "num" }, `#${t.position} `), t.question), h("span", { class: "pts" }, `${t.points} очк.`)),
    form, msg,
    hintBox ? h("button", { type: "button", class: "link", onclick: (e) => { hintBox.hidden = false; e.target.remove(); } }, "Показать подсказку") : null,
    hintBox].filter(Boolean));
  return card;
}

async function viewLeaderboard() {
  setNav("leaderboard");
  const { data, error } = await sb.rpc("leaderboard", { p_limit: 50 });
  if (error) return fail();
  const rows = (data || []).map((r, i) => h("tr", { class: profile && r.username === profile.username ? "me" : null },
    h("td", { class: "n" }, i + 1), h("td", {}, r.username), h("td", { class: "p" }, r.solved), h("td", { class: "p" }, r.points)));
  render(h("h1", {}, "Рейтинг"),
    rows.length ? h("table", { class: "lb" }, h("thead", {}, h("tr", {}, h("th", {}, "#"), h("th", {}, "Игрок"), h("th", { style: "text-align:right" }, "Заданий"), h("th", { style: "text-align:right" }, "Очки"))), h("tbody", {}, rows))
                : h("p", { class: "muted" }, "Пока никто не решил ни одного задания. Станьте первым!"));
}

async function viewProfile() {
  setNav("profile");
  if (!user) return render(h("h1", {}, "Профиль"), needLogin("увидеть свой прогресс"));
  await loadProfile();
  const { data: solves } = await sb.from("solves").select("points");
  const pts = (solves || []).reduce((s, r) => s + r.points, 0);
  const nameMsg = h("p", { class: "msg", role: "status" });
  const nameIn = h("input", { type: "text", value: profile?.username || "", maxlength: "20", "aria-label": "Имя в рейтинге" });
  const delMsg = h("p", { class: "msg err", role: "status" });
  render(h("h1", {}, profile?.username || "Профиль"),
    h("p", { class: "muted" }, user.email),
    h("div", { class: "stats" }, h("div", {}, h("b", {}, pts), h("span", {}, "очков")), h("div", {}, h("b", {}, (solves || []).length), h("span", {}, "заданий решено"))),
    h("h2", {}, "Имя в рейтинге"),
    h("form", { class: "answer", onsubmit: async (e) => {
      e.preventDefault();
      const { data } = await sb.rpc("set_username", { p_username: nameIn.value.trim() });
      if (data?.ok) { nameMsg.className = "msg ok"; nameMsg.textContent = "Сохранено."; await loadProfile(); }
      else { nameMsg.className = "msg err"; nameMsg.textContent = data?.error === "taken" ? "Это имя уже занято." : "3–20 символов: латиница, цифры, _"; }
    } }, nameIn, h("button", { type: "submit" }, "Сохранить")), nameMsg,
    h("h2", {}, "Аккаунт"),
    h("div", { class: "answer" },
      h("button", { class: "ghost", onclick: async () => { await sb.auth.signOut(); location.hash = "#/"; } }, "Выйти"),
      h("button", { class: "danger", onclick: async () => {
        if (prompt("Аккаунт и весь прогресс будут удалены навсегда. Введите слово УДАЛИТЬ:") !== "УДАЛИТЬ") return;
        const { error } = await sb.rpc("delete_my_account");
        if (error) { delMsg.textContent = "Не получилось удалить аккаунт."; return; }
        await sb.auth.signOut().catch(() => {}); location.hash = "#/";
      } }, "Удалить аккаунт")), delMsg);
}

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
  const form = h("form", { class: "form", onsubmit: async (e) => {
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
  render(h("h1", {}, title), form, h("p", {}, ...links));
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

Данные хранятся в Supabase. Удалить аккаунт и все данные можно в профиле.`));
}

// ---------- маршрутизатор ----------
async function route() {
  const hash = location.hash.startsWith("#/") ? location.hash.slice(2) : "";
  const [page, arg] = hash.split("/");
  try {
    if (page === "room" && arg) await viewRoom(decodeURIComponent(arg));
    else if (page === "leaderboard") await viewLeaderboard();
    else if (page === "profile") await viewProfile();
    else if (["login", "signup", "forgot", "newpass"].includes(page)) authForm(page);
    else if (page === "rules") viewRules();
    else await viewRooms();
  } catch (e) { console.error(e); fail(); }
}
window.addEventListener("hashchange", route);
sb.auth.onAuthStateChange(async (event, session) => {
  const prev = user?.id;
  user = session?.user || null;
  if (event === "PASSWORD_RECOVERY") { location.hash = "#/newpass"; return; }
  if (event === "INITIAL_SESSION" || prev !== user?.id) {
    setTimeout(async () => { await loadProfile(); route(); }, 0);   // вне колбэка, чтобы не блокировать auth
  }
});
})();
