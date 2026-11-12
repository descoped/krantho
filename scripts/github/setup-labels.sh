#!/bin/bash
# GitHub label setup for krantho
# Usage: bash scripts/github/setup-labels.sh

set -e

REPO="descoped/krantho"

echo "Setting up labels for $REPO..."
echo ""

# ============================================================
# AREA LABELS
# ============================================================
echo "=== Area Labels ==="

gh label create "cms" --repo $REPO --description "CMS core engine, adapters, components (src/cms/)" --color "61DAFB" --force 2>/dev/null || true
gh label create "persistence" --repo $REPO --description "Persistence layer (src/persistence/)" --color "5319e7" --force 2>/dev/null || true
gh label create "schema" --repo $REPO --description "Schema system (src/schema/)" --color "0075ca" --force 2>/dev/null || true
gh label create "seo-tools" --repo $REPO --description "SEO pipeline and agentic tools (src/tools/)" --color "fbca04" --force 2>/dev/null || true
gh label create "examples" --repo $REPO --description "Example apps (examples/)" --color "c5def5" --force 2>/dev/null || true

echo ""

# ============================================================
# TYPE LABELS
# ============================================================
echo "=== Type Labels ==="

gh label create "bug" --repo $REPO --description "Something isn't working" --color "d73a4a" --force 2>/dev/null || true
gh label create "enhancement" --repo $REPO --description "New feature or request" --color "a2eeef" --force 2>/dev/null || true
gh label create "docs" --repo $REPO --description "Documentation improvements" --color "0075ca" --force 2>/dev/null || true
gh label create "refactor" --repo $REPO --description "Code restructuring" --color "fbca04" --force 2>/dev/null || true
gh label create "test" --repo $REPO --description "Test improvements" --color "bfd4f2" --force 2>/dev/null || true

echo ""

# ============================================================
# PRIORITY LABELS
# ============================================================
echo "=== Priority Labels ==="

gh label create "priority: high" --repo $REPO --description "High priority" --color "b60205" --force 2>/dev/null || true
gh label create "priority: low" --repo $REPO --description "Low priority" --color "c2e0c6" --force 2>/dev/null || true

echo ""

# ============================================================
# STATUS LABELS
# ============================================================
echo "=== Status Labels ==="

gh label create "blocked" --repo $REPO --description "Blocked by external dependency" --color "d93f0b" --force 2>/dev/null || true
gh label create "needs-design" --repo $REPO --description "Needs design work before implementation" --color "e99695" --force 2>/dev/null || true

echo ""
echo "=== Done ==="
