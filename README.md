# NicheFinder

NicheFinder is a Next.js app for YouTube niche discovery, outlier analysis, trend tracking, RPM/revenue estimates, seed-channel refresh, and alerting.

## Stack

- Next.js 16 App Router
- React 19
- Tailwind CSS 4
- Supabase Postgres
- YouTube Data API v3 and YouTube channel RSS
- Recharts
- Resend for alert emails

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment example and fill in credentials:

```bash
cp .env.local.example .env.local
```

Required values:

- `YOUTUBE_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `RESEND_API_KEY` and `RESEND_FROM` for email alerts

3. Apply Supabase migrations from `supabase/migrations` in order.

4. Run the app:

```bash
npm run dev
```

Open `http://localhost:3000`. If the port is busy, Next.js will print the alternate local URL.

## Verification

```bash
npm run lint
npm run build
```

Cron smoke:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/refresh-seeds
```

## Notes

- Cached searches use Supabase and can be bypassed with `force=1`.
- Seed refresh uses RSS for discovery and batched YouTube API calls for stats.
- Similar-channel and alert features require migrations `005_channel_tags.sql` and `006_alerts.sql` to be applied to the active Supabase project.
