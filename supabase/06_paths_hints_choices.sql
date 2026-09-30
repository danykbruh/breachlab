-- =====================================================================
-- BreachLab - пути обучения, подсказки за очки, вопросы с вариантами
-- =====================================================================

-- ---------- Пути обучения ----------
create table if not exists public.paths (
  id         bigint generated always as identity primary key,
  slug       text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  title      text not null,
  summary    text not null,
  room_slugs text[] not null,          -- комнаты по порядку
  position   integer not null default 100,
  published  boolean not null default true
);
alter table public.paths enable row level security;
drop policy if exists "paths: published are public" on public.paths;
create policy "paths: published are public" on public.paths for select to anon, authenticated using (published);
revoke all on public.paths from anon, authenticated;
grant select on public.paths to anon, authenticated;

insert into public.paths (slug, title, summary, room_slugs, position) values
  ('soc-analyst', 'Путь аналитика SOC', 'От основ безопасности до расследования настоящего инцидента.',
   array['welcome','cia-triad','soc-intro','network-basics','phishing-email','log-analysis'], 10),
  ('defender-basics', 'Основы защитника', 'Сети, Linux, кодировки и веб - фундамент для любой роли в ИБ.',
   array['welcome','network-basics','linux-basics','encoding-hashes','web-basics'], 20),
  ('crypto', 'Криптография', 'От Base64 до XOR и подбора хешей.',
   array['encoding-hashes','crypto-2'], 30)
on conflict (slug) do update set title = excluded.title, summary = excluded.summary,
  room_slugs = excluded.room_slugs, position = excluded.position;

-- ---------- Вопросы с вариантами ответа ----------
alter table public.tasks add column if not exists choices jsonb;        -- ["вариант 1", "вариант 2", …] или null
alter table public.tasks add column if not exists has_hint boolean generated always as (hint is not null) stored;

-- ---------- Подсказки за очки: текст подсказки клиенту больше не виден напрямую ----------
revoke select on public.tasks from anon, authenticated;
grant select (id, room_id, position, question, answer_mask, points, choices, has_hint) on public.tasks to anon, authenticated;

create table if not exists public.hint_unlocks (
  user_id    uuid not null references auth.users (id) on delete cascade,
  task_id    bigint not null references public.tasks (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, task_id)
);
alter table public.hint_unlocks enable row level security;
drop policy if exists "hint_unlocks: own" on public.hint_unlocks;
create policy "hint_unlocks: own" on public.hint_unlocks for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.hint_unlocks from anon, authenticated;
grant select on public.hint_unlocks to authenticated;

-- Стоимость подсказки: 30% очков задания (минимум 1)
create or replace function public.hint_cost(p_points integer)
returns integer language sql immutable set search_path = '' as $$ select greatest(1, round(p_points * 0.3)::integer) $$;

-- Открыть подсказку (повторное открытие бесплатно; после решения - тоже бесплатно)
create or replace function public.unlock_hint(p_task_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); h text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select t.hint into h from public.tasks t join public.rooms r on r.id = t.room_id where t.id = p_task_id and r.published;
  if h is null then return jsonb_build_object('error', 'no_hint'); end if;
  if not exists (select 1 from public.solves where user_id = uid and task_id = p_task_id) then
    insert into public.hint_unlocks (user_id, task_id) values (uid, p_task_id) on conflict do nothing;
  end if;
  return jsonb_build_object('hint', h);
end $$;
revoke all on function public.unlock_hint(bigint) from public, anon;
grant execute on function public.unlock_hint(bigint) to authenticated;

-- Уже открытые подсказки в комнате
create or replace function public.room_hints(p_room_id bigint)
returns table (task_id bigint, hint text) language sql stable security definer set search_path = '' as $$
  select t.id, t.hint from public.hint_unlocks u join public.tasks t on t.id = u.task_id
   where u.user_id = auth.uid() and t.room_id = p_room_id;
$$;
revoke all on function public.room_hints(bigint) from public, anon;
grant execute on function public.room_hints(bigint) to authenticated;

-- Проверка ответа: если подсказка открыта до решения - минус её стоимость
create or replace function public.submit_answer(p_task_id bigint, p_answer text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  pts integer;
  ok boolean;
  recent integer;
  used_hint boolean;
  norm text := public.normalize_answer(p_answer);
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if length(coalesce(p_answer, '')) > 200 then return jsonb_build_object('error', 'too_long'); end if;
  select t.points into pts from public.tasks t join public.rooms r on r.id = t.room_id
   where t.id = p_task_id and r.published;
  if pts is null then return jsonb_build_object('error', 'not_found'); end if;
  if exists (select 1 from public.solves where user_id = uid and task_id = p_task_id) then
    return jsonb_build_object('correct', true, 'already', true);
  end if;
  select count(*) into recent from public.submissions
   where user_id = uid and task_id = p_task_id and created_at > now() - interval '1 minute';
  if recent >= 10 then return jsonb_build_object('error', 'rate_limited'); end if;
  ok := exists (select 1 from public.task_answers a where a.task_id = p_task_id
                  and encode(extensions.digest(a.salt || norm, 'sha256'), 'hex') = a.answer_hash);
  insert into public.submissions (user_id, task_id, correct) values (uid, p_task_id, ok);
  if ok then
    used_hint := exists (select 1 from public.hint_unlocks where user_id = uid and task_id = p_task_id);
    if used_hint then pts := greatest(1, pts - public.hint_cost(pts)); end if;
    insert into public.solves (user_id, task_id, points) values (uid, p_task_id, pts);
  end if;
  return jsonb_build_object('correct', ok, 'points', case when ok then pts else 0 end, 'hint_used', coalesce(used_hint, false));
end $$;
revoke all on function public.submit_answer(bigint, text) from public, anon;
grant execute on function public.submit_answer(bigint, text) to authenticated;

-- Варианты ответа для теоретических вопросов
update public.tasks t set choices = v.c::jsonb from public.rooms r, (values
  ('welcome', 3, '["да","нет"]'),
  ('cia-triad', 1, '["Конфиденциальность","Целостность","Доступность"]'),
  ('cia-triad', 2, '["Конфиденциальность","Целостность","Доступность"]'),
  ('cia-triad', 3, '["Конфиденциальность","Целостность","Доступность"]'),
  ('cia-triad', 4, '["C","I","A"]'),
  ('soc-intro', 1, '["L1","L2","L3"]'),
  ('network-basics', 5, '["да","нет"]'),
  ('network-basics', 7, '["TCP","UDP"]'),
  ('encoding-hashes', 5, '["да","нет"]'),
  ('encoding-hashes', 6, '["MD5","SHA-1","SHA-256"]'),
  ('crypto-2', 6, '["MD5","SHA-1","SHA-256","SHA-512"]')
) as v(slug, pos, c)
where r.id = t.room_id and r.slug = v.slug and t.position = v.pos;
update public.tasks set answer_mask = null where choices is not null;
