# Frozen Repository Audit — 2026-08-09

Status: frozen pre-control-plane baseline; corrections only
Repository: `/Users/arthurcarlin/Projects/stick-animation-app`
Branch/HEAD: `rescue-before-restore` at `1691afb`
Audit purpose: establish the first durable, evidence-backed snapshot after a long period of cross-session regression and missing repository memory

## 1. Scope and Method

The audit covered:

- Git status, history, branches, reflog, stashes, worktrees, tags, and unreachable objects
- all non-generated repository paths and top-level generated/artifact areas
- Next.js entry points and live main-screen navigation
- drawing workspace, canvas, timeline, history, playback, tween, persistence, export, and AI-apply paths
- stick workspace, timeline, canvas, tools, and creator paths
- AI contracts, prompts, reference examples, runtime, renderer, model client, cost dashboard, task availability, and project memory
- Supabase clients, migrations, environment key names, and route safety
- existing docs/control-plane attempts, paste pack, build book, and market-research workbooks
- package scripts, TypeScript, ESLint, validators, browser tooling, and production-build evidence

Generated dependency/build directories were inventoried but not read file-by-file. Secret values were not recorded; only required environment key names were identified.

No application source, database, dependency, Git index, commit, remote, or deployment was changed during the audit phase.

## 2. Repository Inventory

Pre-control-plane counts:

| Measure | Count |
| --- | ---: |
| Git-tracked files | 18 |
| Non-ignored untracked files | 272 |
| Low-noise files after excluding `.git`, `node_modules`, `.next`, `.playwright-cli`, `.local`, `output`, and Supabase temp metadata | 169 |
| TS/TSX/MJS/SH/SQL files under `app`, `src`, `scripts`, and `supabase` | 85 |
| Lines across those 85 files | 109,443 |

Code file counts by area:

- `app`: 10
- `src`: 53
- `scripts`: 21
- `supabase/migrations`: 1

### Top-Level Areas

| Path | Audit classification |
| --- | --- |
| `.env.local` | Ignored local credentials/config; four required key names; values not recorded |
| `.local/ai-cost-dashboard` | Generated local AI-cost logs/data |
| `.next/` | Generated Next build/dev state; last production output predates current source |
| `.playwright-cli/` | Ad hoc browser snapshots, logs, screenshots; was unignored |
| `app/` | Next app shell, pages, API routes, dev cost dashboards, stick rig helper |
| `src/components/` | Home chrome, open-project browser, drawing and stick workspaces |
| `src/lib/ai/` | Contracts, prompts, task examples, planning, rendering, synthesis, memory, cost logging |
| `src/lib/openai/` | OpenAI client and Responses API wrapper |
| `src/lib/drawingProjectStorage.ts` | Browser-local drawing project persistence |
| `diamond-animator-docs/` | Mixed reference/design docs, templates, build book, one mature motion-tween spec |
| `docs/` | Stale initial control-plane attempt centered on a past UI-alignment milestone |
| `scripts/` | Validators, trace tools, seed helper, and old docs maintenance helpers |
| `supabase/` | One migration plus unignored CLI link temp metadata |
| `project/project_structure.txt` | Stale March tree; included `.env.local`, omitted current work, listed deleted source |
| `output/` | Browser/test artifacts; was unignored |

## 3. Git and Recovery Posture

History contained only two scaffold-era commits:

```text
1691afb Initial commit
99d23aa Initial commit from Create Next App
```

`rescue-before-restore`, `main`, and `origin/main` all pointed to `1691afb`.

Tracked dirty state before the control-plane task:

- modified: `.gitignore`
- modified: `app/globals.css`
- modified: `app/layout.tsx`
- staged and modified again: `app/page.tsx` (`MM`)
- modified: `package-lock.json`
- modified: `package.json`
- deleted: `src/lib/supabaseClient.ts`
- modified: `tsconfig.json`

Nearly all workspace, AI, API, docs, script, and migration implementation was untracked.

Recovery search found:

