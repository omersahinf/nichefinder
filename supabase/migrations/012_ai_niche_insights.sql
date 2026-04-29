create table if not exists public.ai_niche_insights (
  normalized_keyword text primary key,
  keyword text not null,
  model text not null,
  insight_json jsonb not null,
  snapshot_fetched_at timestamptz,
  sample_size integer not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_niche_insights_expires_at_idx
  on public.ai_niche_insights(expires_at);
