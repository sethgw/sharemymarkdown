---
name: smm
description: Use when sharing markdown content as a link, publishing a plan or draft, sending a document to someone, or turning conversation output into a shareable URL
---

# smm — Share Markdown

## Overview

Turn any markdown — a file, a plan, notes, a summary — into a shareable link with one command. The `smm` CLI creates documents on sharemymarkdown.com and returns a URL.

## When to Use

- User says "share this", "share the plan", "send this to [person]", "publish this", "make a link"
- User wants to turn conversation output (a plan, summary, draft) into something shareable
- User references `smm` or `/smm` directly
- User wants to manage existing shared documents

**Not for:** Local file operations, git workflows, or content that shouldn't leave the machine.

## Core Pattern

1. **Identify content** — a file the user named, or markdown from the conversation
2. **Share it** — pipe or pass to `smm`
3. **Return the link**

File:
```bash
smm share draft.md --visibility unlisted
```

Conversation content (plan, summary, etc.):
```bash
cat <<'EOF' | smm share --title "The Title" --visibility unlisted
# Your markdown here
EOF
```

Share with a specific person after creating:
```bash
smm members grant <document-id> user@example.com editor
```

## Quick Reference

| Action | Command |
|--------|---------|
| Share a file | `smm share <file> [--visibility unlisted]` |
| Share with title | `smm share --title "Name" [--visibility unlisted]` |
| Share and open browser | `smm share <file> --open` |
| Share as JSON | `smm share <file> --json` |
| List documents | `smm docs list` |
| Read a document | `smm docs get <id>` |
| Edit in $EDITOR | `smm docs edit <id>` |
| Set visibility | `smm docs visibility <id> public` |
| Save a version | `smm versions save <id> "message"` |
| Diff versions | `smm versions diff <id> <from> <to>` |
| Create a revision | `smm revisions create <id> "title"` |
| Apply a revision | `smm revisions apply <id> <revision-id>` |
| Grant access | `smm members grant <id> <email> editor` |
| Revoke access | `smm members revoke <id> <user-id>` |
| See who's online | `smm docs presence <id>` |
| Sign in | `smm auth login` |
| All commands | `smm help` |

## Visibility

- **`private`** — owner and granted members only
- **`unlisted`** — anyone with the link (default)
- **`public`** — discoverable

## Common Mistakes

| Problem | Fix |
|---------|-----|
| Auth error | Run `smm auth login` first |
| `smm` not found | `bun add -g @sharemymarkdown/smm` |
| Wrong visibility | Default is `unlisted`. Use `--visibility private` for sensitive content |
| Forgot the link | `smm docs list` shows all documents with their URLs |
