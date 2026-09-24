# Specification Index and Lifecycle

Status: canonical spec registry
Last updated: 2026-09-24

## Active Specs

| Spec | Status | Active authorization |
| --- | --- | --- |
| [`SPEC-0001 — First Reversible AI-Created Stick Animation from Workspace Chat`](0001-first-reversible-ai-stick-animation.md) | Approved through completed Phase 6; Phase 7 superseded | Phase 1 through Phase 6 are **Verified, published, and integrated**. D-0027 is published at `f46ed3b13e6bca3a09c9b2926c972bea8c331f2c`; D-0028's corrected visible outcome is published at `f19955c336be43b19b2c4cc13d16abcc7ded7247`; and D-0029's accepted exact 25-path implementation plus eight records is published/integrated in exact 33-path commit `caa6c2d946780f384d0a8c58f4ea75a771483bcd`. Proof-manifest SHA-256 is `c0d13c9234087855784ad805410667e9d583ac0f03dbe847257db778fea39297`; browser-runner SHA-256 is `b1be9c83951f027687e2b50fa7df702ffa09b2e8213a7c30b6c7b0e9fa6220bd`; accepted framed aggregate is `3bf3290f09f72787fa28db4f1a96003ab5f13e846358361e5805812904078aa2`. D-0033 retires Phase 7 in favor of SPEC-0004; old Phase 7 must not be implemented. |
| [`SPEC-0002 — Lossless Local Drawing Save and Reopen`](0002-lossless-local-drawing-save-and-reopen.md) | Approved | Phase 1, Phase 2, and the realistic-size Save/Save As correction are **Verified/published/integrated**; SPEC-0002 is complete again. The exact 13-path correction commit is `5c36870f7671033e30dc9341ba757e36c6572cc2`. Technical-manifest SHA-256: `9d6c2bd8bc607c947265b72b3b0387909065f6b1305baa7e49a6f51e991c54fd`; closeout-manifest SHA-256: `f0f60e9598859d8b356bf24aa802f01a8e75fb8129cc2aa975683b0f626047c0`. |
| [`SPEC-0003 — Tutorials and Cleaner Home Screen`](0003-tutorials-and-cleaner-home-screen.md) | Verified | D-0030's outcome is published in `4cd1a98b2f0b53c89d50ede453d1ab14bccbc9c7`; D-0031's accepted prerequisite and records are published/integrated in `2cd25fd0bdfb8a775370641ffd65db315cc94532`; D-0032's accepted ten-path product result plus reviewed records are published/integrated in exact 20-path commit `9fa1b819aacc7823711af5838b79e70921469a93`. Its 3,084-byte manifest independently validates at SHA-256 `4b63e1dc171cf9536aecbed067f271793dffc17137200afc8d136e1072d04d6d`, with six receipts, four artifacts, three viewports/screenshots, 14 assertion groups, and zero API/external requests. The clean publication tester passed 40 operations and 13 screenshots with four ordered Stick GETs, one Drawing POST, zero real/non-loopback/provider requests, and cleanup. |
| [`SPEC-0004 — One-Time Stick Figure AI Animator`](0004-future-real-ai-animator-requirements.md) | Completed phases preserved; unfinished phases superseded/inactive | SPEC-0004 Phases 1, 2, and timing-only Phase 2.5 remain Verified, published, and integrated. Phase 2.6 remains rejected, unpublished, and superseded historical evidence. Under D-0055, unfinished Phases 3–8 are Superseded by future SPEC-0008, inactive, and must not be implemented. No implementation authority. |
| [`SPEC-0005 — Professional Shared Stick Motion Engine`](0005-professional-shared-stick-motion-engine.md) | Completed phases preserved; Phase 3 rejected/unpublished; unfinished phases superseded/inactive | SPEC-0005 Phase 1 and Phase 2 v1/v2 remain accepted, Verified, published, and integrated; v2 is complete at GIT-048 `05faa59195c6d5f2d8a11ebcc9ab77fe1b6fdf14`. GIT-049 published the later Phase 3 authorization at `de54aed275c2f6da6e7c3f4a7f65091e8d5370c0`. A Phase 3 executor then ran, but Arthur rejected its visible result: it is unpublished, unaccepted, non-reusable, and not completed. D-0055 supersedes Phase 3 and unfinished Phases 4–8 by future SPEC-0008; they are inactive with no implementation authority. |
| [`SPEC-0006 — Unified Animation Workspace`](0006-unified-animation-workspace.md) | **Verified/published/integrated/recorded/cleaned up through Phase 7** | GIT-061 is exact canonical commit `185f58752c4f8dd4f5bfea0befe48998e5cd0f04`, parent GIT-060 `cbe16411a0f83d3b86136f41d0a66d1874d009aa`. D-0069 accepts the exact 11-path Phase 7 result at immutable 50,224-byte manifest SHA-256 `c6202f6deab4d3bcc75af3ad6699fc2dc70fc58723eccaa8337b1a2aef74bc51`; D-0070 records publication and D-0054 cleanup. SPEC-0006 itself grants no later-phase authority. |
| [`SPEC-0007 — Drawing-Only Manual Editor Completion and AI-Ready Tools`](0007-manual-editor-completion-and-ai-ready-tools.md) | **Verified/published/integrated/recorded/cleaned up** | GIT-062 closes Phase 1, GIT-063 closes Phase 2, D-0079/D-0080/GIT-064 close Phase 3, D-0081/D-0082/GIT-065 close Phase 4, and D-0083/D-0084/GIT-066 `c193b8b…` close Phase 5 with publication/integration, proof preservation and cleanup. |
| [`SPEC-0008 — Conversational AI Animator and Editable Video Reconstruction`](0008-conversational-ai-animator.md) | **Approved historical contract; paused after completed Phase 1** | D-0089/D-0090/GIT-070 close Phase 1. D-0091/GIT-072 and D-0092/GIT-073 `42bfe1a…` preserve later web-research and automatic-commit planning, but D-0093 suspends dispatch. Phases 2–6 are **Paused; Unauthorized; Not started; not rejected**. Explicit resumption, fresh evidence and architecture/spec reconciliation are required before any later phase can be separately authorized. |
| [`SPEC-0009 — Animation Export`](0009-animation-export.md) | **Verified/published/integrated/synchronized/proof-preserved/cleaned up; all three phases closed** | GIT-076 closes Phase 1 at `548063b9247708106c7c8c8a11978563d07d6597`; D-0098/D-0099/GIT-078 close Phase 2 at `682fd9732b9cc30e545b3b709ced62ffd94edc39`; D-0100/D-0101/GIT-079 close Phase 3 at `555d60b48ec97e066b1110d40638927d68c8d34b`. Immutable Phase 3 manifest SHA-256 `0d9b48f584f89d54604284c03713037402e2d68decde5c3b0d0a844cd8065277`, source digest `abb0ba8538454eea3af8cb2761b4225a1c3ed294de21f1097ea9c6b58b21e987`; preserved-proof aggregate SHA-256 `6cba2ea9c3730e7cd874e3db1b16cf0fc0a7e9123942c77b0708a69cce970985`. No direct upload or deployment authority. |
| [`SPEC-0010 — Project Safety and Recovery`](0010-project-safety-and-recovery.md) | **Verified/published/integrated/synchronized/proof-preserved/cleaned up; all three phases closed** | D-0105/GIT-081 close Phase 1. D-0106/D-0107/GIT-082 close Phase 2. D-0108/D-0109/GIT-083 `da348337…` close Phase 3; rebound manifest SHA-256 `5dc275dc…23f5`, source digest `48ec1461…d60`, thirteen-file preserved-proof inventory SHA-256 `b1c42860…8ab5`. |
| [`SPEC-0011 — My Projects Library, Movie Viewer, and Shared Project Management`](0011-my-projects-library-movie-viewer-and-shared-project-management.md) | **Completed; all three phases Verified/published/integrated/synchronized/proof-preserved/cleaned up** | D-0113/GIT-084 close Phase 1, D-0116/GIT-086 close Phase 2, and D-0119/GIT-088 close Phase 3 in exact 28-path commit `d0ec1b23…691f0`. The immutable Phase 3 manifest remains SHA-256 `92ae122c…aaa`; proof is preserved, PID 32270/port 57840 are stopped/closed, and D-0054 cleanup is complete. No provider/paid action, deployment, or Phase 4 authority exists. |
| [`SPEC-0012 — Diamond Animator Guidance Assistant`](0012-diamond-animator-guidance-assistant.md) | **Completed; all six phases Verified/published/integrated/synchronized/proof-preserved/cleaned up** | D-0134/GIT-096 closes exact 34-path commit `20612c364686b5b855e85f0b12c28a61e84b1061`. Immutable Phase 6 manifest SHA-256 is `a0e3eea…2229`; 82 proof files/4,888 KiB are preserved, canonical Home/Assistant are active, review port 58160 is closed and D-0054 cleanup is complete. No Phase 7. |
| [`SPEC-0013 — Version 1 Home Finalizer Removal and Shorter Home Scroll`](0013-version-1-home-finalizer-removal.md) | **Completed; sole Phase 1 Verified/published/integrated/synchronized/proof-preserved/cleaned up** | D-0135/D-0136/GIT-097 close exact 21-path product commit `893daa82f555381d775af8fb73b14a551bd5fb45`. Immutable manifest SHA-256 is `bf8e51c…db63`; 13 proof files/262,442 bytes are preserved at aggregate `cbe9142…17d4b`; port 58080 is closed and D-0054 cleanup is complete. Export is the only Tools/final Home card and the existing scrollbar remains unchanged. No Phase 2. |
| [`SPEC-0014 — Durable In-App Notification Center and Background Completion`](0014-in-app-notification-center.md) | **Approved specification; all four phases Unauthorized/Not started; Phase 1 owner-gated** | D-0137 records the docs-only four-phase plan from clean canonical `main` `acc3204d…cb8d`. Phase 1 cannot begin until Arthur creates Project Manager Version 5, the current PM transitions to AI Animator/Dad support, this plan is separately published, and Arthur separately authorizes Phase 1. No runtime, producer, provider/paid operation or Git publication is included. |

