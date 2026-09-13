# Diamond Animator Master Project Charter

Status: canonical product intent
Last updated: 2026-09-14

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

SPEC-0006 Phases 1–5 are Verified, published, durably integrated, recorded, and cleaned up through GIT-059 `62feafc220c35eb1203dc4f19820e533a54002e1`. Arthur accepted the exact Phase 6 app-copy result on 2026-09-14 after reviewing identical restarted review-copy bytes; D-0068 records the technically Verified 18-path result at immutable manifest SHA-256 `5883ea735bd741b2f14e45d2fa84669ea3bb78ad5ed23693011e0280e4070902`, with 18 source and 13 evidence bindings. Phase 6 completes all supported Drawing V1/V2, Stick V1/V2, unified V1 and native unified V2 Open paths through the common editor, safe first-save adoption, Save As identity rebinding, exact-provenance dedupe, content-addressed storage, last-good recovery and bounded large-project proof without rewriting source stores. CPA propagation is complete in the accepted worktree and GIT-060 publication/integration is the next repository action. Phase 7 remains unauthorized and not started; duplicate-owner retirement and whole-spec completion are not yet claimed.

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
