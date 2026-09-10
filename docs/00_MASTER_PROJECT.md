# Diamond Animator Master Project Charter

Status: canonical product intent
Last updated: 2026-09-10

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

D-0056 resolves the intended architecture: one Animation Workspace owns one typed Drawing/Stick project, stage, timeline, history, persistence path, and AI surface. SPEC-0006 has Arthur’s seven-phase approval under D-0057. GIT-051 published Phase 1’s contract/read-only migration and GIT-052 `d2096109900cc50a0a4dae2f603bd74b7b4a3427` published Phase 2’s direct Untitled New, one combined inherited Projects collection, and one compatibility editor through AnimationWorkspace. D-0061 accepts the exact 16-path Phase 3 mixed stage/compositing result in c6b0 after visible review and executor stop. It is Verified with CPA propagation complete, but unpublished/not integrated; separate GIT-054 publication is next. The scene is manually seeded neutral proof content and adds no AI/motion capability. Phases 4–7 remain Unauthorized/Not started: unified timeline/playback/onion, tools/panels, history/persistence and retirement remain later work.

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
