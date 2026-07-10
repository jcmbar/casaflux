-- Family invitation flow: create, preview, accept, revoke

create or replace function public.normalize_email(p_email text)
returns text
language sql
immutable
as $$
  select lower(trim(p_email));
$$;

create unique index if not exists family_invitations_pending_unique
  on public.family_invitations (family_id, lower(trim(email)))
  where accepted_at is null;

create or replace function public.create_family_invitation(
  p_family_id uuid,
  p_email text,
  p_role text default 'member'
)
returns table (
  invitation_id uuid,
  token text,
  expires_at timestamptz,
  email text,
  role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := public.normalize_email(p_email);
  v_token text;
  v_expires_at timestamptz := now() + interval '7 days';
  v_invitation_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.can_create_family_invitation(p_family_id, v_user_id) then
    raise exception 'Not allowed to invite members to this family';
  end if;

  if v_email is null or v_email = '' then
    raise exception 'Email is required';
  end if;

  if p_role not in ('member', 'admin') then
    raise exception 'Invalid invitation role';
  end if;

  delete from public.family_invitations fi
  where fi.family_id = p_family_id
    and public.normalize_email(fi.email) = v_email
    and fi.accepted_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.family_invitations (
    family_id,
    email,
    role,
    token,
    invited_by,
    expires_at
  )
  values (
    p_family_id,
    v_email,
    p_role,
    v_token,
    v_user_id,
    v_expires_at
  )
  returning id into v_invitation_id;

  return query
  select v_invitation_id, v_token, v_expires_at, v_email, p_role;
end;
$$;

create or replace function public.preview_family_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.family_invitations%rowtype;
  v_family_name text;
  v_status text;
begin
  if p_token is null or length(trim(p_token)) = 0 then
    return jsonb_build_object('status', 'invalid');
  end if;

  select *
  into v_inv
  from public.family_invitations fi
  where fi.token = trim(p_token);

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  select f.name
  into v_family_name
  from public.families f
  where f.id = v_inv.family_id;

  if v_inv.accepted_at is not null then
    v_status := 'accepted';
  elsif v_inv.expires_at <= now() then
    v_status := 'expired';
  else
    v_status := 'valid';
  end if;

  return jsonb_build_object(
    'status', v_status,
    'family_name', v_family_name,
    'role', v_inv.role,
    'expires_at', v_inv.expires_at,
    'invited_email', v_inv.email
  );
end;
$$;

create or replace function public.accept_family_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_inv public.family_invitations%rowtype;
  v_can_invite boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select u.email
  into v_user_email
  from auth.users u
  where u.id = v_user_id;

  select *
  into v_inv
  from public.family_invitations fi
  where fi.token = trim(p_token)
  for update;

  if not found then
    raise exception 'Invalid invitation token';
  end if;

  if v_inv.accepted_at is not null then
    raise exception 'Invitation already accepted';
  end if;

  if v_inv.expires_at <= now() then
    raise exception 'Invitation expired';
  end if;

  if public.normalize_email(v_user_email) <> public.normalize_email(v_inv.email) then
    raise exception 'Authenticated email does not match invitation email';
  end if;

  if v_inv.role not in ('member', 'admin') then
    raise exception 'Invalid invitation role';
  end if;

  if exists (
    select 1
    from public.family_members fm
    where fm.family_id = v_inv.family_id
      and fm.user_id = v_user_id
  ) then
    update public.family_invitations
    set accepted_at = now()
    where id = v_inv.id
      and accepted_at is null;

    return jsonb_build_object(
      'status', 'already_member',
      'family_id', v_inv.family_id
    );
  end if;

  v_can_invite := v_inv.role = 'admin';

  insert into public.family_members (family_id, user_id, role, can_invite)
  values (v_inv.family_id, v_user_id, v_inv.role, v_can_invite);

  update public.family_invitations
  set accepted_at = now()
  where id = v_inv.id;

  return jsonb_build_object(
    'status', 'accepted',
    'family_id', v_inv.family_id
  );
end;
$$;

create or replace function public.revoke_family_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select fi.family_id
  into v_family_id
  from public.family_invitations fi
  where fi.id = p_invitation_id
    and fi.accepted_at is null;

  if v_family_id is null then
    raise exception 'Pending invitation not found';
  end if;

  if not public.can_create_family_invitation(v_family_id, v_user_id) then
    raise exception 'Not allowed to revoke this invitation';
  end if;

  delete from public.family_invitations fi
  where fi.id = p_invitation_id
    and fi.accepted_at is null;
end;
$$;

-- Allow family members to read profiles of other members in the same family
drop policy if exists profiles_select_family_members on public.profiles;

create policy profiles_select_family_members on public.profiles
  for select to authenticated
  using (
    exists (
      select 1
      from public.family_members fm_self
      join public.family_members fm_other
        on fm_self.family_id = fm_other.family_id
      where fm_self.user_id = auth.uid()
        and fm_other.user_id = profiles.id
    )
  );

grant execute on function public.create_family_invitation(uuid, text, text) to authenticated;
grant execute on function public.preview_family_invitation(text) to anon, authenticated;
grant execute on function public.accept_family_invitation(text) to authenticated;
grant execute on function public.revoke_family_invitation(uuid) to authenticated;
