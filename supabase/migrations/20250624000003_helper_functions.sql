-- Permission helpers (SECURITY DEFINER for simpler RLS policies)

create or replace function public.is_family_member(
  p_family_id uuid,
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
    from public.family_members fm
    where fm.family_id = p_family_id
      and fm.user_id = p_user_id
  );
$$;

create or replace function public.is_family_admin(
  p_family_id uuid,
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
    from public.family_members fm
    where fm.family_id = p_family_id
      and fm.user_id = p_user_id
      and fm.role in ('owner', 'admin')
  );
$$;

create or replace function public.can_view_account(
  p_account_id uuid,
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
    from public.accounts a
    where a.id = p_account_id
      and (
        (a.is_family_shared = false and a.owner_user_id = p_user_id)
        or (
          a.is_family_shared = true
          and a.allow_family_view = true
          and public.is_family_member(a.family_id, p_user_id)
        )
      )
  );
$$;

create or replace function public.can_post_to_account(
  p_account_id uuid,
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
    from public.accounts a
    where a.id = p_account_id
      and (
        (a.is_family_shared = false and a.owner_user_id = p_user_id)
        or (
          a.is_family_shared = true
          and a.allow_family_post = true
          and public.is_family_member(a.family_id, p_user_id)
        )
      )
  );
$$;

create or replace function public.can_edit_account(
  p_account_id uuid,
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
    from public.accounts a
    where a.id = p_account_id
      and (
        (a.is_family_shared = false and a.owner_user_id = p_user_id)
        or (
          a.is_family_shared = true
          and public.is_family_member(a.family_id, p_user_id)
          and (
            public.is_family_admin(a.family_id, p_user_id)
            or a.allow_family_edit = true
          )
        )
      )
  );
$$;

create or replace function public.can_manage_family_members(
  p_family_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_family_admin(p_family_id, p_user_id);
$$;

create or replace function public.can_create_family_invitation(
  p_family_id uuid,
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
    from public.family_members fm
    where fm.family_id = p_family_id
      and fm.user_id = p_user_id
      and (
        fm.role in ('owner', 'admin')
        or fm.can_invite = true
      )
  );
$$;

create or replace function public.can_edit_transaction(
  p_transaction_id uuid,
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
    from public.transactions t
    join public.accounts a on a.id = t.account_id
    where t.id = p_transaction_id
      and (
        (a.is_family_shared = false and t.created_by = p_user_id and a.owner_user_id = p_user_id)
        or (
          a.is_family_shared = true
          and public.is_family_member(a.family_id, p_user_id)
          and (
            t.created_by = p_user_id
            or public.is_family_admin(a.family_id, p_user_id)
            or a.allow_family_edit = true
          )
        )
      )
  );
$$;

create or replace function public.generate_family_slug(p_name text)
returns text
language plpgsql
as $$
declare
  base_slug text;
  candidate text;
  suffix int := 0;
begin
  base_slug := lower(trim(p_name));
  base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
  base_slug := regexp_replace(base_slug, '(^-|-$)', '', 'g');

  if base_slug = '' then
    base_slug := 'familia';
  end if;

  candidate := base_slug;

  while exists (select 1 from public.families f where f.slug = candidate) loop
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix::text;
  end loop;

  return candidate;
end;
$$;
