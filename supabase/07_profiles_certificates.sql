-- =====================================================================
-- BreachLab - публичные профили и сертификаты (уже применено в проекте)
-- =====================================================================
alter table public.profiles add column if not exists is_public boolean not null default true;

create table if not exists public.certificates (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  path_slug text not null,
  issued_at timestamptz not null default now(),
  unique (user_id, path_slug)
);
alter table public.certificates enable row level security;
drop policy if exists "certificates: own" on public.certificates;
create policy "certificates: own" on public.certificates for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.certificates from anon, authenticated;
grant select on public.certificates to authenticated;

-- set_profile_public(boolean)   - скрыть/показать профиль
-- public_profile(text)          - данные публичного профиля (или {hidden:true})
-- issue_certificate(text)       - сервер проверяет, что все задания пути решены, и выдаёт сертификат
-- get_certificate(uuid)         - проверка сертификата по номеру (доступна всем)
-- Полный код функций см. в истории миграций Supabase (public_profiles_certificates).
