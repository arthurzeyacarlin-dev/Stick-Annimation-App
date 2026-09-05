# SPEC-0005 — Professional Shared Stick Motion Engine

Status: **Approved. Phase 1 is Verified, published, and integrated. The first former Phase 2 implementation was visually rejected and is closed without acceptance/publication. Restructured Phase 2 is Approved; Authorized; Not started, pending publication of D-0046. Phases 3–8 are Unauthorized; Not started.**

Owner: Arthur
Spec role: Spec Architect
Created: 2026-09-04
Last updated: 2026-09-05
Decision links: [D-0043 through D-0046](../DECISIONS.md)
Related work: [`SPEC-0004`](0004-future-real-ai-animator-requirements.md), [`TODO SPEC-005`](../TODO.md), [`Current State`](../CURRENT_STATE.md), [`Session Handoff`](../SESSION_HANDOFF.md)

> **Lifecycle boundary.** The docs-only activation was published/integrated in exact commit `2b4f00e7a122c196b2c0600144cd638b461bbb2f`. One dedicated Phase 1 Spec Executor then completed the exact six-path proof-only result from that base and stopped. Arthur accepted the historical wave as the Phase 1 readability floor, and GIT-039 published/integrated its exact 20-path package in `2436a9414221e8ee7ef40151284cb8f4e069e828`. GIT-040 published D-0045's former whole-body-pose Phase 2 authorization in `b5ddd5e3f4fb3b19e5c7c2be8a1bd35b0f8d6070`. The first executor result under that authorization was technically green but visually rejected by Arthur; its code/proof bytes were never accepted, propagated, committed, or published, and its disposable review app/worktree was removed. D-0046 supersedes that implementation authorization, restructures this spec to eight phases, and authorizes only the new body-safety Phase 2 after D-0046 is separately published/integrated.
>
> **2026-09-05 review-delivery clarification.** Arthur explicitly requests one fresh ordinary app instance after every Phase 2 technical gate passes so he can smoke-check that the existing application still looks and works normally. This does not make Phase 2 a visible-motion phase: the instance is served unchanged directly from the exact unpublished executor worktree on one loopback-only non-`3000` root URL, contains no preloaded new action or review-only source, and cannot demonstrate or accept the new safety kernel. Phase 3 remains the first human review of new safety-gated motion.
>
> **SPEC-0004 relationship.** SPEC-0004 Phases 1, 2, and timing-only Phase 2.5 remain Verified, published, and integrated. The unpublished Phase 2.6 executor result was rejected by Arthur after human motion review and is not accepted, propagated, published, or runtime truth. This spec supersedes Phase 2.6's intended shared-motion job. SPEC-0004 is paused before Phase 3 until all eight SPEC-0005 phases are accepted, published, and integrated. This does not move, authorize, or rewrite SPEC-0004's later real-provider/Terra phase.

## 1. Owner outcome

Diamond Animator needs one professional shared Stick motion engine, not a growing library of hand-authored joint-coordinate animations. A local Pretend-AI planner and a later separately authorized Terra planner must be able to describe **what movement should happen** through the same bounded movement-goal contract. The local engine must turn that intent into coordinated whole-body key poses, physically readable support and weight, natural paths and timing, and finally complete ordinary independent editable Stick keyframes.

The permanent planner-independent pipeline is:

```text
Pretend AI or a future Terra planner
→ strict action-independent movement goal
→ enumerate whole-body pose candidates
→ important-pose body-safety gate
→ support/weight mechanics and required-pose insertion
→ natural path/timing bake
→ post-rounding and post-contact-repair body-safety gate
→ final whole-animation semantic/continuity gate
→ complete ordinary independent editable Stick keyframes
→ isolated Preview
→ Cancel or one atomic Apply
→ full-playback automation and Arthur's ordinary-app review
```

The engine owns generation only before Preview. After Apply, the result is normal user-owned project data. It contains no live controller and the engine has no continuing authority.

### Before and after

| Current verified/rejected state | Intended result after all eight phases |
| --- | --- |
| Published SPEC-0004 Phase 2/2.5 accepts complete raw 11-joint key-pose coordinates and interpolates them with fixed-length segment reconstruction and one timing profile per transition. | Planners send movement intent; one shared local engine enumerates candidates, rejects unsafe anatomy before and after baking/repair, and creates coordinated natural motion. |
| The rejected unpublished Phase 2.6 added strict action-specific validation and contact repair around source-authored coordinate recipes. | Mechanics are produced from action-independent body/support rules. Action recipes contain no raw joint coordinates. |
| Existing proof can establish schema, deterministic output, editability, and a Play/Pause toggle without proving that a person watched a full animation. | Proof records a complete ordered playback cycle, independent quality expectations, adversarial bad-motion rejection, ordinary-app review, and Arthur's visible acceptance. |
| Walk/run can be declared or numerically checked without proving believable gait mechanics. | Walk and run have distinct contact cycles, alternating support, opposite arm swing, root travel, and run-only flight. |
| Future planners could fork the format, select a permissive materializer, or return raw coordinates. | Pretend AI and the future Terra adapter enter through one strict `stick.movement-goal/v1` door and the same non-bypassable local safety/pose/mechanics/path engine. |

## 2. Evidence and root cause

### 2.1 Published runtime traced at canonical basis

The original spec was prepared from clean detached canonical-main basis `4c1da7fa4ea14ed82af950f7ed748b86387a7e0a`. This D-0046 correction re-read the live path from exact clean GIT-040/canonical-main basis `b5ddd5e3f4fb3b19e5c7c2be8a1bd35b0f8d6070`, where local `main`, local `origin/main`, and this dedicated worktree's detached HEAD matched at task start.

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

The rejected approaches tried to make hand-authored or directly solved coordinates safer after the branch choice was already made. The product needs one authoritative body-safety definition inside the authoring pipeline. Arthur's rejection freezes these causes:

1. there was no single authoritative definition of a safe and natural built-in humanoid body frame;
2. two-bone IK has two elbow/knee branches, but the rejected Phase 2 route chose arms mostly from a fixed screen-side sign instead of enumerating both candidates and selecting a safe sequence from prior-pose continuity and semantic intent;
3. `recover` did not mean converge toward transported rest;
4. unspecified arms could create large unwanted W-arm movement;
5. the baker interpolated global segment angles without an anatomical gate after interpolation, integer rounding, or contact repair;
6. its oracle allowed bad-but-test-legal branches, near-locked moving knees, unwanted motion, overshoot, unsafe in-betweens, and loop snaps; and
7. green automation did not and cannot replace Arthur's visible acceptance.

The first SPEC-0005 Phase 2 executor result under published D-0045/GIT-040 was technically green but visually rejected. It is closed without acceptance or control-plane propagation; no implementation or proof byte from it may be copied, patched, or treated as a foundation. Its removed disposable review app/worktree is historical rejection evidence only. The new Phase 2 begins fresh from published canonical `main` after D-0046 publication.

SPEC-0005 now separates planning, candidate enumeration, body safety, pose creation, mechanics, path/timing, post-repair validation, final semantic/continuity validation, and human quality review.

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
| `locomotion` | `null` or a bounded one-cycle `walk`/`run` goal with direction, short/medium/long stride, and natural/fast pace. It remains rejected until Phase 6. |

The entire canonical UTF-8 goal is at most `32,768` bytes. It rejects joint IDs, point arrays, `x`/`y` coordinates, stored segment angles, executable code, arbitrary curve control points, animation-format payloads, action-specific coordinate tables, or unknown planner metadata. A human-readable action label may exist only in a planner-door audit envelope outside the canonical movement goal; it is discarded before goal digesting/engine entry. The pose/mechanics/path engines may not branch on it. They branch only on the semantic fields above.

Phase 3 implements the internal closed movement-goal subset. Later phases enable already named fields without changing the contract identity. Phase 8 makes the same object the shared planner door. Unsupported combinations always fail before Preview; they are never approximated silently.

### 3.2 Deterministic body and units

