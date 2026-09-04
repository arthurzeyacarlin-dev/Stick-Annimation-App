# SPEC-0005 — Professional Shared Stick Motion Engine

Status: **Proposed and decision-complete. Arthur has approved the product/spec direction and selected Phase 1 as the next implementation only after this docs-only activation is reviewed, published, and integrated. No implementation phase is active.**

Owner: Arthur
Spec role: Spec Architect
Created: 2026-09-04
Last updated: 2026-09-04
Decision link: [D-0043](../DECISIONS.md)
Related work: [`SPEC-0004`](0004-future-real-ai-animator-requirements.md), [`TODO SPEC-005`](../TODO.md), [`Current State`](../CURRENT_STATE.md), [`Session Handoff`](../SESSION_HANDOFF.md)

> **Lifecycle boundary.** This task creates specification and control-plane records only. It does not implement, stage, commit, merge, push, publish, deploy, start an executor, create a review server, contact a provider, or spend money. Phase 1 becomes the next implementation task only after this exact activation is reviewed and separately published/integrated into clean canonical `main`.
>
> **SPEC-0004 relationship.** SPEC-0004 Phases 1, 2, and timing-only Phase 2.5 remain Verified, published, and integrated. The unpublished Phase 2.6 executor result was rejected by Arthur after human motion review and is not accepted, propagated, published, or runtime truth. This spec supersedes Phase 2.6's intended shared-motion job. SPEC-0004 is paused before Phase 3 until all seven SPEC-0005 phases are accepted, published, and integrated. This does not move, authorize, or rewrite SPEC-0004's later real-provider/Terra phase.

## 1. Owner outcome

Diamond Animator needs one professional shared Stick motion engine, not a growing library of hand-authored joint-coordinate animations. A local Pretend-AI planner and a later separately authorized Terra planner must be able to describe **what movement should happen** through the same bounded movement-goal contract. The local engine must turn that intent into coordinated whole-body key poses, physically readable support and weight, natural paths and timing, and finally complete ordinary independent editable Stick keyframes.

The final pipeline is:

```text
Pretend AI or a future Terra planner
→ strict action-independent movement goal
→ whole-body key-pose maker
→ support, balance, weight, and ground mechanics
→ natural timing, arcs, in-betweens, and follow-through
→ complete ordinary independent editable Stick keyframes
→ isolated Preview
→ Cancel or one atomic Apply
→ full-playback automation and Arthur's ordinary-app review
```

The engine owns generation only before Preview. After Apply, the result is normal user-owned project data. It contains no live controller and the engine has no continuing authority.

### Before and after

| Current verified/rejected state | Intended result after all seven phases |
| --- | --- |
| Published Phase 2/2.5 accepts complete raw 11-joint key-pose coordinates and interpolates them with fixed-length segment reconstruction and one timing profile per transition. | Planners send movement intent; one shared local engine creates the coordinated body poses and natural motion. |
| The rejected unpublished Phase 2.6 added strict action-specific validation and contact repair around source-authored coordinate recipes. | Mechanics are produced from action-independent body/support rules. Action recipes contain no raw joint coordinates. |
| Existing proof can establish schema, deterministic output, editability, and a Play/Pause toggle without proving that a person watched a full animation. | Proof records a complete ordered playback cycle, independent quality expectations, adversarial bad-motion rejection, ordinary-app review, and Arthur's visible acceptance. |
| Walk/run can be declared or numerically checked without proving believable gait mechanics. | Walk and run have distinct contact cycles, alternating support, opposite arm swing, root travel, and run-only flight. |
| Future planners could fork the format or return raw coordinates. | Pretend AI and the future Terra adapter enter through one strict `stick.movement-goal/v1` door and the same local engine. |

## 2. Evidence and root cause

### 2.1 Published runtime traced at canonical basis

This spec was prepared from clean detached canonical-main basis `4c1da7fa4ea14ed82af950f7ed748b86387a7e0a`, where local `main` and `origin/main` also pointed when inspected.

- `src/lib/ai/stickFigureMotionEngine.ts` currently receives complete raw `create_key_pose` point sets. Phase 2 normalizes their canonical segment lengths, interpolates the hip and shortest signed segment angles, rebuilds the joint tree, and bakes independent keyframes. Phase 2.5 changes transition progress/spacing; it does not author action mechanics.
- `src/lib/ai/stickFigureCommandExecutor.ts` correctly keeps Preview isolated, makes Cancel/failure no-ops, and commits Apply as one history transaction. The temporary plan/timing information is not stored in the applied document.
- `src/components/workspace/stickfigure/StickFigureWorkspace.tsx` owns real `requestAnimationFrame` playback. Play loops the selected project timeline; human Play/Pause and onion remain workspace state.
- The applied Stick document already supports the required end state: ordinary complete keyframes, manual joint editing, Undo/Redo, browser-local Save/Open, onion skin, Creator round trip, and a derived line head.

These published primitives are useful and protected. The missing capability is between high-level intent and their coordinate/timing input.

### 2.2 Read-only inspection of the rejected unpublished Phase 2.6 result

The rejected executor worktree `/Users/arthurcarlin/.codex/worktrees/8de8/stick-animation-app` was inspected read-only. Nothing there was edited, staged, committed, stopped, deleted, or published.

