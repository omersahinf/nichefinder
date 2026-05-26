create table if not exists public.ai_response_cache (
  id            bigserial primary key,
  prompt_hash   text not null,
  job           text not null,
  result_json   jsonb not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);

create index if not exists ai_response_cache_lookup_idx
  on public.ai_response_cache(prompt_hash, expires_at desc);

create index if not exists ai_response_cache_job_idx
  on public.ai_response_cache(job, created_at desc);

-- Auto-purge expired entries (advisory; actual cleanup via periodic cron)
create or replace function public.purge_expired_ai_cache() returns void
language sql security definer as $$
  delete from public.ai_response_cache where expires_at < now();
$$;