- The only body is `humanoid-11-v1` in `stick-stage-1920x1080-v1`: ordered joints `head`, `neck`, `hip`, `leftElbow`, `leftHand`, `rightElbow`, `rightHand`, `leftKnee`, `leftFoot`, `rightKnee`, `rightFoot`; and segments `head-neck`, `neck-hip`, `neck-leftElbow`, `leftElbow-leftHand`, `neck-rightElbow`, `rightElbow-rightHand`, `hip-leftKnee`, `leftKnee-leftFoot`, `hip-rightKnee`, `rightKnee-rightFoot`. The engine roots body solving at `hip`, uses `hip → neck → head`, `neck → elbow → hand`, and `hip → knee → foot`, and preserves the starter pose's ten segment lengths.
- The stage origin is the top-left. `+x` is screen-right and `+y` is screen-down. Internal solving uses finite IEEE-754 double coordinates. Final coordinates use JavaScript `Math.round` independently per axis, then safety is recomputed from those integers; every final document point is inside `0..1919 × 0..1079`. Character `left` and `right` are anatomical role names and never silently swap because of facing or travel. A mirror reflects unrounded points about the transported neutral hip's vertical axis and then swaps anatomical left/right roles. Mirrored unrounded geometry must agree within `1e-6H`; separately rounded mirror results may differ by at most one pixel per axis, and pass/fail plus failure reason must be identical after swapping named roles.
- For a vector `v`, `angle(v) = atan2(v.y, v.x)` in degrees. Because stage `+y` points down, positive angular change is clockwise on screen. `wrap(a)` returns the unique equivalent in `(-180°, 180°]`. A two-bone joint's signed bend is `wrap(angle(joint → effector) - angle(root → joint))`; `0°` is straight, magnitude is flexion, and sign identifies the actual IK branch. Torso lean is `wrap(angle(hip → neck) - (-90°))`. Head-to-torso angle is `wrap(angle(neck → head) - angle(hip → neck))`.
- `standingBodyHeight`, abbreviated `H`, is exactly `groundY - neutralHead.y` for the transported neutral pose; the current line head has no vertical radius to add. `groundY` is the larger neutral foot `y`. Relative planner and safety values are converted from `H` before rounding.
- Unless a rule names a pixel tolerance, distance comparisons use unrounded Euclidean values with boundary epsilon `1e-9H`, angular comparisons use `1e-9°`, and values inside that epsilon are treated as equal to the boundary. A two-circle solution is tangent when its perpendicular intersection height is at most `1e-9H`. Non-finite operands always fail rather than receiving epsilon treatment.
- The existing 80-unit horizontal line head remains derived from the stored head joint. No circle, head rotation field, custom head, or custom body data is introduced.
- Posture intensity remains semantic engine data: `small`, `medium`, and `large` directional leans target `5°`, `10°`, and `15°`; compression/extension/root offsets target `0.08H`, `0.16H`, and `0.24H` before safety selection. These are requested targets, not permission to violate the corridors below.
- Generation ends before Preview. Every output frame owns distinct ordinary IDs/content and remains independently editable after Apply.

### 3.3 Permanent body-safety and candidate-selection rules

The Phase 2 safety kernel is planner-independent and action-name-independent. It receives only fixed topology/neutral metrics, semantic limb/posture/support intent, candidate poses, final baked frames, and declared continuity/path/contact context. Planner identity, prompt text, action label, fixture ID, materializer name, or a caller-supplied “trusted” flag is neither an input to nor an exception from safety. The current built-in humanoid has no unusual-motion escape hatch. A future custom-rig feature may define explicitly user-authorized unusual anatomy only in a separate spec/contract; SPEC-0005 may not silently authorize it.

Every important pose and every final frame after interpolation, integer rounding, and any future ground/contact repair must satisfy all applicable rules:

1. **Lengths and finite geometry.** Unrounded reconstructed segment lengths match the transported neutral lengths within `1e-6`; rounded final lengths stay within the existing two-pixel tolerance. All joints and the complete derived line head remain inside the stage.
2. **Elbows.** Every elbow has `8° ≤ |bend| ≤ 150°`. The chosen signed branch stays constant for that arm through one sequence. A sign change, a passage through `0°`, or an exactly tangent one-solution IK state is a singular straight-through flip and fails.
3. **Knees.** A moving/acting/support-transition knee has `6° ≤ |bend| ≤ 125°`, with a constant signed branch. The only straight-knee exception is `|bend| ≤ 2°` when the pose is `relax`, `recover`, or unspecified; its foot is planted within two pixels of its transported neutral anchor; and its knee and hip remain within `0.03H` and `0.04H` of transported neutral. That branchless exception may occur only as the sequence's first or last transported-neutral rest endpoint, or within a wholly stationary interval. The first later flexed sample selects the branch; every subsequent non-exempt sample keeps that sign. A straight exception may not occur between two moving samples or at takeoff, landing, contact absorption, step, or swing. The dead corridor `2° < |bend| < 6°` always fails. A moving sample may never use the straight-neutral exception.
4. **Torso and head.** Non-hinge torso lean is at most `30°`; explicit `hinge` posture is at most `50°`. Head-to-torso angle is at most `20°`, and adjacent final frames may change it by at most `8°`. The head must remain above the neck in screen coordinates, and neither a hand nor a non-adjacent limb segment may intersect the neck-head segment or derived line head.
5. **Body crossings and clearance.** Non-adjacent closed line segments may not intersect, overlap, or touch; adjacent segments may meet only at their shared anatomical endpoint. Clearance is the minimum Euclidean point-to-closed-segment distance. A hand remains at least `0.03H` from the `hip → neck` torso segment and `0.055H` from both the head point and the derived horizontal head segment; an explicitly requested center `guard` may reduce the torso clearance to `0.015H` but may not intersect it. Opposite leg segments may not cross. Contact repair may not introduce a crossing that was absent before repair.
6. **Support/contact and rejection-floor balance.** A declared planted foot stays within two pixels of its anchor in both axes until semantic release. A non-airborne pose has at least one declared supported foot on `groundY ± 2px`; no joint may penetrate below `groundY + 2px`. Its conservative balance proxy is `balanceX = (2*hip.x + neck.x + head.x) / 4`: double support requires it inside the interval between the two declared planted anchors expanded by `0.12H`, and single support requires it within `0.16H` of the declared planted anchor. These are Phase 2 fail-closed floors; Phase 4 adds the tighter `0.05H`/`0.08H` mechanics targets and creates weight shifts. Airborne support is rejected until the mechanics phase enables and proves its takeoff/contact context. A support tag with no matching geometric contact fails.
7. **Final-frame continuity.** Outside declared impact/contact, adjacent hip/neck/head/elbow/knee travel is at most `0.12H`, hand/foot travel is at most `0.18H`, and any bend change is at most `35°`. At declared impact/contact the respective caps are `0.20H`, `0.30H`, and `55°`. No path sample may project before `-0.03` or after `1.03` of its transition endpoints, and perpendicular deviation may not exceed the declared path corridor or the fallback `0.12H`. A declared loop's last-to-first step is capped at `0.06H` for hip/neck/head/elbows/knees, `0.10H` for hands/feet, and `25°` for every bend.
8. **Unrequested motion.** An unspecified limb is treated as `relax`, not as free animation space. A relaxed arm's elbow and hand remain within `0.05H` and `0.08H` of transported neutral; a relaxed leg's knee and foot remain within `0.04H` and `0.02H`. When posture is not `lower` or `compress`, hip lowering beyond `0.05H` fails. An unrequested W-arm pose fails when both elbows are above `neck.y + 0.08H`, both hands are above their elbows, and both elbows are outward from the neck. An unrequested head-to-torso change above `8°` fails.
9. **Semantic relax/recover/balance.** `relax` means the transported-neutral corridors above. For `recover`, the role-weighted RMS distance to transported neutral must decrease at every important recovery pose by at least `0.005H` until it is within `0.06H`; no individual non-support role may move more than `0.02H` farther from rest during that step. `balance` is a mechanically tied correction: its effector displacement is at most `0.12H` and at most `60%` of the greater acting-effector/root displacement; its horizontal component opposes the signed center-of-mass/support error; and it becomes zero when that error is within `0.01H`. It is never a free extra gesture.
10. **Whole-animation meaning.** The final semantic/continuity gate rejects a missing requested landmark, an extra unrequested peak/gesture, overshoot, recovery moving away from rest, a last-to-first snap, or a sequence whose acting effector never travels at least `0.08H` for a non-hold movement goal. This gate runs on final rounded/repaired frames immediately before Preview.