- no stash
- no tag
- no extra worktree
- no hidden/dangling commit
- no branch carrying the implementation
- reflog limited to scaffold commits and branch creation
- 1,430 unreachable blobs and 2,830 unreachable trees, but zero commits

Unreachable objects may contain fragments but are not durable history and can be garbage-collected.

### Critical Git Hazard

The old `scripts/sync_docs_to_github.sh` staged broad docs/scripts paths and could commit pre-existing staged files. With `app/page.tsx` already staged, its commit mode could have included an unrelated older app version.

The first operational priority after the control plane is to reconcile the mixed index and create a carefully reviewed baseline. This audit did not stage or commit.

## 4. Application Entry and Visible Product Surface

`app/page.tsx` is a client component that switches screens through local React `view` state:

- home
- open project
- new project
- drawing workspace
- stick figure workspace
- stick figure creator workspace

The main product surfaces are not URL-routed. URL pages include `/credits` and local `/dev/ai-costs` dashboards.

### Live Browser Baseline

Run against the existing local server at `http://127.0.0.1:3000`:

1. Home rendered Diamond Animator chrome, welcome dialog, New/Open/My Project, Tutorials, AI Assistant, Export, AI Project Finalizer, AI Credits, and menu surfaces.
2. New Project rendered Drawing Animation and Stick Figure Animation choices plus Back.
3. Drawing Animation mounted the drawing workspace with menus, timeline/FPS/play controls, right panel, AI controls, and manual drawing toolbar.
4. The AI task menu defaulted to Generate Plans; Generate Frames could be selected and the chat input remained enabled.
5. Stick Figure Animation mounted its timeline/editor shell and placeholder toolbar.
6. Stick Figure Tools exposed Create New Stick Figure and some limb-building UI.
7. The creator mounted, but Save was disabled.
8. No browser warnings/errors were captured during those mounting/navigation flows.

Several home cards had no action handler in `app/page.tsx`; visible presence does not mean a working product flow.

## 5. Drawing Workspace Snapshot

The drawing path is substantial and highly coupled.

Observed code capabilities:

- brush, eraser, fill, text, shape, knife, select, and lasso tools
- imported assets and reusable symbol/session concepts
- layered imperative canvases, pan/zoom, transforms, selection sessions
- frame/keyframe/blank/hold/tween timeline cells
- add/remove/rename/reorder layer logic and frame copy/paste/delete operations
- undo/redo/history spanning bitmap patches, metadata, and timeline structure
- FPS/play/pause/loop timing helpers and onion skinning
- position-only bitmap motion tween
- sound attachments and playback
- manual drawing project save/open/rename/duplicate/delete through localStorage
- AI-generated frame insertion into the real drawing timeline

### High Coupling

Largest audited files:

| File | Lines |
| --- | ---: |
| `src/lib/ai/generateFramesRuntime.ts` | 15,269 |
| `src/components/workspace/DrawingCanvas.tsx` | 10,262 |
| `src/lib/ai/plansTraining.ts` | 9,650 |
| `src/components/workspace/DrawingWorkspace.tsx` | 8,629 |
| `src/lib/ai/drawingFrameExecutor.ts` | 6,458 |
| `app/api/ai/route.ts` | 6,174 |
| `src/lib/ai/drawingAiPrompting.ts` | 6,160 |

The workspace combines React state with many mirrored refs for pointer events, RAF playback, async setters, history, save/load, and AI application. Structural edits in these areas carry high regression risk.

### Persistence Reality

Drawing projects are serialized to one localStorage key: `da_saved_drawing_projects`.

The version-1 envelope includes tool settings, FPS, layers, timeline frames, bitmaps/previews, text, position-tween data, optional sounds, selection, and AI memory. Nested validation is limited, and no schema migration mechanism exists.

Pointer-up “autosave” updates the current frame in memory. Durable project persistence still requires manual Save/Save As.

Static tracing identified fidelity risks around compact WebP previews, geometry restoration, localStorage quota handling, separate text/asset paths, and different edit/playback/export compositing. These were recorded as risks, not marked as reproduced bugs.

