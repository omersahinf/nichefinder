-- Channel-level tags for similarity search. Sprint 1 / C4.

alter table public.channels
  add column if not exists tags text[] not null default '{}';

create index if not exists channels_tags_gin
  on public.channels using gin(tags);
