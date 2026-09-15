# Terminology

Status: canonical vocabulary
Last updated: 2026-09-15

## Product and Workspaces

| Canonical term | Meaning | Notes |
| --- | --- | --- |
| Diamond Animator | Current canonical product name | “Diamond Animator Pro” appears in older copy; final brand is pending. |
| Animation Workspace | The one ordinary editor for drawing, symbol, asset and timeline content | Established by SPEC-0006. Current structured-rig compatibility remains runtime truth until D-0074 Phase 3; do not reintroduce separate Drawing/Stick workspace ownership. |
| Drawing tools | Raster/text authoring controls inside the Animation Workspace | Stable AI compatibility contract ID remains `drawing`; this is not a separate workspace. |
| Draw Rig | D-0074's exact visible label for the future Properties toggle that turns an active freehand tool into ordinary straight-ish segmented raster drawing | It creates no rig object, joint, limb, bone, ID, topology, constraint, or attachment. Off is ordinary freehand. Smoothing zero never enables it silently. Phase 2 is unauthorized. |
| Stick Figure Tools / Rig Tools | Current runtime label / superseded planned label for active structured-rig editing | Both active authoring surfaces are removed in D-0074 Phase 3 after safe migration. Neither is the future product name. |
| Add Limb / Add Segment | Current runtime control / superseded planned label for creating structured graph edges | Historical compatibility vocabulary only after Phase 3; Draw Rig is unrelated raster painting. |
| Stick Figure Creator / Rig Builder | Current runtime workspace / superseded planned name for structured-rig creation | Entire active workspace is retired in Phase 3. A read-only compatibility renderer may remain only behind legacy migration. |
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

## Animation and Timeline

| Term | Meaning |
| --- | --- |
| Neutral layer | A named visible/locked container of cells, with no content kind |
| Content item | A typed raster/text/symbol-instance/asset-instance object inside one neutral owner cell; multiple kinds coexist | Current published V2 additionally supports structured-rig items until D-0074 Phase 3 migration. |
| Symbol instance | A separately transformed reference to a project-owned definition | Current SPEC-0006 instances persist. D-0074 migrates rig-backed definitions to drawing-only definitions rather than extending rig symbols. |
| Drawing Symbol | Reusable project-created Drawing definition in Library | Not an external Asset. |
| Rig Symbol / Stick Figure Symbol | Current/historical structured-rig-backed reusable definition | No active rig-symbol lifecycle exists after D-0074 Phase 3. Supported definitions migrate to Drawing Symbols or drawing-only Mixed Symbols. |
| Mixed Symbol | Reusable project-created definition containing more than one supported ordinary drawing/text/still content kind | Current structured-rig payload is historical compatibility input and must be rasterized during Phase 3 migration. |
| Library | Project-local reusable Drawing and drawing-only Mixed Symbol definitions | Separate from external Assets. Current rig-backed entries remain runtime truth only until migration. |
| Assets | Project-local catalog of imported supported external still media | SPEC-0007 approves static PNG/JPEG/WebP only in Phase 4; that phase remains unauthorized and no video-to-animation behavior is included. |
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
| Pose | Historical rig/joint state for a stick figure at a point in time | Published/current compatibility data may contain it; D-0074 adds no new active pose schema. |
| Structured rig | Historical/current compatibility item containing connected joints/limbs and related rig state | Published SPEC-0006 runtime still supports it. D-0074 Phase 3 migrates it to ordinary raster drawing and retains only read-only compatibility adapters. |
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
