#!/bin/bash
set -euo pipefail

# Local helper only. Despite the historical filename, this script does not
# contact GitHub, push, or maintain a generated/public mirror.
#
# It refuses to run with a non-empty index, validates/regenerates the control
# plane, stages an explicit control-plane allowlist, and optionally commits it.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: not inside a git repository."
  exit 1
fi

COMMIT_MSG=""
if [[ -n "${1:-}" && "${1:-}" != "--commit" ]]; then
  echo "Usage: $0 [--commit \"message\"]"
  exit 1
fi

if [[ "${1:-}" == "--commit" ]]; then
  if [[ -z "${2:-}" || -n "${3:-}" ]]; then
    echo "Usage: $0 [--commit \"message\"]"
    exit 1
  fi
  COMMIT_MSG="$2"
fi

if ! git diff --cached --quiet; then
  echo "Refusing to stage control-plane files because the Git index already contains changes."
  echo "Review the existing staged work before using this helper."
  exit 1
fi

"$ROOT_DIR/scripts/update_memory.sh"

git add -- \
  AGENTS.md \
  README.md \
  .gitignore \
  .env.example \
  docs \
  'diamond-animator-docs/*.md' \
  ':(glob)diamond-animator-docs/**/*.md' \
  src/components/workspace/diamond_animator_docs_paste_pack.md \
  project/project_structure.txt \
  scripts/generate_project_tree.sh \
  scripts/update_memory.sh \
  scripts/sync_docs_to_github.sh

echo "Staged the explicit control-plane allowlist for this repository only."

if [[ -n "$COMMIT_MSG" ]]; then
  git commit -m "$COMMIT_MSG"
  echo "Committed staged docs/workflow changes."
else
  echo "No commit created and nothing was pushed. Review with: git status --short"
  echo "Optional: $0 --commit \"docs: update workflow artifacts\""
fi