- Its base/HEAD was canonical `4c1da7fa4ea14ed82af950f7ed748b86387a7e0a`; its index was empty; its dirty set matched the former exact eight-path Phase 2.6 ceiling.
- Its ignored proof manifest, SHA-256 `900f1faf0fbdddbccd8301a62628cd6889990e1a3c75ca2977fdcd56995a8d5e`, reported 624 assertions, eight valid fixtures, 62 invalid foundation cases, 66 browser flows, 12 screenshots, 43 artifacts, and zero provider/external traffic.
- The implementation added useful strict schemas, binding, fail-closed validation, independent-frame preservation, and planted-contact repair. Those technical results do not equal accepted visible motion.
- The source recipes still contained full action-specific raw joint coordinates, and the core primarily validated those coordinates against action-specific tables. It did not make whole-body poses from an action-independent movement description.
- The browser proof clicked Play, waited only for `playing`, immediately clicked Pause, and waited for `paused`. It did not require frame `0 → … → last → 0`, a minimum playback duration, or observation of every frame.
- The frozen fixture was built and regenerated by the same validator/implementation path, then compared exactly to itself. Candidate digests and frame goldens therefore proved determinism, not independent motion quality.
- The screenshots were static Preview/applied states. They could not prove weight, arcs, velocity continuity, support, gait, or overall motion quality.

Arthur rejected the result after human review. It must never be described as accepted, completed, propagated, published, or professional motion. Its useful proof ideas may inform new independent tests, but its bytes have no implementation authority under this spec.

### 2.3 Root cause

The rejected approach tried to make hand-authored coordinate recipes safer. The product needs a motion authoring system. The root cause is architectural:

1. action knowledge and body coordinates were fused in fixtures;
2. no shared whole-body pose maker converted intent into coordinated chains;
3. support, balance, and ground mechanics were mostly validators/repairs after the poses already existed;
4. interpolation could smooth bad poses but could not invent anticipation, contact, follow-through, or believable gait;
5. proof used implementation-generated exact outputs and static screenshots where independent references and full playback were required.

SPEC-0005 separates planning, pose creation, mechanics, path/timing, baking, and quality review.

## 3. Final shared contract

### 3.1 `stick.movement-goal/v1`

`stick.movement-goal/v1` is the only planner-to-engine format. It is JSON-compatible strict data, cloned/frozen on entry, bound to the current project/transaction/base digest, size/count bounded, finite, dense, duplicate-key rejected, and unknown-field rejected.

| Field | Exact meaning |
| --- | --- |
| `contractVersion` | Exact literal `stick.movement-goal/v1`. |
| `goalId` | Stable `1..64`-character lowercase ASCII slug used for deterministic local IDs, never executable text. |
| `binding` | Exact `projectId`, `transactionId`, `baseDocumentRevision`, and `baseDocumentDigest`. |
| `frameCount` / `fps` | Existing SPEC-0004 bound only: `8..24` frames and `12` or `24` FPS. SPEC-0004 Phase 3 still owns any later expansion. |
| `facing` | `front`, `left`, or `right`. |
| `travel` | `in_place`, `left`, or `right`, plus displacement `0..0.90` in standing-body-height units. It is intent, not root coordinates. `in_place` requires zero. |
| `beats` | Two through eight ordered semantic beats with unique `1..32`-character lowercase ASCII IDs and strictly increasing integer frame hints inside `0..frameCount-1`. The first hint is `0`, the last is `frameCount-1`, and the engine may insert mechanically required poses while preserving the outer frame bound. |
| `beat.root` | `hold`, `shift`, `rise`, `lower`, or `travel`, with magnitude `0..0.35` in standing-body-height units and a semantic direction where applicable. |
| `beat.support` | `both`, `left`, `right`, or `airborne`; later phase gates decide when `airborne` is accepted. |
| `beat.posture` | `neutral`, `compress`, `extend`, `hinge`, or directional lean, with `small`, `medium`, or `large` intensity. Planners do not supply degrees. |
| `beat.limbs` | Zero through four unique arm/leg role goals: `relax`, `balance`, `reach`, `guard`, `swing`, `plant`, `step`, or `recover`; each uses side, a closed relative target region (`low`/`middle`/`high` × `front`/`center`/`side`/`back`), and extension `0..1`, not points or angles. |
| `beat.energy` | `soft`, `natural`, or `sharp`; this guides later spacing but is not a user-visible Reasoning setting. |
| `beat.path` | `natural_arc`, `direct_mechanical`, or `ballistic`; natural is the default and mechanical must be explicit structured intent. |
| `locomotion` | `null` or a bounded one-cycle `walk`/`run` goal with direction, short/medium/long stride, and natural/fast pace. It remains rejected until Phase 5. |

The entire canonical UTF-8 goal is at most `32,768` bytes. It rejects joint IDs, point arrays, `x`/`y` coordinates, stored segment angles, executable code, arbitrary curve control points, animation-format payloads, action-specific coordinate tables, or unknown planner metadata. A human-readable action label may exist only in a planner-door audit envelope outside the canonical movement goal; it is discarded before goal digesting/engine entry. The pose/mechanics/path engines may not branch on it. They branch only on the semantic fields above.

Phase 2 implements the internal closed subset. Later phases enable already named fields without changing the contract identity. Phase 7 makes the same object the shared planner door. Unsupported combinations always fail before Preview; they are never approximated silently.

### 3.2 Deterministic body and units

- The current built-in 11-joint/10-segment humanoid and its canonical segment lengths remain the only body.
- `standingBodyHeight` is the neutral top-of-head-to-ground distance. Relative planner values are converted locally from that scale.
- The existing line head remains derived from the stored head joint. No circle/custom head data is introduced.
- The pose solver orders the chain deterministically: support feet/legs → pelvis/root → torso/head → reaching/acting limbs → mechanically needed balance limbs → final fixed-length rebuild and bounds validation.
- Posture intensity is a semantic engine table, not planner geometry: `small`, `medium`, and `large` directional leans map locally to `5°`, `10°`, and `15°`; compression/extension/root offsets use the same three levels at `0.08`, `0.16`, and `0.24` standing-body-height before safe joint/bounds solving.
- Two-bone limb solving preserves segment lengths, deterministic bend side, joint limits, and continuity with the preceding pose. An unreachable relative target clamps only within the documented safe semantic range or rejects; it never stretches a limb.
- Generation ends before Preview. Every output frame owns distinct ordinary IDs/content and remains independently editable after Apply.