For every active two-bone chain, the solver enumerates both circle-intersection IK solutions in finite precision. It retains the sole tangent solution only to recognize the exact branchless straight-neutral knee boundary above; every moving-chain tangent is rejected as a singularity. It never chooses a branch from a fixed left/right screen sign. At each important pose it forms the bounded Cartesian whole-body candidate set (at most `16` limb-branch combinations for the four built-in limbs), rejects every candidate that violates a hard rule, and chooses one full pose sequence with deterministic dynamic programming. The lexicographic cost tuple is: target-region error; prior-pose branch/maximum joint-turn continuity; recover-toward-rest error; support/contact and balance error; maximum unrequested-role displacement; transported-neutral RMS distance; total joint travel; then canonical candidate bytes as the final tie-break. All distance terms are divided by `H` and angular terms by `180°`. If no complete safe sequence exists, the result fails closed before Preview; it does not clamp to an unsafe pose, reuse a rejected branch, fall back to legacy raw coordinates, or silently omit the goal.

The only new SPEC-0005 materialization/finalization entry must call this kernel before returning a candidate document. Current published SPEC-0004 `phase-1-holds`, `phase-2-baked-motion`, and `phase-2.5-timed-motion` entrypoints remain frozen compatibility paths and are not planner doors; their inputs, outputs, defaults, and visible behavior are revalidated unchanged even when approved extension code shares their files, and they are never selectable by a SPEC-0005 planner. Every future SPEC-0005 planner/materializer must use the one safety-gated entry. Adding another planner-selected or ungated materializer is a contract failure, not an extension point.

### 3.4 Physical and visible quality rules

Automated checks are necessary but cannot declare professional quality alone. Every phase with visible output requires both independent technical evidence and Arthur's ordinary-app review.

Universal rules:

1. complete playback means observing ordered indexes `0, 1, …, last, 0` after one Play action, with no manual frame click during the cycle and an elapsed cycle time within `75%..150%` of `frameCount / fps`;
2. full-playback capture records timestamped frame indexes and body geometry for the whole cycle, not only start/end state;
3. no sample passes only because it compiles, has the right labels/counts, matches an exact implementation-generated digest, or produces still screenshots;
4. accepted references and negative mutations are source-authored independently of the engine under test and are hash-bound before execution;
5. technical proof must show why each named bad mutation fails; the same generator may not create both the expected result and the oracle;
6. Arthur watches at least two uninterrupted loops, pauses, scrubs the named landmark poses, and answers the phase-specific visible questions; any rejected required sample rejects that phase;
7. every visible phase records what automation proves separately from what Arthur accepts by sight.

## 4. Protected boundaries for all eight phases

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

## 5. Review-copy and proof method for visible phases

After focused automation, TypeScript, scoped lint, diff checks, and the permanent browser tester pass, an executor whose phase changes visible output may create ordinary unpublished review copies only as ignored disposable evidence:

1. create an isolated temporary app copy and profile;
2. preload a normal saved Stick project containing the phase sample's ordinary frames, without changing product code or adding a product fixture route;
3. bind a random loopback-only `127.0.0.1` port other than `3000`;
4. use an ordinary URL with no query/hash flag, blue/private-review box, picker, overlay, tester button, public asset, permanent route, or production import;
5. record URL, PID/process group, copy path, viewport, source hashes, network ledger, and cleanup instructions in the proof manifest;
6. Arthur opens the link, confirms the normal Stick workspace, presses Play once, watches two complete loops, presses Pause, scrubs named poses, performs the requested one-frame edit/Undo/Redo where applicable, and records accept/reject plus comments;
7. after review, stop only the manifest-recorded processes, verify ports closed, delete only the exact disposable copies/profiles, and preserve durable ignored evidence.

Review links are human evidence, not publication surfaces. The permanent tester must pass before any link is sent. The restructured Phase 2 remains technical-only and creates no new visible action or permanent review UI. After every non-review technical gate passes, it may leave exactly one fresh ordinary app instance served directly from the exact unpublished executor worktree at `http://127.0.0.1:<random-non-3000-port>/` solely for Arthur's regression smoke review. It must use the unmodified ordinary root with no query/hash flag, blue/private-review box, picker, overlay, tester control, fixture injection, preloaded new action/project, public asset, permanent route, or review import. Its manifest binds the URL, port, launch command, PID/process group, exact worktree path, base/HEAD, empty index, exact eight-path dirty set and hashes/sizes, startup/network logs, purpose `existing_app_regression_smoke_only`, explicit `phase2SafetyDemonstrated: false` and `newMotionReviewed: false`, and exact cleanup instructions. Arthur may check Home, New Project, the ordinary blank Stick workspace and controls, Creator → Back, and other existing flows, but that check is not Phase 2 body-safety or motion evidence. Phase 3 is still the first review of new safety-gated body motion.

## 6. Eight small sequential implementation phases

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

**Entry gate.** Satisfied: the SPEC-0005 activation was reviewed, published, and integrated in clean canonical `main` at `2b4f00e7a122c196b2c0600144cd638b461bbb2f`; the executor started from that exact detached SHA with empty index, exclusive worktree, and the six-path ceiling.

**App-copy review.** One ordinary link loads the accepted historical wave. Arthur presses Play, watches two complete loops, confirms ready → inward → outward is readable and the rest of the body is stable, pauses, scrubs frames `0`, `4`, and `8`, and confirms normal timeline/manual controls remain present.

**Measurable acceptance.** Both desktop `1440×900` and compact `390×844` runs observe every index in order and wrap; elapsed cycle is `0.75..1.50s`; named landmarks are present; unrelated-body coordinate digests remain stable at the three owner poses; all ten limb lengths remain within the current two-pixel output tolerance; zero API/provider/external request; zero actionable console/page error. The accepted wave passes every required independent check.

**Required negative cases.** Immediate Play/Pause without wrap; skipped/out-of-order frame; frozen all-frame project; missing inward or outward landmark; one-frame wrist teleport; root/foot drift; broken limb length; cycle outside tolerance; still-screenshot-only evidence; source hash mismatch; and a fixture generated by the implementation under test without the independent catalog must each fail the appropriate proof or manifest gate.

**Proof.** Six-path manifest with base/status/index/scope hashes; independent source catalog; mutation receipt; two-viewport full-playback trace; ordinary screenshots plus a time-based capture/contact sheet or video; permanent browser tester; TypeScript/scoped lint/diff; zero-egress ledger; self-tests that mutate every material manifest field. Exact coordinate/digest equality may protect historical bytes but cannot be the sole quality oracle.

**Protected regressions.** The wave bytes and visible behavior; normal app controls; all universal boundaries in §4.

**Stop boundary / later relationship.** Return an Implementation Review Packet and stop with empty index. No engine code or Phase 2 begins. Phase 2 may rely on this harness only after Phase 1 is human-accepted, CPA-closed, and separately published/integrated.

**Recommended executor.** `gpt-5.6-sol`, `xhigh`, because proof independence and real-browser timing are high-risk even though runtime scope is zero.

#### Phase 1 accepted implementation and evidence

Arthur accepted the historical wave as the protected Phase 1 readability floor after watching the ordinary app review flow. This acceptance does not claim that Phase 1 improves motion or that the held historical wave is the later professional smooth-motion target.

The stopped executor added exactly the six authorized fixture/proof paths from exact base/HEAD `2b4f00e7a122c196b2c0600144cd638b461bbb2f`, with an empty index and no runtime/component/current-fixture/package/config/control-plane change. The accepted manifest is `output/spec-0005/phase-1/proof-manifest.json`, exactly 10,011 bytes at SHA-256 `af287680b7ae73fd4c543edf8076d9fbb7fb65474a5d4508f8b17dde56174e84`.

The proof records six successful technical receipts: independent quality baseline plus 13 required bad-motion mutations; TypeScript; scoped lint; 11-case proof-validator mutation contract; exact Git/diff/scope; and the clean permanent browser regression. The two real-browser runs observed `0..11..0` at `1440×900` in 1,262.4 ms and `390×844` in 1,085.0 ms, with 26 timestamped geometry samples, six landmark checks, 260 limb-length checks, four ordinary/time-based screenshots, and zero external/API/provider requests or actionable console/page errors. The permanent tester passed 40 operations, 13 screenshots, three historical negative cases, zero real API/non-loopback/provider traffic, and complete cleanup.

