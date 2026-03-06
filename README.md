# ShareMyMarkdown

CLI-first collaborative Markdown with realtime editing, readable history, and draft-style revision workflows.

If you are an agent or operator landing in this repo, the practical rule is simple:

- use the CLI first
- use MCP when you need tool access from an editor or agent runtime
- use the web app for reading, live collaboration, sharing, and review

Canonical agent guidance lives in [AGENTS.md](AGENTS.md). [CLAUDE.md](CLAUDE.md), [CODEX.md](CODEX.md), and [CURSOR.md](CURSOR.md) are symlinks to that file.

## What To Do With This Product

Use ShareMyMarkdown when you want to:

- write Markdown collaboratively without giving up plain text
- keep explicit versions for meaningful checkpoints
- create isolated revisions before changing the live document
- let agents interact with the same document system through MCP

The product is designed so the same core actions exist across:

- CLI
- MCP
- web

## Quick Start

Install dependencies:

```bash
bun install
```

Set up your environment:

```bash
cp .env.example .env
```

Add these values to `.env`:

```env
DATABASE_URL=libsql://...
TURSO_TOKEN=...
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=http://localhost:3000
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

For local GitHub auth, use this callback URL in your GitHub OAuth app:

```txt
http://localhost:3000/api/auth/callback/github
```

Start the app:

```bash
bun dev
```

Then open:

```txt
http://localhost:3000
```

## First Useful Commands

Sign in from the CLI:

```bash
bun run cli auth login
```

Create and edit a document:

```bash
bun run cli docs create "Working Draft"
bun run cli docs edit <document-id>
```

Save a version:

```bash
bun run cli versions save <document-id> "Initial checkpoint"
```

Create and review a revision:

```bash
bun run cli revisions create <document-id> "Alternative draft"
bun run cli revisions edit <document-id> <revision-id>
bun run cli revisions diff <document-id> <revision-id> live
bun run cli revisions apply <document-id> <revision-id>
```

See all CLI commands:

```bash
bun run cli help
```

## MCP

There are two MCP entrypoints:

- local stdio: `bun run mcp`
- HTTP: `http://localhost:3000/mcp`

Discovery endpoints:

- `http://localhost:3000/.well-known/oauth-authorization-server`
- `http://localhost:3000/.well-known/oauth-protected-resource`
- `http://localhost:3000/llms.txt`

## Markdown-Friendly Output

Agents should prefer markdown output when reading content.

Key GET endpoints support markdown when you send either:

- `Accept: text/markdown`
- `?format=markdown`
- `?format=md`

High-value endpoints:

- `/api/documents`
- `/api/documents/:id`
- `/api/documents/:id/presence`
- `/api/documents/:id/versions`
- `/api/documents/:id/revisions`
- `/api/documents/:id/revisions/:revisionId`
- `/api/documents/:id/diff`
- `/api/documents/:id/revisions/:revisionId/diff`
- `/api/documents/:id/members`

## Configuration Notes

- GitHub is the first auth provider.
- Use one GitHub OAuth app for local and a separate one for production.
- `db:push` can hit Turso transaction issues when it tries to recreate existing auth tables. The app also runs `ensureDatabase()` on startup to create missing tables safely.

## Reference

- Agent instructions: [AGENTS.md](AGENTS.md)
- Architecture blueprint: [docs/architecture.md](docs/architecture.md)