### 3.3 Physical and visible quality rules

Automated checks are necessary but cannot declare professional quality alone. Every phase with visible output requires both independent technical evidence and Arthur's ordinary-app review.

Universal rules:

1. complete playback means observing ordered indexes `0, 1, …, last, 0` after one Play action, with no manual frame click during the cycle and an elapsed cycle time within `75%..150%` of `frameCount / fps`;
2. full-playback capture records timestamped frame indexes and body geometry for the whole cycle, not only start/end state;
3. no sample passes only because it compiles, has the right labels/counts, matches an exact implementation-generated digest, or produces still screenshots;
4. accepted references and negative mutations are source-authored independently of the engine under test and are hash-bound before execution;
5. technical proof must show why each named bad mutation fails; the same generator may not create both the expected result and the oracle;
6. Arthur watches at least two uninterrupted loops, pauses, scrubs the named landmark poses, and answers the phase-specific visible questions; any rejected required sample rejects that phase;
7. every visible phase records what automation proves separately from what Arthur accepts by sight.

## 4. Protected boundaries for all seven phases

All phases preserve:

- Preview / Apply / Cancel and the current isolated transaction boundary;
- Preview, Cancel, stale state, invalid data, concurrency/idempotency failure, injected failure, and project switch as document/history/storage/latch/view-state no-ops;
- exactly one atomic history action on Apply, exact Undo/Redo, and exact Save/Open;
- the consumed one-shot/no-post-Apply AI rule;
- one existing white Stick layer, one built-in humanoid, current frame/FPS cap, derived line head, fixed limb lengths, manual tools, onion skin, human Play/Pause, and Creator round trip;
- complete ordinary independent editable keyframes with no `hold`/live tween/controller/shared owner/lock/hidden AI data/regeneration/snap-back;
- Drawing Workspace, backgrounds, colors, custom shapes/rigs, multiple figures, layers, sound, Task/Reasoning behavior, follow-up AI editing, dashboard/auth/billing/deployment, packages/config/environment/database, and provider/client/key/request behavior;
- SPEC-0004's later free-language, variable-cap/multi-figure, UI, real Terra/provider, repair, and release phases. SPEC-0005 supplies their shared motion prerequisite; it does not steal their ownership.

Any phase that needs a boundary change stops and returns to Arthur/PM for a spec decision.

## 5. Review-copy and proof method for every phase

After focused automation, TypeScript, scoped lint, diff checks, and the permanent browser tester pass, the executor may create ordinary unpublished review copies only as ignored disposable evidence:

1. create an isolated temporary app copy and profile;
2. preload a normal saved Stick project containing the phase sample's ordinary frames, without changing product code or adding a product fixture route;
3. bind a random loopback-only `127.0.0.1` port other than `3000`;
4. use an ordinary URL with no query/hash flag, blue/private-review box, picker, overlay, tester button, public asset, permanent route, or production import;
5. record URL, PID/process group, copy path, viewport, source hashes, network ledger, and cleanup instructions in the proof manifest;
6. Arthur opens the link, confirms the normal Stick workspace, presses Play once, watches two complete loops, presses Pause, scrubs named poses, performs the requested one-frame edit/Undo/Redo where applicable, and records accept/reject plus comments;
7. after review, stop only the manifest-recorded processes, verify ports closed, delete only the exact disposable copies/profiles, and preserve durable ignored evidence.

Review links are human evidence, not publication surfaces. The permanent tester must pass before any link is sent.

## 6. Seven small sequential implementation phases

### Phase 1 — Accepted Motion References and Full-Playback Quality Gate

**Owner summary.** Establish an honest motion-quality harness before changing the engine. Protect the older good wave and make the rejected Phase 2.6 proof weaknesses impossible to repeat.

**Goal.** Bind an independently accepted reference, observe a complete real playback cycle, reject known bad-motion mutations, and produce ordinary-app review evidence. This phase changes no runtime.

**Current problem / before and after.** Today the published wave is accepted history, but newer proofs can pass with an immediate Play/Pause and exact outputs regenerated by the same code. After Phase 1, the accepted SPEC-0001 Phase 6 wave is a protected historical reference and the proof stack cannot call an unobserved or circularly judged animation “quality checked.”

**Accepted reference.** The catalog binds the published 12-frame/12-FPS three-pose wave through:

- `scripts/fixtures/stick-ai/v1/wave-request.json`, SHA-256 `f550656daf7e32e5a537b074dc157712e9a9bf896ba35502e6be7eb027043132`;
- `scripts/fixtures/stick-ai/v1/wave-command-batch.json`, SHA-256 `ab10a3c708ef58b26f20c69586c35fc8c4e4fa88d97c1fa311efaafd86a5d3d9`;
- `scripts/fixtures/stick-ai/v1/manual-wave-applied-project.json`, SHA-256 `1f02c71285dfbae10570d8737c1f4be7f0cf19a53d8083b55361788dbe01e343`.

Its accepted visible landmarks are ready at frame `0`, inward wave at `4`, outward wave at `8`, return through the loop, with the right arm communicating the wave while root, head, feet, legs, and non-waving arm remain stable. This historical wave is a readability/regression floor, not the smoothness ceiling for later generated actions.

**Execution path.** Existing accepted saved project → ordinary workspace load → one real Play → timestamp/frame/geometry sampler → observe `0..11..0` → Pause only after wrap → independent landmark/stability checks → mutation checks → ordinary review link.

**Scope and exact allowlist.** One Plan-mode Spec Executor may add exactly these six tracked paths:

