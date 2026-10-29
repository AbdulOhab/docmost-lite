# Docmost Lite

A slimmed-down fork of [Docmost](https://github.com/docmost/docmost) (v0.97.0) for
personal, single-server use. It needs only **Node.js and PostgreSQL**: no Redis, no
email service, no external search engine.

## What you get

- Real-time collaborative editing
- Diagrams (Draw.io, Excalidraw, Mermaid)
- Spaces, groups and space-level permissions
- Comments, page history, search (PostgreSQL full-text)
- File attachments on local disk
- Markdown / HTML export and ZIP import
- Share links and public spaces, notifications inside the app

## What was removed (compared to upstream)

| Removed | Replaced with |
|---|---|
| Redis (cache, queues, rate limit, WebSocket adapter, collab sync) | In-process equivalents |
| BullMQ queues | `LocalQueue` (`apps/server/src/integrations/queue/local-queue.ts`) |
| Email (SMTP, Postmark, templates) | Nothing. Invite by copying the invite link |
| Forgot password / invite resend | `scripts/reset-password.js` (see below) |
| Typesense, AI, billing, telemetry | Nothing |
| S3 / Azure storage | Local disk only |
| GitHub / Figma / Linear integrations, OAuth | Nothing |
| Separate collab process | Runs inside the main process |

Enterprise Edition code (`apps/*/src/ee`, `packages/ee`) is **not** enabled and stays
under the Docmost Enterprise license. The rest is AGPL-3.0.

### Trade-offs to know about

- Jobs run inside the server process. A restart loses any job that was still
  waiting (for example a page history snapshot scheduled a few minutes ahead). The
  next edit creates it again.
- Run **one** server instance. In-memory caches and the collab layer are not shared
  between instances.
- There is no email, so nobody can recover a password by themselves. Use the reset
  script below.

## Run with Docker

```bash
git clone <this repo> docmost-lite && cd docmost-lite
# edit docker-compose.yml: APP_SECRET, DB password, OWNER_* values
docker compose up -d --build
```

Open http://localhost:3000 and log in with `OWNER_EMAIL` / `OWNER_PASSWORD`.
Generate a secret with `openssl rand -hex 32`.

Data lives in two volumes: `db_data` (PostgreSQL) and `docmost` (uploaded files).
Back up both.

## Run without Docker

Requirements: a recent Node.js (the Docker image uses Node 26), pnpm 11, PostgreSQL (tested with 16).

```bash
pnpm install
cp .env.example .env     # set APP_SECRET and DATABASE_URL
pnpm build
pnpm start               # http://localhost:3000
```

Migrations run automatically on start.

For development: `pnpm dev` starts the client and the server with reload.

## First owner

Pick one:

1. **Seeder (no browser step).** Set `OWNER_EMAIL` and `OWNER_PASSWORD` (optional:
   `OWNER_NAME`, `OWNER_WORKSPACE_NAME`). On start, if the database has no workspace,
   the server creates the workspace and the owner. If a workspace already exists the
   variables are ignored, so you can leave them set or remove them afterwards.
2. **Setup page.** Leave `OWNER_*` empty and open the app; the setup form appears
   while the database is empty.

## Adding people

Invite emails are not sent. In **Settings → Members → Invitations**, create the
invitation, then use **Copy link** and send the link yourself.

## Reset a password

```bash
DATABASE_URL=postgresql://user:pass@host:5432/docmost \
  node apps/server/scripts/reset-password.js you@example.com 'new-password'
```

The script also signs the user out everywhere. Inside the Docker image the file is at
`/app/apps/server/scripts/reset-password.js`:

```bash
docker compose exec docmost node apps/server/scripts/reset-password.js you@example.com 'new-password'
```

(`DATABASE_URL` is already set inside the container.)

## Configuration

Copy `.env.example`. The settings that matter:

| Variable | Purpose |
|---|---|
| `APP_URL` | Public URL, used for invite links |
| `APP_SECRET` | 32+ random characters; changing it signs everyone out |
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | Default 3000 |
| `OWNER_EMAIL`, `OWNER_PASSWORD` | Optional first-owner seeder |
| `FILE_UPLOAD_SIZE_LIMIT`, `FILE_IMPORT_SIZE_LIMIT` | Upload limits (50mb / 200mb) |
| `DRAWIO_URL` | Custom Draw.io server (optional) |

Put the app behind an HTTPS reverse proxy (Caddy, nginx) if it is reachable from the
internet.

## How this fork was made

Everything was derived from upstream by deletion plus a few small replacements. To
re-apply the same idea on a newer upstream version:

1. Redis: drop `integrations/redis`, `collaboration/extensions/redis-sync`,
   `ws/adapter/ws-redis.adapter.ts`; use the default cache, in-memory throttler
   storage, and run Hocuspocus directly (`collaboration.gateway.ts`).
2. Queues: replace `@nestjs/bullmq` with `local-queue.ts` and turn each `@Processor`
   class into a plain provider that calls `queue.process(...)` in `onModuleInit`.
3. Email: remove `integrations/mail`, `integrations/transactional` and every caller
   (auth, invitations, notifications).
4. Delete search / AI / billing queue producers (`database/listeners`) and the
   unused dependencies.
5. Storage: keep only `local.driver.ts`.
6. Add `OwnerSeederService` (`core/auth/services/owner-seeder.service.ts`) and
   `scripts/reset-password.js`.

Verify with `pnpm build` and by starting the server against an empty database.

## Tests

```bash
cd apps/server && npx jest
```

15 suites fail because they are untouched Nest scaffolds ("should be defined")
without their dependencies; the remaining tests pass.

## License

Docmost core is AGPL-3.0 (see `LICENSE`). Enterprise directories keep the Docmost
Enterprise license in `packages/ee/LICENSE`. If you modify this and let other people
use it over a network, AGPL requires you to offer them the source.