### Geometry/Performance Risk

Canvas dimensions derive from the host viewport and device-pixel ratio. The authoring world scale is 4.6, multiplied across several canvases and history/tween snapshots. There is no canonical project resolution.

This architecture creates evidence-backed memory, resize, persistence, AI-placement, and export risk. Dedicated reproduction/spec work is required before repair.

### Export Reality

- the home Export card was not wired
- no production animation export path exists
- code can download the current raster frame as PNG through an AI workspace action
- the Other task needed for broad action inference is disabled
- no GIF, WebM, MP4, image-sequence, sprite-sheet, or native project-file import/export flow was found

## 6. Motion Tween

Current V1 drawing motion tween is whole-bitmap X/Y translation with an owner-frame `motionTween` payload and explicit endpoint data.

`diamond-animator-docs/02_animation_engine/MOTION_TWEEN_SYSTEM.md` is the only existing document that contained implementation-grade scope, data model, behavior, debug order, and acceptance cases. It was preserved as provisionally promoted legacy intent pending owner confirmation and current acceptance.

The full motion-tween acceptance suite was not rerun during this audit.

## 7. Stick Figure Snapshot

The stick workspace is an editor scaffold rather than a complete animation system.

Code/UI present:

- stick-specific top/right/tool panels
- timeline metadata and playback index changes
- a live structure graph and canvas
- some limb-creation behavior
- entry into a separate creator
- creator controls for drawing/selecting/sizing/resetting a local rig

Missing/incomplete:

- independent pose/graph data per timeline frame
- real frame-to-frame pose playback
- save/open/project persistence
- undo/redo
- creator Save and library connection
- export
- an approved canonical rig/pose/tween/history schema

The drawing and stick timelines duplicate structural behavior and can drift.

## 8. AI System and Prompt Assets

### Current Architecture

The app calls the OpenAI Responses API, but Generate Frames is hybrid: deterministic analysis can return clarification, a controlled failure, or an eligible direct plan before a model call, while requests on the structured branch use model generation/recovery. Resulting plans are rendered locally with deterministic Canvas2D code and a code-defined visual vocabulary.

Current model IDs in source:

- strong: `gpt-5.4`
- balanced: `gpt-5.3-chat-latest`
- economy: `gpt-5.2`

### Task Availability

| Task | Execution state |
| --- | --- |
| Generate Plans | Temporarily disabled |
| Generate Frames | Enabled |
| Generate Sounds | Temporarily disabled; both sound flags false |
| Other | Temporarily disabled |

UI preferences default to Generate Plans, creating an enabled-state mismatch on first use.

### Reference Assets

- Generate Plans v10: 63 examples, 41 active positive and 22 inactive negative
- Generate Frames v2: 68 examples, 47 positive and 21 negative
- older `framesTraining.ts` v1: 24 examples, no importer found
- Generate Sounds v4: 82 examples plus 6 intent examples
- Other v4: 20 examples plus 17 routing examples
- two DREAM-100 workbooks: each has 105 non-empty worksheet rows (1 header plus 104 research entries); normalized non-empty cell content matched; neither is imported by code; entries lacked recorded sources

These are prompt/reference examples and market research, not a custom LLM training pipeline.

### Project Memory

Runtime Drawing AI memory holds semantic context for one animation project and can sync to Supabase. It is distinct from repository development memory.

The memory API's required `drawing_project_ai_memory` schema existed only as a code comment, not a migration.

### Cost Visibility

Local cost logging and dashboards existed, along with three model profiles and complexity routing. No approved target cost, latency, retry, token, search, retention, or credit policy existed.

## 9. Backend, Environment, and Deployment

Required environment key names found:

