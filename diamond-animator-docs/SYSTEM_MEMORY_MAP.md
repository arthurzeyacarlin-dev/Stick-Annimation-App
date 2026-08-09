# Diamond Animator Reference Library Map

Status: reference navigation, not the current control plane
Last updated: 2026-08-09

## Canonical Entry Point

Current product memory lives in [`../docs/README.md`](../docs/README.md). Every Codex task begins with [`../AGENTS.md`](../AGENTS.md).

This directory preserves domain design intent, historical architecture notes, operational lessons, and build-book narrative. It does not own current state, priorities, decisions, changelog, or handoff.

## Authority Rules

1. Use `../docs/` for current product intent, code state, roadmap, TODO, decisions, terminology, verification, and active specs.
2. Use live code and real-app verification to determine current behavior.
3. Treat files in this directory as reference until `../docs/specs/README.md` explicitly promotes one.
4. When reference prose conflicts with code or the latest product direction, record the conflict; do not silently treat either as resolved.

## Provisionally Promoted Legacy Specification

`02_animation_engine/MOTION_TWEEN_SYSTEM.md` is provisionally promoted as the best detailed legacy V1 intent for drawing-workspace position-only motion tween. It is not newly owner-approved; current acceptance and Arthur's confirmation remain pending.

For every drawing motion-tween task, read:

1. `02_animation_engine/MOTION_TWEEN_SYSTEM.md`
2. `../docs/architecture.md`
3. `../docs/CURRENT_STATE.md`
4. `05_operational/DEBUG_PLAYBOOK.md` for the historical broken-link debugging order
5. the active spec and live tween code

The full acceptance suite must still be rerun before claiming current verification.

## Reference Areas

### `00_core_context/`

Redirects to the canonical charter, PM context, AI snapshot, agent workflow, and session handoff. These six files were zero-byte placeholders before the control-plane baseline.

### `01_workspaces/`

Thin drawing/stick/UI design notes. Preserve as vocabulary and intent. Reconcile with live code and create an approved spec before implementation.

### `02_animation_engine/`

- `MOTION_TWEEN_SYSTEM.md`: provisional legacy promotion described above.
- engine/frame/timeline/playback files: useful design intent, not independently verified current behavior.

### `03_ai_systems/`

Historical AI product notes. They do not describe the current contract, enabled-task matrix, model routing, procedural renderer, project memory, cost logging, or validator state. Use `../docs/AI_SYSTEM.md` and live source first.

### `04_product_systems/`

Aspirational product/UI/workflow notes. They are useful input for future specs but cannot prove a feature exists.

### `05_operational/`

Historical workflow/debug notes and redirects. Current instructions live in `../AGENTS.md` and `../docs/`.

### `06_build_book/`

Narrative/background only. It is not a requirement or implementation specification.

## Historical Paste Pack and Research

The manual paste pack under `../src/components/workspace/diamond_animator_docs_paste_pack.md` and DREAM-100 workbooks under `../src/lib/ai/` are classified in `../docs/archive/README.md`.

## Anti-Duplication Rule

Do not add a current-state, TODO, changelog, roadmap, decision log, or handoff here. Add or update the canonical file under `../docs/` and leave a redirect if an old path must survive.
