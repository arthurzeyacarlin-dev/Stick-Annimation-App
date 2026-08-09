# Archive and Reference Classification

Status: canonical classification map
Last updated: 2026-08-09

## Purpose

Historical material is preserved because it contains design intent and development lessons. It is not allowed to compete silently with the canonical current control plane.

No source, prompt library, workbook, or historical document was deleted during the initial audit.

## Historical Top-Level Docs

The following files capture a March/April 2026 visual-alignment workflow or duplicate the active `AGENTS.md` rules. They are history/convenience redirects, not current state:

- `../DAILY_LOG.md`
- `../DAILY_CHECKLIST.md`
- `../CODEX_SESSION_LOG.md`
- `../CODEX_SESSION_CHECKLIST.md`
- `../CODEX_EXECUTION_PROTOCOL.md`
- `../operational_workflow.md`
- `../codex_project_manager.md`
- `../SKILL.md` — a repository Markdown file, not an installed Codex skill
- `../feature_domain_map.md` — superseded by `../ROADMAP.md`

The historical claim that the Drawing Workspace was complete and the Stick Figure Workspace was visually complete is not current product status.

## `diamond-animator-docs/` Reference Library

Classification:

- `02_animation_engine/MOTION_TWEEN_SYSTEM.md`: provisionally promoted legacy V1 intent; read and reconcile for every drawing motion-tween task; owner confirmation/current acceptance pending.
- `01_workspaces/**`, most `02_animation_engine/**`, and `04_product_systems/**`: design intent requiring reconciliation before implementation authority.
- `03_ai_systems/**`: stale/thin AI design notes; current architecture is `../AI_SYSTEM.md` plus live code.
- `05_operational/**`: legacy operational templates/duplicates; canonical operations are `AGENTS.md` and `docs/`.
- `06_build_book/**`: narrative/background only.
- `00_core_context/**`: redirects to canonical files; they were zero-byte placeholders before this control plane.

`diamond-animator-docs/SYSTEM_MEMORY_MAP.md` now routes readers back to the canonical control plane and labels authority.
Its scoped `diamond-animator-docs/AGENTS.md` applies the same warning automatically when an agent works inside that subtree.

## Paste Pack

`src/components/workspace/diamond_animator_docs_paste_pack.md` is a historical staging artifact. Its own instructions say to copy sections into a docs tree. It contains useful old product prose, but it is not runtime source or current authority.

Do not delete or move it during unrelated editor work. A dedicated archival task may extract unique decisions and relocate it outside `src/` after import/build effects are checked.

## AI/Research Duplicate Candidates

Preserve pending a dedicated cleanup spec:

- `src/lib/ai/framesTraining.ts`: no importer found; appears superseded by `DrawingWorkspaceTask_GenerateFrames.ts`.
- `DREAM_100_LIST_UPDATED.xlsx`: normalized non-empty content matches the newer formatted workbook.
- `DREAM_100_LIST_FORMATTED.xlsx`: preferred non-authoritative market-research archive candidate; rows lack source citations and code does not import it.

Promotion or deletion requires import-graph proof, provenance review, and an explicit decision.

## Promotion Rule

Reference material becomes current authority only when it is reconciled with live code and behavior, brought to the spec template's completeness standard, and listed in `../specs/README.md`.
