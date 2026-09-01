# Specification Index and Lifecycle

Status: canonical spec registry
Last updated: 2026-09-01

## Active Specs

| Spec | Status | Active authorization |
| --- | --- | --- |
| [`SPEC-0001 — First Reversible AI-Created Stick Animation from Workspace Chat`](0001-first-reversible-ai-stick-animation.md) | Approved through completed Phase 6; Phase 7 superseded | Phase 1 through Phase 6 are **Verified, published, and integrated**. D-0027 is published at `f46ed3b13e6bca3a09c9b2926c972bea8c331f2c`; D-0028's corrected visible outcome is published at `f19955c336be43b19b2c4cc13d16abcc7ded7247`; and D-0029's accepted exact 25-path implementation plus eight records is published/integrated in exact 33-path commit `caa6c2d946780f384d0a8c58f4ea75a771483bcd`. Proof-manifest SHA-256 is `c0d13c9234087855784ad805410667e9d583ac0f03dbe847257db778fea39297`; browser-runner SHA-256 is `b1be9c83951f027687e2b50fa7df702ffa09b2e8213a7c30b6c7b0e9fa6220bd`; accepted framed aggregate is `3bf3290f09f72787fa28db4f1a96003ab5f13e846358361e5805812904078aa2`. D-0033 retires Phase 7 in favor of SPEC-0004; old Phase 7 must not be implemented. |
| [`SPEC-0002 — Lossless Local Drawing Save and Reopen`](0002-lossless-local-drawing-save-and-reopen.md) | Approved | Phase 1, Phase 2, and the realistic-size Save/Save As correction are **Verified/published/integrated**; SPEC-0002 is complete again. The exact 13-path correction commit is `5c36870f7671033e30dc9341ba757e36c6572cc2`. Technical-manifest SHA-256: `9d6c2bd8bc607c947265b72b3b0387909065f6b1305baa7e49a6f51e991c54fd`; closeout-manifest SHA-256: `f0f60e9598859d8b356bf24aa802f01a8e75fb8129cc2aa975683b0f626047c0`. |
| [`SPEC-0003 — Tutorials and Cleaner Home Screen`](0003-tutorials-and-cleaner-home-screen.md) | Verified | D-0030's outcome is published in `4cd1a98b2f0b53c89d50ede453d1ab14bccbc9c7`; D-0031's accepted prerequisite and records are published/integrated in `2cd25fd0bdfb8a775370641ffd65db315cc94532`; D-0032's accepted ten-path product result plus reviewed records are published/integrated in exact 20-path commit `9fa1b819aacc7823711af5838b79e70921469a93`. Its 3,084-byte manifest independently validates at SHA-256 `4b63e1dc171cf9536aecbed067f271793dffc17137200afc8d136e1072d04d6d`, with six receipts, four artifacts, three viewports/screenshots, 14 assertion groups, and zero API/external requests. The clean publication tester passed 40 operations and 13 screenshots with four ordered Stick GETs, one Drawing POST, zero real/non-loopback/provider requests, and cleanup. |
| [`SPEC-0004 — One-Time Stick Figure AI Animator`](0004-future-real-ai-animator-requirements.md) | Approved for Phase 1 only — Authorized; Not started | D-0035 accepts the complete direction and authorizes only the exact fixed-fixture, provider-free Phase 1 scope/allowlist. It preserves the retired old SPEC-0001 Phase 7, the Phase 6 wave, no paid/provider/Drawing work, and every Phase 1 boundary. Phases 2–8 remain unauthorized; the next task is one dedicated Plan-mode Phase 1 Spec Executor. |

SPEC-0004 is approved and authorized **for Phase 1 only** under D-0035; it is not approved for Phases 2–8. The Phase 1 executor starts separately in Plan mode after its own clean-base, index, ownership, and exact-allowlist verification. No provider/API activity, paid proof, deployment, or publication is authorized for that phase.

