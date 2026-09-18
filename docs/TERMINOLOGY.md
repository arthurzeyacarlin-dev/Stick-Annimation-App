# Terminology

Status: canonical vocabulary
Last updated: 2026-09-18

## Product and Workspaces

| Canonical term | Meaning | Notes |
| --- | --- | --- |
| Diamond Animator | Current canonical product name | “Diamond Animator Pro” appears in older copy; final brand is pending. |
| Animation Workspace | The one ordinary editor for drawing, symbol, asset and timeline content | Established by SPEC-0006. SPEC-0007 Phase 3 retired active structured-rig authoring; do not reintroduce separate Drawing/Stick workspace ownership. |
| Drawing tools | Raster/text authoring controls inside the Animation Workspace | Stable AI compatibility contract ID remains `drawing`; this is not a separate workspace. |
| Draw Rig | Exact visible label for the Properties toggle that turns an active freehand tool into ordinary straight-ish segmented raster drawing | Published by SPEC-0007 Phase 2. It creates no rig object, joint, limb, bone, ID, topology, constraint, or attachment. Proposed SPEC-0008 cannot reinterpret it as a tracked skeleton. |
| Stick Figure Tools / Rig Tools | Historical labels for retired active structured-rig editing | Both active authoring surfaces were removed by SPEC-0007 Phase 3. Neither is a current product surface. |
| Add Limb / Add Segment | Historical controls/labels for creating structured graph edges | Read-only compatibility vocabulary only; Draw Rig is unrelated raster painting. |
| Stick Figure Creator / Rig Builder | Historical labels for retired structured-rig creation | Active workspace is retired. A read-only compatibility renderer may remain only behind legacy migration. |
| Legacy standalone Stick Figure Workspace | Historical/source-test coordinator not mounted by the ordinary product | Never resurrect it as a second owner. |
| Stick Nodes | A third-party competitor/product name | Do not use it as Diamond Animator's generic category or copy its protected identity. |

## AI Product Layers

| Term | Meaning |
| --- | --- |
| AI Animation System | Umbrella product capability spanning conversational planning and animation actions |
| AI Animator Engine | Historical design term for in-workspace AI productivity/execution; do not assume older files using it describe the current code contract |
| Workspace AI panel | The current right-panel chat/task UI in a workspace |
| Generate Plans | Task for animation/scene planning; code exists, execution currently disabled |
| Generate Frames | Current enabled drawing task that plans and procedurally renders timeline frames |
| Generate Sounds | Sound task; code exists, execution and sound flags currently disabled |
| Other | General workspace-action task; code exists, execution currently disabled |
| AI Assistant | Intended general help/navigation surface; not synonymous with the enabled Generate Frames engine |
| AI Project Finalizer | Intended post-project polish/product surface; current home card is not a working flow |
| Engine command | Structured AI contract instruction intended for a workspace executor; contract presence does not prove an executor exists |
| Action plan | Structured response requesting a workspace-side action, execution mode, and payload; only a small drawing subset is currently implemented |
| Prompt/reference example | Hand-authored example selected and inserted into model context |
| Training example | Avoid for current assets unless explicitly qualified as a filename or future dataset candidate |
| Custom Diamond Animator model | Future fine-tuned/trained model with a real data, evaluation, deployment, and safety pipeline; does not exist today |
| Terra brain | Proposed SPEC-0008's sole conversational intent/planning model: exact `gpt-5.6-terra` through the Responses API | Not implemented yet; it is not a video generator and has no fallback model. |
| Reasoning level | Proposed visible Low/Medium/High/Extra High control mapped to `low`/`medium`/`high`/`xhigh` | Medium defaults on every new/open workspace; `none` and `max` are outside the product control. |
| AI job | Persistent server-owned record and ordered event stream for one conversational/build/edit request | Retry creates a new linked job; completed, failed and cancelled are terminal. |
| Reference video | Temporary generated or user-uploaded video used only for visual/timing reconstruction | It is an isolated artifact, not canonical project content or final export. |
| Cucumber slicer | Proposed deterministic media decoder/sampler that creates an ordered timing/shot-bound frame bundle | Product metaphor only; it is not a model or mutation owner. |
| Editable reconstruction | Honest ordinary drawing-content approximation derived from a validated frame bundle | Not recovered source art, semantic truth, exact vectorization or a structured rig. |
| YouTube-ready video | Proposed inspected downloadable video in the format selected by the Phase 6 same-day YouTube-ingest/encoder gate | Does not mean direct YouTube OAuth/account upload. |

