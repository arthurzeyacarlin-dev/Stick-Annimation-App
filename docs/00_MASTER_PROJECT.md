# Diamond Animator Master Project Charter

Status: canonical product intent
Last updated: 2026-09-26

## Product Mission

Diamond Animator is intended to make professional-quality 2D character animation accessible to people who may have little or no animation experience. Stick-style characters remain a supported visual outcome, but ordinary authoring is drawing-based rather than an active structured-rig system.

The primary experience is AI-first: a user should be able to describe what they envision in natural language, and the AI engine should operate the same underlying animation capabilities available to a human editor. The product must also expose direct, advanced controls so experienced animators can inspect, adjust, and fine-tune the result.

The goal is not to hide a weak editor behind a chat box. The goal is one capable animation system with two interfaces:

- conversational creation and iteration
- direct professional editing

## Intended Users

- Beginners who want to create through conversation and guided choices
- Creators who want AI to accelerate repetitive animation work
- Experienced animators who need precise manual control and reversibility

## Core Product Principles

1. **Professional result quality**: output must be readable, intentional, temporally coherent, and exportable—not merely generated.
2. **Beginner accessibility**: the first useful result should not require mastery of animation software.
3. **Shared capability layer**: AI and human tools must act on the same project model rather than separate fake/demo paths.
4. **User control**: AI changes must be inspectable, undoable, and refinable.
5. **Continuity**: characters, poses, props, scene logic, timing, and project intent must survive multi-step iteration.
6. **Efficiency**: model selection, token use, retries, search, storage, and rendering should be measured against quality and latency.
7. **Regression safety**: a change is not complete until the triggering flow and protected unrelated flows are proven.
8. **Honest capability**: disabled, partial, placeholder, and experimental systems must be labeled as such.

## Current Strategic Position

All seven SPEC-0006 phases are Verified, published, and durably integrated through exact GIT-061 `185f58752c4f8dd4f5bfea0befe48998e5cd0f04`. D-0069 records Arthur's Phase 7 PASS and D-0070 records publication/D-0054 cleanup. The ordinary workspace mounts only the unified V2 editor; one V2 coordinator/history/repository owns authored state and Save/Save As/AI-triggered Save, while legacy parsers remain read-only import leaves.

D-0074's [`SPEC-0007 — Drawing-Only Manual Editor Completion and AI-Ready Tools`](specs/0007-manual-editor-completion-and-ai-ready-tools.md) is fully **Verified, published, integrated, recorded and cleaned up**. GIT-062 closes corrected Phase 1, GIT-063 closes Phase 2 Draw Rig, D-0079/D-0080/GIT-064 close Phase 3 Safe Legacy Rig Retirement and Migration, D-0081/D-0082/GIT-065 close Phase 4 Assets Stabilization, and D-0083/D-0084/GIT-066 `c193b8ba89fa55ead02d84ea10bb81f71b960f8a` close Phase 5 Final Manual Editor Bug Burn and Future-AI Command Registry.

D-0085 creates [`SPEC-0008 — Conversational AI Animator and Editable Video Reconstruction`](specs/0008-conversational-ai-animator.md), and D-0086/GIT-067 publishes its planning package. D-0087/GIT-068 approves it with Phase 1 only; D-0088 preserves/cleans the rejected first result and authorizes one correction; D-0089 accepts the corrected exact 19-path Terra-only one-chat/job foundation plus Arthur's narrow sidebar/timeline presentation corrections. D-0090 records exact GIT-070 `76708645c96b3b0ea95c524f162bb6152d539fcf` publication/integration, proof preservation and D-0054 cleanup. Phase 1 is fully closed. Current-main D-0091/GIT-072 preserves the later bounded web-research plan and D-0092/GIT-073 commit `42bfe1a2607a85a87d486e21d6e573b4e4084d5a` preserves the automatic-commit plan. D-0093 now pauses SPEC-0008 after Phase 1: Phases 2–6 remain **Paused; Unauthorized; Not started; not rejected**. Those later planning decisions remain historical material without dispatch authority. The reference-video architecture is under reconsideration; reusable editable motion/Blender assets remain unproven research rather than an approved replacement. No later AI Animator executor, live/paid provider use, asset purchase or replacement architecture may begin without Arthur's explicit resumption and fresh architecture/spec reconciliation.