SPEC-0004 Phase 1 is Verified, published, and integrated under D-0036/GIT-033 at `086420e6b0cbe683adbb8f0024e65a2fc1d68d6d`. GIT-034 published Phase 2's activation at `70bf7b0799bcff8d703525bcb50c378b8a122ebf`; GIT-035 published the accepted result at `e3ec6a33438c2f3d2e075b6477f18b8eb1b58e24`. GIT-036 published the Phase 2.5 activation at `a755f892d7737c6a10d9c381ec59c1e2fdba4d47`; GIT-037 published its accepted timing-only bytes and reviewed records in `16799539fb7db31e345a878aa892d4485115188b`. The later exact eight-path Phase 2.6 executor result stayed unpublished and was rejected by Arthur after visible review. Its technically green manifest cannot substitute for accepted motion quality because browser proof did not require a complete playback cycle and the exact frozen output came from the same generation path. D-0043 historically assigned that missing shared-motion outcome to SPEC-0005; D-0055 now supersedes unfinished SPEC-0004/0005 phases by future SPEC-0008, with no implementation authority. No provider/API activity, paid proof, deployment, Phase 3–8 authorization, Phase 2.7, or Drawing/workspace integration exists.

SPEC-0002 approves a strict version-2 local Drawing record, lossless raster/audio assets, non-destructive version-1 compatibility, transactional failure safety, finite capacity, and truthful Save/Open presentation. Its original two phases remain published/integrated, ending at `af89b26c89d83eb61f77d91b4a50c105b7c12079`. A real `1440×900` project later exposed boxed-byte expansion of two 60,268,104-byte bitmaps and an out-of-boundary Save preparation error. The accepted correction uses owning typed-byte snapshots and typed V2 hydration/encoding while retaining legacy `number[]`, and moves every pre-storage step inside truthful failure handling without changing the V2 schema or persistence semantics. Its 12-receipt, 890-assertion realistic authoring proof passed Save, edit/save, safe preparation failure, Save As, reload, and original/copy reopen with matching dimensions/digests, held frame, Onion Skin, zero overlays/page errors, and zero external/provider requests. It was published and integrated in exact 13-path commit `5c36870f7671033e30dc9341ba757e36c6572cc2`; the clean permanent tester passed 40 operations and 13 screenshots with one deterministic mocked Drawing request and no real/external request. Technical-manifest SHA-256 is `9d6c2bd8bc607c947265b72b3b0387909065f6b1305baa7e49a6f51e991c54fd`; closeout-manifest SHA-256 is `f0f60e9598859d8b356bf24aa802f01a8e75fb8129cc2aa975683b0f626047c0`.

