# Current State

## 2026-06-17

Active focus:

- Production daily automation check at `12:45 +03` / `09:45 UTC`:
  - `api_usage` total for UTC day `2026-06-17`: about 9,276 units, under the 9,700 guard and 10,000 hard limit.
  - Auto-search shards ran between about `08:48 +03` and `10:53 +03`; `niche_graph_ai` keywords were searched 24 times for 3,646 units.
  - `grow-discover` ran successfully; `niche-graph-discovery` found 120 candidates, added 2 direct keywords, promoted 3 channels, and wrote lifecycle statuses.
  - `grow-discover-ai` ran successfully; narrowed `ai:vertical-strategist` added 11 adjacent `niche_graph_ai` keywords from candidate evidence.
  - `growth_job_errors` had 0 rows for the day, confirming the previous missing `channel_quality_scores` / `channel_deep_scans` schema issues are resolved.
  - Issue found: sports fixture keywords `dodgers vs`, `dodgers vs angels`, and `dodgers vs padres` slipped into `niche_graph_ai` and were each auto-searched once.
  - Fix applied: disabled those seed keywords remotely, tightened graph blocklist for `vs`, `dodgers`, `padres`, `psg`, `uefa`, and `champions league`, added regression tests, and deployed to production.
  - Final smoke check: 0 enabled `niche_graph_ai` keywords match shorts/trailer/match/gameplay/live/movie/episode/sports/`vs` terms.

## 2026-06-16

Active focus:

- Evidence-first niche graph discovery was implemented locally:
  - Added `niche_candidates` lifecycle migration with status, score, evidence JSON, AI verdict JSON, and promotion timestamps.
  - Added `runNicheGraphDiscovery` to `grow-discover`; it only reads `videos.content_class = 'niche'`, non-junk channels, 90-day long-form outlier evidence, and promotes accepted keywords as `seed_keywords.source = 'niche_graph_ai'`.
  - Narrowed `ai-vertical-strategist` so it expands only from `niche_candidates` instead of generating broad keyword lists.
  - Auto-search queue scoring now gives `niche_graph_ai` seeds the strongest source bonus.
  - Added unit coverage for junk keyword blocking and small-channel repeated-outlier scoring.
  - Verification: `npx tsc --noEmit` passed; full `npm test` passed; targeted ESLint for touched discovery/cron/cache files passed.
- Remote Supabase schema was updated through `npx supabase db query --linked`:
  - Applied idempotent migrations `111`, `112`, `114`, `116`, `118`, and `120`.
  - Verified `channel_quality_scores`, `channel_deep_scans`, `niche_snapshots`, `content_rejections`, and `niche_candidates` exist remotely.
  - Repaired remote migration history so local/remote versions `001` through `120` are all marked applied.
  - Smoke counts after schema update: `niche_candidates = 0`, `seed_keywords.source = 'niche_graph_ai' = 0`; first `grow-discover` run should populate them if evidence qualifies.
- Production deploy completed via `npx vercel deploy --prod --yes`:
  - Active alias: `https://nichefinder-tau.vercel.app`.
  - First production `grow-discover` run succeeded in about 29.5s; `niche-graph-discovery` found 120 candidates with status distribution `accepted=2`, `watch=75`, `rejected=43`, and promoted no direct high-score keywords.
  - Production `grow-discover-ai` succeeded in about 41.9s and added 12 `niche_graph_ai` keywords from candidate evidence.
  - Smoke check found `football strategy` among AI-adjacent keywords, so sports blocklists were tightened for `football`, `soccer`, `basketball`, and `baseball`; `football strategy` was disabled remotely.
  - Second production deploy completed with the tightened filters; final smoke check showed `0` enabled `niche_graph_ai` keywords matching shorts/trailer/match/gameplay/live/movie/episode/sports terms.

## 2026-05-27

Active focus:

