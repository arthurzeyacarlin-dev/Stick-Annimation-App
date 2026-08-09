# Verification and Regression Workflow

Status: canonical proof standard and current gate baseline
Last updated: 2026-08-09

## Core Rule

A successful compile is necessary but never sufficient. Every implementation task must prove:

- the exact triggering flow
- the real execution path
- the expected state and visible result
- persistence/reload behavior when relevant
- all protected unrelated flows named in the active spec
- no new browser console errors or warnings
- the exact checks that passed, failed, were skipped, or remain unproven

## Preflight

Before editing:

```bash
git status --short --branch
git diff --check
git diff --cached --check
```

Record pre-existing failures rather than hiding them. If the index is already dirty, do not run helpers that stage or commit.

At the initial 2026-08-09 snapshot, both diff checks already fail on pre-existing
trailing whitespace in `app/page.tsx`:

- unstaged copy: lines 639 and 659
- staged copy: lines 15, 59, 465, and 1179

Those failures are baseline debt, not proof that a later task caused a regression.
Future tasks must still compare the output and must not add new failing paths or
lines. Do not clean these lines incidentally unless the active spec includes that
source change and reconciles the mixed staged/unstaged file first.

Read `AGENTS.md`, the canonical control-plane files, the active spec, and the relevant source path. Reproduce the issue before patching when safe.

## Current Offline Commands

These commands exist today:

```bash
./node_modules/.bin/tsc --noEmit --incremental false
npm run lint
node --experimental-strip-types scripts/validateDrawingAiControlPreferences.ts
node --experimental-strip-types scripts/validateDrawingProjectAiMemory.ts
node --experimental-strip-types scripts/validateDrawingProjectAiMemoryRouteSafety.ts
node --experimental-strip-types scripts/validateTimelinePlaybackSmoothing.ts
```

`package.json` does not yet expose `typecheck`, `test`, `check`, or E2E scripts. Adding them is QLT-003, not something future tasks should assume already exists.

## 2026-08-09 Known Baseline

| Gate | Baseline result | Notes |
| --- | --- | --- |
| TypeScript | Pass | `tsc --noEmit --incremental false` |
| ESLint | Fail | 6 errors, 73 warnings |
| Four offline validators above | Pass | Node emits module-type warnings for TypeScript scripts |
| Production build | Unproven | Existing `.next` build output predates current source |
| Browser smoke | Manual pass for shell/new/drawing/stick/creator mounting | No automated suite |
| Unit/integration/E2E framework | Absent | Bespoke scripts only |
| CI/pre-commit | Absent | No workflow or hooks |

Known lint errors:

- `scripts/validateDrawingProjectAiMemoryRouteSafety.ts`: helper name `useFetchMock` is falsely classified as a React hook at three call sites.
- `src/components/open-project/OpenProjectBrowser.tsx`: synchronous state update inside an effect.
- `src/lib/ai/drawingFrameExecutor.ts`: two `prefer-const` errors.

Known validator-harness failures:

- `scripts/traceGenerateSoundsLivePath.mjs`
- `scripts/validateDrawingAiTaskShutdown.mjs`
- `scripts/validateGenerateSoundsDisabled.mjs`

They fail during private TypeScript compilation because their NodeNext flags disagree with repository imports/types. Compilation happens before cleanup, so failure can leave temp directories. The shutdown validator also contains a stale expectation that Generate Frames is disabled, contradicting current availability code.

## Verification Tiers

### Tier 1 — Fast deterministic checks

Run on every code change:

- diff whitespace checks
- TypeScript
- ESLint
- focused pure/offline validators for the touched subsystem

No network, database, live server, browser, or paid model call should be required.

### Tier 2 — Focused real-app flow

For visible/editor behavior:

1. Start or reuse the local app.
2. Hard reload after code/build changes when hot reload is uncertain.
3. Follow the exact user action sequence in the active spec.
4. Inspect the visible result and relevant internal state/logs.
5. Re-run the sequence after the patch.
6. Run every protected neighboring flow.
7. Inspect browser warnings/errors.

Exploratory browser artifacts created under `.playwright-cli/` triggered Next dev refreshes during the initial audit and invalidated element references. Prefer non-writing in-app browser inspection for exploratory checks, or deliberately isolate artifacts from watched source paths and re-snapshot after a refresh. `.playwright-cli/` is ignored by Git but may still be watched by the dev server.

### Tier 3 — Production build and automated browser suite

Required before a releasable milestone:

- clean dependency install in a reproducible environment
- production build from current source
- offline integration suite with mocked OpenAI/Supabase
- automated browser smoke/regression suite
- schema migration verification against a local or dedicated test database

This tier is not currently implemented.

### Tier 4 — Live external integration

Live OpenAI, Supabase, search, seed, billing, and deployment checks are opt-in only.

Before running them, the active spec must state:

- endpoint/environment and credential source
- whether data will be written or deleted
- maximum request count, tokens, retries, and estimated cost
- safe test project/user isolation
- cleanup and retention behavior
- exact user authorization for the external side effect

Never include live paid tests in the default gate.

## Baseline Browser Smoke Matrix

The first automated suite should cover at minimum:

| ID | Flow | Required assertion |
| --- | --- | --- |
| SMOKE-HOME-01 | Load `/` with welcome state controlled | Diamond Animator shell and home actions render; no console error |
| SMOKE-NEW-01 | Home → New Project → Back | Both workspace choices render and Back returns home |
| SMOKE-DRAW-01 | New Project → Drawing Animation | menus, timeline, canvas/tool controls, right panel, and AI input mount |
| SMOKE-DRAW-AI-01 | Open task menu → select Generate Frames | selected task changes without issuing an API request |
| SMOKE-STICK-01 | New Project → Stick Figure Animation | stick workspace, timeline, tools panel, canvas, and AI panel mount |
| SMOKE-STICK-CREATOR-01 | Stick Figure Tools → Create New Stick Figure → Back | creator mounts, Save remains disabled until specified, Back returns safely |
| SMOKE-OPEN-01 | Open Project with controlled localStorage fixtures | drawing cards list/open without touching real user projects |

Use isolated browser storage for automated tests. Do not delete or mutate the user's real local projects.

## Spec-Level Regression Matrix

Every active spec must name:

- exact original flow
- expected visible and data-state result
- browser/storage/environment setup
- focused automated or deterministic checks
- at least three likely neighboring regressions when the change crosses a shared system
- untouched systems that should not need broad testing
- proof artifacts and last verified date

If a required gate is unavailable, the final PM packet must say “unproven,” not imply coverage.

## Completion Evidence

The final PM Review Packet records:

- root cause and exact fix
- files and systems touched
- files and systems intentionally untouched
- commands and real-app flows run
- passed, failed, skipped, and unproven gates
- regression results
- remaining risks
- cleanup of temporary logs/probes/hooks
- final git status
