<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project Memory

Use the layered project memory files to preserve token cache and avoid reading unrelated context:

- `CLAUDE.md` — static Claude context, project rules, architecture notes, and maintenance protocol.
- `docs/current-state.md` — active work, current status, and where the project last left off.
- `docs/ideas-backlog.md` — dated idea backlog; append new ideas here automatically.
- `docs/decisions.md` — confirmed decisions and short rationale.
- `docs/growth-strategy.md` — long-form growth, quota, automation, and roadmap strategy.
- `PROJECT.md` — short human-facing product summary.

Read only the relevant file for the task. Do not update `CLAUDE.md` unless project rules, format, or architecture change.