```text
scripts/fixtures/spec0005-stick/v1/quality-baseline-cases.json
scripts/fixtures/spec0005-stick/v1/playback-quality-review-plan.json
scripts/spec0005-stick/phase1BrowserProof.ts
scripts/spec0005-stick/recordPhase1Proof.ts
scripts/spec0005-stick/validatePhase1Proof.ts
scripts/validateStickMotionQualityBaseline.ts
```

Ignored artifacts may exist only under `output/spec-0005/phase-1/**`. Every runtime, component, current fixture, package/config, and control-plane path is read-only.

**Non-goals.** No motion-engine, app, fixture-source, playback-runtime, UI, provider, dependency, or project-data change. Phase 1 judges proof quality only; it does not claim the historical held wave is the final smooth-motion target.

**Entry gate.** This SPEC-0005 activation is reviewed, published, and integrated into clean canonical `main`; the executor starts from that exact SHA with empty index, exclusive worktree, and the six-path ceiling. Phase 1 is the only selected next implementation.

**App-copy review.** One ordinary link loads the accepted historical wave. Arthur presses Play, watches two complete loops, confirms ready → inward → outward is readable and the rest of the body is stable, pauses, scrubs frames `0`, `4`, and `8`, and confirms normal timeline/manual controls remain present.

**Measurable acceptance.** Both desktop `1440×900` and compact `390×844` runs observe every index in order and wrap; elapsed cycle is `0.75..1.50s`; named landmarks are present; unrelated-body coordinate digests remain stable at the three owner poses; all ten limb lengths remain within the current two-pixel output tolerance; zero API/provider/external request; zero actionable console/page error. The accepted wave passes every required independent check.

**Required negative cases.** Immediate Play/Pause without wrap; skipped/out-of-order frame; frozen all-frame project; missing inward or outward landmark; one-frame wrist teleport; root/foot drift; broken limb length; cycle outside tolerance; still-screenshot-only evidence; source hash mismatch; and a fixture generated by the implementation under test without the independent catalog must each fail the appropriate proof or manifest gate.

**Proof.** Six-path manifest with base/status/index/scope hashes; independent source catalog; mutation receipt; two-viewport full-playback trace; ordinary screenshots plus a time-based capture/contact sheet or video; permanent browser tester; TypeScript/scoped lint/diff; zero-egress ledger; self-tests that mutate every material manifest field. Exact coordinate/digest equality may protect historical bytes but cannot be the sole quality oracle.

**Protected regressions.** The wave bytes and visible behavior; normal app controls; all universal boundaries in §4.

**Stop boundary / later relationship.** Return an Implementation Review Packet and stop with empty index. No engine code or Phase 2 begins. Phase 2 may rely on this harness only after Phase 1 is human-accepted, CPA-closed, and separately published/integrated.

**Recommended executor.** `gpt-5.6-sol`, `xhigh`, because proof independence and real-browser timing are high-risk even though runtime scope is zero.

### Phase 2 — Action-Independent Whole-Body Key-Pose Maker

**Owner summary.** Turn semantic body goals into coordinated key poses without action-specific coordinates.

**Goal.** Implement the internal closed subset of `stick.movement-goal/v1` and a deterministic whole-body pose solver for grounded non-locomotion micro-movements.

**Current problem / before and after.** Current planners must provide all joint points. After this phase they provide grounded semantic beats, and the pose engine creates root, torso, head, acting limb, and balance-limb positions with fixed lengths.

**Execution path.** Strict internal movement goal → binding/field validation → neutral body metrics → ordered chain solver → two-bone limb solving and balance response → complete important poses → existing published Phase 2.5 timing/baker → independent ordinary keyframes → existing transaction.

**Scope and exact allowlist.** Exactly nine tracked paths:

```text
src/lib/ai/stickFigureMovementGoal.ts
src/lib/ai/stickFigurePoseEngine.ts
src/lib/ai/stickFigureMotionEngine.ts
src/lib/ai/stickFigureCommandExecutor.ts
scripts/fixtures/spec0005-stick/v2/whole-body-pose-cases.json
scripts/spec0005-stick/phase2BrowserProof.ts
scripts/spec0005-stick/recordPhase2Proof.ts
scripts/spec0005-stick/validatePhase2Proof.ts
scripts/validateStickWholeBodyPoseEngine.ts
```

Ignored output: `output/spec-0005/phase-2/**`. No UI, old fixture, provider, package/config, or control-plane edit.

**Non-goals.** No airborne mechanics, automatic mechanics-pose insertion, new path/timing model, gait, final action recipe, language routing, planner connection, UI, provider, or cap expansion.

**Entry gate.** Phase 1 is accepted, closed, and published/integrated; its independent quality harness revalidates unchanged. Phase 2 starts in a new Plan-mode worktree from that publication SHA.

**App-copy review.** Four ordinary links show semantic reach-high-right, centered compression, left support shift, and neutral recovery. Arthur watches two loops, scrubs important poses, and checks that the whole body cooperates instead of only one joint moving.

**Measurable acceptance.** Goals contain zero raw points/angles/joint IDs; the core has no action-name branch; fixed lengths stay within two pixels; requested effectors finish within `8%` of standing body height of their body-relative target region; grounded feet remain within two pixels; reach/shift cases produce a mechanically related torso/root or balance-limb response; mirrored goals produce mirrored geometry within rounding tolerance; deterministic repeat is byte exact; every result is independent/editable and passes Phase 1 full-playback capture.

**Required negative cases.** Raw `x`/`y`, points, angles, code, unknown fields, non-finite/sparse/duplicate data, wrong binding/version/count, unreachable unsafe target, hyperextended/reversed bend, stretched limb, action-name-only goal, action-specific core switch, uncoordinated single-joint reach, and unsupported airborne/locomotion goal fail before Preview.

