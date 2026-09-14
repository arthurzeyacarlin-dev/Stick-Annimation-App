# Terminology

Status: canonical vocabulary
Last updated: 2026-09-14

## Product and Workspaces

| Canonical term | Meaning | Notes |
| --- | --- | --- |
| Diamond Animator | Current canonical product name | “Diamond Animator Pro” appears in older copy; final brand is pending. |
| Animation Workspace | The one ordinary editor for Drawing, rig, symbol, asset and timeline content | Established by SPEC-0006. Do not reintroduce separate Drawing/Stick workspace ownership. |
| Drawing tools | Raster/text authoring controls inside the Animation Workspace | Stable AI compatibility contract ID remains `drawing`; this is not a separate workspace. |
| Rig Tools | Approved SPEC-0007 user-facing name for the rig/pose controls tab | Current runtime still says “Stick Figure Tools” until a future authorized Phase 2 implementation. Stable compatibility IDs may remain `stick-figure`. |
| Add Segment | Approved SPEC-0007 user-facing name for adding one connection between joints | Current runtime still says “Add Limb”; internal `limbs` names remain compatibility terms unless narrowly migrated. |
| Rig Builder | Approved SPEC-0007 user-facing name for the embedded rig-definition editor | Current runtime still says “Stick Figure Creator”; Save is disabled/local-only until a future authorized Phase 5 implementation. Not “Creator Hub.” |
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
| Content item | A typed raster/text/symbol-instance/structured-rig object inside one neutral owner cell; multiple kinds coexist |
| Symbol instance | A separately transformed reference to a project-owned definition | Current SPEC-0006 instances persist. SPEC-0007 approves controlled linked-definition update/Make Unique for Rig Symbols in a later phase; that phase remains unauthorized. |
| Drawing Symbol | Reusable project-created Drawing definition in Library | Not an external Asset. |
| Rig Symbol | Approved SPEC-0007 user-facing name for a reusable project-created structured rig definition in Library | Current persisted compatibility category is “Stick Figure Symbol.” |
| Mixed Symbol | Reusable project-created Drawing + structured-rig definition in Library | Current persisted compatibility category is “Drawing and Stick Figure Symbol.” |
| Library | Project-local reusable Drawing, Rig and Mixed Symbol definitions | Separate from external Assets. |
| Assets | Project-local catalog of imported supported external still media | SPEC-0007 approves static PNG/JPEG/WebP only in Phase 6; that phase remains unauthorized and no video-to-animation behavior is included. |
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
| Pose | Rig/joint state for a stick figure at a point in time; canonical schema not yet approved |
| Rig | Connected joints and segments plus versioned appearance/joint attachments inside one structured rig item | SPEC-0006 provides the current graph; SPEC-0007 proposes the additive extension and complete manual tools. |
| Segment | User-facing connection between two rig joints | Current compatibility source/type fields may still call this a limb. |
| Joint attachment | Approved SPEC-0007 structured circle/square/triangle owned by a rig joint | Centered on and moves with the joint; it is not raster paint. |

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