The active Approved SPEC-0001 contains D-0011's Phase 1.5 tester approval and D-0012's narrow conditional Drawing correction approval. The corrected implementation stayed inside that boundary and was subsequently accepted through D-0010's executor/review/architect lifecycle.

Phase 1.5 was published and integrated in exact canonical-main implementation commit `8df64552e29e4170df8000097fe857b7a31dff69` (parent `3768226fd3aa3668a6cf7260da8476ceea0a084e`) with the reviewed 35-path scope; its six-document control-plane publication record was published in commit `687cbeaf6acbf9625e0d940e78bc600251eb0604`. D-0015 and the SPEC-0001 Phase 2 activation were published in exact eight-path commit `a85690de9396cf97e3063005cbb6da85f109ae1d`. D-0016 authorized the proof-only compatibility correction and was published/integrated in exact seven-path commit `6c2973caecb742334fb432bdda8fbc674bb7db42`.

The accepted correction was implemented from exact base `8b663d2b80144e9aeba9ea0ecf0f78ccefa78926` in exactly 23 implementation/proof paths. It preserves the no-plan v1 suite and adds a fail-closed, hash-bound v2 catalog/plan/registry/declarative-adapter path; Git-derived dirty/clean validation; measured base/result lint evidence; and exact network, production, source-restoration, and lifecycle cleanup. The renewed technical manifest at `output/spec-0001/phase-1.5-compatibility/proof-manifest.json` has SHA-256 `53202d21ba7248e46a3e3423a623fbc785b5c3beedd6dd4d2a984b37614cffe8`, binds 9 receipts and 43 artifacts, and passed independent archived revalidation without restored dependencies. The compatibility self-test passed 37 negative cases; the real runner proof separately exercised 27 closed synthetic actions, 4 checkpoints, 1 screenshot, and the five named Home/Stick/Creator/Drawing regression groups. `productPhaseClaimed: false` is mandatory: this proves compatibility infrastructure, not product Phase 2 behavior.

