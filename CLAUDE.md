@AGENTS.md

# NicheFinder Static Context

NicheFinder is a Next.js app for YouTube niche discovery, outlier analysis, saturation research, revenue estimates, seed-channel refresh, and automation-backed growth discovery.

## Static Working Rules

- Treat `CLAUDE.md` as high-cost static context. Keep it stable and short for token cache preservation.
- Read `AGENTS.md` before coding and follow the local Next.js warning there.
- Prefer existing project patterns and helpers over new abstractions.
- Protect secrets. Never commit `.env.local` or real API keys.
- Keep product UI dense, professional, and research-oriented; the primary experience is the working app, not a marketing page.
- For automation work, prefer the existing cron endpoints and `scripts/local-growth-cron.sh`.
- For YouTube/Supabase data checks, verify against the database before making claims.

## Static Architecture Notes

- Frontend/backend: Next.js App Router with TypeScript.
- Data store: Supabase Postgres.
- Data sources: YouTube Data API v3 and YouTube RSS feeds.
- Growth system: seed refresh, keyword discovery, growth discovery, auto-search, and tuning cron endpoints.
- AI growth loop: OpenAI-compatible provider configuration via `AI_BASE_URL`, `AI_MODEL`, and `AI_API_KEY`.
- Revenue estimates are category-based approximations, not verified YouTube Analytics RPM.

## Maintenance Protocol

1. When a new idea or suggestion is discussed:
   - Append it to `docs/ideas-backlog.md` under a dated `## YYYY-MM-DD` heading.
   - Do not ask the user first; save it automatically.

2. When the user says “tamam, ekleyelim / yapalım / bunu seçelim” or otherwise confirms a direction:
   - Move the relevant item from `docs/ideas-backlog.md` to `docs/decisions.md`.
   - Add a short rationale.

3. After a decision is made, ask only if it changes a rule, format, or architecture:
   - “Bu bir kural / format / mimari değişikliği mi? Eğer öyleyse CLAUDE.md'ye ekleyelim mi?”
   - Update `CLAUDE.md` only if the user says yes.
   - If it is a content/product decision, do not ask to update `CLAUDE.md`; `docs/decisions.md` is enough.

`CLAUDE.md` changes are expensive because they invalidate cache. Only update this file when how the project works changes. If what the project does changes, keep it in `docs/decisions.md`.

---
> Aktif çalışma durumu: docs/current-state.md
> Fikir havuzu: docs/ideas-backlog.md
> Kesinleşmiş kararlar: docs/decisions.md
Bu dosyalar sadece ilgili konuda gerekirse okunur.