D-0094 creates [`SPEC-0009 — Animation Export`](specs/0009-animation-export.md) as a separate three-phase local product plan: Choose and Watch; Create and Save Video; Social Destinations and Final Testing. GIT-074 publishes that planning package in `30f6f85e5c483c9df15946e7a451bf2a31374f2e`. D-0096/GIT-076 close Phase 1. D-0097 authorizes Phase 2, D-0098 records Arthur's acceptance, and D-0099 closes exact 29-path GIT-078 `682fd9732b9cc30e545b3b709ced62ffd94edc39` publication/integration, proof preservation and D-0054 cleanup. Phase 2 persists a project-owned default-white background, uses one shape-preserving centered renderer, and creates local 720p/1080p H.264 MP4 with AAC when audio exists through pinned Mediabunny `1.58.1`/MPL-2.0, Finder save, truthful progress/cancel/failure, zero-byte cleanup and post-write validation. D-0100 accepts and technically verifies Phase 3's local 14-choice destination catalog, Original unchanged-shape download, complete-animation contain framing, validated Custom / Other dimensions and final long/performance proof. D-0101/GIT-079 close the exact 24-path publication at `555d60b48ec97e066b1110d40638927d68c8d34b`, proof preservation and D-0054 cleanup. Export makes zero AI/provider/social-service calls; Terra code is unchanged. All three SPEC-0009 phases are fully closed.

D-0102 defines [`SPEC-0010 — Project Safety and Recovery`](specs/0010-project-safety-and-recovery.md) as the next beta-readiness foundation: Save and Exit; one separate local latest emergency recovery draft; and startup Recover Work / Discard Draft with final fault/regression proof. GIT-080 publishes the plan. D-0105/GIT-081 `44cdafc534d7ef096cd2e283532a956c4eaa91f6` close Phase 1. D-0106/D-0107/GIT-082 `7e7063eaab3c486278355559c490611e3ca590ea` close Phase 2. D-0108/D-0109/GIT-083 `da348337d9329044937b2d27cb76498b743e778f` close Phase 3 with startup gating, exact-generation single-winner recovery, detached-copy protection, confirmed discard, final regression proof, proof preservation and cleanup. All three SPEC-0010 phases are fully closed.

D-0110 defines [`SPEC-0011 — My Projects Library, Movie Viewer, and Shared Project Management`](specs/0011-my-projects-library-movie-viewer-and-shared-project-management.md) as the completed three-phase local project-library sequence. D-0113/GIT-084 fully close Phase 1, D-0115/D-0116/GIT-086 fully close Phase 2, and D-0118/D-0119/GIT-088 fully close Phase 3. GIT-088 is exact 28-path commit `d0ec1b23d7e1d9ff13a0779c2758e33e858691f0`, parent `b57ff995df9bb351dacb9a6a79b8cbd23203e988`, message `Complete SPEC-0011 Phase 3 shared project management`: 14 accepted technical paths plus 14 reviewed control-plane/tree paths. Immutable 46,868-byte manifest SHA-256 is `92ae122c227a36fd8a637b1922b1bca139224be4caf0e42d3a147f2a43147aaa`, source digest `05ee661120e7751658b9ea2e5269c7cc1cbc666645568af1db7b1ff1f08074d1`. Canonical `main`, `origin/main`, and live GitHub `main` synchronized cleanly; proof was preserved, PID 32270/port 57840 stopped, and D-0054 cleanup removed the obsolete Phase 3 review worktree and local publication branch. All three SPEC-0011 phases are Verified, published, integrated, synchronized, proof-preserved, and cleaned up. No AI/provider/paid, deployment, or paused SPEC-0008 work is included.

D-0120 creates [`SPEC-0012 — Diamond Animator Guidance Assistant`](specs/0012-diamond-animator-guidance-assistant.md); D-0121–D-0134/GIT-089–GIT-096 complete all six phases. Exact GIT-096 commit `20612c364686b5b855e85f0b12c28a61e84b1061` closes Phase 6 local/private-beta offline/recovery hardening with proof preservation, activation and D-0054 cleanup. SPEC-0012 has no Phase 7. Public beta and deployment remain separately gated.

D-0135/D-0136/GIT-097 close the one-phase [`SPEC-0013 — Version 1 Home Finalizer Removal and Shorter Home Scroll`](specs/0013-version-1-home-finalizer-removal.md) in exact commit `893daa82f555381d775af8fb73b14a551bd5fb45` with proof preservation and D-0054 cleanup. The inert Finalizer Home card is removed, Export becomes the sole Tools/final Home card, intrinsic scroll depth shortens without scrollbar CSS changes, and the directly stale Assistant catalog fact is corrected.

