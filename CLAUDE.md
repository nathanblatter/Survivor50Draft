# CI/CD

- **Org:** github.com/nathanblatter
- **Runner:** Native macOS GitHub Actions runner on Mac Mini (launchd service at ~/actions-runner)
- **Deploy trigger:** Push to `master` branch
- **Deploy workflow:** `.github/workflows/deploy.yml` — pulls latest code in `/Users/nathanblatter/Desktop/survivor50draft`, rebuilds Docker containers, and restarts
- **Secrets:** `.env` file on host (gitignored) — contains ADMIN_PASSWORD, JWT_SECRET, ANTHROPIC_API_KEY, CLOUDFLARE_TUNNEL_TOKEN
- **Infrastructure:** Docker Compose (app + Cloudflare tunnel + seed runner), shared Postgres from docker-services
