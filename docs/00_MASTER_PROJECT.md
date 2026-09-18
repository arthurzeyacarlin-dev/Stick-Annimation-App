# Diamond Animator Master Project Charter

Status: canonical product intent
Last updated: 2026-09-18

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

D-0085 creates [`SPEC-0008 — Conversational AI Animator and Editable Video Reconstruction`](specs/0008-conversational-ai-animator.md) as **Proposed; decision-complete and review-ready; no implementation phase authorized**. Its bounded V1 sequence is Terra conversation/intent/jobs → provider-neutral reference video → deterministic frame slicing → isolated editable drawing reconstruction → registered-command conversational edits → beta/export closeout. Phase 1 is ready only for Arthur's later separate approval/authorization after this proposal is published; Phases 2–6 remain gated. No provider, paid call, implementation, deployment or Git publication occurs in the proposal task.

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
- review and execute Proposed SPEC-0008 only through its separately authorized, accepted, recorded, published/integrated and cleaned phase lifecycle

The ordered phase plan lives in `ROADMAP.md`.

## Explicit Non-Claims

This charter does not claim that the current app already delivers professional output, full AI control, production export, cloud collaboration, or a custom LLM. Those are intended outcomes that require specs and verification.