- Vercel cron daily quota utilization was adjusted for higher YouTube API efficiency:
  - `DAILY_QUOTA_GUARD` increased from 9,000 to 9,700 while the hard daily limit remains 10,000.
  - Auto-search cron handlers were split into 9 daily shards: `/api/cron/auto-search` through `/api/cron/auto-search-9`.
  - Auto-search shards now run every 15 minutes from `05:20 UTC` through `07:20 UTC`, with `grow-tune` moved to `07:30 UTC`.
  - Existing per-keyword quota guard remains active, so later shards should stop naturally once the day approaches the guard.
  - Verification: `vercel.json` parsed successfully, `npx tsc --noEmit` passed, and targeted ESLint for touched cron/cache files passed.
  - Full `npm run lint` still fails on pre-existing unrelated issues in `app/niche/[slug]/share/page.tsx` and unused warnings in other files.
- 2026-05-27 production cron check at `14:56 +03` confirmed the sharded schedule worked:
  - Supabase `api_usage` totals for UTC day `2026-05-27`: 96 rows, 9,490 units.
  - Auto-search shards `/api/cron/auto-search` through `/api/cron/auto-search-9` all recorded usage: 92 keyword runs, 9,483 units.
  - Auto-search activity spanned `08:56:43 +03` through `11:18:59 +03`.
  - Total usage stayed below the 9,700 guard and within the 10,000 hard daily quota.
  - Growth cron also recorded small usage: `cron` 4, `trend` 2, `graph_crawler` 1.
  - Recurring growth sub-job errors remained: `channel-quality` missing `public.channel_quality_scores` and `uploads-deep-scan` missing `public.channel_deep_scans` in the Supabase schema cache.

## 2026-05-18

Active focus:

- 2026-05-18 manual daily automation run completed on current-source local dev server `http://localhost:3000`:
  - Start time check was `2026-05-18 20:52 +03` / `2026-05-18 17:52 UTC`.
  - Pre-run quota read: 0 used, 10,000 remaining, guard at 9,000.
  - Pre-run database totals: 39,926 channels, 108,906 videos, 10,485 seed channels, 3,108 seed keywords.
  - `refresh-seeds` completed: 200 seed channels attempted, 200 refreshed, 2,933 new videos, 63 quota units, 0 alert matches.
  - `grow-discover` completed in about 5 seconds:
    - `velocity-tracker` added 20 candidates.
    - `extraction` added 14 candidates.
    - `trend` added 11 candidates.
    - `graph-crawler` added 3 candidates.
    - `pattern-miner`, `variation`, and `ai:pattern-slot-filler` added 0 candidates.
    - `ai:vertical-strategist` added 0 candidates because OpenRouter fallback Gemma 4 26B A4B returned upstream 429.
  - `channel-quality` and `uploads-deep-scan` again returned generic `Job failed` inside `grow-discover`; main automation still completed.
  - `auto-search` processed 75 keywords, discovered 2,984 channels, used 8,650 units, and stopped on `quota_guard`.
  - `keyword-discovery` added no new candidates; extraction, variation, and trend added 0.
  - `grow-tune` completed with no promotions, demotions, or disables.
  - Post-run quota read: 8,716 used, 1,284 remaining, guard at 9,000.
  - Supabase `api_usage` totals for `2026-05-18`: `cron_auto_search` 8,650, `cron` 63, `trend` 2, `graph_crawler` 1.
  - Post-run database totals: 41,858 channels, 114,375 videos, 10,997 seed channels, 3,133 seed keywords.

## 2026-05-17

Active focus:

