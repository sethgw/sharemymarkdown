# Contributing

## Setup

```bash
bun install
cp .env.example .env
# Fill in DATABASE_URL, TURSO_TOKEN, BETTER_AUTH_SECRET, BETTER_AUTH_URL,
# GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
bun dev
```

GitHub OAuth callback for local dev: `http://localhost:3000/api/auth/callback/github`

## Architecture Rule

Every user-facing feature must exist as an application service first, then be exposed through CLI, MCP, and web. Do not build features only inside React components or HTTP handlers.

## Code Style

- Bun-native — no Node/Vite alternatives
- TypeScript, no `any`
- Drizzle ORM on the `1.0.x beta` line
- Prefer simple over clever

## Making Changes

1. Read `AGENTS.md` for the full agent guide and working rules.
2. Keep CLI, MCP, and web capability parity aligned.
3. Keep the published CLI package (`@sharemymarkdown/smm`) minimal — no web/server dependencies in the npm artifact.
4. Test locally with `bun dev` and `bun run cli -- <command>`.

## Database

```bash
bun run db:generate   # generate migration
bun run db:push       # push schema to Turso
```

The app runs `ensureDatabase()` on startup to create missing tables safely. `db:push` can hit Turso transaction issues when recreating existing auth tables.

## Building

```bash
bun run build              # web build
bun run build:cli-package  # CLI npm package in dist-cli/
```

## Pull Requests

- Keep PRs focused on a single change.
- Describe what changed and why.
- Verify CLI and web still work after your change.
