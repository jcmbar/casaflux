-- Remove manual "dev full access" policies that bypass RLS.
-- These were added directly on the dev project (not in repo migrations) and grant
-- qual=true to anon/authenticated, making every row visible across users.
-- Safe to run in all environments: drops only policies matching this name pattern.

do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname like 'dev full access%'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      r.policyname,
      r.schemaname,
      r.tablename
    );
    raise notice 'Dropped policy % on %.%', r.policyname, r.schemaname, r.tablename;
  end loop;
end;
$$;