- `OPENAI_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

No `.env.example` existed before the control-plane task.

Supabase state:

- only `create_plans_training_table.sql` migration existed
- no `supabase/config.toml`
- CLI link temp metadata was unignored
- plans seed script performs a remote service-role upsert and is not a safe default verification step

Security blockers found by source inspection:

- `/api/ai` had no in-repo authentication or rate limiting
- project-memory GET/POST/DELETE used a service-role client and caller-provided project IDs without authentication/ownership enforcement

Public deployment was therefore classified as blocked.

## 10. Documentation Audit

Two overlapping documentation systems existed:

1. `docs/`: short March UI-alignment files claiming Drawing complete, Stick visually complete, and AI/animation unbuilt.
2. `diamond-animator-docs/`: a memory map pointing to six zero-byte core files, thin design notes, operational templates, narrative build-book files, and the detailed motion-tween spec.

Additional issues:

- `docs/changelog.md` was empty
- operational Current State/TODO/Changelog/Session Log files were prose templates, not records
- `README.md` was Create Next App boilerplate
- `docs/SKILL.md` duplicated agent rules but was not an installed/discoverable skill
- AI docs omitted the actual contract, enabled matrix, model routing, renderer, memory, cost, and validation architecture
- paste-pack content was stored under `src/components/workspace` as a manual copy/paste staging artifact
- old maintenance scripts omitted key docs and created Git staging hazards

This evidence drove the decision to make `docs/` canonical and `AGENTS.md` the bootloader rather than add a third tree.

## 11. Toolchain and Verification Baseline

Observed local versions:

- Node 24.13.1
- npm 11.8.0

Package scripts before the control plane:

- `dev`
- `build`
- `start`
- `lint`
- `seed:generate-plans-training`

Missing:

- supported runtime pin (`engines`, `.nvmrc`, `.node-version`, or `packageManager`)
- `typecheck`, `test`, `check`, and E2E scripts
- conventional test framework/configuration
- CI and pre-commit gates
- EditorConfig/formatter policy

### Commands Run

Passed:

```text
./node_modules/.bin/tsc --noEmit --incremental false
node --experimental-strip-types scripts/validateDrawingAiControlPreferences.ts
node --experimental-strip-types scripts/validateDrawingProjectAiMemory.ts
node --experimental-strip-types scripts/validateDrawingProjectAiMemoryRouteSafety.ts
node --experimental-strip-types scripts/validateTimelinePlaybackSmoothing.ts
```

Failed:

```text
npm run lint
```

Result: 6 errors and 73 warnings.

Errors included three false React-hook classifications for `useFetchMock`, one state-in-effect error in OpenProjectBrowser, and two `prefer-const` errors in the frame executor.

Three sound/shutdown validator harnesses failed before assertions because their private NodeNext TypeScript flags rejected current imports/types. Their compile step preceded cleanup, leaving possible temp directories. One shutdown assertion was also logically stale because it expected Generate Frames to be disabled.

The production build was not rerun. Existing `.next` production output was dated 2026-04-23 and could not prove August source.

## 12. Proven Versus Unproven

Proven in this audit:

- repository/Git/documentation/tooling inventory
- TypeScript and named validator results
- task availability flags and default mismatch
- main code execution paths by source tracing
- live mounting/navigation flows listed above
- creator Save disabled
- lack of migrations/auth/rate/ownership controls in repository source

Not proven:

- full drawing gesture correctness
- save/reopen visual fidelity
- motion-tween acceptance behavior
- export download correctness/fidelity
- real AI response quality or cost
- live Supabase behavior or schema state
- sound generation/playback
- responsive/accessibility behavior
- production build/deployment
- each statically identified canvas/persistence risk as a reproduced user bug

## 13. Recommended Next Order

1. Establish and validate the canonical control plane.
2. Reconcile `app/page.tsx` staged versus working versions without losing either.
3. Review ignored/generated boundaries and create a durable baseline commit/archive.
4. Approve the first spec, preferably quality/regression harness foundations.
5. Resolve deterministic lint/validator gates.
6. Decide launch scope and measurable quality definition.
7. Specify stable document/persistence foundations and stick rig/pose/frame models before broad feature expansion.

This audit is historical evidence. Rolling truth belongs in `../CURRENT_STATE.md`.
