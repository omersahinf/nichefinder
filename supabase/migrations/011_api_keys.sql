create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  key_prefix text not null,
  key_hash text not null unique,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists api_keys_user_id_idx
  on public.api_keys(user_id, created_at desc);

create index if not exists api_keys_active_idx
  on public.api_keys(user_id, revoked_at, last_used_at desc nulls last);
