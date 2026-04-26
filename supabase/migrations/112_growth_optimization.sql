create table if not exists public.channel_quality_scores (
  channel_id text primary key references public.channels(youtube_id) on delete cascade,
  quality_score numeric not null default 0,
  avg_outlier_score numeric not null default 0,
  recent_video_count integer not null default 0,
  upload_frequency_score numeric not null default 0,
  niche_match_score numeric not null default 0,
  monetization_score numeric not null default 0,
  mega_channel_penalty numeric not null default 0,
  inactive_penalty numeric not null default 0,
  metadata jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create index if not exists channel_quality_scores_score_idx
  on public.channel_quality_scores(quality_score desc, updated_at desc);

create table if not exists public.channel_deep_scans (
  channel_id text primary key references public.channels(youtube_id) on delete cascade,
  last_scanned_at timestamptz not null default now(),
  videos_seen integer not null default 0,
  new_videos_added integer not null default 0,
  quota_units integer not null default 0,
  metadata jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create index if not exists channel_deep_scans_last_scanned_idx
  on public.channel_deep_scans(last_scanned_at asc);

insert into public.seed_keywords (keyword, category, priority, source) values
  ('why it sucks to be born as', 'pattern', 72, 'pattern_probe'),
  ('what it was like to be', 'pattern', 70, 'pattern_probe'),
  ('why you would not survive', 'pattern', 72, 'pattern_probe'),
  ('life as a', 'pattern', 68, 'pattern_probe'),
  ('what if you were born', 'pattern', 68, 'pattern_probe'),
  ('the worst time to be alive', 'history', 70, 'pattern_probe'),
  ('born as a dinosaur', 'education', 68, 'pattern_probe'),
  ('born as an animal', 'education', 68, 'pattern_probe'),
  ('ancient life documentary', 'education', 66, 'pattern_probe'),
  ('animal survival explained', 'education', 66, 'pattern_probe'),
  ('why it was horrible to be', 'pattern', 70, 'pattern_probe'),
  ('you would not survive as', 'pattern', 70, 'pattern_probe'),
  ('the dark truth about', 'pattern', 68, 'pattern_probe'),
  ('what happened to', 'pattern', 66, 'pattern_probe')
on conflict (keyword) do nothing;
