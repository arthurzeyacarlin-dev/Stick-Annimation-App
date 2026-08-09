# SPEC-NNNN — Title

Status: Draft
Owner: Arthur
Implementer: Codex
Created: YYYY-MM-DD
Last updated: YYYY-MM-DD
Decision links: none
TODO IDs: none
Baseline branch/commit: record exact value
Last verified branch/commit: unverified

## 1. Exact Goal

State the user-visible outcome in plain language. Describe what the user should be able to do after this spec that they cannot reliably do now.

## 2. Current Behavior and Evidence

Document:

- exact reproduction steps
- visible result
- data/state result
- code path traced
- logs/screenshots/checks used
- evidence label: live verified, code verified, check verified, risk, or unknown

Do not start implementation from a visual guess.

## 3. Root Cause or Missing Foundation

For a bug, identify the proven broken link. For a feature, identify the missing capability/data contract. Separate facts from hypotheses.

## 4. Scope

List the smallest systems and behaviors this spec is authorized to change.

## 5. Non-Goals

List nearby systems, cleanup, redesigns, and future capabilities intentionally excluded.

## 6. Canonical User Flow

Number every user action from initial setup through final visible result, including save/reload/playback/export when relevant.

## 7. Execution Path

Trace event → component/handler → state/data mutation → render/persist/response. Link exact files and relevant functions/types.

## 8. Data, AI, Cost, Security, and Privacy Impact

Answer explicitly:

- schema/version/migration impact
- persistence/backward-compatibility impact
- AI task/model/prompt/reference impact
- live request/token/retry/search/cost limits
- authentication/ownership/rate-limit impact
- user data sent, stored, logged, or deleted

Write “none” only after tracing.

## 9. Touch Matrix

| System/file | Intended change | Why required | Protected behavior |
| --- | --- | --- | --- |
| Example | | | |

## 10. Implementation Plan

Use narrow steps. Each step should have a verification checkpoint. Structural refactors must be justified by an acceptance requirement, not taste.

## 11. Acceptance Criteria

Use observable pass/fail statements. Include:

- exact visible behavior
- exact state/data result
- error/empty/loading/disabled behavior
- persistence and reload when relevant
- undo/redo/rollback when relevant
- performance/cost bounds when relevant

## 12. Regression Matrix

| ID | Protected flow | Why at risk | Required proof |
| --- | --- | --- | --- |
| REG-01 | | | |

Name systems intentionally not retested and explain why they are outside the execution path.

## 13. Verification Plan

Record exact commands, fixtures, browser storage setup, viewport, server/environment, external-call policy, and proof artifacts.

Separate:

- fast deterministic checks
- focused real-app flow
- full build/E2E gates
- opt-in live external integration

## 14. Implementation Record

Complete during work:

- files changed
- key decisions/deviations
- temporary logs/probes added and removed
- migrations/config changes
- actual cost/external calls, if any

## 15. Verification Record

Complete after patching:

| Gate/flow | Pass/fail/skipped/unproven | Evidence |
| --- | --- | --- |
| | | |

## 16. Final State and Handoff

Record:

- final status
- what is proven done
- what is not proven or not fixed
- remaining risks/watchouts
- exact next step
- control-plane files updated
- final git status