- 2026-05-17 manual daily automation run completed on current-source local dev server `http://localhost:3000`:
  - Start time check was `2026-05-17 15:31 +03` / `2026-05-17 12:31 UTC`.
  - Pre-run quota read: 0 used, 10,000 remaining, guard at 9,000.
  - Pre-run database totals: 37,935 channels, 103,293 videos, 9,922 seed channels, 3,065 seed keywords.
  - `refresh-seeds` completed: 200 seed channels attempted, 199 refreshed, 2,873 new videos, 62 quota units, 0 alert matches.
  - `grow-discover` completed in about 7 seconds:
    - `velocity-tracker` added 20 candidates.
    - `extraction` added 26 candidates.
    - `trend` added 12 candidates.
    - `graph-crawler` added 1 candidate.
    - `pattern-miner`, `variation`, and `ai:pattern-slot-filler` added 0 candidates.
    - `ai:vertical-strategist` added 0 candidates because OpenRouter fallback Gemma 4 26B A4B returned upstream 429.
  - `channel-quality` and `uploads-deep-scan` again returned generic `Job failed` inside `grow-discover`; main automation still completed.
  - `auto-search` processed 80 keywords, discovered 3,184 channels, used 8,660 units, and stopped on `quota_guard`.
  - `keyword-discovery` added 5 trend candidates; extraction and variation added 0.
  - `grow-tune` completed with no promotions, demotions, or disables.
  - Post-run quota read: 8,725 used, 1,275 remaining, guard at 9,000.
  - Supabase `api_usage` totals for `2026-05-17`: `cron_auto_search` 8,660, `cron` 62, `trend` 2, `graph_crawler` 1.
  - Post-run database totals: 39,926 channels, 108,906 videos, 10,485 seed channels, 3,108 seed keywords.

## 2026-05-15

Active focus:

- DB-first paginated search implementation is now in progress/completed locally:
  - `/api/search` and `/api/v1/search` use Supabase `videos`/`channels` for normal keyword, empty keyword, and filter-only searches.
  - YouTube refresh is explicit and keyword-only; normal DB reads return `quotaUnits: 0`.
  - UI supports 100-row pages, Load more, `showing loaded of total`, 3d date preset, and 8m+ duration preset.
  - Full-text/trigram DB indexes remain a later migration; the first implementation uses ILIKE/query expansion.
- 2026-05-15 manual daily automation run completed on current-source local dev server `http://localhost:3000`:
  - Start time check was `2026-05-15 06:46 +03` / `2026-05-15 03:46 UTC`.
  - Pre-run quota read: 0 used, 10,000 remaining, guard at 9,000.
  - Pre-run database totals: 35,907 channels, 97,699 videos, 9,354 seed channels, 3,035 seed keywords.
  - `refresh-seeds` completed: 200 seed channels attempted, 199 refreshed, 2,842 new videos, 61 quota units, 0 alert matches.
  - `grow-discover` completed in about 4 seconds:
    - `velocity-tracker` added 20 candidates.
    - `extraction` added 14 candidates.
    - `trend` added 11 candidates.
    - `graph-crawler`, `pattern-miner`, `variation`, and `ai:pattern-slot-filler` added 0 candidates.
    - `ai:vertical-strategist` added 0 candidates because OpenRouter fallback Gemma 4 26B A4B returned upstream 429.
  - `channel-quality` and `uploads-deep-scan` again returned generic `Job failed` inside `grow-discover`; main automation still completed.
  - `auto-search` processed 83 keywords, discovered 3,356 channels, used 8,666 units, and stopped on `quota_guard`.
  - `keyword-discovery` added 5 trend candidates; extraction and variation added 0.
  - `grow-tune` completed with no promotions, demotions, or disables.
  - Post-run quota read: 8,729 used, 1,271 remaining, guard at 9,000.
  - Supabase `api_usage` totals for `2026-05-15`: `cron_auto_search` 8,666, `cron` 61, `trend` 2.
  - Post-run database totals: 37,935 channels, 103,293 videos, 9,922 seed channels, 3,065 seed keywords.

## 2026-05-13

Active focus:

