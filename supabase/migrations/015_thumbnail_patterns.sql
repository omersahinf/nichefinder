create table if not exists public.thumbnail_patterns (
  id uuid primary key default gen_random_uuid(),
  normalized_keyword text not null,
  keyword text not null,
  video_id text not null references public.videos(youtube_id) on delete cascade,
  labels text[] not null default '{}',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint thumbnail_patterns_unique unique (normalized_keyword, video_id)
);

create index if not exists thumbnail_patterns_keyword_created_idx
  on public.thumbnail_patterns(normalized_keyword, created_at desc);

create index if not exists thumbnail_patterns_video_idx
  on public.thumbnail_patterns(video_id);

alter table public.thumbnail_patterns enable row level security;

drop policy if exists "thumbnail patterns are readable by authenticated users" on public.thumbnail_patterns;
create policy "thumbnail patterns are readable by authenticated users"
  on public.thumbnail_patterns
  for select
  to authenticated
  using (true);

drop policy if exists "thumbnail patterns insert by authenticated users" on public.thumbnail_patterns;
create policy "thumbnail patterns insert by authenticated users"
  on public.thumbnail_patterns
  for insert
  to authenticated
  with check (true);

drop policy if exists "thumbnail patterns update by creator" on public.thumbnail_patterns;
create policy "thumbnail patterns update by creator"
  on public.thumbnail_patterns
  for update
  to authenticated
  using (created_by = auth.uid());

create or replace function public.update_thumbnail_patterns_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists thumbnail_patterns_updated_at_trigger on public.thumbnail_patterns;
create trigger thumbnail_patterns_updated_at_trigger
  before update on public.thumbnail_patterns
  for each row
  execute function public.update_thumbnail_patterns_updated_at();