**Proof.** Independent semantic input cases and expected qualitative invariants, solver unit/property checks, mirrored/metamorphic cases, mutation tests, four full-playback browser flows, one-frame manual edit/Undo/Redo/Save/Open, permanent tester, manifest, and Arthur review. The solver may have deterministic coordinate snapshots as regression evidence, but they are secondary to independent semantic/physical assertions.

**Protected regressions.** Phase 1 harness/reference and all §4 boundaries. Published Phase 1/2/2.5 materializers remain selectable/unchanged unless the new hidden Phase 2 option is explicitly used.

**Stop boundary / later relationship.** Stop after the four grounded micro-movements. No airborne mechanics, natural paths, gait, final actions, planner connection, or Phase 3 work. Phase 3 extends the shared engine; it does not fork it.

**Recommended executor.** `gpt-5.6-sol`, `ultra`, because body-chain architecture and future compatibility are foundational.

### Phase 3 — Weight, Balance, Support, and Ground Mechanics

**Owner summary.** Make grounded/airborne transitions mechanically readable and let the engine insert poses that physics requires.

**Goal.** Add support ownership, ground contact, center-of-mass proxy, anticipation/contact/compression/recovery rules, and deterministic mechanically required key-pose insertion.

**Current problem / before and after.** A pose can be geometrically valid yet float, slide, fall outside support, or omit takeoff/landing. After Phase 3, support transitions generate the missing structural poses before baking.

**Execution path.** Movement goal → whole-body requested poses → support/ground state machine → support-polygon and center-of-mass proxy → required-pose insertion → re-solve body chains → validate contact/weight → existing timing/baker/transaction.

**Scope and exact allowlist.** Exactly nine tracked paths:

```text
src/lib/ai/stickFigureMovementGoal.ts
src/lib/ai/stickFigurePoseEngine.ts
src/lib/ai/stickFigureMechanicsEngine.ts
src/lib/ai/stickFigureMotionEngine.ts
src/lib/ai/stickFigureCommandExecutor.ts
scripts/fixtures/spec0005-stick/v3/body-mechanics-cases.json
scripts/spec0005-stick/phase3BrowserProof.ts
scripts/spec0005-stick/recordPhase3Proof.ts
scripts/spec0005-stick/validatePhase3Proof.ts
```

Ignored output: `output/spec-0005/phase-3/**`.

**Non-goals.** No new path interpolation, Earth-gravity implementation, locomotion cycle, action recipe, language/planner route, UI, provider, or frame/FPS expansion.

**Entry gate.** Published/integrated Phase 2 and unchanged Phase 1 harness. Plan-mode trace must show the nine paths suffice; otherwise stop before edits.

**App-copy review.** Ordinary links show weight shift, deep compression/recovery, takeoff/contact/recovery, and direction-change settle. Arthur watches two loops and inspects feet, pelvis, knees, and landing frames.

**Measurable acceptance.** The ground line is the starting neutral pose's lowest foot `y` and stays fixed for the transaction. A planted foot moves at most two pixels until release. The 2D center-of-mass proxy is `balanceX = (2*hip.x + neck.x + head.x) / 4`; with double support it projects between the two planted foot anchors plus/minus `5%` of standing body height, and with single support it stays within `8%` of standing body height of that anchor. Single support places the pelvis/torso visibly toward the support side. Grounded→airborne inserts anticipation/takeoff, airborne→grounded inserts contact/compression/recovery, and unsupported reversal inserts a settle/weight-transfer pose when frame capacity permits; insertion is deterministic and never exceeds 24 frames; every inserted pose is complete and independently editable.

**Required negative cases.** Foot slide, false planted tag, support-side mismatch, center outside support, airborne without takeoff, landing without contact/compression/recovery, long unexplained hover, knee inversion, ground penetration, instant reversal, required insertion beyond the frame cap, and post-bake repair that changes an applied document all fail.

**Proof.** Support/contact traces, auto-insertion decisions, independent mechanics invariants, mutated failures, full-cycle capture at both viewports, manual edit persistence, protected suites, manifest, and Arthur review. Numeric proxies are supporting evidence; visible weight acceptance is mandatory.

**Protected regressions.** Phase 1 reference, Phase 2 semantic solver, §4 boundaries, and published Phase 2.5 timing math.

**Stop boundary / later relationship.** No new in-between path model, Earth-gravity curve, gait, final recipe, or planner route. Phase 4 consumes the mechanics states.

**Recommended executor.** `gpt-5.6-sol`, `ultra`, because support/contact defects are subtle and foundational.

### Phase 4 — Natural Speed, Paths, and In-Betweens

**Owner summary.** Connect good mechanical poses with motion that accelerates, decelerates, arcs, follows through, and obeys gravity.

**Goal.** Replace one generic segment interpolation assumption with mechanics-aware body/limb paths and velocity-continuous timing while still baking ordinary keyframes.

**Current problem / before and after.** Existing timing curves space frames but all joints still derive from one root/angle interpolation. After Phase 4, planted chains, swing limbs, root travel, impact/recovery, and airborne roots follow appropriate natural paths.

**Execution path.** Requested/inserted key poses + support transitions + existing timing profiles → per-chain path selection → tangent/velocity continuity → natural acceleration/deceleration and follow-through → fixed-length reconstruction → complete baked frames → transaction.

**Scope and exact allowlist.** Exactly nine tracked paths:

```text
src/lib/ai/stickFigureMovementGoal.ts
src/lib/ai/stickFigureMechanicsEngine.ts
src/lib/ai/stickFigurePathEngine.ts
src/lib/ai/stickFigureMotionEngine.ts
src/lib/ai/stickFigureCommandExecutor.ts
scripts/fixtures/spec0005-stick/v4/natural-path-cases.json
scripts/spec0005-stick/phase4BrowserProof.ts
scripts/spec0005-stick/recordPhase4Proof.ts
scripts/spec0005-stick/validatePhase4Proof.ts
```

