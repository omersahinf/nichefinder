-- Full-text search support for videos.title and channels.title
-- Replaces ILIKE scans with GIN-indexed tsvector columns for better performance at scale

-- Enable pg_trgm for trigram-based similarity and ILIKE optimization
create extension if not exists pg_trgm;

-- Add generated tsvector column to videos for full-text search on title
alter table public.videos
  add column if not exists title_tsv tsvector
  generated always as (to_tsvector('english', coalesce(title, ''))) stored;

create index if not exists videos_title_tsv_idx
  on public.videos using gin(title_tsv);

-- Trigram index on title for fast ILIKE / similarity fallback
create index if not exists videos_title_trgm_idx
  on public.videos using gin(title gin_trgm_ops);

-- Trigram index on channel_title for cross-field search
create index if not exists videos_channel_title_trgm_idx
  on public.videos using gin(channel_title gin_trgm_ops);

-- Add generated tsvector to channels for channel title search
alter table public.channels
  add column if not exists title_tsv tsvector
  generated always as (to_tsvector('english', coalesce(title, ''))) stored;

create index if not exists channels_title_tsv_idx
  on public.channels using gin(title_tsv);

-- Composite index: most common filter combination (outlier_score, published_at)
create index if not exists videos_outlier_published_idx
  on public.videos(outlier_score desc, published_at desc);

-- Index for channel_id lookups (used in grouping queries)
create index if not exists videos_channel_id_outlier_idx
  on public.videos(channel_id, outlier_score desc);