SPEC-0002 approves a strict version-2 local Drawing record, lossless raster/audio assets, non-destructive version-1 compatibility, transactional failure safety, finite capacity, and truthful Save/Open presentation. Its original two phases remain published/integrated, ending at `af89b26c89d83eb61f77d91b4a50c105b7c12079`. A real `1440×900` project later exposed boxed-byte expansion of two 60,268,104-byte bitmaps and an out-of-boundary Save preparation error. The accepted correction uses owning typed-byte snapshots and typed V2 hydration/encoding while retaining legacy `number[]`, and moves every pre-storage step inside truthful failure handling without changing the V2 schema or persistence semantics. Its 12-receipt, 890-assertion realistic authoring proof passed Save, edit/save, safe preparation failure, Save As, reload, and original/copy reopen with matching dimensions/digests, held frame, Onion Skin, zero overlays/page errors, and zero external/provider requests. It was published and integrated in exact 13-path commit `5c36870f7671033e30dc9341ba757e36c6572cc2`; the clean permanent tester passed 40 operations and 13 screenshots with one deterministic mocked Drawing request and no real/external request. Technical-manifest SHA-256 is `9d6c2bd8bc607c947265b72b3b0387909065f6b1305baa7e49a6f51e991c54fd`; closeout-manifest SHA-256 is `f0f60e9598859d8b356bf24aa802f01a8e75fb8129cc2aa975683b0f626047c0`.

The active Approved SPEC-0001 contains D-0011's Phase 1.5 tester approval and D-0012's narrow conditional Drawing correction approval. The corrected implementation stayed inside that boundary and was subsequently accepted through D-0010's executor/review/architect lifecycle.

Phase 1.5 was published and integrated in exact canonical-main implementation commit `8df64552e29e4170df8000097fe857b7a31dff69` (parent `3768226fd3aa3668a6cf7260da8476ceea0a084e`) with the reviewed 35-path scope; its six-document control-plane publication record was published in commit `687cbeaf6acbf9625e0d940e78bc600251eb0604`. D-0015 and the SPEC-0001 Phase 2 activation were published in exact eight-path commit `a85690de9396cf97e3063005cbb6da85f109ae1d`. D-0016 authorized the proof-only compatibility correction and was published/integrated in exact seven-path commit `6c2973caecb742334fb432bdda8fbc674bb7db42`.

The accepted correction was implemented from exact base `8b663d2b80144e9aeba9ea0ecf0f78ccefa78926` in exactly 23 implementation/proof paths. It preserves the no-plan v1 suite and adds a fail-closed, hash-bound v2 catalog/plan/registry/declarative-adapter path; Git-derived dirty/clean validation; measured base/result lint evidence; and exact network, production, source-restoration, and lifecycle cleanup. The renewed technical manifest at `output/spec-0001/phase-1.5-compatibility/proof-manifest.json` has SHA-256 `53202d21ba7248e46a3e3423a623fbc785b5c3beedd6dd4d2a984b37614cffe8`, binds 9 receipts and 43 artifacts, and passed independent archived revalidation without restored dependencies. The compatibility self-test passed 37 negative cases; the real runner proof separately exercised 27 closed synthetic actions, 4 checkpoints, 1 screenshot, and the five named Home/Stick/Creator/Drawing regression groups. `productPhaseClaimed: false` is mandatory: this proves compatibility infrastructure, not product Phase 2 behavior.

The correction was published and integrated in exact canonical-main commit `e07268cc80751baba99ac6708a1e8a93d4fc4756`. Phase 2 subsequently started from exact activation base `68338d54542bbfd3fb1f0fab06548f0424871f80` and its historical result was published in `adbda9dd4f42a103c3c5af41ccc19b110b6825c0`. After Arthur rejected that visible result, D-0017's §10.5A correction was accepted and published at `edfb3dea023119b91336e6e5da645d4982a9f068`; Phase 3 was published/integrated at `3fe3a5487389647b67216e9466121e00f1a73856`; Phase 4 at `71841e96499f7627139c53d87114bba65e19d29d`; and Phase 5 at `9bbcc1df2fe4c79c0947601d0ea6274a85732d85`. D-0027's typo-friendly Phase 6 activation was published at `f46ed3b13e6bca3a09c9b2926c972bea8c331f2c`, D-0028's corrected owner outcome was published at `f19955c336be43b19b2c4cc13d16abcc7ded7247`, and D-0029's accepted exact 25-path implementation plus eight records was published/integrated at `caa6c2d946780f384d0a8c58f4ea75a771483bcd`. Phase 6 is Verified/published/integrated. D-0033 retires old Phase 7; D-0034 records the complete direction; D-0035 approves and authorizes only SPEC-0004 Phase 1, which is not started.

## Provisionally Promoted Legacy References

