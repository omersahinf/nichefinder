create table if not exists public.user_alerts (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  normalized_keyword text not null,
  min_outlier numeric not null default 2,
  min_subs bigint not null default 0,
  max_subs bigint not null default 10000000,
  email text not null,
  last_notified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_alerts_keyword_idx
  on public.user_alerts(normalized_keyword);
