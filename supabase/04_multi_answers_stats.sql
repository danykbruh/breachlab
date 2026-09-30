-- =====================================================================
-- BreachLab — несколько вариантов ответа и статистика платформы
-- (уже применено в проекте; файл хранится для истории)
-- =====================================================================
alter table public.task_answers drop constraint if exists task_answers_pkey;
alter table public.task_answers add column if not exists id bigint generated always as identity primary key;
create index if not exists task_answers_task on public.task_answers (task_id);

create or replace function public.submit_answer(p_task_id bigint, p_answer text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  pts integer;
  ok boolean;
  recent integer;
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
  if ok then insert into public.solves (user_id, task_id, points) values (uid, p_task_id, pts); end if;
  return jsonb_build_object('correct', ok, 'points', case when ok then pts else 0 end);
end $$;
revoke all on function public.submit_answer(bigint, text) from public, anon;
grant execute on function public.submit_answer(bigint, text) to authenticated;

-- set_task_answer: заменяет все варианты; add_task_answer: добавляет ещё один
create or replace function public.set_task_answer(p_room_slug text, p_position integer, p_answer text)
returns text language plpgsql security definer set search_path = '' as $$
declare tid bigint; s text := encode(extensions.gen_random_bytes(16), 'hex');
begin
  select t.id into tid from public.tasks t join public.rooms r on r.id = t.room_id
   where r.slug = p_room_slug and t.position = p_position;
  if tid is null then raise exception 'task % / % not found', p_room_slug, p_position; end if;
  delete from public.task_answers where task_id = tid;
  insert into public.task_answers (task_id, salt, answer_hash)
  values (tid, s, encode(extensions.digest(s || public.normalize_answer(p_answer), 'sha256'), 'hex'));
  return 'ok: ' || p_room_slug || ' #' || p_position;
end $$;
revoke all on function public.set_task_answer(text, integer, text) from public, anon, authenticated;

create or replace function public.add_task_answer(p_room_slug text, p_position integer, p_answer text)
returns text language plpgsql security definer set search_path = '' as $$
declare tid bigint; s text := encode(extensions.gen_random_bytes(16), 'hex');
begin
  select t.id into tid from public.tasks t join public.rooms r on r.id = t.room_id
   where r.slug = p_room_slug and t.position = p_position;
  if tid is null then raise exception 'task % / % not found', p_room_slug, p_position; end if;
  insert into public.task_answers (task_id, salt, answer_hash)
  values (tid, s, encode(extensions.digest(s || public.normalize_answer(p_answer), 'sha256'), 'hex'));
  return 'ok+: ' || p_room_slug || ' #' || p_position;
end $$;
revoke all on function public.add_task_answer(text, integer, text) from public, anon, authenticated;

create or replace function public.platform_stats()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'rooms',   (select count(*) from public.rooms where published),
    'tasks',   (select count(*) from public.tasks t join public.rooms r on r.id = t.room_id where r.published),
    'players', (select count(*) from public.profiles),
    'solves',  (select count(*) from public.solves));
$$;
revoke all on function public.platform_stats() from public;
grant execute on function public.platform_stats() to anon, authenticated;

-- Служебные функции не должны вызываться через API
revoke execute on function public.handle_new_user() from public, anon, authenticated;
