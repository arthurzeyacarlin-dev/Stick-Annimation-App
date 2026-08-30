# Session Handoff

Status: canonical last-known stopping point
Last updated: 2026-08-26
Active Approved specs: `docs/specs/0001-first-reversible-ai-stick-animation.md`, `docs/specs/0002-lossless-local-drawing-save-and-reopen.md`, and `docs/specs/0003-tutorials-and-cleaner-home-screen.md`
Current result: SPEC-0003 remains **Approved and active**. Its one product implementation remains **Authorized; Not started** and its visible result is unchanged. D-0031 authorizes one separate **Authorized; Not started** tester-compatibility prerequisite that must be accepted, propagated, and published before product work starts.
Current roadmap phase: Phase 0 — Preserve and Stabilize

## Current D-0031 Result

Started in a new dedicated correction worktree from clean published canonical-main SHA `4cd1a98b2f0b53c89d50ede453d1ab14bccbc9c7`, completed the required boot, and independently traced the live Phase 6 Stick mount, API availability dispatch, permanent no-plan tester route, plan-mode route, and proof boundaries.

Before any tracked edit, the clean mandatory command failed during the first protected Stick flow:

```text
AssertionError [ERR_ASSERTION]: Unexpected /api/ai request outside Drawing proof.
at browserRoute (.../scripts/runSpec0001BrowserProof.ts:1371:12)
```

Every `StickFigureAiPanel` mount sends the already-integrated same-origin availability `GET /api/ai`. The no-plan tester's older route rule allows only its Drawing POST and rejects that GET. The two viewport Stick flows mount before Creator and after Back, so they produce exactly four availability GETs. The request is provider-free in the scrubbed proof environment. No Tutorials runtime is involved.

D-0031 now authorizes the smallest safe correction: one seven-path tester prerequisite, its own technical proof, no product/runtime change, no weaker network rule, and no permanent-gate waiver. The Tutorials outcome, ten-path product ceiling, three viewports, and early Arthur review remain unchanged.

## Exact Prerequisite Boundary

Only a future dedicated prerequisite Spec Executor may change:

- `scripts/runSpec0001BrowserProof.ts`
- `scripts/fixtures/spec0001-browser/spec0003-prerequisite/v1/stick-availability-contract.json`
- `scripts/fixtures/spec0001-browser/spec0003-prerequisite/v1/proof-commands.json`
- `scripts/fixtures/spec0001-browser/spec0003-prerequisite/v1/proof-manifest.schema.json`
- `scripts/spec0001-browser/spec0003TesterCompatibilityContract.ts`
- `scripts/spec0001-browser/recordSpec0003TesterCompatibilityProof.ts`
- `scripts/spec0001-browser/validateSpec0003TesterCompatibilityProof.ts`

It must test-fulfill exactly two availability GETs in `stick-1440x900` followed by two in `stick-1024x768`, keep exactly one mocked Drawing POST, keep real API-route and non-loopback counts at zero, preserve 40 operations/13 screenshots/4 driver messages/37 historical negatives, preserve every plan-mode registration meaning, validate its dedicated manifest, and stop.

## Exact Git and Lifecycle State

- correction worktree: `/private/tmp/spec0003-tester-compat-spec-correction-4cd1a98`
- branch: `codex/spec0003-tester-compat-spec-correction`
- starting and current HEAD: `4cd1a98b2f0b53c89d50ede453d1ab14bccbc9c7`
- canonical `main` and local `origin/main` at audit: the same SHA, clean `0/0`
- D-0030 activation publication: complete at `4cd1a98b…`
- D-0031 tester prerequisite: Authorized/Not started; this correction publication is pending
- SPEC-0003 product implementation: Authorized/Not started; blocked on accepted prerequisite publication
- index: empty
- implementation, staging, commit, merge, push, publication, deployment, provider/external/paid work: not performed

## Exact Next Handoff

1. A separate publication-only Control Plane Architect publishes this reviewed D-0031 specification/control-plane correction and records its exact clean canonical-main SHA.
2. One new Plan-mode prerequisite Spec Executor starts from that SHA, changes only the seven authorized technical paths, validates `output/spec-0003/permanent-tester-prerequisite/proof-manifest.json`, returns its Implementation Review Packet, and stops.
3. Arthur and the Project Manager accept or reject that technical result. Accepted work transfers exclusively to a Control Plane Architect for propagation and a separate later publication.
4. The prerequisite publication reruns the corrected clean permanent tester. Its exact synchronized canonical-main SHA becomes the sole base for the fresh ten-path SPEC-0003 product executor.

Only after all four steps may Tutorials implementation start. SPEC-0001 Phase 7 remains separate and Unauthorized/Not started.

## Proven and Not Proven

Proven: the exact clean published basis and current no-plan failure; the Phase 6 Stick mount -> availability GET -> same-origin route path; four expected GET contexts/order; the older no-plan rule as the blocker; a seven-path provider-free tester correction without product/runtime changes; and no change to the product result or ten-path ceiling.

Not proven or performed: prerequisite implementation/proof; a passing corrected tester; Tutorials implementation/screenshots/future acceptance; staging, commit, publication, deployment, or any provider/external/paid request.

## Systems Intentionally Left Unchanged

All product runtime and styles; Home/header/chrome; New/Open; Drawing; Stick; Creator; timelines; AI panels; SPEC-0001 Phase 6 behavior; SPEC-0002 Save/Open; all current tester/fixture/proof bytes; packages/dependencies/configuration/environment/database/public assets/deployment; other worktrees; and recovery material remain unchanged by this specification correction.
