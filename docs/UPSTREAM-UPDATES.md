# Updating docmost-lite from upstream Docmost

docmost-lite is a long-lived fork of [Docmost](https://github.com/docmost/docmost).
It was cut from **v0.97.0** (upstream commit `6d117f8c`, "link self-hosting setup guide
from integrations settings (#2608)"). This file explains what the fork changed, so a
future upstream update can be merged without breaking it. Read it before merging.

## 1. One-time setup

```bash
git remote add upstream https://github.com/docmost/docmost.git   # origin is the fork itself
git config rerere.enabled true      # git remembers conflict resolutions between updates
```

Branches: `lite` is the working fork. `main` still holds the untouched v0.97.0 code and
is used as the clean mirror of upstream.

## 2. The update routine

```bash
git fetch upstream --tags
git checkout main && git merge --ff-only upstream/main      # main = pure upstream
git checkout lite && git checkout -b update-vX.Y.Z
git merge main                                               # merge, do not rebase
# resolve conflicts using section 4, then run the checklist in section 5
git checkout lite && git merge --no-ff update-vX.Y.Z && git tag lite-vX.Y.Z
```

Use **merge, not rebase**: the fork is long-lived and rebasing would rewrite published
history and make `rerere` less useful. Update one upstream release at a time if several
were skipped; the conflicts are far easier to reason about.

Read the upstream release notes first and look for: **security fixes** (apply even if
the code is in a file the fork deleted, if the same flaw can exist in our replacement),
**database migrations**, new **environment variables**, and changes to files in
section 4.

## 3. What the fork is (the idea in one paragraph)

Single-user, single-process Docmost that needs only Node and PostgreSQL. Everything that
needed Redis, a mail service, or an external search/AI/billing service was removed or
replaced by an in-process equivalent; Enterprise code is not enabled. On top of that the
fork adds MCP, a Diagrams section, and diagram library packs. (An in-app AI Assistant was
built and then removed on purpose: use the MCP endpoint from an external AI tool instead.)
Do not undo these choices while merging: **no Redis, no email, no extra container**.

### Removed or replaced (upstream changes to these are normally ignored)

| Area | Upstream | In the fork |
|---|---|---|
| Redis cache / throttler storage / socket.io adapter | Redis | in-memory (`CacheModule`, default throttler) |
| Collab multi-server sync | `collaboration/extensions/redis-sync`, separate collab server | removed; Hocuspocus runs inside the main process (`collaboration.gateway.ts`) |
| Job queues | BullMQ (`@nestjs/bullmq`, 16 queues) | `integrations/queue/local-queue.ts` (in-process, same `add()` API; pending delayed jobs are lost on restart) |
| Notification / history / import / attachment processors | BullMQ `WorkerHost` classes | plain providers that call `queue.process()` in `onModuleInit` |
| Email | `integrations/mail`, `integrations/transactional` (react-email) | removed; no invites, no forgot-password |
| Member invitations | `workspace-invitation.service`, invite endpoints, invite sign-up UI | removed |
| External integrations (GitHub, Figma, Linear, OAuth) | `core/integration` | removed |
| Search / AI / billing queues and listeners | `database/listeners`, Typesense, AI queue | removed (search is PostgreSQL only) |
| Storage | local, S3, Azure | local only (`storage.provider.ts`) |
| Telemetry | `integrations/telemetry` | removed |
| Page verification notifications | `verification.notification.ts` | removed |
| Settings menu | many Enterprise pages | trimmed to community pages (`settings-sidebar.tsx`) |
| Dependencies | ~40 unused (AI SDKs, AWS, Azure, Stripe, LDAP, SAML, Typesense, ioredis, bullmq, nodemailer, postmark, react-email, ...) | removed from `apps/server/package.json` |

`apps/server/src/ee`, `apps/client/src/ee` and `packages/ee` stay under upstream's
Enterprise licence. The server `ee` folder is empty in this repo; keep it that way.
The client `ee` folder is still present (the UI imports it) but its features are off.

### Added by the fork (no upstream equivalent; upstream will not conflict, but check it still compiles against new upstream APIs)

- `apps/server/src/mcp/` — MCP endpoint (`POST /mcp`), scoped tokens, tools, diagram tools,
  `internal-api.ts` (calls the app's own REST API in-process).
- `apps/server/src/diagrams/` — diagram library packs.
- `apps/server/src/core/auth/services/owner-seeder.service.ts` — creates the owner from `OWNER_*`.
- `apps/server/scripts/reset-password.js`.
- Migrations `20261030T120000-mcp-tokens`, `20261030T130000-diagram-libraries`
  (see the migration warning below).
- Client: `features/diagrams`, `features/mcp`, `pages/diagrams`,
  `pages/settings/{mcp,diagram-libraries}`.
- New dependencies: server `@modelcontextprotocol/server`; client `@excalidraw/mermaid-to-excalidraw`.

## 4. Conflict hotspots (upstream files the fork edited)

Resolve a conflict by keeping the fork's intent and taking upstream's unrelated changes.

**Modified upstream files** (79 at the time of writing; list them with
`git diff --name-only <base>..lite --diff-filter=M`):

| Files | What the fork did | When upstream touches it |
|---|---|---|
| `apps/server/src/app.module.ts` | removed Redis/Mail/Telemetry/EE loader modules, added `McpModule`, `DiagramsModule`, `AiModule`, `NoopAuditModule` always | keep our module list; add any genuinely new upstream module |
| `apps/server/src/main.ts` | removed the Redis socket adapter | keep it removed |
| `integrations/environment/environment.service.ts`, `environment.validation.ts` | removed Redis/mail/AI/stripe/etc getters; added `getMcpTokens`, `getAiConfig`, `getOwnerSeed`; blank values count as unset (`FILE_UPLOAD_SIZE_LIMIT`) | merge new upstream getters; keep ours |
| `integrations/static/static.module.ts` | removed billing/posthog/AI keys from `window.CONFIG` | keep removed |
| `core/page/services/page.service.ts`, `comment.service.ts`, `space.service.ts`, `attachment.service.ts`, `trash-cleanup.service.ts`, `workspace.service.ts` | `InjectQueue`/`Queue` now come from `integrations/queue/local-queue`; AI/billing/search queue calls removed | if upstream adds a queue job, use `local-queue` and register the handler |
| `collaboration/**` (gateway, authentication, persistence, history) | no Redis; access re-checks are in-process (`CollabAccessService.onRecheck`) | highest-risk area: re-test real-time editing |
| `core/notification/**` | email code removed, in-app notifications kept | keep email removed |
| `core/auth/**`, `workspace.controller.ts` | forgot/reset password and invitations removed | keep removed |
| `integrations/import/**` | queue replaced by `local-queue`; DOCX/PDF/Confluence EE paths removed | keep |
| `package.json` (root, server, client), `pnpm-workspace.yaml`, `Dockerfile`, `docker-compose.yml`, `.env.example` | deps removed/added; compose has only `docmost` + `db`; no `patches` dir | see below |
| `apps/client/src/App.tsx`, `global-app-shell.tsx`, `global-sidebar.tsx`, `settings-sidebar.tsx` | routes/menus for Diagrams, MCP, libraries; Enterprise entries removed | keep our routes, merge new upstream routes |
| `apps/client/src/lib/config.ts` | `getConfigValue` treats `""` as unset | keep (otherwise blank `.env` values disable uploads) |
| `packages/editor-ext` | untouched, **Draw.io is kept** | take upstream |

**Files the fork deleted:** if upstream *modifies* one, git reports a modify/delete
conflict. Keep it deleted, but read the upstream diff: a bug or security fix there may
need a counterpart in our replacement (for example the queue, mail-less auth flow, or
`collab` access code).

**`pnpm-lock.yaml`:** never merge by hand. Take ours (`git checkout --ours pnpm-lock.yaml`),
fix `package.json` conflicts first (keep our removals, accept upstream version bumps of
packages we still use), then run `pnpm install` to regenerate it. If upstream adds a
`patchedDependencies` entry for a package we removed, drop that entry (a stale entry
breaks `pnpm add` and the Docker build).

## 5. After merging: checklist

1. `grep -rnE "bullmq|ioredis|nestjs-ioredis|nodemailer|postmark|react-email|typesense|@aws-sdk|stripe" apps/server/src apps/server/package.json`
   must show nothing the fork removed. If upstream reintroduced one, port that code
   to the in-process replacement instead of re-adding the dependency.
2. `pnpm install` then `pnpm editor-ext:build` (client and server type-checks need the built package).
3. `npx tsc --noEmit -p apps/server/tsconfig.json` and the same for `apps/client`.
4. `pnpm build`.
5. `cd apps/server && npx jest`. Known baseline: 15 suites fail because they are
   untouched Nest "should be defined" scaffolds without their providers; ~490 tests pass.
   More failures than that are real.
6. Start against an **empty** PostgreSQL with `NODE_ENV=production` (migrations run
   automatically only in production mode) and check: login, create/edit a page and
   reload, two browsers editing the same page, page history snapshot (appears after
   about a minute), import a ZIP, Markdown export, search, share link, comments.
7. Fork features: `POST /mcp` tool list, a Mermaid / Excalidraw / Draw.io diagram.
8. Restart the app after every `pnpm build`: the server writes `window.CONFIG` into
   `client/dist/index.html` at start-up, so a rebuilt client without a restart is a blank page.

### Migration warning

Kysely refuses to run when a migration file sorts *before* one that already ran. Our
migrations are dated `20261030T…`. If upstream later ships a migration with a
**smaller** timestamp than `20261030T140000`, existing databases will fail to start.
Fixes, in order of preference: rename the fork's two migrations to a timestamp later
than every upstream one (only safe for databases that have not run them, so also update
the `kysely_migration` table rows), or pass `allowUnorderedMigrations: true` to the
`Migrator` in `database/services/migration.service.ts` and `database/migrate.ts`.
Check this every time upstream adds a migration.

## 6. Traps learned the hard way

- A blank `FILE_UPLOAD_SIZE_LIMIT=` in `.env` used to disable image/file upload; blank
  values must stay "unset" (server getters use `||`, client `getConfigValue` too).
- `ConfigModule` reads the `.env` **file** too, so clearing an env var in the shell does
  not hide a value that is in the file; run tests from a directory with a different `.env`.
- Draw.io in headless browsers: `embed.diagrams.net` returns 403 for a headless user agent.
- Excalidraw SVG payloads are base64 of a *latin1* byte string, not UTF-8.
- The jsonb columns written through postgres.js need an object wrapper
  (`{ items }`, `{ models }`); a bare array becomes a PostgreSQL array, and
  `JSON.stringify` double-encodes.

## 7. Asking Claude Code to do the update

> Update docmost-lite to upstream Docmost vX.Y.Z. Follow `docs/UPSTREAM-UPDATES.md`:
> add the `upstream` remote, merge on a new branch, resolve conflicts keeping Redis,
> email and invitations removed, run the full checklist (including a boot against an
> empty database and a browser pass over the fork features), and report the migrations,
> new env variables and security fixes in the upstream release before merging into `lite`.