D-0137 creates [`SPEC-0014 — Durable In-App Notification Center and Background Completion`](specs/0014-in-app-notification-center.md) from canonical `main`. Arthur subsequently established PM V5, authorized Phase 1 and accepted the fresh two-bell correction under D-0138. D-0139/GIT-099 fully publish, synchronize, preserve and clean up the exact 19-path Phase 1 result in 33-path commit `06365eacffe493ea3550de71b3baff0f57bf03b2`, with immutable manifest SHA-256 `b1c082c2508b3039fdeacdd65f99ded4a9d49ed7cec99eb9aaff8352be143669`. Home owns the overall bell and Assistant owns its own bell; no other screen has one. D-0140 accepts the corrected Phase 2 Assistant/Terra unread-only exact-target result, which GIT-100 publishes in `318566d6d20acec672c3d8c6a0e5620ad70c7d66`. D-0141 rejects Phase 3 Export notifications as low-value; rejected runtime never enters main, and ordinary Export remains screen-owned. D-0142 accepts the corrected Phase 4 browser-declared offline/restored notices through the two existing bells, with one shared durable event/read state and no AI/provider/tool/Export change. GIT-102 publishes its 14 technical plus 14 record/tree paths from base `57f3a8560dc61f79db87c13dbff7285684b74793` in commit `283c297d1df01371dc599a52719d35dc78e1d2f4`; D-0143 closes synchronization, proof preservation and cleanup. Manifest SHA-256 is `1646e497ad2e96b2263201dbced8c69bd6aae21487de481b255a912f7019a0eb`. Future low-usage, updater and AI-animation notices remain dormant. SPEC-0014 defines exactly four phases; there is no Phase 5 in this spec.

The permanent direction is drawing-only: no non-destructive command may silently remove unrelated authored pixels/items; intentional removals use a closed registry of explicit destructive controls; same-paint raster overlaps use maximum coverage rather than cumulative darkening; and accepted Phase 2 **Draw Rig** creates ordinary segmented raster paint, never joints/bones/topology. Accepted Phase 3 retires active structured-rig/Creator authoring and migrates historical rig content non-destructively into ordinary drawing/drawing symbols through read-only compatibility adapters. Every future-AI-eligible mutation uses the same validated capability as its ordinary manual control. SPEC-0007 adds no AI/provider/model/prompt/API/video/tracking behavior.

The current code is a prototype foundation, not a finished Version 1. Existing documents that called either workspace “complete” described a past visual milestone and are superseded by `CURRENT_STATE.md`.

## AI and Custom-Model Direction

The current app uses OpenAI models with structured prompts and hand-authored reference examples. It does not contain a custom-trained Diamond Animator LLM today.

A future custom model or fine-tuning program is a separate research track. It must define dataset provenance, licensing, schemas, evaluation, safety, deployment, latency, and cost before prompt-example files are treated as training data.

## Current Phase

Phase 0 is preservation and stabilization:

- establish a durable control plane
- preserve the recovered implementation baseline in reviewed Git history
- introduce spec-first work and repeatable regression proof
- resolve launch scope and product-quality definitions
- stabilize core document, persistence, security, and test foundations before broad feature expansion
- preserve completed SPEC-0008 Phase 1 while D-0093 pauses Phases 2–6; do no later AI Animator/provider implementation until Arthur explicitly resumes it and the architecture/spec is reconciled
- preserve fully closed SPEC-0009 Phases 1–3 through D-0101/GIT-079
- preserve fully closed SPEC-0010 Phases 1–3 through D-0109/GIT-083
- preserve fully closed SPEC-0011 Phases 1–3 through D-0119/GIT-088 `d0ec1b23d7e1d9ff13a0779c2758e33e858691f0`
- preserve fully closed SPEC-0012 Phases 1–6 through D-0134/GIT-096 `20612c364686b5b855e85f0b12c28a61e84b1061`; do not deploy or expose a public beta without separate authority
- preserve the closed one-phase SPEC-0013 result under D-0135/D-0136/GIT-097
- preserve D-0138/D-0139/GIT-099's fully closed SPEC-0014 Phase 1 two-bell foundation, D-0140/GIT-100's fully closed Phase 2 correction and D-0142/D-0143/GIT-102's fully closed Phase 4 offline/restored result; honor D-0141's Phase 3 Export rejection

The ordered phase plan lives in `ROADMAP.md`.

## Explicit Non-Claims

This charter does not claim that the current app already delivers professional output, full AI control, production export, cloud collaboration, or a custom LLM. Those are intended outcomes that require specs and verification.