Ignored output: `output/spec-0005/phase-4/**`.

**Non-goals.** No walk/run gait planner, action recipe catalog, language/planner route, UI, provider, or stored live path/tween controller.

**Entry gate.** Phase 3 mechanics is accepted/published and its support trace revalidates. The Plan-mode executor freezes the exact standing-body scale used for physics.

**App-copy review.** Ordinary links show a reaching arc, fast dodge-and-settle micro-movement, hop parabola, and landing follow-through. Arthur watches two loops at normal speed, then scrubs at least five evenly distributed frames.

**Measurable acceptance.** Natural swing end effectors have non-collinear intermediate samples and stay inside their declared arc corridor; no non-impact joint moves more than `35%` of standing body height in one frame. For adjacent moving samples that each exceed `2%` of standing body height per frame, non-impact velocity magnitude ratio is at most `2.5×` and direction changes by at most `90°`; a transition to/from the lower threshold must align with an endpoint, settle, anticipation, contact, or recovery sample. Direction reversal includes a near-zero/settle sample; natural transitions are not equal-gap constant pace; planted feet preserve Phase 3 contact. Airborne vertical root samples use `g = 9.81m/s²` after mapping neutral standing height to `1.75m`, with takeoff/contact endpoints and a single apex; tolerance is two stage pixels after rounding. Follow-through occurs only on declared free chains and decays by recovery.

**Required negative cases.** Teleport, snap, equal-gap natural motion, zigzag arc, overshoot, velocity cusp without impact, two apexes, float/linear airborne root, wrong gravity sign/scale, planted-foot drift, follow-through on support limb, endless oscillation, and `direct_mechanical` without explicit structured intent fail.

**Proof.** Unrounded path/velocity traces, independent physics/metamorphic checks, bad-path mutations, full playback/time capture, body integrity/editability/history/storage regressions, manifest, and Arthur review. Exact baked coordinates alone are insufficient.

**Protected regressions.** All prior phase invariants and §4. Phase 2.5 formulas remain available but path selection may combine them only as specified; no live curve is stored.

**Stop boundary / later relationship.** No walk/run cycle planner or final action recipe. Phase 5 composes gait from these shared paths.

**Recommended executor.** `gpt-5.6-sol`, `ultra`, because temporal/physics behavior needs high-confidence reasoning and browser proof.

### Phase 5 — Real Walk and Run Locomotion

**Owner summary.** Produce distinct believable locomotion instead of a crab walk or a sped-up walk.

**Goal.** Implement one-cycle left/right walk and run planning through the shared contract and engine.

**Current problem / before and after.** Labels and alternating-leg checks can pass while root travel, arm opposition, contacts, or flight are wrong. After Phase 5, walk and run have different mechanics and visibly travel.

**Execution path.** `locomotion` movement goal → gait-cycle planner → contact/down/passing/up key goals → Phase 2 pose maker → Phase 3 support/ground mechanics → Phase 4 paths/timing → ordinary frames → transaction.

**Scope and exact allowlist.** Exactly ten tracked paths:

```text
src/lib/ai/stickFigureMovementGoal.ts
src/lib/ai/stickFigurePoseEngine.ts
src/lib/ai/stickFigureMechanicsEngine.ts
src/lib/ai/stickFigurePathEngine.ts
src/lib/ai/stickFigureLocomotionPlanner.ts
src/lib/ai/stickFigureCommandExecutor.ts
scripts/fixtures/spec0005-stick/v5/locomotion-cases.json
scripts/spec0005-stick/phase5BrowserProof.ts
scripts/spec0005-stick/recordPhase5Proof.ts
scripts/spec0005-stick/validatePhase5Proof.ts
```

Ignored output: `output/spec-0005/phase-5/**`.

**Non-goals.** No general language understanding, core-action recipe catalog, provider/future-Terra adapter, UI, multi-figure scene, cap expansion, or alternate gait-specific baker.

**Entry gate.** Phase 4 accepted/published; 24-frame cap can contain one complete requested cycle. Any need for the broader SPEC-0004 Phase 3 cap returns to Arthur instead of widening here.

**App-copy review.** Four ordinary links: walk right, walk left, run right, run left. Arthur watches two loops and answers: does it travel, alternate support, swing opposite arms, read as walk versus run, and avoid sideways crab motion?

**Measurable acceptance.** Each gait has ordered contact → down → passing → up landmarks for both sides; left/right support alternates; when left leg is forward the right arm is forward and vice versa at the corresponding landmark; root displacement is monotonic in requested direction with no backtracking over `3%` of total travel; planted foot stays within two pixels; walk always retains at least one ground contact and has no flight; run includes at least one interval with both feet airborne and shorter contact proportion than its paired walk; run changes cadence/flight/vertical dynamics, not merely playback speed; final travel is at least one short stride and within stage bounds.

**Required negative cases.** Same-side arm/leg swing, non-alternating support, crab/sideways posture, in-place leg cycling, sliding planted feet, walk flight, run without flight, run byte-identical to time-scaled walk, wrong-direction/backtracking root, missing gait landmark, leg crossing/broken length, and out-of-bounds travel fail.

**Proof.** Contact and opposition traces, gait-phase/state receipts, walk/run structural comparison independent of labels, mutated crab/sped-up-walk fixtures, two-viewport full playback, manual-edit/Undo/Redo/Save/Open, permanent tester, manifest, and Arthur acceptance.

**Protected regressions.** All prior engine and §4 rules. Locomotion planner emits the same movement-goal semantics and cannot bypass shared mechanics/path validation.

**Stop boundary / later relationship.** No natural-language routing, action-recipe catalog, real provider, cap expansion, or UI change. Phase 6 reuses gait/engine but does not rewrite it.

