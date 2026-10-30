# Docmost Lite

A slimmed-down fork of [Docmost](https://github.com/docmost/docmost) (v0.97.0) for
personal, single-server use. It needs only **Node.js and PostgreSQL**: no Redis, no
email service, no external search engine.

## What you get

- Real-time collaborative editing
- A **Diagrams** section: full-page Excalidraw editor with autosave, PNG/SVG export and a gallery
- Diagrams (Excalidraw, Mermaid)
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
| Email (SMTP, Postmark, templates) | Nothing |
| Member invitations and invite sign-up | Nothing. There is one owner account |
| Forgot password | `scripts/reset-password.js` (see below) |
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

## Accounts

This build is for one person: the owner account is created by the seeder or the
setup page. Inviting other members was removed. (The database tables still exist;
only the server endpoints and screens are gone.)

## Assistant (AI chat that can use the app for you)

**Assistant** in the sidebar is a chat where you type what you want and an AI model
does it with the same tools the MCP endpoint offers: search and read pages, create and
edit pages, add comments, create and edit diagrams. It acts as **you** (your
permissions), shows each step it takes, and links to the pages it touched.

It is built on the [Vercel AI SDK](https://ai-sdk.dev) (the same library upstream Docmost's AI uses): replies stream in as they are written, and tool use is the SDK's standard loop. No extra container or service is needed.

Set it up in **Settings → AI Assistant** (owner/admin):

- **Providers:** add any OpenAI-compatible service (presets for Z.ai GLM, OpenAI,
  OpenRouter and Ollama, or your own address). Enter the API address and key, then
  *Fetch model names* (or type them) and *Test connection*. Keys are stored encrypted
  with `APP_SECRET`, never shown again (only the last 4 characters), and a blank key
  field on edit keeps the saved one.
- **Several models:** every enabled provider's models appear in the **model switcher**
  at the top of the Assistant, and each person's choice is remembered in their browser.
- **Behavior:** default model, creativity (temperature), the most tool steps per
  request, and extra instructions that are added to the assistant's built-in rules.

Or set one provider in `.env` (it then shows as read-only "From .env"):

```bash
AI_API_KEY=<your key>
AI_MODEL=<model name from your provider>
AI_MODELS=<more model names, comma separated>   # optional
# AI_BASE_URL defaults to Z.ai's general GLM API: https://api.z.ai/api/paas/v4
```

For GLM use the **general API key** (pay per token). A *GLM Coding Plan* key may only be
used inside Z.ai's supported coding tools, so do not put it here; use it with Claude
Code or OpenCode plus the MCP endpoint below instead.

Things to know:

- It cannot delete anything (the delete tools are not offered to it).
- Connecting is patient (long connect timeout, retries), because some routes to the AI host are slow or lossy.
- It can create and change pages, so check what it reports. It prefers appending over replacing.
- Every request is billed by your AI provider. Each message can trigger several model calls (one per tool step, at most 8).
- The conversation is kept in your browser only (last 40 messages) and the model sees the
  whole chat each time. Page text it reads is sent to the AI provider.
- It uses the normal keyword search, not embeddings, so wording matters for finding pages.

## Diagrams

**Diagrams** in the sidebar has its own navigation like a space: a menu (all diagrams,
new, libraries, trash) and a list of your diagrams. *New diagram* offers three types:

| Type | What you get |
|---|---|
| **Excalidraw** | Full-page Excalidraw editor: every tool, autosave and `Ctrl+S`, PNG/SVG export, undo/redo, light and dark theme |
| **Mermaid** | Code on the left, live preview on the right, autosave, SVG export, and **Convert to Excalidraw** to turn it into editable shapes |
| **Draw.io** | The full diagrams.net editor. It is loaded from `embed.diagrams.net` (needs internet), or from your own server via `DRAWIO_URL` |

A diagram is a normal page holding one diagram block, kept in a space called
*Diagrams* (created the first time you make one). So search, page history, share
links, trash and MCP all work on diagrams. Keep that page for the drawing alone:
saving replaces its content.

**Library packs (Excalidraw "extensions").** Settings → **Diagram libraries** lets an
admin upload `.excalidrawlib` files or install packs from the public
libraries.excalidraw.com catalogue. They are stored on the server, switched on or off
per pack, and appear in everyone's Excalidraw library panel in any browser. Your own
saved shapes stay in your browser.

All three types can also be inserted into any page: `/excalidraw`, `/drawio` and
`/mermaid`.

## MCP (use your pages from an AI assistant)

The server can speak the [Model Context Protocol](https://modelcontextprotocol.io) at
`POST /mcp`, so Claude Code and other MCP clients can search, read, write and (if you
allow it) delete pages. It is off until a token exists.

**Create a token in the app:** Settings → **MCP** → *Create token*, give it a name and
tick the scopes. The token is shown once; only its hash is stored. Revoke it from the
same page. The page also shows the endpoint and the connect command:

```bash
claude mcp add --transport http docmost http://localhost:3000/mcp \
  --header "Authorization: Bearer <your token>"
```

You can also set tokens in `.env` instead (they appear read-only on the MCP page):

```bash
openssl rand -hex 32          # put the result in .env as MCP_TOKEN
MCP_TOKEN=<that value>
MCP_SCOPES=read,write         # add delete only if you want it
```

**Diagrams over MCP.** `create_diagram` and `update_diagram` take Mermaid code, or for
Excalidraw a list of `nodes` and `edges` (positions are worked out for you, with
shapes, colours and labelled arrows), or raw Excalidraw elements. `get_diagram` reads
Mermaid code or an Excalidraw drawing back as shapes and arrows. Deleting a diagram
uses `delete_page`. Draw.io diagrams can be listed but not read or changed.

**Permissions.** Each token carries scopes, and a tool only exists for a token that
has its scope, so a read-only token cannot even see the write tools.

| Scope | Tools |
|---|---|
| `read` | `list_spaces`, `list_pages`, `get_page`, `search_pages`, `recent_pages`, `page_history`, `list_comments`, `list_trash`, `list_diagrams`, `get_diagram` |
| `write` | `create_space`, `create_page`, `update_page` (replace / append / prepend), `move_page`, `duplicate_page`, `restore_page`, `add_comment`, `create_diagram`, `update_diagram` |
| `delete` | `delete_page` (to trash), `delete_page_permanently` (needs `confirm: true`), `delete_comment` |

Make one token per tool or machine with only the scopes it needs, for example a
read-only token for a search helper. In `.env`, several tokens can be listed as
`MCP_TOKENS="tokenA=read;tokenB=read,write;tokenC=all"`. Only the owner can grant the
`delete` scope.

Things to know:

- The tools act as the **owner account**, through the normal API, so the usual
  permission checks still apply. Anyone holding a token can do what its scopes allow
  to every page. Keep tokens secret, use HTTPS if the app is reachable from outside,
  and prefer the smallest scope that works.
- The server signs in as the owner with its own session, which appears once in
  Settings as an unnamed device.
- Page content goes in and out as Markdown by default (`format` can be `html` or `json`).
- Tested with raw JSON-RPC requests against every tool. It has not been tried with a
  real Claude Code client yet.

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
| `APP_URL` | Public URL of the app |
| `APP_SECRET` | 32+ random characters; changing it signs everyone out |
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | Default 3000 |
| `OWNER_EMAIL`, `OWNER_PASSWORD` | Optional first-owner seeder |
| `FILE_UPLOAD_SIZE_LIMIT`, `FILE_IMPORT_SIZE_LIMIT` | Upload limits (50mb / 200mb) |
| `AI_API_KEY`, `AI_MODEL`, `AI_MODELS`, `AI_BASE_URL` | Optional Assistant (see above) |
| `DRAWIO_URL` | Custom Draw.io server (optional; the default needs internet) |
| `MCP_TOKEN`, `MCP_SCOPES`, `MCP_TOKENS` | Optional MCP access (see above) |

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
   (auth, notifications). Remove the invitation service, endpoints and screens.
4. Delete search / AI / billing queue producers (`database/listeners`) and the
   unused dependencies.
5. Storage: keep only `local.driver.ts`.
6. Add the MCP module (`apps/server/src/mcp`), which wraps the REST API as MCP tools.
7. Add `OwnerSeederService` (`core/auth/services/owner-seeder.service.ts`) and
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
