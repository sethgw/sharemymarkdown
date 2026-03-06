# ShareMyMarkdown

CLI-first collaborative Markdown with realtime editing, stable share links, readable history, and draft-style revision workflows.

If you are an agent or operator landing in this repo, the practical rule is simple:

- use the CLI first
- use MCP when you need tool access from an editor or agent runtime
- use the web app for reading, live collaboration, sharing, and review

Canonical agent guidance lives in [AGENTS.md](AGENTS.md). [CLAUDE.md](CLAUDE.md), [CODEX.md](CODEX.md), and [CURSOR.md](CURSOR.md) are symlinks to that file.

## What To Do With This Product

Use ShareMyMarkdown when you want to:

- turn local Markdown into a durable share link instead of pasting drafts around
- write Markdown collaboratively without giving up plain text
- control whether a document is private, unlisted, or public
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

Local CLI during repo development:

```bash
bun run cli -- help
```

Prepare the lean npm CLI package locally:

```bash
bun run build:cli-package
cd dist-cli
npm pack --dry-run
```

Published CLI:

```bash
bun add -g @sharemymarkdown/smm
smm share draft.md --visibility unlisted
```

## Claude Code Skill

Install the `/smm` skill so Claude Code can share markdown on your behalf:

```bash
smm install-skill
```

After restarting Claude Code, type `/smm` to share files, plans, or conversation content as a link.

## First Useful Commands

Sign in from the CLI:

```bash
smm auth login
```

Create a link from a file or stdin:

```bash
smm share draft.md --visibility unlisted
cat draft.md | smm share --title "Working Draft"
```

Open and edit an existing document:

```bash
smm docs get <document-id>
smm docs edit <document-id>
smm docs visibility <document-id> public
```

Save a version:

```bash
smm versions save <document-id> "Initial checkpoint"
```

Create and review a revision:

```bash
smm revisions create <document-id> "Alternative draft"
smm revisions edit <document-id> <revision-id>
smm revisions diff <document-id> <revision-id> live
smm revisions apply <document-id> <revision-id>
```

Set a default visibility for future shares:

```bash
smm config set default-visibility unlisted
smm config show
```

See all CLI commands:

```bash
smm help
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
- `/api/shared/:shareId`
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
- CLI defaults live in `~/.config/sharemymarkdown/config.json`.
- The repo workspace package is private; npm publishing happens from the generated `dist-cli/` package as `@sharemymarkdown/smm`.
- `db:push` can hit Turso transaction issues when it tries to recreate existing auth tables. The app also runs `ensureDatabase()` on startup to create missing tables safely.

## Reference

- Agent instructions: [AGENTS.md](AGENTS.md)
- Architecture blueprint: [docs/architecture.md](docs/architecture.md)