- Confirmed the earlier same-day note was actually yesterday's quota day: before this run, Supabase had `2026-05-13` `api_usage` rows = 0, while `2026-05-12` had `cron_auto_search` 8,762 and `trend` 2.
- 2026-05-13 manual daily automation run completed on current-source local dev server `http://localhost:3000`:
  - Start time check was `2026-05-13 17:46 +03` / `2026-05-13 14:46 UTC`.
  - `refresh-seeds` completed: 200 seed channels attempted, 199 refreshed, 2,911 new videos, 63 quota units, 0 alert matches.
  - `grow-discover` completed in about 6 seconds:
    - `velocity-tracker` added 20 candidates.
    - `extraction` added 25 candidates.
    - `trend` added 11 candidates.
    - `graph-crawler` added 2 candidates.
    - `pattern-miner`, `variation`, and `ai:pattern-slot-filler` added 0 candidates.
    - `ai:vertical-strategist` added 0 candidates because OpenRouter primary/fallback free Gemma models returned upstream 429; `ai:pattern-slot-filler` skipped with `no_slot_patterns`.
  - `channel-quality` and `uploads-deep-scan` again returned generic `Job failed` inside `grow-discover`; main automation still completed.
  - `auto-search` processed 77 keywords, discovered 3,098 channels, used 8,654 units, and stopped on `quota_guard`.
  - `keyword-discovery` added 3 trend candidates; extraction and variation added 0.
  - `grow-tune` completed with no promotions, demotions, or disables.
  - Post-run quota read: 8,720 used, 1,280 remaining, guard at 9,000.
  - Supabase `api_usage` totals for `2026-05-13`: `cron_auto_search` 8,654, `cron` 63, `trend` 2, `graph_crawler` 1.
  - Post-run database totals: 35,907 channels, 97,699 videos, 9,354 seed channels, 3,035 seed keywords.

## 2026-05-10

Active focus:

- 2026-05-10 manual daily automation run completed on local dev server `http://localhost:3000`:
  - Machine time before running was `2026-05-10 16:44 +03`; UTC day was also `2026-05-10`.
  - `refresh-seeds` completed: 200 seed channels refreshed, 2,904 new videos, 63 quota units, 0 alert matches.
  - `grow-discover` completed in about 57 seconds:
    - `velocity-tracker` added 20 candidates.
    - `extraction` added 19 candidates.
    - `trend` added 9 candidates.
    - `graph-crawler` added 4 candidates.
    - `pattern-miner`, `variation`, and `ai:pattern-slot-filler` added 0 candidates.
    - `ai:vertical-strategist` added 0 candidates. OpenRouter primary Gemma 4 31B returned upstream 429, fallback Gemma 4 26B responded but JSON parsing failed with `Bad control character in string literal`.
  - `channel-quality` and `uploads-deep-scan` again returned generic `Job failed` inside `grow-discover`; main automation still completed.
  - `auto-search` processed 83 keywords, discovered 3,410 channels, used 8,666 units, and stopped on `quota_guard`.
  - `keyword-discovery` added 9 trend candidates; extraction and variation added 0.
  - `grow-tune` completed with no promotions, demotions, or disables.
  - Post-run quota read: 8,732 used, 1,268 remaining, guard at 9,000. Supabase `api_usage` totals for `2026-05-10`: `cron_auto_search` 8,666, `cron` 63, `trend` 2, `graph_crawler` 1.
  - Post-run database totals: 31,723 channels, 86,074 videos, 8,215 seed channels.

## 2026-05-09

Active focus:

- AI provider migration from Alibaba/Qwen to OpenRouter started:
  - `.env.local` now uses `AI_PROVIDER=openrouter`, `AI_MODEL=google/gemma-4-31b-it:free`, and `AI_FALLBACK_MODEL=google/gemma-4-26b-a4b-it:free`.
  - `lib/ai-client.ts` now reads `OPENROUTER_API_KEY` when `AI_PROVIDER=openrouter` and will not send stale Alibaba `AI_API_KEY` values to OpenRouter.
  - Added fallback handling in `generateAiJson`: retry the fallback model when the primary model fails or returns invalid JSON.
  - Real OpenRouter smoke test result: Minimax free intermittently returned upstream 429 or empty content with JSON mode; fallback Gemma 4 31B returned valid parsed JSON with `costUsd: 0`.
