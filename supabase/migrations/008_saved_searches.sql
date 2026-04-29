create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  keyword text,
  filters_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  last_visited_at timestamptz
);

create index if not exists saved_searches_recent_idx
  on public.saved_searches(last_visited_at desc nulls last);