The preserved successful independent validation receipt records 102 passing checks against the exact manifest. After Arthur's review, later local GETs appended 200 bytes to the live server log, and normal process termination appended a seven-byte terminal-reset sequence, leaving 501 bytes total; the original 294 manifest-bound bytes remain an exact SHA-256-matching prefix, while all other 12 artifacts and all six source files still match their complete bound hashes/sizes. CPA closeout stopped only manifest-recorded PID/PGID `90076`, verified loopback port `58451` closed, removed only the exact disposable copy, and preserved durable ignored evidence. This append-only review traffic is not an accepted source-byte or runtime change.

Phase 1 is Verified, published, and integrated in exact 20-path commit `2436a9414221e8ee7ef40151284cb8f4e069e828`, parent `2b4f00e7a122c196b2c0600144cd638b461bbb2f`, message `Publish SPEC-0005 Phase 1 quality gate`. The required clean permanent tester passed 40 operations, 13 screenshots, four driver messages, three negative cases, zero non-loopback attempts, zero real API-route requests, zero policy violations, zero production leaks, zero console errors, and cleanup. Its 84,506-byte result has SHA-256 `bc7d5c978926b1b55babc8aee92827a4baef94adbca9570741b5dcc0e88f881d`. D-0045/GIT-040's former Phase 2 authorization led to one rejected unpublished implementation. D-0046 supersedes it with the technical-only body-safety Phase 2 below; that new executor waits for separate publication of D-0046.

### Phase 2 — Planner-Independent Body Safety Gate and Foundation

**Owner summary.** Establish one non-bypassable definition of a safe/natural built-in humanoid body frame before another pose maker is allowed to create visible output.

**Goal.** Implement the §3.2–3.3 topology, geometry, IK enumeration, candidate rejection/sequence selection, important-pose gate, post-rounding/post-repair frame gate, and final semantic/continuity gate as shared local infrastructure. The kernel is reusable by later Pretend AI and Terra planning because it accepts no planner identity, action name, fixture ID, prompt text, provider data, or raw-coordinate exception.

**Current problem / before and after.** Current published baking proves canonical lengths and stage bounds but interpolates global angles, rounds, and returns frames without an anatomical gate. The first former SPEC-0005 Phase 2 attempt then chose bad IK branches and allowed technically legal but visually unsafe motion. After this phase, the project has one authoritative safety kernel that enumerates both IK branches, rejects unsafe important/final poses, chooses coherent sequences, and fails before Preview when no safe sequence exists. It does not yet create a new whole-body action.

**Execution path.** Neutral built-in body + semantic chain intent + enumerated two-bone candidates → important-pose safety gate/sequence selection → future mechanics/path stages → final rounded frames after any repair → per-frame safety gate → whole-animation semantic/continuity gate → safety-qualified candidate or fail-closed result. Phase 2 implements and proves the safety-owned steps and their integration seam; Phase 3 supplies the first actual movement-goal pose maker.

**Scope and exact allowlist.** Exactly eight tracked paths:

```text
src/lib/ai/stickFigureBodySafety.ts
src/lib/ai/stickFigureMotionEngine.ts
src/lib/ai/stickFigureCommandExecutor.ts
scripts/fixtures/spec0005-stick/v2/body-safety-cases.json
scripts/spec0005-stick/recordPhase2SafetyProof.ts
scripts/spec0005-stick/validatePhase2SafetyProof.ts
scripts/validateStickBodySafety.ts
scripts/validateStickBodySafetyIntegration.ts
```

Ignored output may exist only under `output/spec-0005/phase-2/**`. `stickFigureBodySafety.ts` is new. The two existing runtime files may change only to create one closed safety-qualified SPEC-0005 finalization seam and to reject ungated/alternate-materializer use; the published SPEC-0004 materializer outputs and public behavior remain compatibility-preserved. No component, workspace, UI, existing fixture, project/history/storage, provider, package/config, canonical document, or other runtime path may change.

**Implementation boundary.** `stickFigureBodySafety.ts` owns all §3.2–3.3 constants and calculations, two-circle IK enumeration, hard-candidate validation, deterministic full-sequence selection, final-frame validation, and final-animation validation. Helpers that can return unchecked candidate geometry stay module-private. The sole exported completion API returns either a safety-qualified cloned/frozen candidate or a typed failure; there is no boolean `skip`, `trusted`, planner, action, fixture, materializer, or custom-rig override. The closed failure reasons are `non_finite_geometry`, `segment_length`, `stage_bounds`, `elbow_bend`, `knee_bend`, `branch_singularity`, `branch_flip`, `torso_head`, `body_crossing`, `clearance`, `support_contact`, `continuity`, `overshoot`, `loop_snap`, `unrequested_motion`, `recovery`, `balance`, `semantic_continuity`, `no_safe_sequence`, and `integration_bypass`; a failure also identifies `important_pose`, `final_frame`, `final_animation`, or `integration`, plus the applicable frame/transition/roles. When several rules fail, evaluation follows §3.3 rule order, then frame/transition order, then anatomical role order, so the reported failure is deterministic. `stickFigureMotionEngine.ts` may expose one new SPEC-0005 finalizer that can only return through that API. `stickFigureCommandExecutor.ts` may recognize only that closed SPEC-0005 finalizer and must reject caller-selected legacy/alternate materialization for a movement-goal candidate. The current SPEC-0004 materializer literals remain frozen historical compatibility entrypoints and cannot be reached from the future movement-goal door.

**Non-goals.** No `stick.movement-goal/v1` whole-body pose maker, new action/motion, mechanics-pose insertion, new path/timing/gravity, contact repair, gait, semantic recipe, normal planner connection, visible UI or review-only product code, provider, custom rig, or cap expansion. Phase 2 validates synthetic/adversarial candidates and integration boundaries; it does not make the former Phase 2 motion acceptable by editing or reusing it. The one permitted ordinary regression-smoke instance exercises only existing application behavior and adds no Phase 2 product surface.

**Entry gate.** Phase 1 remains accepted/published at `2436a9414221e8ee7ef40151284cb8f4e069e828`. GIT-040 published the superseded former Phase 2 authorization at `b5ddd5e3f4fb3b19e5c7c2be8a1bd35b0f8d6070`; its executor is stopped, rejected, removed, and has no accepted byte. A new executor starts only after D-0046 and this exact eight-phase restructuring are separately reviewed, published, and integrated. It starts from that new publication SHA in one clean detached Plan-mode worktree, confirms an empty index/exclusive ownership/exact eight-path ceiling, and must not reuse the removed result.

**Proof independence.** The fixture catalog and `validateStickBodySafety.ts` form the independent/body-rule oracle and are authored before or separately from the runtime route. The oracle may import only the stable project contract/topology primitives, not `stickFigureBodySafety.ts`, `stickFigureMotionEngine.ts`, or the executor. It independently recomputes angles, lengths, crossings, semantic distances, continuity, and expected pass/fail reasons. Runtime property/metamorphic tests use fixed seeds and at least 10,000 bounded candidates plus their mirrored counterparts; exact engine-produced coordinates may be recorded only as secondary regression evidence. `validateStickBodySafetyIntegration.ts` proves the safety seam, transaction fail-closed behavior, and source/AST prohibition on planner/action/fixture/materializer bypass.

**Required positive/property cases.** Neutral straight-knee rest endpoint transitioning into one selected safe flexion branch; a wholly stationary neutral straight-knee interval; safely flexed mirrored arms and legs; both safe IK branches considered with the continuity-consistent branch selected; relaxed unspecified limbs staying near transported neutral; monotonically recovering poses; conservative double- and single-support balance floors; small directional proportional balance-limb response; exact segment preservation before/after rounding; safe final frames surviving the same result after a no-op contact-repair pass; deterministic byte-identical sequence choice; and a no-safe-candidate failure with no Preview candidate.

