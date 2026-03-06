# Architecture

## Product Goal

Build a collaborative Markdown system with three required properties:

- realtime editing by default
- version history as a first-class feature
- collaboration workflows that feel simpler than Git

The key architectural correction is this:

- CLI is the primary surface
- MCP and web are parity adapters
- the domain model and business actions must live in one shared application core

"Same functionality" should mean parity at the capability level, not identical UI. The web can render cursors and selections. The CLI can expose the same operations through commands, local editor flows, and streams.

## Non-Negotiable Rule

Every user-facing behavior must exist as an application command or query first, then be exposed through:

- CLI
- MCP
- web

No feature should be invented only inside a web route or React component.

## Surface Model

### CLI

Primary product surface.

Binary: `smm` (installed via `bun add -g @sharemymarkdown/smm`)

Examples:

- `smm auth login`
- `smm docs list`
- `smm docs create`
- `smm docs edit`
- `smm versions list`
- `smm versions diff`
- `smm members grant`

For V1, the CLI edit workflow can use `$EDITOR` plus sync and version operations. It does not need to imitate a browser UI to achieve feature parity.

### MCP

Machine-facing tool surface for agents and editor integrations.

Examples:

- `list_documents`
- `get_document`
- `save_version`
- `diff_versions`
- `grant_document_access`

MCP should call the same application services as CLI and web, with its own auth adapter layered on top.

### Web

Rich UX surface for collaborative editing, history browsing, and sharing.

Examples:

- live CodeMirror editor
- presence indicators
- readable diff views
- share controls

The web layer should remain thin. It is primarily a presentation and transport adapter over the same service layer.

## Runtime Topology

```txt
CLI client --------------------.
                              |
MCP client ---- OAuth/MCP ----+----> Bun server
                              |        |- auth and OAuth endpoints
Web client ---- HTTP / WS ----'        |- JSON APIs
                                       |- MCP handlers
                                       |- Yjs room manager
                                       `- application core
                                                 |
                                                 v
                                           Turso / libSQL
```

The Bun service remains the source of truth for:

- auth
- authorization
- document metadata
- versions and diffs
- realtime collaboration persistence

## Capability Parity Contract

Track parity explicitly in code. The repo now has an initial catalog in [src/core/capabilities.ts](/Users/seth/repositories/sharemymarkdown/src/core/capabilities.ts).

V1 capability groups:

- auth
- documents
- versions
- sharing
- collaboration

The parity requirement applies to:

- login and identity
- document CRUD
- edit and sync operations
- version history
- diff and restore
- collaborator management

## Stack Decisions

### Runtime

- Bun
- `bun.serve()` for HTTP, WebSocket, and MCP-facing endpoints
- Bun also runs the CLI entrypoint

### Web

- React 19
- CodeMirror 6
- `y-codemirror.next`

### Collaboration

- `yjs`
- `y-protocols`
- `y-websocket`

Yjs remains the realtime engine. The server owns room authorization and persistence.

### Database

- Turso / libSQL via `@libsql/client`
- Drizzle ORM on the beta line

Pin both:

- `drizzle-orm@beta`
- `drizzle-kit@beta`

Keep ORM and migration tooling on the same beta build line.

### Auth

- `better-auth`
- `@better-auth/drizzle-adapter`
- `@better-auth/oauth-provider`

Recommendation for new work:

- use Better Auth browser sessions for web
- use Better Auth OAuth provider capabilities for CLI and MCP token issuance
- use MCP-compatible metadata and protected-resource endpoints from the Better Auth OAuth direction

Important note: the Better Auth docs for the legacy MCP plugin explicitly say it is heading toward deprecation in favor of the OAuth Provider plugin. Build the auth layer so that MCP compatibility comes from the OAuth provider path, not a dead-end plugin choice.

## Auth Strategy

### Web

- cookie-based Better Auth sessions
- standard browser sign-in and sign-out
- session lookup on every API and WebSocket upgrade
- start with GitHub as the first social provider

### CLI

Preferred V1 login flow:

- browser-based OAuth or device authorization
- store access and refresh tokens in a local credential file
- use bearer auth for CLI requests

This gives the CLI a first-class login flow without pretending it is a browser.

## Initial Auth Provider

Start with GitHub auth first.

Reasons:

- it is the fastest way to get real users through the system
- it works cleanly for the developer audience
- it keeps the first auth surface small while CLI, MCP, and web parity are still being established

Based on the Better Auth GitHub documentation:

- local callback URL should be `http://localhost:3000/api/auth/callback/github`
- the GitHub app must have access to the user's email information
- provider config uses `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`

The first auth milestone should therefore be:

1. Better Auth base configuration
2. GitHub social provider enabled
3. browser sign-in working
4. CLI login bootstrap using the same auth service
5. MCP token validation on the same provider-backed auth stack

### MCP

- expose OAuth discovery and protected resource metadata
- validate bearer tokens on MCP requests
- attach authenticated session context to every tool invocation

The Better Auth MCP helpers such as `withMcpAuth` are still useful at the transport layer, but the durable long-term shape should align with the OAuth provider flow.

## Folder Layout

The repo should evolve toward this shape:

