> Agent calisma baglami icin `CLAUDE.md` kullanilir.
> Guncel durum, fikirler ve kararlar `docs/` altindadir.

# NicheFinder

NicheFinder is a YouTube niche discovery and outlier analysis tool for creators, operators, and channel researchers. It helps answer:

- Is this niche worth entering?
- Is saturation low, medium, or high?
- Are small channels getting meaningful views?
- Which videos are outperforming their channel baseline?
- Which channels and videos are similar?
- What is the likely RPM and revenue potential?
- What keywords, formats, or titles should be tested next?

## Core Experience

- Search by niche keyword or YouTube video URL.
- Inspect video results with views, subscribers, duration, outlier score, category, and estimated revenue.
- Review saturation, small-channel winners, similar channels, and similar videos.
- Generate AI niche insights, title ideas, and video ideas from proven patterns.
- Save searches, configure alerts, and expose selected data through API endpoints.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS
- Supabase Postgres
- YouTube Data API v3 + YouTube RSS feeds
- Provider-agnostic AI growth loop via OpenAI-compatible API settings
- Vercel cron / local cron endpoints for automation

## Key Docs

- Agent context: `CLAUDE.md`
- Active state: `docs/current-state.md`
- Ideas: `docs/ideas-backlog.md`
- Decisions: `docs/decisions.md`
- Growth strategy: `docs/growth-strategy.md`