- 2026-05-09 manual daily automation run completed on local dev server `http://localhost:3000`:
  - Before running automation, AI config was changed to Gemma 4 31B primary and Gemma 4 26B A4B fallback because Minimax free was unreliable in JSON mode.
  - `refresh-seeds` completed with two RSS 404 skips: 200 seed channels attempted, 198 refreshed, 2,871 new videos, 62 quota units, 0 alert matches.
  - First `grow-discover` pass completed in about 5 seconds, but AI jobs skipped because two AI job prechecks did not yet count `OPENROUTER_API_KEY`:
    - `velocity-tracker` added 20 candidates.
    - `extraction` added 26 candidates.
    - `trend` added 10 candidates.
    - `graph-crawler` added 8 candidates.
  - Fixed OpenRouter key prechecks in `lib/ai-vertical-strategist.ts` and `lib/ai-pattern-slot-filler.ts`, then reran `grow-discover`:
    - `velocity-tracker` added 20 candidates.
    - `extraction` added 2 candidates.
    - `trend` added 1 candidate.
    - `graph-crawler`, `variation`, `pattern-miner`, and `ai:pattern-slot-filler` added 0 candidates.
    - `ai:vertical-strategist` still added 0 candidates because OpenRouter free upstream returned 429 for Gemma 4 31B and then Gemma 4 26B fallback.
  - `channel-quality` and `uploads-deep-scan` again returned generic `Job failed` inside `grow-discover`; main automation still completed.
  - `auto-search` processed 83 keywords, discovered 3,366 channels, used 8,664 units, and stopped on `quota_guard`.
  - `keyword-discovery` added 6 candidates: 1 extraction candidate and 5 trend candidates; variation added 0.
  - `grow-tune` completed with no promotions, demotions, or disables.
  - Post-run quota read: 8,730 used, 1,270 remaining, guard at 9,000. Supabase `api_usage` totals for `2026-05-09`: `cron_auto_search` 8,664, `cron` 62, `trend` 3, `graph_crawler` 1.
  - Post-run database totals: 29,385 channels, 79,975 videos, 7,583 seed channels.

## 2026-05-08

Active focus:

- 2026-05-08 manual daily automation run completed on local dev server `http://localhost:3000`:
  - Machine time at final check was `2026-05-08 13:36 +03`; Supabase `api_usage` records this run under UTC day `2026-05-08`.
  - `refresh-seeds` completed with one RSS 404 skip: 200 seed channels attempted, 199 refreshed, 2,927 new videos, 63 quota units reported by the endpoint, 0 alert matches.
  - `grow-discover` completed in about 162 seconds:
    - `ai:vertical-strategist` added 168 candidates with `qwen3.6-plus`.
    - `extraction` added 25 candidates.
    - `velocity-tracker` added 20 candidates.
    - `trend` added 12 candidates.
    - `graph-crawler` added 4 candidates.
    - `pattern-miner`, `variation`, and `ai:pattern-slot-filler` added 0 candidates.
  - `channel-quality` and `uploads-deep-scan` again returned generic `Job failed` inside `grow-discover`; main automation still completed.
  - `auto-search` processed 86 keywords, discovered 3,529 channels, used 8,772 units, and stopped on `quota_guard`.
  - `keyword-discovery` added 19 candidates: 3 extraction candidates and 16 trend candidates; variation added 0.
  - `grow-tune` completed with no promotions, demotions, or disables.
  - Post-run quota read: 8,773 used, 1,227 remaining, guard at 9,000. Supabase `api_usage` totals for `2026-05-08`: `cron_auto_search` 8,772, `trend` 1. Note that the `refresh-seeds` endpoint reported 63 units, but those units were not present in the final `api_usage` source totals.
  - Post-run database totals: 26,973 channels, 73,889 videos, 6,986 seed channels.

## 2026-05-06

Active focus:

- 2026-05-06 manual daily automation run completed on local dev server `http://localhost:3000`:
  - `refresh-seeds` completed: 200 seed channels refreshed, 2,899 new videos, 63 quota units, 0 alert matches.
  - `grow-discover` completed in about 176 seconds:
    - `ai:vertical-strategist` added 164 candidates with `qwen3.6-plus`.
    - `extraction` added 28 candidates.
    - `velocity-tracker` added 20 candidates.
    - `trend` added 10 candidates.
    - `graph-crawler` added 10 candidates.
    - `pattern-miner` added 1 candidate.
    - `variation` and `ai:pattern-slot-filler` added 0 candidates.
  - `channel-quality` and `uploads-deep-scan` again returned generic `Job failed` inside `grow-discover`; main automation still completed.
  - `auto-search` processed 84 keywords, discovered 3,398 channels, used 8,668 units, and stopped on `quota_guard`.
  - `keyword-discovery` added 23 candidates: 13 extraction candidates and 10 trend candidates; variation added 0.
  - `grow-tune` completed with no promotions, demotions, or disables.
  - Post-run quota read: 8,734 used, 1,266 remaining, guard at 9,000. Supabase `api_usage` totals for `2026-05-06`: `cron_auto_search` 8,668, `cron` 63, `trend` 2, `graph_crawler` 1.
  - Post-run database totals: 24,369 channels, 67,302 videos, 6,329 seed channels.

