# Ideas Backlog

## 2026-05-19

- Evaluate Ollama Cloud as a replacement/free-tier AI provider for growth keyword generation:
  - Smoke test `gpt-oss:20b`, `gemma4:31b`, and `qwen3.5`/`qwen3-next` options for JSON keyword output quality, free-tier usage, and rate-limit reliability.
  - Prefer a low-usage default for daily automation, with a stronger fallback only if the free plan allows it.

## 2026-04-30

- Build a dedicated “Video Similarity / Saturation” workflow for pasted YouTube URLs:
  - Show target video.
  - Show similar exact videos, broader related videos, competitor channels, small-channel winners, detected tags/keywords, RPM estimate, and recommendation.
  - Example niche: AGI / AI takeover / future scenarios / AI safety / superintelligence.

- Improve the main NicheFinder dashboard design with a dense professional research-tool layout:
  - Command-style search input for niche keyword or YouTube URL.
  - Niche overview metrics.
  - AI insight/recommendation panel.
  - Results table.
  - Similar channels and similar videos panels.

- Investigate and fix recurring `grow-discover` sub-job failures:
  - `channel-quality`
  - `uploads-deep-scan`

- Consider adding an explicit automation runbook for other agents:
  - Required env variables.
  - Local server command.
  - Manual cron endpoint order.
  - Expected quota guard behavior.

- Roadmap themes preserved from the old long `PROJECT.md`:
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
