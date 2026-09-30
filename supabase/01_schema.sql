-- =====================================================================
-- BreachLab - схема базы данных (этап 1)
-- Запускать один раз: Supabase → SQL Editor → New query → вставить → Run
--
-- Принципы:
--  * RLS на всех таблицах, по умолчанию - запрет.
--  * Правильные ответы (task_answers) клиенту недоступны вообще:
--    проверка идёт только в функции submit_answer на сервере.
--  * Ответы хранятся как sha256(соль + ответ), а не открытым текстом.
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;

-- ---------- Профили ----------
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  username   text not null unique check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);

-- ---------- Комнаты (уроки) ----------
create table if not exists public.rooms (
  id          bigint generated always as identity primary key,
  slug        text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  title       text not null,
  summary     text not null,                 -- одна строка для списка комнат
  body_md     text not null default '',      -- теория (markdown)
  files       jsonb not null default '[]',   -- файлы для скачивания: [{"name":"…","url":"…"}]
  category    text not null check (category in ('soc','web','linux','forensics','crypto','osint')),
  difficulty  text not null check (difficulty in ('easy','medium','hard')),
  position    integer not null default 100,  -- порядок в списке
  published   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------- Задания внутри комнаты ----------
create table if not exists public.tasks (
  id          bigint generated always as identity primary key,
  room_id     bigint not null references public.rooms (id) on delete cascade,
  position    integer not null,
  question    text not null,
  hint        text,                          -- подсказка (показывается по запросу)
  answer_mask text,                          -- формат ответа, например «***.***.***.***»
  points      integer not null default 10 check (points between 1 and 500),
  unique (room_id, position)
);

-- ---------- Правильные ответы: НЕ доступны клиенту ----------
create table if not exists public.task_answers (
  task_id     bigint primary key references public.tasks (id) on delete cascade,
  salt        text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  answer_hash text not null                  -- sha256(salt || нормализованный ответ)
);

-- ---------- Попытки (для лимита и статистики) ----------
create table if not exists public.submissions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  task_id    bigint not null references public.tasks (id) on delete cascade,
  correct    boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists submissions_user_task_time on public.submissions (user_id, task_id, created_at);

-- ---------- Решённые задания ----------
create table if not exists public.solves (
  user_id   uuid not null references auth.users (id) on delete cascade,
  task_id   bigint not null references public.tasks (id) on delete cascade,
  points    integer not null,
  solved_at timestamptz not null default now(),
  primary key (user_id, task_id)
);

-- =====================================================================
-- Профиль создаётся при регистрации. Имя берём из формы регистрации;
-- если занято или некорректно - генерируем user_xxxxxx (можно сменить позже).
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare wanted text := new.raw_user_meta_data ->> 'username';
        i integer;
begin
  if wanted is null or wanted !~ '^[a-zA-Z0-9_]{3,20}$'
     or exists (select 1 from public.profiles where lower(username) = lower(wanted)) then
    wanted := null;
  end if;
  -- запасное имя user_xxxxxxxx; при совпадении пробуем другое (регистрация не должна падать)
  for i in 1..10 loop
    begin
      insert into public.profiles (user_id, username)
      values (new.id, coalesce(wanted, 'user_' || encode(extensions.gen_random_bytes(4), 'hex')))
      on conflict (user_id) do nothing;
      return new;
    exception when unique_violation then
      wanted := null;
    end;
  end loop;
  raise exception 'could not create profile';
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.profiles     enable row level security;
alter table public.rooms        enable row level security;
alter table public.tasks        enable row level security;
alter table public.task_answers enable row level security;   -- политик нет = доступа нет ни у кого
alter table public.submissions  enable row level security;
alter table public.solves       enable row level security;

drop policy if exists "rooms: published are public" on public.rooms;
create policy "rooms: published are public" on public.rooms
  for select to anon, authenticated using (published);

drop policy if exists "tasks: of published rooms" on public.tasks;
create policy "tasks: of published rooms" on public.tasks
  for select to anon, authenticated
  using (exists (select 1 from public.rooms r where r.id = room_id and r.published));

drop policy if exists "profiles: own" on public.profiles;
create policy "profiles: own" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "solves: own" on public.solves;
create policy "solves: own" on public.solves
  for select to authenticated using (user_id = (select auth.uid()));

-- Права: читать можно, писать напрямую - нельзя (только через функции ниже)
revoke all on public.profiles, public.rooms, public.tasks, public.task_answers,
              public.submissions, public.solves from anon, authenticated;
grant select on public.rooms, public.tasks to anon, authenticated;
grant select on public.profiles, public.solves to authenticated;

-- =====================================================================
-- Проверка ответа (единственный способ получить очки)
-- =====================================================================
create or replace function public.normalize_answer(a text)
returns text language sql immutable set search_path = '' as $$
  select lower(regexp_replace(btrim(coalesce(a, '')), '\s+', ' ', 'g'))
$$;

create or replace function public.submit_answer(p_task_id bigint, p_answer text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  ans public.task_answers%rowtype;
  pts integer;
  ok boolean;
  recent integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if length(coalesce(p_answer, '')) > 200 then return jsonb_build_object('error', 'too_long'); end if;

  -- задание должно существовать и быть в опубликованной комнате
  select t.points into pts from public.tasks t join public.rooms r on r.id = t.room_id
   where t.id = p_task_id and r.published;
  if pts is null then return jsonb_build_object('error', 'not_found'); end if;

  -- уже решено - очки второй раз не начисляем
  if exists (select 1 from public.solves where user_id = uid and task_id = p_task_id) then
    return jsonb_build_object('correct', true, 'already', true);
  end if;

  -- лимит: не больше 10 попыток в минуту на задание (защита от перебора)
  select count(*) into recent from public.submissions
   where user_id = uid and task_id = p_task_id and created_at > now() - interval '1 minute';
  if recent >= 10 then return jsonb_build_object('error', 'rate_limited'); end if;

  select * into ans from public.task_answers where task_id = p_task_id;
  ok := ans.task_id is not null and
        encode(extensions.digest(ans.salt || public.normalize_answer(p_answer), 'sha256'), 'hex') = ans.answer_hash;

  insert into public.submissions (user_id, task_id, correct) values (uid, p_task_id, ok);
  if ok then
    insert into public.solves (user_id, task_id, points) values (uid, p_task_id, pts);
  end if;
  return jsonb_build_object('correct', ok, 'points', case when ok then pts else 0 end);
end $$;
revoke all on function public.submit_answer(bigint, text) from public, anon;
grant execute on function public.submit_answer(bigint, text) to authenticated;

-- =====================================================================
-- Рейтинг: только имя и сумма очков, без деталей чужих решений
-- =====================================================================
create or replace function public.leaderboard(p_limit integer default 50)
returns table (username text, points bigint, solved bigint)
language sql stable security definer set search_path = '' as $$
  select p.username, sum(s.points), count(*)
    from public.solves s join public.profiles p on p.user_id = s.user_id
   group by p.username
   order by sum(s.points) desc, max(s.solved_at) asc
   limit least(greatest(p_limit, 1), 100)
$$;
revoke all on function public.leaderboard(integer) from public;
grant execute on function public.leaderboard(integer) to anon, authenticated;

-- Смена имени пользователя
create or replace function public.set_username(p_username text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_username !~ '^[a-zA-Z0-9_]{3,20}$' then return jsonb_build_object('error', 'invalid'); end if;
  if exists (select 1 from public.profiles where lower(username) = lower(p_username) and user_id <> auth.uid()) then
    return jsonb_build_object('error', 'taken');
  end if;
  update public.profiles set username = p_username where user_id = auth.uid();
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.set_username(text) from public, anon;
grant execute on function public.set_username(text) to authenticated;

-- Удаление аккаунта самим пользователем
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;


-- =====================================================================
-- Для автора комнат: задать правильный ответ (только из SQL Editor).
-- Пример: select public.set_task_answer('my-room', 1, 'ответ');
-- =====================================================================
create or replace function public.set_task_answer(p_room_slug text, p_position integer, p_answer text)
returns text language plpgsql security definer set search_path = '' as $$
declare tid bigint; s text := encode(extensions.gen_random_bytes(16), 'hex');
begin
  select t.id into tid from public.tasks t join public.rooms r on r.id = t.room_id
   where r.slug = p_room_slug and t.position = p_position;
  if tid is null then raise exception 'task % / % not found', p_room_slug, p_position; end if;
  insert into public.task_answers (task_id, salt, answer_hash)
  values (tid, s, encode(extensions.digest(s || public.normalize_answer(p_answer), 'sha256'), 'hex'))
  on conflict (task_id) do update set salt = excluded.salt, answer_hash = excluded.answer_hash;
  return 'ok: ' || p_room_slug || ' #' || p_position;
end $$;
revoke all on function public.set_task_answer(text, integer, text) from public, anon, authenticated;

-- Проверка: RLS включён везде
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;