The correction was published and integrated in exact canonical-main commit `e07268cc80751baba99ac6708a1e8a93d4fc4756`. Phase 2 subsequently started from exact activation base `68338d54542bbfd3fb1f0fab06548f0424871f80` and its historical result was published in `adbda9dd4f42a103c3c5af41ccc19b110b6825c0`. After Arthur rejected that visible result, D-0017's §10.5A correction was accepted and published at `edfb3dea023119b91336e6e5da645d4982a9f068`; Phase 3 was published/integrated at `3fe3a5487389647b67216e9466121e00f1a73856`; Phase 4 at `71841e96499f7627139c53d87114bba65e19d29d`; and Phase 5 at `9bbcc1df2fe4c79c0947601d0ea6274a85732d85`. D-0027's typo-friendly Phase 6 activation was published at `f46ed3b13e6bca3a09c9b2926c972bea8c331f2c`, D-0028's corrected owner outcome was published at `f19955c336be43b19b2c4cc13d16abcc7ded7247`, and D-0029's accepted exact 25-path implementation plus eight records was published/integrated at `caa6c2d946780f384d0a8c58f4ea75a771483bcd`. Phase 6 is Verified/published/integrated. D-0033 retires old Phase 7; D-0034 records the complete direction; D-0035 authorized SPEC-0004 Phase 1; D-0036 accepted it; and GIT-033 published/integrated it at `086420e6b0cbe683adbb8f0024e65a2fc1d68d6d`. D-0037 authorizes SPEC-0004 Phase 2 only; Phases 3–8 remain unauthorized.

## Current approval and future planning identifiers

All seven SPEC-0006 phases are Verified/published/integrated through exact GIT-061 `185f58752c4f8dd4f5bfea0befe48998e5cd0f04`. Its exact 11-path Phase 7 manifest is PASS/VALID at SHA-256 `c6202f6deab4d3bcc75af3ad6699fc2dc70fc58723eccaa8337b1a2aef74bc51`, 50,224 bytes, with 11 source and 16 evidence bindings. D-0070 records publication and cleanup. Historical Phase 1/2/4A/4 manifest files absent from preserved storage are reported only by recorded identity; preserved Phase 3/5/6 manifests fully revalidated.

The corrected 4A → stopped-owner checkpoint → 4B sequence remains complete. SPEC-0006 is closed through GIT-061. Drawing-only SPEC-0007 is fully closed through D-0083/D-0084/GIT-066. D-0085 creates SPEC-0008, D-0086/GIT-067 publishes its planning-only package, D-0087 authorizes Phase 1, and D-0089/D-0090/GIT-070 close its accepted corrected result. D-0091's bounded Phase 2 internet-research contract is published in GIT-072 and D-0092's automatic-commit planning contract is preserved in GIT-073 commit `42bfe1a…`; D-0093 pauses all remaining SPEC-0008 phases with no rejection or dispatch authority. D-0094/D-0095/GIT-074 establish SPEC-0009; D-0096/GIT-076 close Phase 1; D-0097/D-0098/D-0099/GIT-078 close Phase 2; D-0100/D-0101/GIT-079 close Phase 3 and the complete spec. D-0072's prior proposal, D-0073's `/4bb1/` evidence, and rejected `/3cd3/` remain historical.

D-0120 created SPEC-0012; GIT-089 published the plan. D-0121–D-0123/GIT-090 close Phase 1, D-0124/GIT-091 close combined Phase 2/absorbed Phase 3, D-0125–D-0130/GIT-092–GIT-094 close Phase 4, D-0131/GIT-095 close Phase 5, and D-0133/D-0134/GIT-096 close Phase 6 and the complete spec. SPEC-0012 remains independent from paused SPEC-0008 and cannot mutate animation/project content or resume any Animator phase.

D-0135/D-0136/GIT-097 close SPEC-0013. D-0137 creates approved planning-only SPEC-0014 with four separately gated phases: notification foundation/UI; Assistant and Terra completion/failure across navigation; Export completion/failure across navigation; and offline/reliability/dormant-contract closeout. All four phases remain Unauthorized/Not started and Phase 1 is additionally blocked by the PM V5 owner gate.

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

D-0062 explicitly permits two internal stopped-owner checkpoints within the same corrected Phase 4 before its single visible acceptance/CPA/publication. This narrow exception does not change separation between numbered phases.

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