## 2026-05-05

Active focus:

- 2026-05-05 manual daily automation run completed on local dev server `http://localhost:3000`:
  - `refresh-seeds` completed: 200 seed channels refreshed, 2,956 new videos, 64 quota units, 0 alert matches.
  - `grow-discover` completed in about 184 seconds:
    - `ai:vertical-strategist` added 167 candidates with `qwen3.6-plus`.
    - `extraction` added 30 candidates.
    - `velocity-tracker` added 20 candidates.
    - `trend` added 8 candidates.
    - `graph-crawler` added 2 candidates.
    - `pattern-miner` added 1 candidate.
    - `variation` and `ai:pattern-slot-filler` added 0 candidates.
  - `channel-quality` and `uploads-deep-scan` again returned generic `Job failed` inside `grow-discover`; main automation still completed.
  - `auto-search` processed 76 keywords, discovered 3,059 channels, used 8,652 units, and stopped on `quota_guard`.
  - `keyword-discovery` added no new candidates; extraction found 30, variation found 50, and trend found 8 but all were already covered or rejected.
  - `grow-tune` completed with no promotions, demotions, or disables.
  - Post-run quota read: 8,719 used, 1,281 remaining, guard at 9,000. Supabase `api_usage` totals for `2026-05-05`: `cron_auto_search` 8,652, `cron` 64, `trend` 2, `graph_crawler` 1.

## 2026-05-04

Active focus:

- 2026-05-03 evening / 2026-05-04 continuation manual daily automation run completed on local dev server `http://localhost:3000`:
  - `refresh-seeds` completed before the date rollover: 199 seed channels refreshed, 2,915 new videos, 63 quota units recorded under `2026-05-03`.
  - `grow-discover` completed in about 226 seconds:
    - `ai:vertical-strategist` added 172 candidates with `qwen3.6-plus`.
    - `extraction` added 24 candidates.
    - `velocity-tracker` added 20 candidates.
    - `trend` added 9 candidates.
    - `graph-crawler` added 5 candidates.
    - `pattern-miner` added 1 candidate.
    - `variation` and `ai:pattern-slot-filler` added 0 candidates.
  - `channel-quality` and `uploads-deep-scan` again returned generic `Job failed` inside `grow-discover`; main automation still completed.
  - Initial `auto-search` ran for about 16.4 minutes and returned HTTP 500 `Unable to run auto-search` after Supabase network errors (`ECONNRESET` / `ENOTFOUND`) during cache/quota writes. It still recorded 79 keyword usage entries and 8,458 quota units before failing.
  - A second guarded `auto-search` run completed successfully: 3 keywords, 106 channels discovered, 306 units, stopped on `quota_guard`.
  - Total `2026-05-04` `cron_auto_search` usage: 82 keyword usage entries, 8,764 units.
  - `keyword-discovery` added 8 trend candidates; extraction and variation added 0.
  - `grow-tune` completed with no promotions, demotions, or disables.
  - Post-run quota read: 8,767 used, 1,233 remaining, guard at 9,000. Supabase `api_usage` totals for `2026-05-04`: `cron_auto_search` 8,764, `trend` 2, `graph_crawler` 1.

## 2026-05-03

Active focus:

