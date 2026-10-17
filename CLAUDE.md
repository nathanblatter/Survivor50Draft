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
`/admin` signs in through **Squawk** (Nathan's auth service, https://squawk.nathanblatter.com) with the **owner passkey** — there is no app password, no admin user table, and intentionally no password fallback (Squawk recovery codes are the break-glass). Flow (`backend/src/routes/auth.ts` + `backend/src/lib/squawk.ts`, page `frontend/src/pages/LoginPage.tsx`): `GET /api/auth/start` stashes a PKCE verifier by `state` (in-memory, 5 min) and 302s to Squawk `/oauth/authorize` (`scope=admin`, `resource=SQUAWK_RESOURCE`); Squawk sends the browser to `/login?login_challenge=…`, where "Sign in as owner" runs the passkey ceremony via the proxies `POST /api/auth/owner/begin|finish` (service token); Squawk then redirects to `GET /api/auth/callback?code&state`, which exchanges the code at `/oauth/token`, verifies the ES256 token against Squawk's JWKS (`iss == SQUAWK_ISSUER`, `aud == SQUAWK_SERVICE_ID`, `sub == "owner"` only) and mints the app's existing 7-day JWT (`{admin:true}`, `JWT_SECRET`), handed to the SPA as `/login#token=…` (fragment, never query string); the SPA stores it in localStorage as before and `GET /api/auth/verify` + `authMiddleware` are unchanged. Env: `SQUAWK_ISSUER`, `SQUAWK_SERVICE_ID`, `SQUAWK_CREDENTIAL`, `SQUAWK_CLIENT_ID` (public PKCE client, redirect_uri `https://survivor.nathanblatter.com/api/auth/callback`), `SQUAWK_RESOURCE`, `SQUAWK_SITE_URL`, plus `JWT_SECRET`. Empty `SQUAWK_ISSUER` → `/api/auth/config` reports `enabled:false` and the other auth routes 404. Squawk-side setup lives in the Squawk console (service "survivor", login_url `/login`, scope `admin`, invite-only). The orphan `user_sessions` table (never written) was dropped 2026-10-16 via `DROP TABLE IF EXISTS` in `initDB`.

Context bar picks season / league / episode once; **Log Episode** builds a whole episode and submits it in one transaction (`POST /api/seasons/:id/scoring/events` with `events[]`). "Pre-fill" calls `POST .../scoring/extract` `{episode, urls?, text?, wikipedia?=true}`: `backend/src/lib/wikipedia.ts` fetches the "<Show> <N>" Wikipedia page (API, redirects followed) and parses the season-summary + voting-history tables deterministically (votes, tribe/individual wins, journeys, Shot in the Dark, fire, jury); `wikipediaProposals.ts` turns them into proposals. Recap URLs/text go to Claude Opus 5 for the narrative-only events (idols, food, alliances), grounded on the Wikipedia facts. Nothing is written until the admin accepts. Narrative recaps alone miss votes (ep 2 of S51 was logged 6-0 instead of 6-4 that way) — always keep Wikipedia on.

## CI/CD
- Push to `master` → `.github/workflows/deploy.yml` on the Mac Mini self-hosted runner pulls this checkout (`~/dev/Survivor50Draft`), rebuilds the Docker image (tsc gates inside the build), zero-downtime swaps the `app` container. Cloudflare tunnel fronts it.
- Secrets in `.env` on host (gitignored, loaded via compose `env_file`): JWT_SECRET, SQUAWK_* (see Admin), ANTHROPIC_API_KEY, CLOUDFLARE_TUNNEL_TOKEN, KPI_API_KEY, FLIGHTDECK_*.
- Deploy only via the pipeline; manual container pokes are for diagnosis only.
