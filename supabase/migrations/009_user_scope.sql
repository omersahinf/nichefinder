alter table public.searches
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.saved_searches
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.user_alerts
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists searches_user_id_idx
  on public.searches(user_id, created_at desc);

create index if not exists saved_searches_user_id_recent_idx
  on public.saved_searches(user_id, last_visited_at desc nulls last, created_at desc);

create index if not exists user_alerts_user_id_idx
  on public.user_alerts(user_id, created_at desc);

alter table public.searches enable row level security;
alter table public.saved_searches enable row level security;
alter table public.user_alerts enable row level security;
alter table public.channels enable row level security;
alter table public.videos enable row level security;
alter table public.search_cache enable row level security;

drop policy if exists "searches are private to owner" on public.searches;
create policy "searches are private to owner"
  on public.searches
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "saved searches are private to owner" on public.saved_searches;
create policy "saved searches are private to owner"
  on public.saved_searches
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "saved searches insert by owner" on public.saved_searches;
create policy "saved searches insert by owner"
  on public.saved_searches
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "saved searches update by owner" on public.saved_searches;
create policy "saved searches update by owner"
  on public.saved_searches
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "saved searches delete by owner" on public.saved_searches;
create policy "saved searches delete by owner"
  on public.saved_searches
  for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "alerts are private to owner" on public.user_alerts;
create policy "alerts are private to owner"
  on public.user_alerts
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "alerts insert by owner" on public.user_alerts;
create policy "alerts insert by owner"
  on public.user_alerts
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "alerts update by owner" on public.user_alerts;
create policy "alerts update by owner"
  on public.user_alerts
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "alerts delete by owner" on public.user_alerts;
create policy "alerts delete by owner"
  on public.user_alerts
  for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "channels are publicly readable" on public.channels;
create policy "channels are publicly readable"
  on public.channels
  for select
  to anon, authenticated
  using (true);

drop policy if exists "videos are publicly readable" on public.videos;
create policy "videos are publicly readable"
  on public.videos
  for select
  to anon, authenticated
  using (true);

drop policy if exists "search cache is publicly readable" on public.search_cache;
create policy "search cache is publicly readable"
  on public.search_cache
  for select
  to anon, authenticated
  using (true);