**Required negative cases.** The exact rejected reach alternative-branch issue; impossible reach; zero-length and sub-two-pixel rounded segments; stretched segment; elbow branch flip; knee branch flip; singular straight-through elbow/knee flip; moving-knee near-lock, dead-corridor bend, or inversion; head/torso inversion, kink, or snap; unsafe in-between with individually safe endpoints; unsafe geometry introduced only by integer rounding; unsafe geometry introduced only by contact repair; `recover` moving away from rest; W arms from unspecified limbs; large unsolicited hip lowering/body compression; unsafe hand/body/head crossing; unsupported/false contact or foot slide/lift; unbalanced grounded pose; large unexplained joint jump; path overshoot; declared-loop last-to-first teleport; invalid mirror asymmetry; unreachable target/no safe candidate; and planner identity, action label, fixture ID, prompt text, alternate materializer, or forged trust metadata attempting to bypass the same rejection.

**Required inherited proof.** On the live Phase 2 dirty tree, run `scripts/validateStickMotionQualityBaseline.ts`, `scripts/validateStickFigureAiContracts.ts`, `scripts/validateStickFigureCommandTransaction.ts`, `scripts/validateStickFigureMotionEngine.ts`, `scripts/validateStickFigureActionTiming.ts`, `scripts/validateStickFigureAiUiAdapter.ts`, `scripts/validateStickHistoryPersistence.ts`, and `scripts/validateStickPoseTimeline.ts`. These current focused validators must preserve the published SPEC-0005 Phase 1 reference and accepted SPEC-0004 Phase 1/2/2.5 outputs, defaults, timing formulas, editability, transaction/history/storage/onion/Creator behavior, and zero-egress boundary. Historical proof manifests and successful receipts remain immutable audit records with their published hashes; do not claim to rerun their activation-HEAD/old-dirty-set/live-process checks against new approved source extensions. Run the permanent browser tester in an isolated clean clone of the exact D-0046 publication base to protect unrelated app behavior, and state explicitly that current Phase 2 runtime coverage comes from the new safety/integration validators because no normal app route invokes it yet. Legacy compatibility revalidation is not permission for any future planner to use a legacy materializer.

**Review decision.** Phase 2 is technical-only because it intentionally produces no new user-visible action and changes no normal app presentation. After every technical gate passes, create exactly one fresh ordinary regression-review instance directly from the exact unpublished executor worktree on a random loopback-only non-`3000` port. Do not duplicate or inject source, preload a new action/project, add a blue box, picker, overlay, test control, fixture, query/hash flag, special route, public asset, or permanent review UI. Arthur's smoke check answers only whether the existing ordinary application still looks and works normally; because no normal route invokes the new safety seam, it is not evidence that Phase 2 safety works and it is not a new-motion acceptance gate. Arthur reviews the first new safety-gated whole-body motion in Phase 3: reach-high-right, centered compression, left support shift, and neutral recovery, each through two full loops and important-pose scrubbing.

**Measurable acceptance.** Every §3.2–3.3 rule is represented by an independent positive and negative assertion; all required negatives fail before Preview with the named reason; mirror/property runs pass; both IK solutions are demonstrably enumerated; sequence choice changes when prior-pose/recovery/support intent changes while remaining deterministic; post-rounding and post-repair checks catch faults absent from unrounded endpoints; all inherited/frozen validators and the permanent tester pass; exact Git-visible dirty set equals the eight-path allowlist; manifest validation mutates every material field; index is empty; external requests remain zero; and exactly one manifest-bound ordinary regression-review process may exist after all gates pass. Its root URL, source identity, process identity, purpose, non-claims, and cleanup instructions must validate, and source/product scans must prove that no review-only or preloaded-action byte was added.

**Proof.** One independently validated manifest binds the exact base/HEAD/index/allowlist, source/fixture hashes, independent-oracle provenance, fixed property seeds/case counts, pass/fail reason matrix, source/AST bypass scan, transaction/legacy regression receipts, TypeScript/scoped lint/full-lint non-regression, both diff checks, permanent tester, zero-egress ledger, and cleanup. After those gates pass, it also binds the single ordinary regression-review root URL/port, launch command, PID/process group, exact executor-worktree path and source identity, startup/network logs, `existing_app_regression_smoke_only` purpose, false safety/new-motion claims, and bounded cleanup instructions. The manifest cannot label visible quality or Phase 2 safety human-accepted because Phase 2 has no new visible quality claim and the ordinary app does not invoke the safety seam.

**Protected regressions.** The exact published Phase 1 reference/proof; all accepted SPEC-0004 Phase 1/2/2.5 source and behavior; all §4 boundaries; normal Stick/Drawing UI and storage. The separate pre-existing derived line-head renderer gap is not part of this phase and must not be changed or claimed fixed.

**Stop boundary / later relationship.** Return the Spec Executor Implementation Review Packet and stop with an empty index, leaving only the one manifest-bound ordinary regression-review instance available for Arthur. No Phase 3 code, canonical memory edit, Git action, provider/external operation, safety-by-sight claim, or new-motion acceptance occurs. After Arthur's smoke check, stop only the manifest-recorded PID/process group, verify its port closed, and preserve the exact executor worktree/evidence unless later authority says otherwise. Only after technical acceptance, sequential CPA closeout, and separate publication may Phase 3 begin fresh on this safety foundation.

**Recommended executor.** `gpt-5.6-sol`, `ultra`, because anatomical invariants, candidate sequencing, adversarial proof, and bypass prevention are foundational.

### Phase 3 — Action-Independent Whole-Body Key-Pose Maker

**Owner summary.** Turn semantic body goals into coordinated key poses without action-specific coordinates.

**Goal.** Implement the internal closed subset of `stick.movement-goal/v1` and a deterministic whole-body pose solver for grounded non-locomotion micro-movements.

**Current problem / before and after.** Current planners must provide all joint points. After this phase they provide grounded semantic beats, and the pose engine creates root, torso, head, acting limb, and balance-limb positions with fixed lengths.

**Execution path.** Strict internal movement goal → binding/field validation → neutral body metrics → ordered chain solver → enumerate both two-bone limb solutions and whole-body candidates → Phase 2 important-pose safety/sequence selection → existing published SPEC-0004 Phase 2.5 timing/baker → Phase 2 post-rounding/final-continuity gate → independent ordinary keyframes → existing transaction.

**Scope and exact allowlist.** Exactly nine tracked paths:

```text
src/lib/ai/stickFigureMovementGoal.ts
src/lib/ai/stickFigurePoseEngine.ts
src/lib/ai/stickFigureMotionEngine.ts
src/lib/ai/stickFigureCommandExecutor.ts
scripts/fixtures/spec0005-stick/v3/whole-body-pose-cases.json
scripts/spec0005-stick/phase3BrowserProof.ts
scripts/spec0005-stick/recordPhase3Proof.ts
scripts/spec0005-stick/validatePhase3Proof.ts
scripts/validateStickWholeBodyPoseEngine.ts
```

Ignored output: `output/spec-0005/phase-3/**`. No UI, old fixture, provider, package/config, safety-kernel, or control-plane edit.

**Non-goals.** No airborne mechanics, automatic mechanics-pose insertion, new path/timing model, gait, final action recipe, language routing, planner connection, UI, provider, or cap expansion.

**Entry gate.** Restructured Phase 2 is technically accepted, CPA-closed, and separately published/integrated; its accepted source, independent oracle fixtures, reason matrix, current safety/property/integration validators, and canonical acceptance record must revalidate. Its historical manifest hash remains an immutable audit anchor, not a demand to rerun a prior activation/dirty-set receipt in the Phase 3 worktree. Phase 3 still requires a later explicit owner authorization after that publication.

**App-copy review.** Four ordinary links show semantic reach-high-right, centered compression, left support shift, and neutral recovery. Arthur watches two loops, scrubs important poses, and checks that the whole body cooperates instead of only one joint moving.

**Measurable acceptance.** Goals contain zero raw points/angles/joint IDs; the core has no action-name branch; fixed lengths stay within two pixels; requested effectors finish within `8%` of standing body height of their body-relative target region; grounded feet remain within two pixels; reach/shift cases produce a mechanically related torso/root or balance-limb response; mirrored goals produce mirrored geometry within rounding tolerance; deterministic repeat is byte exact; every result is independent/editable and passes Phase 1 full-playback capture.

