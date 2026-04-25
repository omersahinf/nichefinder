alter table public.ai_costs
  add column if not exists theoretical_cost_usd numeric not null default 0;

create index if not exists ai_costs_theoretical_idx
  on public.ai_costs(day, theoretical_cost_usd desc);
