#!/usr/bin/env bash
# Pipe markdown from other tools into shareable documents.
#
# Prerequisites:
#   bun add -g @sharemymarkdown/smm
#   smm auth login

set -euo pipefail

# Share a file directly
smm share notes.md --visibility unlisted

# Pipe from stdin
echo "# Meeting Notes\n\n- Discussed roadmap\n- Agreed on Q2 priorities" \
  | smm share --title "Meeting Notes"

# Pipe from another command
git log --oneline -20 | smm share --title "Recent Commits" --visibility private

# Share and open in browser
smm share draft.md --open

# Share and get JSON output (useful for scripting)
RESULT=$(smm share draft.md --json)
echo "$RESULT" | jq '.shareUrl'

# Share with a specific person
DOC_ID=$(smm share draft.md --json | jq -r '.id')
smm members grant "$DOC_ID" reviewer@example.com editor
