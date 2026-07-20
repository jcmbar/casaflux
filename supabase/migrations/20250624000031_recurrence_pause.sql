-- Pause/resume for transaction recurrences (distinct from permanent end via is_active).

alter table public.transaction_recurrences
  add column if not exists is_paused boolean not null default false;

comment on column public.transaction_recurrences.is_paused is
  'When true, the recurrence remains available but does not generate upcoming predictions until resumed. Distinct from is_active=false (ended).';

create index if not exists transaction_recurrences_active_paused_idx
  on public.transaction_recurrences (is_active, is_paused)
  where is_active = true;
