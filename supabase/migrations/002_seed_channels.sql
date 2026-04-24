create table if not exists public.seed_channels (
  channel_id text primary key references public.channels(youtube_id) on delete cascade,
  added_via text not null,
  priority integer not null default 0,
  added_at timestamptz not null default now(),
  last_crawled_at timestamptz,
  constraint seed_channels_added_via_check
    check (added_via in ('manual', 'mention', 'featured', 'user_search'))
);

create index if not exists seed_priority_idx
  on public.seed_channels(priority desc, last_crawled_at asc nulls first);
