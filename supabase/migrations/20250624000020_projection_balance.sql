-- Explicit opt-in for monthly projected balance.
--
-- Existing rows remain out of the projection by default so introducing this
-- feature does not silently change financial numbers users already trust.

alter table public.transaction_recurrences
  add column if not exists include_in_projection boolean not null default false;

alter table public.financial_predictions
  add column if not exists include_in_projection boolean not null default false;

comment on column public.transaction_recurrences.include_in_projection is
  'Whether new predictions generated from this recurrence participate in projected balance.';

comment on column public.financial_predictions.include_in_projection is
  'Snapshot indicating whether this prediction participates in projected balance.';

create or replace function public.set_recurrence_projection(
  p_recurrence_id uuid,
  p_include_in_projection boolean
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_recurrence_id uuid;
  v_updated_predictions integer;
begin
  update public.transaction_recurrences
  set include_in_projection = p_include_in_projection
  where id = p_recurrence_id
  returning id into v_recurrence_id;

  if v_recurrence_id is null then
    raise exception 'Recurrence not found or inaccessible';
  end if;

  update public.financial_predictions
  set include_in_projection = p_include_in_projection
  where recurrence_id = p_recurrence_id
    and status = 'predicted';

  get diagnostics v_updated_predictions = row_count;
  return v_updated_predictions;
end;
$$;

revoke all on function public.set_recurrence_projection(uuid, boolean)
  from public;
grant execute on function public.set_recurrence_projection(uuid, boolean)
  to authenticated;
