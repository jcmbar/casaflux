-- Point family_members.user_id at profiles so PostgREST can embed profiles in selects.
-- profiles.id is 1:1 with auth.users.id, so this preserves the same referential integrity.

alter table public.family_members
  drop constraint if exists family_members_user_id_fkey;

alter table public.family_members
  add constraint family_members_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;
