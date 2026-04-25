create table if not exists public.title_patterns (
  id uuid primary key default gen_random_uuid(),
  pattern text not null unique,
  pattern_type text not null default 'regex',
  status text not null default 'active',
  score numeric not null default 0,
  velocity_score numeric not null default 0,
  video_count integer not null default 0,
  channel_count integer not null default 0,
  slot_count integer not null default 0,
  avg_outlier_score numeric not null default 0,
  avg_views_per_hour numeric not null default 0,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists title_patterns_score_idx
  on public.title_patterns(score desc, last_seen_at desc nulls last);

create index if not exists title_patterns_velocity_idx
  on public.title_patterns(velocity_score desc, last_seen_at desc nulls last);

create table if not exists public.title_pattern_examples (
  id uuid primary key default gen_random_uuid(),
  pattern_id uuid not null references public.title_patterns(id) on delete cascade,
  video_id text not null references public.videos(youtube_id) on delete cascade,
  channel_id text not null references public.channels(youtube_id) on delete cascade,
  title text not null,
  slot_value text,
  views bigint not null default 0,
  outlier_score numeric not null default 0,
  views_per_hour numeric not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique(pattern_id, video_id)
);

create index if not exists title_pattern_examples_pattern_idx
  on public.title_pattern_examples(pattern_id, views_per_hour desc);

create table if not exists public.format_alerts (
  id uuid primary key default gen_random_uuid(),
  pattern_id uuid references public.title_patterns(id) on delete cascade,
  alert_type text not null,
  severity integer not null default 50,
  message text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists format_alerts_created_idx
  on public.format_alerts(created_at desc);

create table if not exists public.ai_costs (
  id uuid primary key default gen_random_uuid(),
  day date not null default current_date,
  provider text not null,
  model text not null,
  job text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric not null default 0,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists ai_costs_day_idx on public.ai_costs(day, provider, model);
