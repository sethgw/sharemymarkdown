# ShareMyMarkdown

CLI-first collaborative Markdown with realtime sync, readable history, and Git-like workflows.

## Product Rule

The same domain capabilities should be available through:

- CLI
- MCP
- web

CLI is the primary surface. Web and MCP are adapters over the same application core, not separate products with drift.

## Stack

- Bun for the server, API routes, WebSocket collaboration, and CLI runtime
- React 19 for the browser UI
- CodeMirror 6 for the web editor
- Yjs for realtime CRDT syncing and presence
- Turso / libSQL for metadata, snapshots, and version history
- Better Auth for sessions, GitHub auth, OAuth, and MCP-compatible auth metadata
- Drizzle on the 1.0 beta line (`drizzle-orm@beta`, `drizzle-kit@beta`)

## Current State

The repo still started from a Bun + React template, but the architecture has been updated for a CLI-first build. The working blueprint lives in [docs/architecture.md](/Users/seth/repositories/sharemymarkdown/docs/architecture.md).

There is also an initial CLI entrypoint so the repository now reflects the intended primary surface:

```bash
bun run cli help
```

Agent-facing repo guidance lives in [AGENTS.md](/Users/seth/repositories/sharemymarkdown/AGENTS.md). `CLAUDE.md` is a symlink to that canonical file to avoid instruction drift.

## Local Dev

```bash
bun install
bun run cli help
bun dev
```

## Environment

The scaffold should support:

- `DATABASE_URL`
- `TURSO_TOKEN`, `TURSO_AUTH_TOKEN`, or `TURBO_TOKEN`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

GitHub is the recommended first auth provider. For local development, configure the GitHub OAuth callback URL as `http://localhost:3000/api/auth/callback/github`.

## MCP

There are now two MCP surfaces backed by the same document/version/share operations:

- `bun run mcp` for local stdio usage
- `http://localhost:3000/mcp` for Streamable HTTP

The HTTP MCP endpoint is protected by Better Auth's MCP OAuth flow. The discovery metadata lives at:

- `http://localhost:3000/.well-known/oauth-authorization-server`
- `http://localhost:3000/.well-known/oauth-protected-resource`
- `http://localhost:3000/llms.txt`

## Agent-Friendly Output

Key GET endpoints support markdown output when requested with either:

- `Accept: text/markdown`
- `?format=markdown`
- `?format=md`

## Notes

- Use Bun's native HTML + TSX bundling instead of adding Vite.
- Keep Drizzle ORM and Drizzle Kit on the same beta build line.
- For MCP auth, prefer Better Auth's OAuth Provider direction for new work, even though the legacy MCP plugin still exists.
- Better Auth's GitHub docs call out that the GitHub app needs the `user:email` scope.