## Animation and Timeline

| Term | Meaning |
| --- | --- |
| Neutral layer | A named visible/locked container of cells, with no content kind |
| Content item | A typed raster/text/symbol-instance/asset-instance object inside one neutral owner cell; multiple kinds coexist | Historical structured-rig input is migrated before ordinary mount and is not new authored content. |
| Symbol instance | A separately transformed reference to a project-owned definition | Current instances point to Drawing or drawing-only Mixed definitions. |
| Drawing Symbol | Reusable project-created Drawing definition in Library | Not an external Asset. |
| Rig Symbol / Stick Figure Symbol | Historical structured-rig-backed reusable definition | No active rig-symbol lifecycle exists. Supported definitions migrate to Drawing Symbols or drawing-only Mixed Symbols. |
| Mixed Symbol | Reusable project-created definition containing more than one supported ordinary drawing/text/still content kind | Current structured-rig payload is historical compatibility input and must be rasterized during Phase 3 migration. |
| Library | Project-local reusable Drawing and drawing-only Mixed Symbol definitions | Separate from external Assets. Historical rig-backed entries migrate before ordinary mount. |
| Assets | Project-local catalog of imported supported external still media | SPEC-0007 Phase 4 is published. Proposed SPEC-0008 reference video/frame bundles remain isolated artifacts until reconstruction Apply creates only supported ordinary project content. |
| Timeline position | An indexed time slot in one layer's timeline |
| Timeline cell | The metadata at a timeline position, classified as empty, keyframe, blank keyframe, hold, or tween |
| Authored frame | Content/state owned for animation at a timeline position; not every displayed timeline position owns one independently |
| Frame | Context-dependent shorthand; use timeline position, timeline cell, authored frame, or rendered playback frame when ownership matters |
| Keyframe | A timeline cell that owns explicit content/state |
| Blank keyframe | An explicit keyframe with no inherited visible content |
| Hold/span | Timeline positions that continue an owner keyframe's content |
| Tween | Generated/interpolated state between owned endpoints; schemas are subsystem-specific, and no canonical stick-tween schema exists yet |
| Owner keyframe | The keyframe that stores authoritative span/tween data |
| Motion tween | Current drawing V1 whole-bitmap position interpolation; legacy V1 intent is provisionally promoted pending current verification/owner confirmation |
| Tween endpoint | Explicit start or end state used to produce motion |
| Pose | Historical rig/joint state for a stick figure at a point in time | Read-only compatibility input may contain it; there is no new active pose schema. |
| Structured rig | Historical compatibility item containing connected joints/limbs and related rig state | SPEC-0007 Phase 3 migrates it to ordinary raster drawing and retains only read-only compatibility adapters. |
| Draw Rig segment | One straight-ish portion of an ordinary raster stroke emitted by the Draw Rig accumulator | It is not an item, object, bone, graph edge, or selectable topology. |
| Raster-paint coverage companion | Bounded internal provenance used to apply same-paint per-pixel maximum coverage across gestures and Save/Open | Not a vector stroke, rig, hidden editable item, or user-facing object. |
| Destructive command | A runtime-registered explicit user action whose purpose is removal and whose exact target/reference/confirmation behavior is audited | Current set is enumerated in SPEC-0007 §1.1. Painting/Fill/transform are targeted mutations, not delete commands. |

## Memory

| Term | Meaning |
| --- | --- |
| Repository control plane | Files under `docs/` plus the `AGENTS.md` bootloader that preserve development continuity |
| Animation-project AI memory | Runtime semantic memory for one user's animation project, optionally synced to Supabase |
| Chat history | Messages in the current AI panel session; not equivalent to repository or durable project memory |

## Evidence and Status

| Label | Meaning |
| --- | --- |
| Live verified | Observed in the real running app in a dated flow |
| Code verified | Directly traced in current source |
| Check verified | Proven by a named deterministic command |
| Intended | Approved direction not yet proven in the app |
| Risk | Evidence-backed concern requiring dedicated reproduction |
| Unknown | Not inspected or not safely testable in the current pass |
| Partial | Some real behavior exists, but the promised end-to-end flow is incomplete |
| Disabled | Code/UI may exist, but execution is intentionally blocked |
| Placeholder | Visible surface that intentionally does not provide the advertised product capability yet |
