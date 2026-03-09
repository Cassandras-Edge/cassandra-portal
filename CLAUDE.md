# CLAUDE.md — Cassandra Portal

## What This Is

CF Worker that serves the Cassandra dashboard UI (Workbench). Manages:
- **Projects** — organizational boundaries for grouping service configs (personal + shared, with membership)
- **MCP keys** — project-scoped API keys for MCP services, stored in both D1 (metadata) and KV (runtime auth)
- **Service credentials** — per-project credentials (e.g. Pushover), encrypted in D1, synced to KV
- **Runner keys** — tenant API keys proxied to the orchestrator (separate from projects)

Protected by CF Access (Google OAuth). User identity from `Cf-Access-Authenticated-User-Email` header or CF_Authorization JWT.

## Repo Structure

```
cassandra-portal/
├── src/
│   ├── index.ts          # Hono router, static asset serving, entrypoint
│   ├── auth.ts           # Shared getUserEmail() from CF Access
│   ├── db.ts             # D1 helpers, AES-GCM encryption, project queries
│   ├── mcp-keys.ts       # Legacy MCP key CRUD + MCP_SERVICES registry
│   ├── projects.ts       # Project + member CRUD
│   ├── credentials.ts    # Service credential CRUD + project-scoped key CRUD + KV sync
│   ├── runner-proxy.ts   # Runner tenant proxy to orchestrator admin API
│   ├── migrations/       # D1 SQL migrations
│   └── __tests__/
├── frontend/             # Vite + Tailwind v4 + vanilla TS
│   ├── index.html
│   ├── src/
│   │   ├── main.ts       # SPA router
│   │   ├── style.css     # @import "tailwindcss" + @theme
│   │   ├── api.ts        # Fetch wrappers for all API routes
│   │   ├── pages/        # dashboard, workbench, runner-keys
│   │   └── components/   # modal, ui primitives
│   ├── vite.config.ts
│   └── package.json
├── infra/modules/portal-edge/
├── wrangler.jsonc.example
├── package.json
└── tsconfig.json
```

## Deploy

Worker auto-deploys on push to main via GitHub Actions (`deploy.yml`). Frontend is built with Vite, then served via Workers Static Assets. D1 migrations run before deploy.

### Infra (one-time, from cassandra-infra)

D1 database is provisioned by Terraform alongside KV, DNS, and CF Access:

```bash
cd cassandra-infra/environments/production/portal
source ../../.env
tofu init -backend-config=production.s3.tfbackend
tofu apply
# Outputs: mcp_keys_kv_namespace_id, portal_db_id
```

After `tofu apply`, set the new D1 database ID as a GitHub Actions secret (`D1_DATABASE_ID`) on the repo.

### Wrangler secrets (one-time, then on rotation)

```bash
cd cassandra-portal
# Generate a CREDENTIALS_KEY: openssl rand -base64 32
wrangler secret put CREDENTIALS_KEY
```

### Manual deploy (if needed)

```bash
npm install
cd frontend && npm install && npm run build && cd ..
npx wrangler d1 execute cassandra-portal --remote --file=src/migrations/001_initial.sql
npx wrangler deploy
```

## Secrets (via wrangler secret put)

- `RUNNER_URL` — Runner orchestrator URL
- `RUNNER_ADMIN_KEY` — Admin API key for runner /tenants routes
- `DOMAIN` — Root domain for link generation
- `CREDENTIALS_KEY` — AES-256 key for encrypting service credentials in D1
- `VM_PUSH_URL` — VictoriaMetrics push endpoint for Worker metrics
- `VM_PUSH_CLIENT_ID` — CF Access service token client ID
- `VM_PUSH_CLIENT_SECRET` — CF Access service token client secret

## Bindings

- `MCP_KEYS` — Shared KV namespace for MCP API keys (runtime auth)
- `PORTAL_DB` — D1 database for projects, members, credentials, key metadata

## Tailwind CSS v4 Rules

This project uses Tailwind CSS v4 with Vite. Follow these rules strictly:

- Use `@import "tailwindcss"` — NOT `@tailwind base/components/utilities`
- Theme config via `@theme` directive in CSS — NO `tailwind.config.js`
- Vite plugin: `@tailwindcss/vite` — NO `autoprefixer` or `postcss-import`
- Use slash notation for opacity: `bg-black/50` — NOT `bg-opacity-*`
- Renamed utilities: `shadow-xs` (was `shadow-sm`), `rounded-xs` (was `rounded-sm`), `outline-hidden` (was `outline-none`)
- Default border color is `currentColor` (was `gray-200`)
- Default ring width is 1px (was 3px)
- CSS variables in arbitrary values: `bg-(--my-var)` — NOT `bg-[--my-var]`
- Custom utilities via `@utility` directive, custom variants via `@variant`
- Buttons do NOT get `cursor-pointer` by default — add explicitly
- Container queries are built-in: `@container`, `@sm:`, `@md:` variants
- Dynamic spacing: every multiple of `--spacing` works (e.g., `mt-21`)
- `@import "tailwindcss"` instead of old `@tailwind` directives
- PostCSS plugin is `@tailwindcss/postcss`, CLI is `@tailwindcss/cli`
- Hover styles only apply on devices that support hover (`@media (hover: hover)`)

## Observability

Pushes metrics to VictoriaMetrics on every request via `cassandra-observability`:
- `mcp_requests_total` — request count by status/path
- `mcp_request_duration_ms_total` — latency
- `mcp_key_operations_total` — key create/delete/set_credentials by service
