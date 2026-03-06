# ShareMyMarkdown Agent Guide

This repository is intentionally agent-friendly.

## Product Rule

CLI is the primary surface.

Every meaningful capability must exist in the application core first and then be exposed through:

- CLI
- MCP
- web

Do not invent product behavior only inside React components or HTTP handlers.

## Stack

- Bun for server, bundling, CLI runtime, and WebSocket transport
- React 19 for the web UI
- CodeMirror 6 for the editor
- Yjs for realtime collaboration and presence
- Turso / libSQL for persistence
- Drizzle ORM on the `1.0.x beta` line
- Better Auth for GitHub auth, sessions, bearer auth, and MCP auth plumbing

## Important Paths

- `src/index.ts`: Bun server, HTTP routes, websocket upgrades
- `src/cli.ts`: CLI surface
- `build-cli-package.ts`: generates the minimal publishable npm package in `dist-cli/`
- `src/mcp/server.ts`: MCP tool surface
- `src/server/services/documents.ts`: document, version, sharing services
- `src/server/services/revisions.ts`: draft and revision services
- `src/server/collaboration.ts`: Yjs room manager and presence
- `src/server/db/schema.ts`: Drizzle schema
- `src/server/db/ensure.ts`: bootstrap table creation for local and Turso startup
- `src/core/capabilities.ts`: capability parity contract across surfaces
- `docs/architecture.md`: product and architecture blueprint
- `llms.txt`: machine-readable repo summary served at `/llms.txt`

## Current Capabilities

- Auth via GitHub
- CLI login bridge
- Document list/create/read/edit
- Share-link creation from CLI, MCP, and web
- Document visibility: `private`, `unlisted`, `public`
- Realtime collaborative editing in web
- Presence
- Versions: save, list, diff, restore
- Revisions: create, edit, diff, apply
- Sharing: list, grant, revoke
- MCP parity for document, version, revision, sharing, and presence operations

## Local Commands

```bash
bun install
bun run cli -- help
bun dev
bun run build
bun run build:cli-package
bun run mcp
```

Binary shape after publish:

```bash
bun add -g @sharemymarkdown/smm
smm share draft.md --visibility unlisted
# long alias also works:
sharemymarkdown share draft.md --visibility unlisted
```

Publish artifact flow:

```bash
bun run build:cli-package
cd dist-cli
npm pack --dry-run
npm publish --access public
```

Database helpers:

```bash
bun run db:generate
bun run db:push
```

Note: `db:push` can hit Turso transaction issues when it tries to recreate existing auth tables. The app also runs `ensureDatabase()` on startup to create missing tables safely.

## Environment

- `DATABASE_URL`
- `TURSO_TOKEN` or `TURSO_AUTH_TOKEN` or `TURBO_TOKEN`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `SMM_SERVER_URL`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

Local GitHub callback:

```txt
http://localhost:3000/api/auth/callback/github
```

## Agent Working Rules

- Prefer Bun-native workflows over Node/Vite alternatives.
- Keep CLI, MCP, and web capability parity aligned.
- Keep share-link and visibility semantics aligned across all three surfaces.
- Keep the published CLI package minimal; avoid pulling web/server-only dependencies into the npm artifact.
- Treat Yjs as the source of truth for live editor state.
- Treat HTTP services and DB records as the source of truth for revisions, versions, sharing, and auth.
- Prefer markdown and text representations when building agent-facing output.
- Preserve readable APIs for both humans and automated agents.

## Markdown-Friendly Endpoints

The server supports markdown representations on key GET routes when either:

- `Accept: text/markdown`
- `?format=markdown`
- `?format=md`

High-value routes:

- `/api/documents`
- `/api/documents/:id`
- `/api/shared/:shareId`
- `/api/documents/:id/presence`
- `/api/documents/:id/versions`
- `/api/documents/:id/revisions`
- `/api/documents/:id/revisions/:revisionId`
- `/api/documents/:id/diff`
- `/api/documents/:id/revisions/:revisionId/diff`
- `/api/documents/:id/members`

## Agent Discovery Files

Canonical file:

- `AGENTS.md`

Symlinked compatibility files:

- `CLAUDE.md -> AGENTS.md`
- `CODEX.md -> AGENTS.md`
- `CURSOR.md -> AGENTS.md`

Machine-readable summary:

- `llms.txt`

## Deployment

- Production URL: `https://sharemymarkdown.com`
- Docker/Dokploy via `docker-compose.yml`
- GitHub Actions deploy on push to `master`
- `drizzle-kit push` runs on container start to sync DB schema

## Runtime Agent Discovery

- `/.well-known/agents.json`: machine-readable agent capabilities
- `/.well-known/oauth-authorization-server`: MCP/OAuth discovery
- `/.well-known/oauth-protected-resource`: protected resource metadata
- `/openapi.yaml`: OpenAPI 3.1 spec for all HTTP endpoints
- `/llms.txt`: machine-readable repo and product summary