**Recommended executor.** `gpt-5.6-sol`, `ultra`, because gait requires coordinated temporal mechanics and visible judgment.

### Phase 6 — Rebuild Core Actions Through the Shared Engine

**Owner summary.** Rebuild wave, jump, hop, bow, and dodge as semantic recipes, then accept them in the ordinary app.

**Goal.** Replace raw hand-coordinate recipe piles with bounded `stick.movement-goal/v1` recipes consumed by Phases 2–5.

**Current problem / before and after.** Existing/rejected examples hard-code whole bodies and can preserve unrelated poses or bad mechanics. After Phase 6, recipes state movement intent only and share all pose/mechanics/path code.

**Execution path.** Local fixed recipe data → strict movement goal → shared pose/mechanics/path engine → complete ordinary frames → transaction → full-playback proof and ordinary review.

**Scope and exact allowlist.** Exactly seven tracked paths:

```text
src/lib/ai/stickFigureMotionRecipes.ts
src/lib/ai/stickFigureCommandExecutor.ts
scripts/fixtures/spec0005-stick/v6/action-recipe-cases.json
scripts/spec0005-stick/phase6BrowserProof.ts
scripts/spec0005-stick/recordPhase6Proof.ts
scripts/spec0005-stick/validatePhase6Proof.ts
scripts/validateStickMotionRecipes.ts
```

Ignored output: `output/spec-0005/phase-6/**`. The accepted lower engine files are read-only. If a recipe exposes an engine defect, stop and return a narrowly authorized correction to the owning earlier phase; do not patch around it with coordinates.

**Non-goals.** No normal-chat/Pretend-AI/Terra connection, raw-coordinate fallback, lower-engine rewrite, provider, UI, follow-up editing, or SPEC-0004 phase work.

**Entry gate.** Phase 5 accepted/published and all earlier manifests revalidate. Plan-mode source scan confirms recipe representation needs no raw coordinate field.

**App-copy review.** Five ordinary links for wave, jump, hop, bow, and dodge. Arthur watches two full loops, scrubs named anticipation/action/contact/recovery poses, and compares against the earlier rejected failures.

**Measurable acceptance.** Recipe and fixture source contain no joint coordinate/angle arrays; all five use the same public engine call; wave has stable feet/root and readable alternating hand extremes with no inherited extra action; jump and hop visibly compress, take off, reach one apex, contact, compress, and recover, with hop lower/shorter than jump; bow has readable anticipation/hinge/bottom settle/recovery and maintained support; dodge transfers weight, moves in the requested direction, settles before reversal, returns without foot slide, and includes no unrequested gesture. Every action passes full-cycle, mechanics, path, ownership, and transaction gates.

**Required negative cases.** Raw-coordinate recipe; action-name switch in lower engine; wave with clap/hop; jump with wave hand; hop with head nod/shake; floating apex dwell; missing landing recovery; compressed unreadable bow; instant dodge reversal; sliding feet; extra pre/post action; and recipe-specific direct keyframe writer fail.

**Proof.** Source/AST scan plus runtime rejection, semantic recipe snapshots, independent action landmark/invariant catalog, adversarial mutations derived outside the engine, full-playback captures, permanent tester, manifest, and Arthur's five explicit accept/reject decisions. Self-generated exact goldens remain secondary only.

**Protected regressions.** The historical accepted wave remains available/protected until this phase is accepted and deliberately routed in a later authorized task. All §4 systems remain unchanged.

**Stop boundary / later relationship.** Do not connect normal chat, Pretend AI, or Terra. Do not modify lower engine bytes. Phase 7 creates the shared planning door and final gate.

**Recommended executor.** `gpt-5.6-sol`, `xhigh`, because the engine is established but visible action quality remains demanding.

### Phase 7 — Shared Pretend-AI / Terra-Ready Planning Door and Final Gate

**Owner summary.** Prove that local Pretend AI and a future Terra planner describe the same bounded goal and use the same engine, without contacting a provider.

**Goal.** Add one strict planner door, connect a local Pretend-AI adapter to the Phase 6 recipes, validate a provider-free Terra-shaped test adapter, and run the complete quality/ownership regression gate.

**Current problem / before and after.** Planner formats could fork or a future model could return raw coordinates. After Phase 7, all accepted planning output is `stick.movement-goal/v1`; only the local engine may create poses/frames.

**Execution path.** Pretend recipe adapter **or** provider-free Terra-shaped fixture adapter → identical planner-door validation/binding → shared movement goal → one shared pose/mechanics/path/baker pipeline → existing Preview/Apply/Cancel transaction → full-playback and Arthur review.

**Scope and exact allowlist.** Exactly eight tracked paths:

```text
src/lib/ai/stickFigureMovementGoal.ts
src/lib/ai/stickFigurePlannerDoor.ts
src/lib/ai/stickFigureMotionRecipes.ts
src/lib/ai/stickFigureCommandExecutor.ts
scripts/fixtures/spec0005-stick/v7/planner-door-cases.json
scripts/spec0005-stick/phase7BrowserProof.ts
scripts/spec0005-stick/recordPhase7Proof.ts
scripts/spec0005-stick/validatePhase7Proof.ts
```

Ignored output: `output/spec-0005/phase-7/**`. No provider client, route, key, environment/config, package, UI, SPEC-0004 provider-phase, or deployment path may change.

**Non-goals.** No live Terra/provider/API call, credential/config work, pricing/privacy/cost decision, language-model quality claim, second planner format, new UI behavior, follow-up editing, deployment, or SPEC-0004 real-provider implementation.

**Entry gate.** Phase 6 is accepted/published; all six prior manifests and accepted source hashes revalidate. The current provider/privacy/cost gates remain closed because this phase makes no live request.

