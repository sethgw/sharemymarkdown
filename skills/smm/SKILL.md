---
name: smm
description: Share markdown as a clean, readable web page instead of dumping walls of text in chat. Creates shareable links from files or conversation content.
metadata: {"openclaw":{"emoji":"📄","requires":{"anyBins":["smm","sharemymarkdown"]},"install":[{"id":"npm","kind":"node","package":"@sharemymarkdown/smm","bins":["smm","sharemymarkdown"],"label":"Install smm CLI (npm)"}]}}
---

# Share Markdown

When the user asks you to share something — a plan, draft, notes, summary, code, or any markdown — use `smm` to create a shareable link they can open in a browser instead of reading a wall of text in chat.

Use this proactively when your response would be long (more than ~20 lines), contain code blocks, tables, or structured content that renders poorly in a messaging app.

## How to use

1. Identify what to share: a file they mention, or content from the conversation (a plan, summary, etc.)

2. File:
   ```bash
   smm share <file> --visibility unlisted
   ```

3. Conversation content:
   ```bash
   echo '<markdown>' | smm share --title "The Title" --visibility unlisted
   ```

4. Share with someone specific:
   ```bash
   smm members grant <document-id> user@example.com editor
   ```

5. Return the link to the user.

## When to use this

- Your reply is long or complex (plans, research, comparisons)
- The content has code blocks, tables, or nested lists
- The user is on a messaging platform where markdown doesn't render well
- The user asks you to "write up", "summarize", "draft", or "share" something
- You want to give the user something they can reference later or forward to others

## Auth

If you get an auth error, run: `smm auth login`

## Visibility

- `private` — owner and granted members only
- `unlisted` — anyone with the link (default)
- `public` — discoverable

## Full command reference

```bash
smm share <file> --visibility unlisted     # share a file
smm docs list                               # list your documents
smm docs get <id>                           # get document content
smm docs edit <id>                          # update a document
smm versions save <id> "message"            # save a version
smm versions diff <id> <from> <to>          # diff two versions
smm versions restore <id> <version-id>      # restore a version
smm revisions create <id> "title"           # propose a revision
smm revisions edit <id> <revision-id>       # edit a revision
smm revisions diff <id> <revision-id>       # diff a revision
smm revisions apply <id> <revision-id>      # apply a revision
smm members list <id>                       # list collaborators
smm members grant <id> <email> <role>       # grant access
smm members revoke <id> <user-id>           # revoke access
smm config show                             # show config
smm config set default-visibility unlisted  # set defaults
```