**Required negative cases.** Raw `x`/`y`, points, angles, code, unknown fields, non-finite/sparse/duplicate data, wrong binding/version/count, unreachable unsafe target, hyperextended/reversed bend, stretched limb, action-name-only goal, action-specific core switch, uncoordinated single-joint reach, and unsupported airborne/locomotion goal fail before Preview.

**Proof.** Independent semantic input cases and expected qualitative invariants, solver unit/property checks, mirrored/metamorphic cases, mutation tests, four full-playback browser flows, one-frame manual edit/Undo/Redo/Save/Open, permanent tester, manifest, and Arthur review. The solver may have deterministic coordinate snapshots as regression evidence, but they are secondary to independent semantic/physical assertions.

**Protected regressions.** Phase 1 harness/reference, the accepted Phase 2 safety kernel/oracle, and all §4 boundaries. Published SPEC-0004 Phase 1/2/2.5 compatibility materializers remain unchanged and unavailable to the new movement-goal route.

**Stop boundary / later relationship.** Stop after the four grounded micro-movements. No airborne mechanics, natural paths, gait, final actions, planner connection, or Phase 4 work. Phase 4 extends the shared engine; it does not fork or weaken the Phase 2 safety kernel.

**Recommended executor.** `gpt-5.6-sol`, `ultra`, because body-chain architecture and future compatibility are foundational.

### Phase 4 — Mechanics, Weight, Contact, and Required-Pose Insertion

**Owner summary.** Make grounded/airborne transitions mechanically readable and let the engine insert poses that physics requires.

**Goal.** Add support ownership, ground contact, center-of-mass proxy, anticipation/contact/compression/recovery rules, and deterministic mechanically required key-pose insertion.

**Current problem / before and after.** A pose can be anatomically safe yet float, slide, fall outside support, or omit takeoff/landing. After Phase 4, support transitions generate the missing structural poses before baking and route every repaired result back through Phase 2 safety.

**Execution path.** Movement goal → whole-body requested poses → support/ground state machine → support-polygon and center-of-mass proxy → required-pose insertion → re-solve body chains → validate contact/weight → existing timing/baker → Phase 2 post-repair/final-continuity gate → transaction.

**Scope and exact allowlist.** Exactly nine tracked paths:

```text
src/lib/ai/stickFigureMovementGoal.ts
src/lib/ai/stickFigurePoseEngine.ts
src/lib/ai/stickFigureMechanicsEngine.ts
src/lib/ai/stickFigureMotionEngine.ts
src/lib/ai/stickFigureCommandExecutor.ts
scripts/fixtures/spec0005-stick/v4/body-mechanics-cases.json
scripts/spec0005-stick/phase4BrowserProof.ts
scripts/spec0005-stick/recordPhase4Proof.ts
scripts/spec0005-stick/validatePhase4Proof.ts
```

Ignored output: `output/spec-0005/phase-4/**`.

**Non-goals.** No new path interpolation, Earth-gravity implementation, locomotion cycle, action recipe, language/planner route, UI, provider, or frame/FPS expansion.

**Entry gate.** Published/integrated Phase 3 and unchanged Phase 1 harness/Phase 2 safety proof. Plan-mode trace must show the nine paths suffice; otherwise stop before edits.

**App-copy review.** Ordinary links show weight shift, deep compression/recovery, takeoff/contact/recovery, and direction-change settle. Arthur watches two loops and inspects feet, pelvis, knees, and landing frames.

**Measurable acceptance.** The ground line is the starting neutral pose's lowest foot `y` and stays fixed for the transaction. A planted foot moves at most two pixels until release. The 2D center-of-mass proxy is `balanceX = (2*hip.x + neck.x + head.x) / 4`; with double support it projects between the two planted foot anchors plus/minus `5%` of standing body height, and with single support it stays within `8%` of standing body height of that anchor. Single support places the pelvis/torso visibly toward the support side. Grounded→airborne inserts anticipation/takeoff, airborne→grounded inserts contact/compression/recovery, and unsupported reversal inserts a settle/weight-transfer pose when frame capacity permits; insertion is deterministic and never exceeds 24 frames; every inserted pose is complete and independently editable.

**Required negative cases.** Foot slide, false planted tag, support-side mismatch, center outside support, airborne without takeoff, landing without contact/compression/recovery, long unexplained hover, knee inversion, ground penetration, instant reversal, required insertion beyond the frame cap, and post-bake repair that changes an applied document all fail.

**Proof.** Support/contact traces, auto-insertion decisions, independent mechanics invariants, mutated failures, full-cycle capture at both viewports, manual edit persistence, protected suites, manifest, and Arthur review. Numeric proxies are supporting evidence; visible weight acceptance is mandatory.

**Protected regressions.** Phase 1 reference, Phase 2 safety kernel, Phase 3 semantic solver, §4 boundaries, and published SPEC-0004 Phase 2.5 timing math.

**Stop boundary / later relationship.** No new in-between path model, Earth-gravity curve, gait, final recipe, or planner route. Phase 5 consumes the mechanics states.

**Recommended executor.** `gpt-5.6-sol`, `ultra`, because support/contact defects are subtle and foundational.

### Phase 5 — Paths, Timing, Gravity, and In-Betweens

**Owner summary.** Connect good mechanical poses with motion that accelerates, decelerates, arcs, follows through, and obeys gravity.

**Goal.** Replace one generic segment interpolation assumption with mechanics-aware body/limb paths and velocity-continuous timing while still baking ordinary keyframes.

**Current problem / before and after.** Existing timing curves space frames but all joints still derive from one root/angle interpolation. After Phase 5, planted chains, swing limbs, root travel, impact/recovery, and airborne roots follow appropriate natural paths and every rounded frame passes Phase 2 safety.

**Execution path.** Requested/inserted key poses + support transitions + existing timing profiles → per-chain path selection → tangent/velocity continuity → natural acceleration/deceleration and follow-through → fixed-length reconstruction/rounding → Phase 2 final-frame and whole-animation gate → complete baked frames → transaction.

**Scope and exact allowlist.** Exactly nine tracked paths:

```text
src/lib/ai/stickFigureMovementGoal.ts
src/lib/ai/stickFigureMechanicsEngine.ts
src/lib/ai/stickFigurePathEngine.ts
src/lib/ai/stickFigureMotionEngine.ts
src/lib/ai/stickFigureCommandExecutor.ts
scripts/fixtures/spec0005-stick/v5/natural-path-cases.json
scripts/spec0005-stick/phase5BrowserProof.ts
scripts/spec0005-stick/recordPhase5Proof.ts
scripts/spec0005-stick/validatePhase5Proof.ts
```

Ignored output: `output/spec-0005/phase-5/**`.

**Non-goals.** No walk/run gait planner, action recipe catalog, language/planner route, UI, provider, or stored live path/tween controller.

**Entry gate.** Phase 4 mechanics is accepted/published and its support trace plus Phase 2 post-repair safety proof revalidate. The Plan-mode executor freezes the exact standing-body scale used for physics.

**App-copy review.** Ordinary links show a reaching arc, fast dodge-and-settle micro-movement, hop parabola, and landing follow-through. Arthur watches two loops at normal speed, then scrubs at least five evenly distributed frames.

**Measurable acceptance.** Natural swing end effectors have non-collinear intermediate samples and stay inside their declared arc corridor; Phase 2's stricter joint-specific final-frame caps remain mandatory. For adjacent moving samples that each exceed `2%` of standing body height per frame, non-impact velocity magnitude ratio is at most `2.5×` and direction changes by at most `90°`; a transition to/from the lower threshold must align with an endpoint, settle, anticipation, contact, or recovery sample. Direction reversal includes a near-zero/settle sample; natural transitions are not equal-gap constant pace; planted feet preserve Phase 4 contact. Airborne vertical root samples use `g = 9.81m/s²` after mapping neutral standing height to `1.75m`, with takeoff/contact endpoints and a single apex; tolerance is two stage pixels after rounding. Follow-through occurs only on declared free chains and decays by recovery.

**Required negative cases.** Teleport, snap, equal-gap natural motion, zigzag arc, overshoot, velocity cusp without impact, two apexes, float/linear airborne root, wrong gravity sign/scale, planted-foot drift, follow-through on support limb, endless oscillation, and `direct_mechanical` without explicit structured intent fail.

