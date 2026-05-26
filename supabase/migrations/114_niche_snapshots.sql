-- Weekly niche snapshots for watchlist trend tracking
create table if not exists niche_snapshots (
  id              bigserial primary key,
  user_id         uuid        references auth.users(id) on delete cascade,
  keyword         text        not null,
  saturation_level text       not null,
  opportunity_score integer   not null default 0,
  avg_outlier     numeric(8,2) not null default 0,
  small_win_ratio numeric(5,3) not null default 0,
  rpm_min         numeric(8,2),
  rpm_max         numeric(8,2),
  total_channels  integer     not null default 0,
  snapped_at      timestamptz not null default now()
);

create index if not exists niche_snapshots_user_keyword_idx
  on niche_snapshots(user_id, keyword, snapped_at desc);

create index if not exists niche_snapshots_snapped_at_idx
  on niche_snapshots(snapped_at desc);
