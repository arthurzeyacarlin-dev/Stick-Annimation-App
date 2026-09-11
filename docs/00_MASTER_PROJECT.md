# Diamond Animator Master Project Charter

Status: canonical product intent
Last updated: 2026-09-11

## Product Mission

Diamond Animator is intended to make professional-quality stick-figure animation accessible to people who may have little or no animation experience.

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

SPEC-0006 Phases 1–3 are Verified/published/integrated through GIT-054 `e11f6c453f13772ee9bd4b172a17bc68e1de65b9`. Arthur rejected the former Phase 4 typed-layer result; it remains unpublished and non-reusable. D-0062 corrects the same spec to neutral layers with ordered typed items in the same cell. Seven numbered phases remain; corrected Phase 4 has internal 4A (12 paths, model/read migration/minimal repository) then 4B (24 paths, ordinary neutral New/Open, controlled item editing, shared history/render/timeline/playback/onion), ending in one visible Phase 4 review. Correction implementation is not started. The required outcome is one neutral layer/frame with Drawing, text, symbols and editable rigs together; one shared project capability layer and no cloud/social Share. Arthur already authorizes proceeding after safe architecture. PM coordinates separately authorized records publication and verified same-copy recovery, then sequential 4A → stopped-owner checkpoint → 4B in the retained `/6e90/` worktree under SPEC-0006 §12/16. No invisible checkpoint is product acceptance. No extra Plan-click or pasted-prompt approval is required. This docs-only task starts no executor/server and performs no Git publication or cleanup. Later numbered phases still require prior acceptance, CPA propagation and separate publication/integration.

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
- review and, only through separately authorized phases, establish the lossless unified workspace before expanding manual Stick tools or motion-video AI

The ordered phase plan lives in `ROADMAP.md`.

## Explicit Non-Claims

This charter does not claim that the current app already delivers professional output, full AI control, production export, cloud collaboration, or a custom LLM. Those are intended outcomes that require specs and verification.