| Spec | Status | Authority and caveat |
| --- | --- | --- |
| `../../diamond-animator-docs/02_animation_engine/MOTION_TWEEN_SYSTEM.md` | Provisionally promoted legacy V1 intent; implementation present; owner confirmation and current verification pending | Best detailed inherited reference for drawing position-only motion tween, not a newly approved spec. Full acceptance was not rerun on 2026-08-09. Latest user direction and accepted superseding decisions prevail; any code/spec mismatch must be recorded and reconciled before changing either. |

No file under `diamond-animator-docs/` is currently an approved implementation specification. The row above is a mandatory reconciliation reference only.

## File Naming

New specs use:

```text
docs/specs/NNNN-short-kebab-case-title.md
```

Numbers are monotonic and never reused. The first new spec is `0001-...`.

## Lifecycle

| Status | Meaning |
| --- | --- |
| Draft | Being researched; no implementation authorization |
| Proposed | Goal/scope/proof ready for PM decision |
| Approved | Arthur or the current explicit task authorized implementation |
| In progress | Implementation and verification loop is active |
| Implemented | Code is patched, but required verification is not complete |
| Verified | Acceptance and regression gates passed; control plane updated |
| Blocked | Cannot proceed within current authority after the required blocked threshold/process |
| Superseded | Replaced by a named newer spec/decision |
| Abandoned | Deliberately stopped; reason preserved |

Only one spec should be `In progress` unless independent concurrency is documented in both specs and the handoff.

## Phase Execution and Integration

For a phased implementation spec:

1. one Spec Executor task and worktree executes and technically tests exactly one authorized phase;
2. the executor creates and validates the technical proof manifest, returns an Implementation Review Packet, and stops without control-plane or Git mutation;
3. Arthur and the Project Manager accept or reject that implementation;
4. only after acceptance and executor shutdown may a Control Plane Architect take exclusive ownership of the same worktree, update the canonical control plane, validate the technical evidence, complete final tracked-state proof, return its own PM Review Packet, and stop;
5. both packets are review evidence and neither authorizes staging, committing, merging, pushing, or publication;
6. only a later explicit publication instruction authorizes the Control Plane Architect to publish and integrate the accepted phase; and
7. the next phase starts in a new Spec Executor task only after the preceding phase is Verified and durably integrated into canonical `main`.

Every implementation phase starts in Codex Plan mode for evidence refresh, execution-path tracing, and a phase-bounded plan before implementation begins.

The Spec Executor may write only the phase-authorized implementation/fixture/technical-test boundary plus ignored proof artifacts. Canonical spec/status/TODO/decision/changelog/handoff propagation belongs only to the Control Plane Architect. The roles never edit the same worktree concurrently; transfer is sequential and recorded after the executor has completely stopped.

SPEC-0001 Phase 1 is the completed historical exception under the previous combined lifecycle. Its Verified, published, and integrated status is preserved.

## Progressive Elaboration and Review Threshold

Approval requires a safe, decision-complete user outcome and an implementable, verifiable current phase—not perfect foreknowledge of every later mechanic. Later-phase uncertainty should become a named entry gate, prerequisite, or follow-up unless it changes the accepted outcome or blocks the current phase.

A spec returns for another correction round only when a consolidated review finds a genuine blocker: an unresolved owner choice or user-outcome change; material security, privacy, cost, data-loss, or external-service risk; an infeasible or unprovable current phase; an authorization-boundary conflict; or a protected regression. Bounded engineering details may be settled inside the authorized phase only when scope, safety, and acceptance remain unchanged.

## Promotion Rules

A design note becomes an approved spec only when it contains:

- exact user goal and current problem
- evidence from live code/behavior
- explicit scope and non-goals
- real execution path and data/state impact
- exact user action sequence
- measurable acceptance criteria
- protected regression boundaries
- cost/security/privacy/dependency impact
- required verification commands and real-app flows
- status, owner/decision link, and last verified date/commit

Thin architecture prose, chat logs, paste packs, TODO entries, code comments, and test scripts are not specs by themselves.

## Required End-of-Spec Updates

After Arthur and the Project Manager accept a phase implementation, the Control Plane Architect—not the Spec Executor—performs the required end-of-phase updates:

1. add its final evidence and exact files changed
2. update `../CURRENT_STATE.md`
3. close/move its `../TODO.md` IDs
4. append `../changelog.md`
5. record durable choices in `../DECISIONS.md`
6. update this index and `../SESSION_HANDOFF.md`
7. run the control-plane and relevant code gates

Do not mark Verified when any required acceptance flow remains unproven. Stop after the Control Plane Architect PM Review Packet; Git publication remains separately authorized.
