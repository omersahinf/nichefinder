-- Close Supabase linter issue `rls_disabled_in_public` for internal tables.
-- These tables are accessed by server-side service-role code; anon/authenticated
-- clients should not read or mutate them directly.

alter table if exists public.ai_costs enable row level security;
alter table if exists public.ai_niche_insights enable row level security;
alter table if exists public.ai_response_cache enable row level security;
alter table if exists public.api_keys enable row level security;
alter table if exists public.api_usage enable row level security;
alter table if exists public.app_errors enable row level security;
alter table if exists public.channel_deep_scans enable row level security;
alter table if exists public.channel_quality_scores enable row level security;
alter table if exists public.format_alerts enable row level security;
alter table if exists public.growth_job_errors enable row level security;
alter table if exists public.keyword_discovery_log enable row level security;
alter table if exists public.niche_snapshots enable row level security;
alter table if exists public.seed_channels enable row level security;
alter table if exists public.seed_keywords enable row level security;
alter table if exists public.subscriptions enable row level security;
alter table if exists public.title_pattern_examples enable row level security;
alter table if exists public.title_patterns enable row level security;
