create extension if not exists pgcrypto;

create table if not exists public.channels (
  youtube_id text primary key,
  title text not null,
  description text not null default '',
  subs bigint not null default 0,
  total_views bigint not null default 0,
  video_count integer not null default 0,
  country text,
  created_at timestamptz,
  category text,
  fetched_at timestamptz not null default now(),
  avg_views_last_30 numeric,
  is_monetized boolean,
  thumbnail_url text not null default ''
);

create table if not exists public.videos (
  youtube_id text primary key,
  channel_id text not null references public.channels(youtube_id) on delete cascade,
  channel_title text not null,
  title text not null,
  description text not null default '',
  views bigint not null default 0,
  likes bigint not null default 0,
  comments bigint not null default 0,
  duration text not null default '',
  published_at timestamptz not null,
  thumbnail_url text not null default '',
  tags text[] not null default '{}',
  outlier_score numeric not null default 0,
  outlier_reason text not null default '',
  fetched_at timestamptz not null default now()
);

create table if not exists public.searches (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  normalized_keyword text not null,
  filters_json jsonb not null default '{}',
  results_count integer not null default 0,
  source text not null default 'youtube',
  fallback_reason text,
  quota_units integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.search_cache (
  cache_key text primary key,
  keyword text not null,
  normalized_keyword text not null,
  filters_json jsonb not null default '{}',
  video_ids text[] not null default '{}',
  results_count integer not null default 0,
  source text not null default 'youtube',
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.api_usage (
  id bigint generated always as identity primary key,
  day date not null default current_date,
  source text not null default 'youtube',
  units integer not null check (units >= 0),
  context jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists channels_fetched_at_idx on public.channels(fetched_at);
create index if not exists videos_channel_id_idx on public.videos(channel_id);
create index if not exists videos_published_at_idx on public.videos(published_at desc);
create index if not exists videos_fetched_at_idx on public.videos(fetched_at);
create index if not exists searches_keyword_idx on public.searches(normalized_keyword, created_at desc);
create index if not exists search_cache_keyword_idx on public.search_cache(normalized_keyword, fetched_at desc);
create index if not exists api_usage_day_idx on public.api_usage(day);