**Proof.** Unrounded path/velocity traces, independent physics/metamorphic checks, bad-path mutations, full playback/time capture, body integrity/editability/history/storage regressions, manifest, and Arthur review. Exact baked coordinates alone are insufficient.

**Protected regressions.** All prior phase invariants and §4. Published SPEC-0004 Phase 2.5 formulas remain available but path selection may combine them only as specified; no live curve is stored and no rounded/repaired frame bypasses Phase 2 safety.

**Stop boundary / later relationship.** No walk/run cycle planner or final action recipe. Phase 6 composes gait from these shared paths.

**Recommended executor.** `gpt-5.6-sol`, `ultra`, because temporal/physics behavior needs high-confidence reasoning and browser proof.

### Phase 6 — Walk and Run Locomotion

**Owner summary.** Produce distinct believable locomotion instead of a crab walk or a sped-up walk.

**Goal.** Implement one-cycle left/right walk and run planning through the shared contract and engine.

**Current problem / before and after.** Labels and alternating-leg checks can pass while root travel, arm opposition, contacts, or flight are wrong. After Phase 6, walk and run have different mechanics and visibly travel.

**Execution path.** `locomotion` movement goal → gait-cycle planner → contact/down/passing/up key goals → Phase 3 pose maker → Phase 4 support/ground mechanics → Phase 5 paths/timing → Phase 2 final safety/continuity gate → ordinary frames → transaction.

**Scope and exact allowlist.** Exactly ten tracked paths:

```text
src/lib/ai/stickFigureMovementGoal.ts
src/lib/ai/stickFigurePoseEngine.ts
src/lib/ai/stickFigureMechanicsEngine.ts
src/lib/ai/stickFigurePathEngine.ts
src/lib/ai/stickFigureLocomotionPlanner.ts
src/lib/ai/stickFigureCommandExecutor.ts
scripts/fixtures/spec0005-stick/v6/locomotion-cases.json
scripts/spec0005-stick/phase6BrowserProof.ts
scripts/spec0005-stick/recordPhase6Proof.ts
scripts/spec0005-stick/validatePhase6Proof.ts
```

Ignored output: `output/spec-0005/phase-6/**`.

**Non-goals.** No general language understanding, core-action recipe catalog, provider/future-Terra adapter, UI, multi-figure scene, cap expansion, or alternate gait-specific baker.

**Entry gate.** Phase 5 accepted/published; 24-frame cap can contain one complete requested cycle. Any need for the broader SPEC-0004 Phase 3 cap returns to Arthur instead of widening here.

**App-copy review.** Four ordinary links: walk right, walk left, run right, run left. Arthur watches two loops and answers: does it travel, alternate support, swing opposite arms, read as walk versus run, and avoid sideways crab motion?

**Measurable acceptance.** Each gait has ordered contact → down → passing → up landmarks for both sides; left/right support alternates; when left leg is forward the right arm is forward and vice versa at the corresponding landmark; root displacement is monotonic in requested direction with no backtracking over `3%` of total travel; planted foot stays within two pixels; walk always retains at least one ground contact and has no flight; run includes at least one interval with both feet airborne and shorter contact proportion than its paired walk; run changes cadence/flight/vertical dynamics, not merely playback speed; final travel is at least one short stride and within stage bounds.

**Required negative cases.** Same-side arm/leg swing, non-alternating support, crab/sideways posture, in-place leg cycling, sliding planted feet, walk flight, run without flight, run byte-identical to time-scaled walk, wrong-direction/backtracking root, missing gait landmark, leg crossing/broken length, and out-of-bounds travel fail.

**Proof.** Contact and opposition traces, gait-phase/state receipts, walk/run structural comparison independent of labels, mutated crab/sped-up-walk fixtures, two-viewport full playback, manual-edit/Undo/Redo/Save/Open, permanent tester, manifest, and Arthur acceptance.

**Protected regressions.** All prior engine and §4 rules. Locomotion planner emits the same movement-goal semantics and cannot bypass shared mechanics/path validation.

**Stop boundary / later relationship.** No natural-language routing, action-recipe catalog, real provider, cap expansion, or UI change. Phase 7 reuses gait/engine but does not rewrite it.

**Recommended executor.** `gpt-5.6-sol`, `ultra`, because gait requires coordinated temporal mechanics and visible judgment.

### Phase 7 — Core Actions Through the Shared Engine

**Owner summary.** Rebuild wave, jump, hop, bow, and dodge as semantic recipes, then accept them in the ordinary app.

**Goal.** Replace raw hand-coordinate recipe piles with bounded `stick.movement-goal/v1` recipes consumed by Phases 2–6.

**Current problem / before and after.** Existing/rejected examples hard-code whole bodies and can preserve unrelated poses or bad mechanics. After Phase 7, recipes state movement intent only and share all safety/pose/mechanics/path code.

**Execution path.** Local fixed recipe data → strict movement goal → shared pose/mechanics/path engine → Phase 2 final safety/semantic/continuity gate → complete ordinary frames → transaction → full-playback proof and ordinary review.

**Scope and exact allowlist.** Exactly seven tracked paths:

```text
src/lib/ai/stickFigureMotionRecipes.ts
src/lib/ai/stickFigureCommandExecutor.ts
scripts/fixtures/spec0005-stick/v7/action-recipe-cases.json
scripts/spec0005-stick/phase7BrowserProof.ts
scripts/spec0005-stick/recordPhase7Proof.ts
scripts/spec0005-stick/validatePhase7Proof.ts
scripts/validateStickMotionRecipes.ts
```

Ignored output: `output/spec-0005/phase-7/**`. The accepted lower engine files are read-only. If a recipe exposes an engine defect, stop and return a narrowly authorized correction to the owning earlier phase; do not patch around it with coordinates.

**Non-goals.** No normal-chat/Pretend-AI/Terra connection, raw-coordinate fallback, lower-engine rewrite, provider, UI, follow-up editing, or SPEC-0004 phase work.

**Entry gate.** Phase 6 is accepted/published; all earlier phases' current focused validators, canonical acceptance records, and published source anchors revalidate. Historical manifest hashes remain audit anchors rather than being rerun under a different phase's HEAD/dirty set. Plan-mode source scan confirms recipe representation needs no raw coordinate field.

**App-copy review.** Five ordinary links for wave, jump, hop, bow, and dodge. Arthur watches two full loops, scrubs named anticipation/action/contact/recovery poses, and compares against the earlier rejected failures.

**Measurable acceptance.** Recipe and fixture source contain no joint coordinate/angle arrays; all five use the same public engine call; wave has stable feet/root and readable alternating hand extremes with no inherited extra action; jump and hop visibly compress, take off, reach one apex, contact, compress, and recover, with hop lower/shorter than jump; bow has readable anticipation/hinge/bottom settle/recovery and maintained support; dodge transfers weight, moves in the requested direction, settles before reversal, returns without foot slide, and includes no unrequested gesture. Every action passes full-cycle, mechanics, path, ownership, and transaction gates.

**Required negative cases.** Raw-coordinate recipe; action-name switch in lower engine; wave with clap/hop; jump with wave hand; hop with head nod/shake; floating apex dwell; missing landing recovery; compressed unreadable bow; instant dodge reversal; sliding feet; extra pre/post action; and recipe-specific direct keyframe writer fail.

**Proof.** Source/AST scan plus runtime rejection, semantic recipe snapshots, independent action landmark/invariant catalog, adversarial mutations derived outside the engine, full-playback captures, permanent tester, manifest, and Arthur's five explicit accept/reject decisions. Self-generated exact goldens remain secondary only.

**Protected regressions.** The historical accepted wave remains available/protected until this phase is accepted and deliberately routed in a later authorized task. All §4 systems remain unchanged.

**Stop boundary / later relationship.** Do not connect normal chat, Pretend AI, or Terra. Do not modify lower engine bytes. Phase 8 creates the shared planning door and final gate.

**Recommended executor.** `gpt-5.6-sol`, `xhigh`, because the engine is established but visible action quality remains demanding.

### Phase 8 — Shared Pretend-AI / Terra-Ready Planning Door and Final Gate

**Owner summary.** Prove that local Pretend AI and a future Terra planner describe the same bounded goal and use the same engine, without contacting a provider.

