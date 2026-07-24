-- Platform admin (master/admin) for internal user management.
-- Status is app-level (active/inactive/deleted). Hard delete is out of V1.
--
-- Bootstrap a master after deploy (SQL editor / psql):
--   update public.profiles
--   set app_role = 'master'
--   where email = 'seu@email.com';

alter table public.profiles
  add column if not exists app_role text not null default 'user',
  add column if not exists status text not null default 'active',
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references public.profiles (id) on delete set null,
  add column if not exists deleted_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_app_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_app_role_check
      check (app_role in ('user', 'admin', 'master'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_status_check
      check (status in ('active', 'inactive', 'deleted'));
  end if;
end $$;

create index if not exists profiles_status_idx on public.profiles (status);
create index if not exists profiles_app_role_idx on public.profiles (app_role);
create index if not exists profiles_created_at_idx on public.profiles (created_at desc);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.profiles (id) on delete restrict,
  target_user_id uuid not null references public.profiles (id) on delete restrict,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_audit_logs_action_check
    check (action in ('inactivate', 'reactivate', 'soft_delete'))
);

create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);

create index if not exists admin_audit_logs_target_idx
  on public.admin_audit_logs (target_user_id, created_at desc);

comment on table public.admin_audit_logs is
  'Audit trail for platform admin user-management actions.';

alter table public.admin_audit_logs enable row level security;

-- No direct client access; reads/writes go through SECURITY DEFINER RPCs.
drop policy if exists admin_audit_logs_deny_all on public.admin_audit_logs;

revoke all on table public.admin_audit_logs from anon, authenticated;
grant select, insert on table public.admin_audit_logs to service_role;

create or replace function public.is_platform_admin(
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.status = 'active'
      and p.app_role in ('admin', 'master')
  );
$$;

create or replace function public.is_platform_master(
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.status = 'active'
      and p.app_role = 'master'
  );
$$;

create or replace function public.admin_user_stats()
returns table (
  total_users bigint,
  active_users bigint,
  inactive_users bigint,
  deleted_users bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso administrativo negado'
      using errcode = '42501';
  end if;

  return query
  select
    count(*)::bigint as total_users,
    count(*) filter (where p.status = 'active')::bigint as active_users,
    count(*) filter (where p.status = 'inactive')::bigint as inactive_users,
    count(*) filter (where p.status = 'deleted')::bigint as deleted_users
  from public.profiles p;
end;
$$;

create or replace function public.admin_list_users(
  p_search text default null,
  p_status text default null
)
returns table (
  id uuid,
  email text,
  full_name text,
  status text,
  app_role text,
  created_at timestamptz,
  status_changed_at timestamptz,
  deleted_at timestamptz,
  transactions_count bigint,
  accounts_count bigint,
  imports_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_status text := nullif(trim(coalesce(p_status, '')), '');
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso administrativo negado'
      using errcode = '42501';
  end if;

  if v_status is not null and v_status not in ('active', 'inactive', 'deleted') then
    raise exception 'Status de filtro inválido'
      using errcode = '22023';
  end if;

  return query
  select
    p.id,
    p.email,
    p.full_name,
    p.status,
    p.app_role,
    p.created_at,
    p.status_changed_at,
    p.deleted_at,
    (
      select count(*)::bigint
      from public.transactions t
      where t.created_by = p.id
    ) as transactions_count,
    (
      select count(*)::bigint
      from public.accounts a
      where a.owner_user_id = p.id
    ) as accounts_count,
    (
      select count(*)::bigint
      from public.import_batches b
      where b.owner_user_id = p.id
    ) as imports_count
  from public.profiles p
  where (v_status is null or p.status = v_status)
    and (
      v_search is null
      or p.email ilike '%' || v_search || '%'
      or coalesce(p.full_name, '') ilike '%' || v_search || '%'
    )
  order by p.created_at desc;
end;
$$;

create or replace function public.admin_set_user_status(
  p_target_user_id uuid,
  p_next_status text,
  p_reason text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
  v_action text;
  v_previous_status text;
begin
  if v_actor_id is null then
    raise exception 'Não autenticado'
      using errcode = '42501';
  end if;

  if not public.is_platform_admin(v_actor_id) then
    raise exception 'Acesso administrativo negado'
      using errcode = '42501';
  end if;

  if p_next_status not in ('active', 'inactive', 'deleted') then
    raise exception 'Status inválido'
      using errcode = '22023';
  end if;

  select * into v_actor
  from public.profiles
  where id = v_actor_id;

  select * into v_target
  from public.profiles
  where id = p_target_user_id
  for update;

  if not found then
    raise exception 'Usuário não encontrado'
      using errcode = 'P0002';
  end if;

  if v_target.id = v_actor_id and p_next_status <> 'active' then
    raise exception 'Você não pode inativar ou excluir a própria conta'
      using errcode = '42501';
  end if;

  if v_target.app_role = 'master' and v_actor.app_role <> 'master' then
    raise exception 'Somente master pode alterar outro master'
      using errcode = '42501';
  end if;

  if v_target.app_role = 'admin' and v_actor.app_role <> 'master' then
    raise exception 'Somente master pode alterar um admin'
      using errcode = '42501';
  end if;

  if v_target.status = p_next_status then
    return v_target;
  end if;

  v_previous_status := v_target.status;

  if p_next_status = 'inactive' then
    v_action := 'inactivate';
  elsif p_next_status = 'active' then
    v_action := 'reactivate';
  else
    v_action := 'soft_delete';
  end if;

  update public.profiles
  set
    status = p_next_status,
    status_changed_at = now(),
    status_changed_by = v_actor_id,
    deleted_at = case
      when p_next_status = 'deleted' then coalesce(deleted_at, now())
      else null
    end
  where id = v_target.id
  returning * into v_target;

  insert into public.admin_audit_logs (
    actor_user_id,
    target_user_id,
    action,
    metadata
  )
  values (
    v_actor_id,
    v_target.id,
    v_action,
    jsonb_build_object(
      'previous_status', v_previous_status,
      'next_status', p_next_status,
      'reason', nullif(trim(coalesce(p_reason, '')), ''),
      'target_email', v_target.email,
      'target_app_role', v_target.app_role
    )
  );

  return v_target;
end;
$$;

grant execute on function public.is_platform_admin(uuid) to authenticated;
grant execute on function public.is_platform_master(uuid) to authenticated;
grant execute on function public.admin_user_stats() to authenticated;
grant execute on function public.admin_list_users(text, text) to authenticated;
grant execute on function public.admin_set_user_status(uuid, text, text) to authenticated;
