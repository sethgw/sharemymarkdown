#!/usr/bin/env bash
# Full agent workflow: login → create → share → version → revision → collaborate
#
# Prerequisites:
#   bun add -g @sharemymarkdown/smm
#
# This script shows the complete lifecycle of a document.

set -euo pipefail

echo "=== 1. Auth ==="
smm auth login
smm auth status

echo ""
echo "=== 2. Share a file ==="
# Share a local file as an unlisted document
smm share README.md --visibility unlisted --json

echo ""
echo "=== 3. Create a document from scratch ==="
DOC_ID=$(smm docs create "Agent Working Notes" --visibility private 2>&1 | awk '{print $1}')
echo "Created document: $DOC_ID"

echo ""
echo "=== 4. Edit the document ==="
# Opens $EDITOR — for scripts, pipe content instead:
echo "# Agent Notes" | smm share --title "Agent Notes" --visibility unlisted

echo ""
echo "=== 5. Save a version ==="
smm versions save "$DOC_ID" "Initial draft"
smm versions list "$DOC_ID"

echo ""
echo "=== 6. Create and apply a revision ==="
smm revisions create "$DOC_ID" "Improve intro"
# Get the revision ID from the list
REV_ID=$(smm revisions list "$DOC_ID" | head -1 | awk '{print $1}')
echo "Created revision: $REV_ID"

# Edit the revision (opens $EDITOR)
# smm revisions edit "$DOC_ID" "$REV_ID"

# Diff revision against live document
smm revisions diff "$DOC_ID" "$REV_ID" live

# Apply revision to the live document
smm revisions apply "$DOC_ID" "$REV_ID"

echo ""
echo "=== 7. Collaborate ==="
smm members grant "$DOC_ID" teammate@example.com editor
smm members list "$DOC_ID"
smm docs presence "$DOC_ID"

echo ""
echo "=== 8. Configure defaults ==="
smm config set default-visibility unlisted
smm config show

echo ""
echo "Done. Run 'smm help' for all commands."
