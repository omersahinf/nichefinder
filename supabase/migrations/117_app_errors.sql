create table if not exists public.app_errors (
  id          bigserial primary key,
  scope       text not null,
  message     text not null,
  stack       text,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists app_errors_scope_idx on public.app_errors(scope, created_at desc);
create index if not exists app_errors_created_idx on public.app_errors(created_at desc);
