alter table public.videos
  add column if not exists content_class text not null default 'niche',
  add column if not exists content_reasons text[] not null default '{}',
  add column if not exists content_score numeric not null default 0.5;

alter table public.videos
  drop constraint if exists videos_content_class_check;

alter table public.videos
  add constraint videos_content_class_check
  check (content_class in ('niche', 'junk'));

create index if not exists videos_content_class_published_idx
  on public.videos(content_class, published_at desc);

create index if not exists videos_content_class_outlier_idx
  on public.videos(content_class, outlier_score desc);

alter table public.channels
  add column if not exists content_class text not null default 'niche',
  add column if not exists content_reasons text[] not null default '{}',
  add column if not exists junk_video_ratio numeric not null default 0;

alter table public.channels
  drop constraint if exists channels_content_class_check;

alter table public.channels
  add constraint channels_content_class_check
  check (content_class in ('niche', 'junk'));

create index if not exists channels_content_class_idx
  on public.channels(content_class, fetched_at desc);

alter table public.seed_channels
  add column if not exists disabled_at timestamptz,
  add column if not exists disabled_reason text;

create index if not exists seed_channels_active_priority_idx
  on public.seed_channels(priority desc, last_crawled_at asc nulls first)
  where disabled_at is null;

create table if not exists public.content_rejections (
  id bigint generated always as identity primary key,
  entity_type text not null default 'video',
  video_id text,
  channel_id text,
  channel_title text,
  title text,
  description text not null default '',
  duration_seconds integer,
  tags text[] not null default '{}',
  content_class text not null default 'junk',
  content_reasons text[] not null default '{}',
  content_score numeric not null default 0,
  source text not null default 'unknown',
  metadata jsonb not null default '{}',
  rejected_at timestamptz not null default now(),
  constraint content_rejections_content_class_check
    check (content_class in ('niche', 'junk'))
);

alter table public.content_rejections enable row level security;

create index if not exists content_rejections_video_id_idx
  on public.content_rejections(video_id);

create index if not exists content_rejections_channel_id_idx
  on public.content_rejections(channel_id);

create index if not exists content_rejections_rejected_at_idx
  on public.content_rejections(rejected_at desc);

update public.seed_keywords
set
  enabled = false,
  expires_at = coalesce(expires_at, now()),
  last_searched_at = coalesce(last_searched_at, now())
where enabled = true
  and (
    keyword ilike '%shorts%'
    or keyword ilike '%youtube shorts%'
    or keyword ilike '%trailer%'
    or keyword ilike '%teaser%'
    or keyword ilike '%promo%'
    or keyword ilike '%match highlight%'
    or keyword ilike '%game highlight%'
    or keyword ilike '%live stream%'
    or keyword ilike '%gameplay%'
    or keyword ilike '%minecraft%'
    or keyword ilike '%fortnite%'
    or keyword ilike '%roblox%'
    or keyword ilike '%movie clip%'
    or keyword ilike '%full episode%'
    or category = 'gaming'
  );
