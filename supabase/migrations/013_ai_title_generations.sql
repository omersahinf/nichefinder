create table if not exists public.ai_title_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  normalized_keyword text not null,
  keyword text not null,
  model text not null,
  titles_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_title_generations_user_created_idx
  on public.ai_title_generations(user_id, created_at desc);

create index if not exists ai_title_generations_keyword_created_idx
  on public.ai_title_generations(normalized_keyword, created_at desc);

alter table public.ai_title_generations enable row level security;

drop policy if exists "ai title generations are private to owner" on public.ai_title_generations;
create policy "ai title generations are private to owner"
  on public.ai_title_generations
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "ai title generations insert by owner" on public.ai_title_generations;
create policy "ai title generations insert by owner"
  on public.ai_title_generations
  for insert
  to authenticated
  with check (user_id = auth.uid());
