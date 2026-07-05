create table if not exists public.niche_candidates (
  id uuid primary key default gen_random_uuid(),
  canonical_keyword text not null unique,
  source text not null default 'niche_graph',
  score numeric not null default 0,
  status text not null default 'watch',
  evidence jsonb not null default '{}',
  ai_verdict jsonb not null default '{}',
  reject_reason text,
  created_at timestamptz not null default now(),
  evaluated_at timestamptz,
  promoted_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint niche_candidates_status_check
    check (status in ('watch', 'accepted', 'promoted', 'rejected'))
);

alter table public.niche_candidates enable row level security;

create index if not exists niche_candidates_status_score_idx
  on public.niche_candidates(status, score desc, updated_at desc);

create index if not exists niche_candidates_created_idx
  on public.niche_candidates(created_at desc);

alter table public.seed_channels
  drop constraint if exists seed_channels_added_via_check;

alter table public.seed_channels
  add constraint seed_channels_added_via_check
  check (added_via in ('manual', 'mention', 'featured', 'user_search', 'niche_graph_ai'));

create index if not exists seed_keywords_niche_graph_queue_idx
  on public.seed_keywords(priority desc, last_searched_at asc nulls first)
  where enabled = true and source = 'niche_graph_ai';