**App-copy review.** Ordinary links expose wave, jump, hop, bow, dodge, walk, and run projects produced through the shared door. Arthur watches two full loops of each, scrubs landmarks, edits one in-between joint in at least one action, verifies Undo/Redo and Save/Open, and gives one explicit final shared-engine acceptance decision.

**Measurable acceptance.** Pretend and Terra-shaped test adapters that express the same intent yield the same canonical movement-goal digest and engine result; both reject raw coordinates/code/curves/unknown fields; planner identity cannot select a different engine/materializer; all seven actions pass their prior full-playback and mechanics gates at both viewports; every frame remains complete/independent/editable; one-shot and transaction invariants pass; provider/API/external request counts are zero; source scan finds no provider client/key/env/config or second animation format.

**Required negative cases.** Planner-specific schema/engine, raw points or executable code, unbounded beats/frames, wrong/stale binding, unknown field, planner-selected materializer, provider client construction, network attempt, fake “Terra” result in a second format, hidden AI data in applied project, post-Apply regeneration, and any prior bad-motion mutation fail.

**Proof.** Cross-adapter equivalence, strict schema/security mutations, source scan, all prior engine/action tests, full-cycle browser evidence, manual ownership/history/storage/Creator/onion/permanent tester, zero-egress ledger, technical manifest, and Arthur final review.

**Protected regressions.** Everything in §4 plus all earlier accepted manifests and the current SPEC-0004 future-provider ownership.

**Stop boundary / later relationship.** Stop after the provider-free planner door and final acceptance packet. Do not contact Terra or another model, change a key/config/route/UI, move SPEC-0004's real-provider phase, publish, or resume SPEC-0004 Phase 3. SPEC-0004 resumes only after Phase 7 is accepted, CPA-closed, separately published/integrated, and a later task explicitly authorizes its next phase.

**Recommended executor.** `gpt-5.6-sol`, `ultra`, because the final shared boundary must prevent format/authority drift and reprove the whole system.

## 7. Phase lifecycle and manifest rules

Exactly seven phases exist. There is no Phase 7.5 or silent repair phase.

For each phase:

1. the preceding phase and control-plane record must be accepted, published, and integrated in canonical `main`;
2. one new dedicated Spec Executor starts in Plan mode from that exact SHA, verifies clean base/empty index/exclusive ownership/exact path ceiling, traces the real execution path, and executes only that phase;
3. the executor changes only the phase allowlist plus its ignored output root, creates and independently validates a technical proof manifest, provides review links only after the permanent tester passes, returns a Spec Executor Implementation Review Packet, and completely stops;
4. Arthur and the Project Manager accept or reject. Rejection returns to a separately authorized correction executor; it causes no propagation/publication;
5. after acceptance and explicit worktree transfer, one Control Plane Architect verifies unchanged accepted bytes/evidence, updates canonical records, runs memory/tracked-state closeout, returns a CPA PM Review Packet, and stops with empty index;
6. only a later explicit publication instruction authorizes staging the exact reviewed implementation/control-plane set, committing, fast-forwarding clean canonical `main`, pushing normally, and verifying `0/0` synchronization;
7. only then may the next phase begin.

Every manifest binds exact base/HEAD/branch, index, observed/expected allowlist, source hashes/sizes, fixture provenance, command order, receipts/artifacts, browser URLs/processes/viewports, full-playback traces, human-review status, network ledger, cleanup state, and mutation self-tests. It rejects one-byte/status/base/path/count/order/tolerance/reference/network/lifecycle changes. A manifest cannot mark the phase accepted; only Arthur/PM review can.

## 8. Explicit non-goals

SPEC-0005 does not add or change:

- Drawing/backgrounds/camera/props;
- stick colors, multiple layers/figures, custom rigs/shapes, non-humanoid bodies, or head format;
- sound, export, project migration, or deployment;
- visible Task/Reasoning behavior, Mode, new chat UI, general language matching, follow-up AI editing, or post-Apply AI authority;
- live tween/shared hold ownership/hidden controller/AI-only data/locks/regeneration/snap-back;
- current frame/FPS caps or SPEC-0004 Phase 3's broader scene ownership;
- live provider/model/client/API/key/search/RAG, paid request, price/cost/privacy/retention policy, dashboard, auth, billing, or rate limits;
- SPEC-0004's later Terra/provider phase, repair phase, or release phase.

## 9. Decision-complete vs named gates

Decision-complete now:

- final pipeline and one shared movement-goal contract;
- action-independent/raw-coordinate prohibition;
- seven exact sequential phases and phase-specific allowlists;
- full-playback definition, independent-reference rule, ordinary-review method, editability/transaction/regression boundaries;
- whole-body, mechanics, path/gravity, gait, action-recipe, and planner-door outcomes;
- no-provider/no-scope-expansion boundary.

Named gates that do not block Phase 1:

- later-phase numeric thresholds may be tightened by independent evidence during that phase, but may not weaken the visible outcome or protected boundary without Arthur/PM review;
- if 24 frames cannot contain a required mechanically complete sample, stop and return to SPEC-0004 Phase 3's owner decision rather than silently widen the cap;
- exact current Terra alias/pricing/privacy/retention/budget and any live request remain the later SPEC-0004 provider gate;
- product-wide “professional-grade” release claims still require the later representative benchmark, comparison, cost, privacy, and release decisions. Passing SPEC-0005 proves only the accepted shared Stick motion scope.

## 10. Handoff

After this docs-only activation is reviewed and separately published/integrated, the exact next task is one new dedicated Plan-mode **SPEC-0005 Phase 1 Spec Executor** from that clean canonical-main publication SHA, using only the six Phase 1 paths and `output/spec-0005/phase-1/**`.

Until that publication occurs, do not start an executor. Do not touch the rejected `/8de8/` worktree, implement any engine phase, resume SPEC-0004 Phase 3, contact a provider, create a review copy, stage, commit, merge, push, publish, or deploy.
