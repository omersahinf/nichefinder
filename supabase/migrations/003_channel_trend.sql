-- Channel trend columns. Sprint 1 / C1.

alter table public.channels
  add column if not exists trend_growth_30d numeric,
  add column if not exists trend_direction text,
  add column if not exists trend_sample_size integer;

create index if not exists channels_trend_direction_idx
  on public.channels(trend_direction)
  where trend_direction is not null;
