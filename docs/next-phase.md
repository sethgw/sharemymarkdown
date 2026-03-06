# Next Phase Plan

## What's Done

- Core product loop: create, edit, share, version, revise, diff, restore
- Three-surface parity: CLI, MCP, web
- Realtime collaboration with Yjs + presence
- GitHub auth (web + CLI login bridge + MCP bearer)
- Deployment: Docker/Dokploy, GitHub Actions CI/CD, Traefik/LetsEncrypt, Cloudflare
- Agent discovery: AGENTS.md, llms.txt, /.well-known/agents.json
- Default visibility changed to unlisted (shareable links by default)

## Phase 2: Organizations + Multi-Tenancy

### 1. Better Auth Organizations Plugin

Add the `organization` plugin so every resource is tenanted through org membership.

- Install and configure `@better-auth/organization` plugin
- Add org schema tables (organizations, members, invitations)
- Auto-create a "Personal" org on first sign-in
- Every document belongs to an organization
- Add `organizationId` column to documents table
- Migrate existing documents to their owner's personal org

### 2. Organization CRUD

Expose org management across all surfaces:

| Capability | CLI | MCP | Web |
|---|---|---|---|
| List orgs | `smm orgs list` | `list_organizations` | dashboard sidebar |
| Create org | `smm orgs create` | `create_organization` | settings |
| Invite member | `smm orgs invite` | `invite_to_organization` | settings |
| Remove member | `smm orgs remove` | `remove_from_organization` | settings |
| Switch active org | `smm orgs use` | context param | dropdown |

### 3. Document Scoping

- Documents list filtered by active organization
- Share links still work cross-org (unlisted/public visibility)
- Org members with appropriate roles can see all org documents
- Document creation defaults to the user's active org

### 4. Roles and Permissions

- Org-level roles: owner, admin, member
- Document-level roles stay: owner, editor, viewer
- Org admins can manage all documents in the org
- Org members can see org documents but need explicit grants to edit

## Phase 3: Product Polish

### 5. Web UI Decomposition

The `App.tsx` monolith is ~1200 lines. Split into:

- `pages/Landing.tsx`
- `pages/Dashboard.tsx`
- `pages/DocumentEditor.tsx`
- `pages/SharedView.tsx`
- `pages/CliLogin.tsx`
- `pages/McpLogin.tsx`

### 6. Share Page UX

- Branded share page at `/s/:shareId` with rendered markdown
- Open Graph meta tags for link previews
- "Edit with us" CTA for viewers to request access or sign in

### 7. Notifications

- In-app notification when someone joins your document
- Email digest (optional) for revision activity
- Webhook/event system for agent integrations

### 8. Public Document Discovery

- `/explore` page listing public documents
- Search by title/content
- Sort by recent activity

## Phase 4: Agent-Native Features

### 9. MCP Auth Migration

Per architecture.md: migrate from the Better Auth MCP plugin to the OAuth Provider plugin path. The current MCP plugin is heading toward deprecation.

- Set up OAuth Provider plugin
- Implement authorization code + PKCE flow
- Support dynamic client registration for agents
- Deprecate legacy MCP auth path

### 10. Agent Collaboration Primitives

- Structured revision proposals from agents (not just raw markdown replacement)
- Agent-initiated comments/annotations on document sections
- "Suggest changes" mode where agent edits are staged as revisions
- Webhook callbacks when documents change (so agents can react)

### 11. CLI Package Publishing

- `dist-cli/` build is ready but not yet published to npm
- Published as `@sharemymarkdown/smm` — `smm` works globally
- Add version/release automation to GitHub Actions

## Immediate Next Steps (pick up here)

1. **Verify OAuth fix** — confirm GitHub sign-in works on production after the cookie-forwarding fix deploys
2. **Organizations plugin** — this is the big structural change; start with schema + auto-creation of personal org
3. **Split App.tsx** — do this alongside or right before the org UI work to keep components manageable
