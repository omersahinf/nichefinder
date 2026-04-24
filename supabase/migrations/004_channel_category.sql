-- Channel category used for RPM and revenue estimates. Sprint 1 / C2.

alter table public.channels
  add column if not exists category text;

create index if not exists channels_category_idx
  on public.channels(category)
  where category is not null;
