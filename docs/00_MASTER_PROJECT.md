# Diamond Animator Master Project Charter

Status: canonical product intent
Last updated: 2026-09-13

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

SPEC-0006 Phases 1–5 are Verified, published, durably integrated, recorded, and cleaned up. GIT-057 published Phase 5 in exact 31-path commit `a759ae8afbb67e8fb723983851ae36947fd97f17`; GIT-058 published its exact 13-path record closeout as `41983b0c88e1994675a4901d5814b3d972ad46b4`, and pre-GIT-059 verification found local/live GitHub `main` synchronized at clean `0/0`. D-0067 records completion of the D-0054 accepted-copy cleanup and preservation of the 98-file proof backup. This exact 11-path D-0067 records package is terminal GIT-059; its commit SHA is intentionally not predeclared, and its exact identity/publication status must be read directly from the canonical commit containing D-0067 and current Git refs. Once GIT-059 is published and synchronized, Phase 5 is fully closed with no follow-on records-only closeout. The exact 17-path Phase 5 manifest remains PASS/VALID at SHA-256 `6a1c65c967f8f1d87a27e3834677bea84381f0c2577125bebfead6ca77308b6d`. Phase 5 completes the current Drawing/Stick tool matrix, the four shared panels, project-owned Drawing/Stick/Mixed symbol catalogs, durable first-gesture Stick editing, cross-kind Select/Lasso transforms, unified onion behavior, bitmap alignment, and compact timeline pointer access without adding new AI or future manual-tool capability. The next possible product action is Phase 6, but it remains unauthorized and not started and requires Arthur's separate explicit authorization.

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
