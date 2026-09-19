# Survivor Fantasy Draft (survivor.nathanblatter.com)

VISION: the one place Nathan's leagues live — draft the cast, score every episode in minutes, and keep the legacy of every season forever.

## Stack
- `backend/` Express + TypeScript + pg (shared Postgres `survivor50` db). `npm run typecheck`, `npm run build`, `npm run seed -- survivor-51`.
- `frontend/` Vite + React 19 + TypeScript. `npm run typecheck`, `npm run build` (build runs tsc first — the gate).
- Node 20 via nvm: `export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"`.
- Local dev: `npm run dev` at repo root (backend :3001, frontend :5173 proxying /api). `backend/.env` points at localhost:5432.

## Data model (season-scoped scoring, league-scoped teams)
shows → seasons → leagues → teams → team_players. players/tribes/scoring_events/game state hang off the **season**; teams/draft hang off the **league**, so many leagues can share one season's scoring. Scoring rules are per show. Every API route is scoped (`/api/seasons/:id/...`, `/api/leagues/:id/...`); there are no "first season" fallbacks.

Adding a season: `backend/src/seasons/<slug>.ts` + `npm run seed -- <slug>` (non-destructive, safe on prod), or Admin → Seasons.

## Admin
`/admin` (password in `.env` ADMIN_PASSWORD). Context bar picks season / league / episode once; **Log Episode** builds a whole episode and submits it in one transaction (`POST /api/seasons/:id/scoring/events` with `events[]`). "Draft from recaps" calls `POST .../scoring/extract` (Claude Opus 5 reads article URLs/text and proposes events; nothing is written until the admin accepts).

## CI/CD
- Push to `master` → `.github/workflows/deploy.yml` on the Mac Mini self-hosted runner pulls this checkout (`~/dev/Survivor50Draft`), rebuilds the Docker image (tsc gates inside the build), zero-downtime swaps the `app` container. Cloudflare tunnel fronts it.
- Secrets in `.env` on host (gitignored): ADMIN_PASSWORD, JWT_SECRET, ANTHROPIC_API_KEY, CLOUDFLARE_TUNNEL_TOKEN, KPI_API_KEY, FLIGHTDECK_*.
- Deploy only via the pipeline; manual container pokes are for diagnosis only.
