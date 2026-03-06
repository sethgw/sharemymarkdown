# /smm - Share Markdown

When the user wants to share something — a plan, draft, notes, summary, or any markdown — use `smm` to create a shareable link.

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

5. Return the link.

## Auth

If auth error: `smm auth login`

## Install

If not found: `bun add -g @sharemymarkdown/smm`

## Visibility

- `private` — owner and granted members only
- `unlisted` — anyone with the link (default)
- `public` — discoverable

## Full command reference

```bash
smm docs list
smm docs get <id>
smm docs edit <id>
smm versions save <id> "message"
smm versions diff <id> <from> <to>
smm versions restore <id> <version-id>
smm revisions create <id> "title"
smm revisions edit <id> <revision-id>
smm revisions diff <id> <revision-id> [base|live]
smm revisions apply <id> <revision-id>
smm members list <id>
smm members grant <id> <email> <role>
smm members revoke <id> <user-id>
smm config show
smm config set default-visibility unlisted
```
