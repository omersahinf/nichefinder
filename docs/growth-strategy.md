# Growth Strategy

This file preserves the long-form strategy that used to live in `PROJECT.md`. Read it only when working on acquisition, automation, quota planning, growth loops, or roadmap strategy.

## Vision

NicheFinder combines TubeLab-style niche discovery with ViewStats-style outlier analysis. The first use case is personal research; the later goal is a public paid product.

Differentiation: niche discovery, outlier explanations, saturation analysis, and RPM/revenue context in one interface.

## Competitor Context

| Feature | TubeLab | ViewStats Pro | NicheFinder |
|---|---|---|---|
| Niche discovery | 400K+ channel focus | Analysis-focused | Target feature |
| Outlier detection | Large video database | Strong outlier explanations | Core feature |
| RPM / monetization | Available | Limited | Core context |
| Thumbnail analysis | Limited | Stronger A/B archive | Planned |
| Alerts | Limited | Available | Planned / partial |
| AI idea generation | Available | Available | Planned / partial |
| Chrome extension | Available | Available | Planned / partial |

## Data Strategy

YouTube Data API free quota is 10K units/day.

- `videos.list` / `channels.list`: 1 unit per 50 ID batch.
- `search.list`: 100 units and should be used carefully.
- YouTube RSS feeds cost 0 API quota and are the preferred cheap discovery source.
- Cache aggressively in Postgres to avoid duplicate fetches.
- Use official API + RSS + cache + batch calls + quota increase path.

Avoid:

- Rotating multiple Gmail/API accounts for the same product.
- Calling `search.list` unnecessarily.
- Scraping YouTube HTML pages for data.

## Data Model Sketch

```text
channels
  youtube_id, title, description, subs, total_views, video_count,
  country, created_at, category, fetched_at, avg_views_last_30, is_monetized

videos
  youtube_id, channel_id, title, views, likes, duration,
  published_at, thumbnail_url, tags, outlier_score, fetched_at

searches
  id, user_id, keyword, filters_json, created_at

seed_channels
  channel_id, added_via, priority
```

## Phase 1: Seed + RSS Discovery

Goal: discover new videos daily without spending search quota.

- Collect faceless/niche-focused seed channels.
- For every seed, read YouTube RSS feed: `videos.xml?channel_id=...`.
- Enrich new video IDs through batched `videos.list`.
- Run nightly cron across seeds.
- Expected cost: low API units because RSS is free and video stats are batched.

## Phase 1.5: Auto-search Worker

Goal: automate new channel discovery without manual searches.

- `seed_keywords` stores evergreen and discovered keywords.
- Cron searches the oldest/highest-priority runnable keywords first.
- Each search costs roughly 102 units.
- Daily budget targets roughly 85-88 keywords, stopping via quota guard.
- Store discovered channels and update keyword yield metrics.
- Admin UI manages keyword enable/disable/priority.

## Phase 1.6: Self-evolving Keyword System

Goal: let the keyword set grow and prune itself.

Discovery sources:

- Tag/title extraction from recent videos.
- Template-based variation generation.
- Trend discovery from Google Trends RSS and YouTube trending.
- AI generation from top-performing keyword gaps.

Performance tuning:

- Track `yield = total_channels_added / total_runs`.
- Promote high-yield keywords.
- Demote overlapping or low-yield keywords.
- Disable expired trends and repeated no-yield keywords.

## Phase 1.7: Parallel Growth Orchestrator

Goal: run discovery loops in parallel.

Schedule target:

```text
03:00 UTC  refresh-seeds
04:00 UTC  grow-discover
           - pattern-miner
           - velocity-tracker
           - keyword-extraction
           - keyword-variation
           - keyword-trends
           - graph-crawler
           - ai:vertical-strategist
           - ai:pattern-slot-filler
05:00 UTC  auto-search
06:00 UTC  grow-tune
```

AI configuration:

- Provider-agnostic OpenAI-compatible base URL.
- Current model decision: `qwen3.6-plus`.
- Switch providers through `AI_BASE_URL`, `AI_MODEL`, and `AI_API_KEY`.
- Track AI costs in `ai_costs`.
- Use a daily budget cap so bugs or loops do not create surprise spend.

Growth tables:

- `title_patterns`
- `title_pattern_examples`
- `format_alerts`
- `ai_costs`

## Phase 2: Graph Crawling

Goal: expand the channel pool organically.

- Parse channel mentions from video descriptions.
- Collect featured/related channels when available.
- Add discovered channels to seeds with lower priority.
- Use cache and batch calls to avoid waste.

## Phase 3: Uploads Playlist Deepening

Goal: pull channel history more cheaply than repeated search.

- YouTube channel uploads playlists start with `UU`.
- `playlistItems.list` costs 1 unit per 50 videos.
- Fetching 500 videos from a channel costs roughly 10 units.
- Use this to deepen channel history and improve trend calculations.

## Phase 4: Quota Increase

Goal: scale beyond the free daily quota when the product has proof.

- Apply through Google Cloud Console -> YouTube Data API -> Quotas.
- Prepare product description and usage case.
- Apply once the dataset and product usage show serious traction.

## Roadmap Themes

- RPM and revenue estimates.
- Monetization signals.
- Similar channels and graph discovery.
- Trend score and velocity clusters.
- Alerts.
- Auth and billing.
- AI title and idea generation.
- Thumbnail pattern analysis.
- Chrome extension.
- Public landing/SEO.
- Saved searches and collections.
