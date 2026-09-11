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

SPEC-0006 Phases 1–3 are Verified/published/integrated through GIT-054, and GIT-055 published D-0062's corrected neutral architecture at `e956840001d18757af8f2de5361640ba70d44d68`. Arthur accepted the corrected Phase 4 implementation under D-0063. Its exact 26-path technical manifest is PASS at SHA-256 `9d2d18871981db2e499c689723730ada4690dd5cb94ab620a038e45557f298de`; Phase 4 is technically Verified pending GIT-056 publication/integration. The accepted result establishes ordinary neutral New, same-cell Drawing and editable Stick content, shared timeline/history/playback/onion, safe V2 Save/Save As/Open, and exact pointer-mapped Stick gestures. It adds no AI or future manual-tool capability. Phases 5–7 remain not started and cannot begin before Phase 4 publication, synchronization, and accepted-copy cleanup.

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
