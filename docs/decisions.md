# Decisions

## 2026-05-27

- Use more of the daily YouTube quota by raising the application quota guard to 9,700 and sharding production auto-search across 9 Vercel cron invocations.
  - Rationale: Vercel cron executions share the same serverless timeout as normal functions, and observed production auto-search runs process only about 10-12 keywords before the 60-second window ends. Multiple staggered shards let the existing `seed_keywords.last_searched_at` ordering and quota guard consume the daily budget without one long-running job.
  - Keep the hard API limit at 10,000 and retain the pre-search guard check so late shards stop before exhausting quota.

## 2026-05-15

- Make the main search experience DB-first, paginated, and filter-only capable.
  - `/api/search` and `/api/v1/search` read Supabase videos/channels first for keyword and no-keyword searches.
  - YouTube API usage is reserved for explicit keyword refresh/backfill paths (`forceRefresh=1` / `force=1`) and background automation.
  - Default DB page size is 100, capped at 500; refresh fetch size is separate and capped at 200.
  - Response metadata includes total count, page, page size, has-more state, source, DB match count, refresh reason, and quota units.
  - Rationale: the growing corpus should power the product experience without spending YouTube quota on normal browsing/filtering.

## 2026-04-30

- Keep `CLAUDE.md` as static, cache-friendly context only.
  - Rationale: frequent edits invalidate token cache and increase context cost.

- Store active state, ideas, and decisions in separate docs:
  - `docs/current-state.md`
  - `docs/ideas-backlog.md`
  - `docs/decisions.md`
  - Rationale: dynamic context can change without touching `CLAUDE.md`.

- Private GitHub repository is acceptable and preferred for this stage.
  - Repository: `https://github.com/omersahinf/nichefinder`
  - Rationale: the project contains product strategy, growth automation, Supabase schema, and niche research logic that should not be public yet.

- Use OpenRouter free models through the OpenAI-compatible AI growth configuration for current automation.
  - Model: `google/gemma-4-31b-it:free`
  - Fallback model: `google/gemma-4-26b-a4b-it:free`
  - Rationale: Alibaba plan ended; existing growth loops are provider-agnostic and read `AI_BASE_URL`, `AI_MODEL`, and provider-specific API keys. With `AI_PROVIDER=openrouter`, require `OPENROUTER_API_KEY` so stale Alibaba `AI_API_KEY` values are not sent to OpenRouter.
  - Updated on 2026-05-09 from `qwen3.6-plus`.
  - Minimax M2.5 free was tested first, but it intermittently returned upstream 429s or empty content under JSON mode. Use Gemma 4 31B as the primary free model for daily automation, with Gemma 4 26B A4B as fallback.
  - Keep `AI_FREE_USAGE=true` for free-model runs, but keep a daily budget cap configured because the app still performs a preflight budget check.

- Keep `.env.local` and real credentials out of git.
  - Rationale: local automation depends on real keys, but secrets must remain local/private.

- Reduce `PROJECT.md` to a short human-facing summary and move long strategy to `docs/growth-strategy.md`.
  - Rationale: new agents should not pull a 200+ line roadmap into context unless they are explicitly working on strategy, growth, or quota planning.