```txt
src/
  cli.ts
  index.ts
  index.html
  core/
    capabilities.ts
    contracts/
      auth.ts
      documents.ts
      versions.ts
      sharing.ts
  web/
    frontend.tsx
    App.tsx
    pages/
      LandingPage.tsx
      DashboardPage.tsx
      DocumentPage.tsx
      HistoryPage.tsx
    editor/
      MarkdownEditor.tsx
      PresenceBar.tsx
      VersionSidebar.tsx
    auth/
      auth-client.ts
  server/
    auth/
      auth.ts
      oauth.ts
      session.ts
      permissions.ts
    app/
      commands/
        create-document.ts
        update-document.ts
        create-version.ts
        restore-version.ts
        grant-access.ts
      queries/
        list-documents.ts
        get-document.ts
        list-versions.ts
        diff-versions.ts
        list-members.ts
      services/
        documents.ts
        versions.ts
        sharing.ts
    collab/
      room-manager.ts
      persistence.ts
      awareness.ts
      protocol.ts
    transports/
      http/
        routes.ts
      mcp/
        handlers.ts
      ws/
        upgrade.ts
    db/
      client.ts
db/
  schema/
    auth.ts
    documents.ts
    versions.ts
    yjs.ts
    oauth.ts
  relations.ts
  drizzle.config.ts
```

## Data Model

There are three persisted state categories now:

1. core auth/session state
2. product metadata and history
3. OAuth and MCP-facing provider state

### Better Auth Base Tables

- `users`
- `sessions`
- `accounts`
- `verifications`

### Product Tables

#### `documents`

- `id`
- `title`
- `owner_id`
- `head_version_id`
- `created_at`
- `updated_at`
- `archived_at`

#### `document_members`

- `document_id`
- `user_id`
- `role`
- `created_at`

Roles:

- `owner`
- `editor`
- `viewer`

#### `versions`

- `id`
- `document_id`
- `parent_version_id`
- `author_id`
- `message`
- `markdown`
- `yjs_snapshot`
- `created_at`

Store both plain Markdown and exact Yjs snapshot data. Plain text is required for readable diffs and CLI output.

### Collaboration Tables

#### `yjs_snapshots`

- `id`
- `document_id`
- `snapshot`
- `state_vector`
- `created_at`

#### `yjs_updates`

- `id`
- `document_id`
- `update`
- `created_at`

### OAuth / MCP Provider Tables

Per the Better Auth OAuth and MCP documentation, include the official provider schema objects for:

- OAuth access tokens
- OAuth applications
- OAuth consents
- OAuth clients
- OAuth sessions
- OAuth authorization codes

The exact Drizzle file should mirror the official Better Auth schema for the chosen provider path.

## Collaboration Model

Yjs is still the live editing engine. Nothing about the CLI-first requirement changes that.

Server responsibilities:

- authorize room joins
- host room state in memory
- persist updates and snapshots
- broadcast awareness
- compact updates into snapshots

CLI responsibilities for V1:

- support non-browser edit flows through `$EDITOR`
- support document pull, push, diff, and version commands
- optionally stream presence or version activity

Web responsibilities for V1:

- provide the richest realtime editing experience
- display cursors, presence, and history visually

## Transport Mapping

Use one application core with three adapter layers:

### HTTP / JSON

Used by:

- CLI commands
- web UI

Recommended endpoints:

- `ALL /api/auth/*`
- `GET /api/session`
- `GET /api/documents`
- `POST /api/documents`
- `GET /api/documents/:documentId`
- `PATCH /api/documents/:documentId`
- `GET /api/documents/:documentId/history`
- `POST /api/documents/:documentId/versions`
- `POST /api/documents/:documentId/restore/:versionId`
- `GET /api/documents/:documentId/members`
- `POST /api/documents/:documentId/members`
- `DELETE /api/documents/:documentId/members/:userId`

### WebSocket

Used by:

- web editor
- future live CLI flows if desired

Recommended endpoint:

- `GET /ws/documents/:documentId`

### MCP

Used by:

- AI agents
- editor assistants
- automation clients

Tool handlers should map directly onto the same document, version, and sharing services used by the other surfaces.

## Build Order

Because CLI is primary, the implementation order should change:

1. Define the capability catalog and contracts.
2. Build Better Auth base auth plus GitHub provider support.
3. Implement the core document, version, and sharing services.
4. Add OAuth provider support for CLI and MCP token flows.
5. Ship the first useful CLI commands on top of those services.
6. Add HTTP routes that expose the same actions for web and CLI clients.
7. Add MCP handlers on top of the same services.
8. Add Yjs room management and persistence.
9. Add the web editor and history UI.
10. Add collaborative polish such as presence, comments, and review flows.

## Risks and Design Constraints

- Do not let the web UI become the de facto product API.
- Do not rely on binary Yjs blobs alone for history and diffs.
- Do not build MCP auth around a soon-to-be-deprecated path if the OAuth provider path is available.
- Do not assume CLI parity means identical UX. It means the same operations and outcomes.
- Horizontal scaling still requires sticky routing or pub/sub because live Yjs rooms are in memory.

## Definition of Done for V1

V1 is done when a signed-in user can do the following from the CLI:

- log in
- list documents
- create a document
- edit a document
- save a version
- diff versions
- restore a version
- grant or revoke collaborator access

And the same domain actions are also available through:

- MCP tools
- web UI

That is the smallest meaningful version of the product.
