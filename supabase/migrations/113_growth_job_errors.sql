-- Growth job errors table for surfacing real failure reasons
create table if not exists growth_job_errors (
  id          bigserial primary key,
  job         text        not null,
  error_msg   text        not null,
  metadata    jsonb       not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists growth_job_errors_job_idx on growth_job_errors(job);
create index if not exists growth_job_errors_created_at_idx on growth_job_errors(created_at desc);