**Goal.** Add one strict planner door, connect a local Pretend-AI adapter to the Phase 7 recipes, validate a provider-free Terra-shaped test adapter, and run the complete quality/ownership regression gate.

**Current problem / before and after.** Planner formats could fork or a future model could return raw coordinates. After Phase 8, all accepted planning output is `stick.movement-goal/v1`; only the local safety-gated engine may create poses/frames.

**Execution path.** Pretend recipe adapter **or** provider-free Terra-shaped fixture adapter → identical planner-door validation/binding → shared movement goal → one shared candidate/safety/pose/mechanics/path/baker/final-gate pipeline → existing Preview/Apply/Cancel transaction → full-playback and Arthur review.

**Scope and exact allowlist.** Exactly eight tracked paths:

```text
src/lib/ai/stickFigureMovementGoal.ts
src/lib/ai/stickFigurePlannerDoor.ts
src/lib/ai/stickFigureMotionRecipes.ts
src/lib/ai/stickFigureCommandExecutor.ts
scripts/fixtures/spec0005-stick/v8/planner-door-cases.json
scripts/spec0005-stick/phase8BrowserProof.ts
scripts/spec0005-stick/recordPhase8Proof.ts
scripts/spec0005-stick/validatePhase8Proof.ts
```

Ignored output: `output/spec-0005/phase-8/**`. No provider client, route, key, environment/config, package, UI, SPEC-0004 provider-phase, or deployment path may change.

**Non-goals.** No live Terra/provider/API call, credential/config work, pricing/privacy/cost decision, language-model quality claim, second planner format, new UI behavior, follow-up editing, deployment, or SPEC-0004 real-provider implementation.

**Entry gate.** Phase 7 is accepted/published; all seven prior phases' current focused validators, canonical acceptance records, and published source anchors revalidate. Historical manifest hashes remain audit anchors rather than being rerun under Phase 8's different HEAD/dirty set. The current provider/privacy/cost gates remain closed because this phase makes no live request.

**App-copy review.** Ordinary links expose wave, jump, hop, bow, dodge, walk, and run projects produced through the shared door. Arthur watches two full loops of each, scrubs landmarks, edits one in-between joint in at least one action, verifies Undo/Redo and Save/Open, and gives one explicit final shared-engine acceptance decision.

**Measurable acceptance.** Pretend and Terra-shaped test adapters that express the same intent yield the same canonical movement-goal digest and engine result; both reject raw coordinates/code/curves/unknown fields; planner identity cannot select a different engine/materializer; all seven actions pass their prior full-playback and mechanics gates at both viewports; every frame remains complete/independent/editable; one-shot and transaction invariants pass; provider/API/external request counts are zero; source scan finds no provider client/key/env/config or second animation format.

**Required negative cases.** Planner-specific schema/engine, raw points or executable code, unbounded beats/frames, wrong/stale binding, unknown field, planner-selected materializer, provider client construction, network attempt, fake “Terra” result in a second format, hidden AI data in applied project, post-Apply regeneration, and any prior bad-motion mutation fail.

**Proof.** Cross-adapter equivalence, strict schema/security mutations, source scan, all prior engine/action tests, full-cycle browser evidence, manual ownership/history/storage/Creator/onion/permanent tester, zero-egress ledger, technical manifest, and Arthur final review.

**Protected regressions.** Everything in §4 plus all earlier accepted manifests and the current SPEC-0004 future-provider ownership.

**Stop boundary / later relationship.** Stop after the provider-free planner door and final acceptance packet. Do not contact Terra or another model, change a key/config/route/UI, move SPEC-0004's real-provider phase, publish, or resume SPEC-0004 Phase 3. SPEC-0004 resumes only after Phase 8 is accepted, CPA-closed, separately published/integrated, and a later task explicitly authorizes its next phase.

**Recommended executor.** `gpt-5.6-sol`, `ultra`, because the final shared boundary must prevent format/authority drift and reprove the whole system.

## 7. Phase lifecycle and manifest rules

Exactly eight phases exist. There is no Phase 2.5, Phase 2.6, Phase 2A/2B, Phase 8.5, or silent repair phase inside SPEC-0005.

For each phase:

1. the preceding phase and control-plane record must be accepted, published, and integrated in canonical `main`;
2. one new dedicated Spec Executor starts in Plan mode from that exact SHA, verifies clean base/empty index/exclusive ownership/exact path ceiling, traces the real execution path, and executes only that phase;
3. the executor changes only the phase allowlist plus its ignored output root, creates and independently validates a technical proof manifest, provides new-motion review links only for visible phases and only after the permanent tester passes, permits technical-only Phase 2 solely the one manifest-bound ordinary existing-app regression-smoke root after all technical gates pass, returns a Spec Executor Implementation Review Packet, and completely stops;
4. Arthur and the Project Manager accept or reject. Rejection returns to a separately authorized correction executor; it causes no propagation/publication;
5. after acceptance and explicit worktree transfer, one Control Plane Architect verifies unchanged accepted bytes/evidence, updates canonical records, runs memory/tracked-state closeout, returns a CPA PM Review Packet, and stops with empty index;
6. only a later explicit publication instruction authorizes staging the exact reviewed implementation/control-plane set, committing, fast-forwarding clean canonical `main`, pushing normally, and verifying `0/0` synchronization;
7. only then may the next phase begin.

Every manifest binds its own phase's exact base/HEAD/branch, index, observed/expected allowlist, source hashes/sizes, fixture provenance, command order, receipts/artifacts, network ledger, cleanup state, and mutation self-tests. Visible phases additionally bind browser URLs/processes/viewports, full-playback traces, and human-review status. Technical-only Phase 2 binds new-motion/full-playback human review as `not-applicable`, but after all technical gates pass it must bind exactly one ordinary regression-smoke root URL, port, launch command, PID/process group, exact executor-worktree path, base/HEAD/index/dirty-set source identity, startup/network logs, explicit non-claims, and cleanup instructions. A manifest rejects a second review process/copy, any injected/preloaded/review-only source, or a one-byte/status/base/path/count/order/tolerance/reference/network/lifecycle change. Later phases verify earlier work through current focused suites, published source/control-plane anchors, and immutable recorded manifest hashes; they do not misreport old activation-HEAD/dirty-set/live-process validators as rerun in a new worktree. A manifest cannot mark the phase accepted; only Arthur/PM review can.

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
- eight exact sequential phases and phase-specific allowlists;
- full-playback definition, independent-reference rule, ordinary-review method, editability/transaction/regression boundaries;
- whole-body, mechanics, path/gravity, gait, action-recipe, and planner-door outcomes;
- no-provider/no-scope-expansion boundary.

Named gates that do not block the restructured Phase 2:

- later-phase numeric thresholds may be tightened by independent evidence during that phase, but may not weaken the visible outcome or protected boundary without Arthur/PM review;
- if 24 frames cannot contain a required mechanically complete sample, stop and return to SPEC-0004 Phase 3's owner decision rather than silently widen the cap;
- exact current Terra alias/pricing/privacy/retention/budget and any live request remain the later SPEC-0004 provider gate;
- product-wide “professional-grade” release claims still require the later representative benchmark, comparison, cost, privacy, and release decisions. Passing SPEC-0005 proves only the accepted shared Stick motion scope.

## 10. Handoff

The exact next lifecycle action is GIT-041: separate publication/integration of D-0046 and this eight-phase restructuring. After that publication is cleanly verified, the Project Manager may create one new dedicated Plan-mode technical-only Phase 2 Spec Executor from the exact GIT-041 publication SHA under the exact eight-path ceiling. Until then, do not start an executor. After every Phase 2 technical gate passes, leave exactly one unchanged-source ordinary app instance served directly from the exact unpublished executor worktree on one loopback-only non-`3000` root URL for Arthur's existing-app regression smoke check, with the manifest bindings and non-claims above. Do not create a second or special review surface, reuse or reconstruct the removed rejected Phase 2 result, touch the rejected SPEC-0004 `/8de8/` history, resume SPEC-0004 Phase 3, contact a provider, deploy, or expand scope. Phase 3 remains unauthorized and is the first phase where Arthur reviews new safety-gated body motion in the ordinary app.
