#!/bin/bash
set -euo pipefail

# Safe control-plane maintenance helper.
#
# Default behavior:
# 1) Validate that canonical memory files exist and are non-empty.
# 2) Regenerate the sanitized project tree.
#
# This script never stages, commits, pushes, resets, restores, cleans, seeds,
# deploys, or contacts an external service.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REGEN_TREE=1

case "${1:-}" in
  "")
    ;;
  --check-only|--no-tree)
    REGEN_TREE=0
    ;;
  *)
    echo "Usage: $0 [--check-only|--no-tree]"
    exit 1
    ;;
esac

REQUIRED_FILES=(
  "AGENTS.md"
  "README.md"
  ".env.example"
  "docs/README.md"
  "docs/00_MASTER_PROJECT.md"
  "docs/PROJECT_MANAGER_CONTEXT.md"
  "docs/CURRENT_STATE.md"
  "docs/architecture.md"
  "docs/AI_SYSTEM.md"
  "docs/ROADMAP.md"
  "docs/TODO.md"
  "docs/DECISIONS.md"
  "docs/TERMINOLOGY.md"
  "docs/testing_workflow.md"
  "docs/specs/README.md"
  "docs/specs/TEMPLATE.md"
  "docs/SESSION_HANDOFF.md"
  "docs/changelog.md"
  "docs/archive/README.md"
  "docs/baselines/2026-08-09-repository-audit.md"
  "diamond-animator-docs/AGENTS.md"
  "diamond-animator-docs/SYSTEM_MEMORY_MAP.md"
  "diamond-animator-docs/02_animation_engine/MOTION_TWEEN_SYSTEM.md"
)

MISSING_COUNT=0
for rel in "${REQUIRED_FILES[@]}"; do
  if [[ ! -s "$ROOT_DIR/$rel" ]]; then
    echo "Missing or empty canonical file: $rel"
    MISSING_COUNT=$((MISSING_COUNT + 1))
  fi
done

if [[ "$MISSING_COUNT" -ne 0 ]]; then
  echo "Control-plane validation failed: $MISSING_COUNT required file(s) missing or empty."
  exit 1
fi

if [[ "$REGEN_TREE" -eq 1 ]]; then
  "$ROOT_DIR/scripts/generate_project_tree.sh"
fi

echo "Required control-plane files are present and non-empty."
echo "Git index and history remain untouched; inspect the working tree with: git status --short --branch"