- 2026-05-03 manual daily automation run completed on local dev server `http://localhost:3000`:
  - `refresh-seeds` completed: 200 seed channels refreshed, 2,918 new videos, 63 quota units.
  - `grow-discover` completed in about 219 seconds:
    - `velocity-tracker` added 20 candidates.
    - `extraction` added 27 candidates.
    - `trend` added 10 candidates.
    - `graph-crawler` added 5 candidates.
    - `ai:vertical-strategist` added 171 candidates with `qwen3.6-plus`.
    - `variation`, `pattern-miner`, and `ai:pattern-slot-filler` added 0 candidates.
  - `channel-quality` and `uploads-deep-scan` again returned generic `Job failed` inside `grow-discover`; main automation still completed.
  - `auto-search` processed 78 keywords, discovered 3,203 channels, used 8,656 units, and stopped on `quota_guard`.
  - `keyword-discovery` added 30 extraction candidates and 9 trend candidates; variation added 0.
  - `grow-tune` completed with no promotions, demotions, or disables.
  - Post-run `/api/quota` read returned `used: 1`, `remaining: 9999`, `guardAt: 9000`, which does not match the `auto-search` reported units. Quota read uses `todayKey()` from UTC ISO date; investigate quota logging/date/source if this matters for monitoring.

## 2026-05-01

Active focus:

- The project was pushed to the private GitHub repo `https://github.com/omersahinf/nichefinder`.
- The user plans to update the visual design with Claude Design.
- Local worktree currently contains an in-progress UI redesign/refactor:
  - Modified: `app/globals.css`, `app/layout.tsx`, `app/search-page-client.tsx`, `lib/saturation.ts`
  - Added component files under `app/components/`: `FilterSidebar.tsx`, `NavBar.tsx`, `NicheOverview.tsx`, `ResultsTable.tsx`, `ui.tsx`
- Agent context refactor is in progress:
  - `PROJECT.md` is now a short human-facing summary.
  - Long growth/roadmap strategy moved to `docs/growth-strategy.md`.
  - Layered memory pointers are present in both `AGENTS.md` and `CLAUDE.md`.
- `excalidraw.log` is untracked and intentionally should not be committed unless explicitly needed.
- AI growth model was switched from `qwen3-max-2026-01-23` to `qwen3.6-plus` in local config and default AI client fallback.
  - A tiny OpenAI-compatible chat completion test succeeded with `model: qwen3.6-plus`.
  - The response included separate thinking output; app parsing reads `message.content`, so this should not break JSON extraction, but completion token usage can increase.
  - Local `AI_DAILY_USD_CAP` was raised to `100` for the remaining Alibaba plan window so AI growth jobs are not blocked by the old low cap.
- Search result depth was raised from 50 to 200 requested videos by paging YouTube `search.list` with `nextPageToken`; UI now labels the count as shown results instead of a total corpus count.

Operational notes:

- Local dev server has been used at `http://localhost:3000`.
- Daily automation has been manually run through cron endpoints when requested.
- 2026-05-01 manual daily automation run completed on local dev server `http://localhost:3001`:
  - `refresh-seeds` completed: 200 seed channels refreshed, 2,936 new videos, 63 quota units.
  - `grow-discover` completed in about 154 seconds: velocity added 20 candidates, trend added 15, graph crawler added 2, AI vertical strategist added 177.
  - `channel-quality` and `uploads-deep-scan` again returned generic `Job failed` inside `grow-discover`; main automation still completed.
  - `auto-search` processed 85 keywords, discovered 3,577 channels, used 8,670 units, and stopped on `quota_guard`.
  - `keyword-discovery` added 3 trend candidates.
  - `grow-tune` completed with no promotions, demotions, or disables.
  - Post-run quota read: 8,736 used, 1,264 remaining, guard at 9,000.
- 2026-04-30 manual daily automation run completed:
  - `refresh-seeds` completed.
  - `grow-discover` added 212 candidates; `channel-quality` and `uploads-deep-scan` returned generic `Job failed`.
  - `auto-search` processed 85 keywords, discovered 3,586 channels, used 8,670 units, and stopped on `quota_guard`.
  - `keyword-discovery` added 10 trend candidates.
  - `grow-tune` completed with no promotions, demotions, or disables.
- Recent recurring issue: `channel-quality` and `uploads-deep-scan` jobs returned generic failures inside `grow-discover`; main automation still completed.

Context migration note:

- Previous `CLAUDE.md` only contained `@AGENTS.md`; there was no prior dynamic content to redistribute.
