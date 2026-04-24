alter table public.videos
  add column if not exists duration_seconds integer;

update public.videos
set duration_seconds =
  coalesce((substring(duration from '(\d+)H'))::integer, 0) * 3600 +
  coalesce((substring(duration from '(\d+)M'))::integer, 0) * 60 +
  coalesce((substring(duration from '(\d+)S'))::integer, 0)
where duration_seconds is null
  and duration ~ '^PT(\d+H)?(\d+M)?(\d+S)?$';

create index if not exists videos_duration_seconds_idx
  on public.videos(duration_seconds);
