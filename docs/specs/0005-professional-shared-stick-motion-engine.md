# SPEC-0005 — Professional Shared Stick Motion Engine

Status: **Approved; Phase 2 v2 accepted and technically Verified; publication/integration pending.** GIT-047 published D-0052 at `5d0299a00459d39d6c4bff5eeb345f72c5abde4e`. D-0053 records the accepted SPEC-0005 Phase 2 v2 result as technically Verified, pending separate GIT-048 publication/integration. Phase 1 and Phase 2 v1 remain published history; canonical main still contains v1 until that publication. Corrected Phase 3 and Phases 4–8 remain Unauthorized/Not started.

Owner: Arthur
Spec role: Spec Architect
Created: 2026-09-04
Last updated: 2026-09-08
Decision links: [D-0043 through D-0053](../DECISIONS.md)
Related work: [`SPEC-0004`](0004-future-real-ai-animator-requirements.md), [`TODO SPEC-005`](../TODO.md), [`Current State`](../CURRENT_STATE.md), [`Session Handoff`](../SESSION_HANDOFF.md)

> **Lifecycle boundary.** The docs-only activation was published/integrated in exact commit `2b4f00e7a122c196b2c0600144cd638b461bbb2f`. One dedicated Phase 1 Spec Executor then completed the exact six-path proof-only result from that base and stopped. Arthur accepted the historical wave as the Phase 1 readability floor, and GIT-039 published/integrated its exact 20-path package in `2436a9414221e8ee7ef40151284cb8f4e069e828`. GIT-040 published D-0045's former whole-body-pose Phase 2 authorization in `b5ddd5e3f4fb3b19e5c7c2be8a1bd35b0f8d6070`. The first executor result under that authorization was technically green but visually rejected by Arthur; its code/proof bytes were never accepted, propagated, committed, or published, and its disposable review app/worktree was removed. D-0046 supersedes that implementation authorization, restructures this spec to eight phases, and authorizes only the new body-safety Phase 2 after D-0046 is separately published/integrated.
>
> **2026-09-05 review-delivery clarification.** Arthur explicitly requests exactly one ordinary app instance after every Phase 2 technical gate passes so he can smoke-check that the existing application still looks and works normally. This does not make Phase 2 a visible-motion phase: the instance is served unchanged directly from the exact unpublished executor worktree on one loopback-only non-`3000` root URL, contains no preloaded new action or review-only source, and cannot demonstrate or accept the new safety kernel. D-0047 permits a later same-worktree correction executor to reuse the preserved process or sequentially replace it if necessary, never to run two or create a second copy. Phase 3 remains the first human review of new safety-gated motion.
>
> **2026-09-05 Phase 2 publication-stop correction.** GIT-041 published D-0046 and this eight-phase structure in exact canonical-main commit `46b97556ec4e9c9249a1ff354c546f7b1c32ea4d`. A later Phase 2 executor implemented an eight-path body-safety result in `/Users/arthurcarlin/.codex/worktrees/7dfc/stick-animation-app` and stopped. Its manifest at SHA-256 `ea7ab9c5a142843b109ad49924f4709660347265099740312a666eca07972cd4` (17,826 bytes) is preserved as historical technical evidence only. Publication stopped because the exported API selected important poses only after callers had already supplied final frames, and Phase 4's ceiling could not lawfully extend the safety module for mechanics-qualified airborne motion. The result is implemented-but-publication-blocked, not accepted, Verified, published, or rejected visible motion. D-0047 corrects those two specification interfaces without changing anatomy numbers or authorizing runtime work.

> **2026-09-06 accepted Phase 2 correction.** GIT-042 published D-0047 in exact twelve-document commit `1861db92e8f599afa811b0ab6fdd46cc475f9f1c`. The stopped executor corrected only the exact eight authorized paths. D-0048 accepts the result as technically Verified, pending publication/integration. The 17,520-byte correction manifest SHA-256 is `e8a3fbbbb1a1cdf63e5d3648422def4736a4a1bf212ecc27335d2aa842db7874` and passed 168 checks. Runtime integration passed 20,305 assertions, 81 named negatives, and 10,000 generated cases plus 10,000 mirrors; the independent non-importing oracle separately passed 10,000 cases plus 10,000 mirrors and 68 negatives. Inherited validators, TypeScript, lint non-regression, the permanent tester, zero-egress controls, and cleanup passed. Arthur's ordinary-app review is separate smoke evidence, not body-safety or new-motion proof. Phases 3–8 remain Unauthorized/Not started.
>
> **2026-09-06 historical Phase 2 publication and now-superseded Phase 3 authorization.** GIT-043 published the exact accepted 21-path Phase 2 package in `e52454354c39b962ac2710a8602a5306ffd62ad5`, parent `1861db92…`, message `Implement SPEC-0005 Phase 2 body safety`. The required clean tester passed 40 operations, 13 screenshots, four messages, all 37 negatives, one deterministic mocked Drawing POST, zero real API-route/non-loopback/provider requests, and cleanup; result SHA-256 is `c2887be734fe073191aa7d81fc9ffcf2cd6009da0bd188b67ddd9ad77aaebb63`. D-0049 historically authorized the prior Phase 3 contract and GIT-044 later published that record. D-0050 supersedes its future authority after the resulting executor was rejected; the next implementation is the Phase 2 v2 correction, not Phase 3.
>
> **2026-09-07 safety and natural-pose correction.** GIT-044 published D-0049 at exact canonical-main SHA `269ac82335ee4576cb471bd9dffc8f7ce9bdec0f`. Arthur rejected the resulting separate Phase 3 execution after visible review; none of that worktree's runtime, fixture, test, proof, or review bytes is accepted or reused here. Fresh canonical tracing proves that published Phase 2 v1 is a number-safety gate: it enforces lengths, broad numeric bends, screen-sign continuity, crossings, contact, clearance, and travel corridors, but has no performer-facing projection, allowed limb plane, body-local bend guide, comfort band, or naturalness score. A visibly wrong Reach High Right elbow near `57°` therefore remained inside the broad `8°..150°` corridor; the alternate two-circle elbow solution was also numerically valid, and closest-screen continuity could retain the wrong-looking projection because screen-space sign is not anatomy, facing, or depth. D-0050 preserves the eight phases, records Phase 2 v1 as historical rather than silently rewriting it, authorizes a v2 Phase 2 correction first, and rewrites Phase 3 to consume that corrected layer.
>
> **2026-09-07 bounded-sequence and composition correction.** GIT-045 published D-0050 and the first v2 plan in exact commit `a4589664b6857eb10a828189e177e0e7d47e3f69`, parent `269ac823…`, message `Correct SPEC-0005 Phase 2 safety and Phase 3 plan`. Fresh review then found one real contract gap before implementation: one whole-goal facing, support state, limb-role set, and recovery target cannot represent turning, changing hand/foot/pelvis support, a non-neutral base pose, or explicitly requested simultaneous/sequential movement. D-0051 corrects the still-unshipped goal to a bounded ordered semantic sequence, preserves all eight phase owners, and required its now-complete GIT-046 publication at `55b05e2daad649ac1e0027722a75762a9714d281`. D-0052 below resolves the subsequently reported front-knee projection blocker. No D-0050 history or accepted runtime byte is rewritten.
>
> **SPEC-0004 relationship.** SPEC-0004 Phases 1, 2, and timing-only Phase 2.5 remain Verified, published, and integrated. The unpublished Phase 2.6 executor result was rejected by Arthur after human motion review and is not accepted, propagated, published, or runtime truth. This spec supersedes Phase 2.6's intended shared-motion job. SPEC-0004 is paused before Phase 3 until all eight SPEC-0005 phases are accepted, published, and integrated. This does not move, authorize, or rewrite SPEC-0004's later real-provider/Terra phase.

## 1. Owner outcome

Diamond Animator needs one professional shared Stick motion engine, not a growing library of hand-authored joint-coordinate animations. A local Pretend-AI planner and a later separately authorized Terra planner must be able to describe **what movement should happen** through the same bounded movement-goal contract. The local engine must turn that intent into coordinated whole-body key poses, physically readable support and weight, natural paths and timing, and finally complete ordinary independent editable Stick keyframes.

The permanent planner-independent pipeline is:

```text
Pretend AI or a future Terra planner
→ strict bounded action-independent semantic movement sequence
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
| Future planners could fork the format, select a permissive materializer, return raw coordinates, or flatten compound movement into one global state. | Pretend AI and the future Terra adapter enter through one strict bounded-sequence `stick.movement-goal/v1` door and the same non-bypassable local safety/pose/mechanics/path engine. |

## 2. Evidence and root cause

### 2.1 Published runtime traced at canonical basis

The original spec was prepared from clean detached canonical-main basis `4c1da7fa4ea14ed82af950f7ed748b86387a7e0a`; D-0046 re-read it from GIT-040 basis `b5ddd5e3f4fb3b19e5c7c2be8a1bd35b0f8d6070`. This D-0047 correction verified current clean canonical `main`/`origin/main` at GIT-041 `46b97556ec4e9c9249a1ff354c546f7b1c32ea4d` before editing. The preserved Spec Architect worktree remains detached at older `b5ddd5e3…` with the inherited twelve doc paths, so its HEAD is not current canonical truth; the delta is reviewed against `46b97556…`.

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

The first SPEC-0005 Phase 2 executor result under published D-0045/GIT-040 was technically green but visually rejected. It is closed without acceptance or control-plane propagation; no implementation or proof byte from it may be copied, patched, or treated as a foundation. Its removed disposable review app/worktree is historical rejection evidence only.

The distinct restructured Phase 2 executor implemented the body-safety foundation from published GIT-041 base `46b97556ec4e9c9249a1ff354c546f7b1c32ea4d`. Its first `ea7ab9c5…` manifest is preserved as historical non-acceptance evidence because the PM publication review found two specification defects: Phase 3 could not obtain checked important poses before baking, and Phase 4 lacked authority to extend the safety module for airborne mechanics. D-0047 corrected those contracts; D-0048 accepted the corrected exact eight-path result, and GIT-043 published/integrated it at `e52454354c39b962ac2710a8602a5306ffd62ad5`.

SPEC-0005 now separates planning, candidate enumeration, body safety, pose creation, mechanics, path/timing, post-repair validation, final semantic/continuity validation, and human quality review.

### 2.4 Phase 2 v1 limitation and rejected Phase 3 evidence

The correction basis is clean canonical `main`/`origin/main` `269ac82335ee4576cb471bd9dffc8f7ce9bdec0f`. The Spec Architect traced only that canonical source and did not read, run, copy, or modify the rejected Phase 3 worktree.

**Code verified at the correction basis:** `StickBodySafetyFrameContextV1` contains posture, motion phase, impact, support, broad limb intent, planted anchors, literal target-effector points, a path corridor, balance values, and landmark strings. It contains no performer facing, projection, limb plane, elbow/knee guide, requested flexion band, true-key/guide/hold/contact/impact distinction, or forbidden-movement declaration. `validateFrame` accepts any elbow magnitude inside `8°..150°`; `candidateStaticCost` and the sequence selector order target distance, screen-space turn/travel, recovery, support, unrequested displacement, and neutral distance. The selector rejects ordinary screen-sign changes, but screen sign is only the orientation of the projected 2D triangle. These checks prove finite bounded geometry, not natural anatomy or pose readability.

**Arthur's rejected-review evidence supplied with D-0050:** a visibly bad Reach High Right elbow was about `57°`, so it passed the v1 magnitude corridor. The same hand target had another mathematically valid elbow branch. The selected sequence stayed near the prior screen branch, while sign changes were forbidden, even though neither screen branch encoded facing, anatomical forward/back, or depth. The rejected Phase 3 goal supplied only side/limb/intent/target height/direction/extension; it omitted facing, joint guide/limb plane, comfort band, support/root/torso staging, required action landmark, and forbidden extra movement. It generated too few whole-body alternatives and ranked target accuracy/continuity/travel rather than prompt match, joint comfort, line of action, balance, silhouette, and minimum unrequested movement.

The rejected fixtures also promoted roughly eight small trajectory samples into hard key poses. The existing transition easing restarted at each sample, producing move-stop-move-stop motion. Neutral Recovery started with the arm already raised, and Reach High Right was not a wave. Its tests proved math, determinism, editability, and playback mechanics, but not natural human-looking poses. These facts reject the Phase 3 result and the sufficiency of Phase 2 v1 as the next Preview gate; they do not erase GIT-043 or invalidate its bounded numeric-safety evidence.

### 2.5 GIT-045 sequence/composition gap

GIT-045 is valid published specification history, but its whole-goal schema still has one `performerFacing`, one `support`, one `rootGoal`, and one four-limb role set. That shape cannot state a turn, a support/contact release or acquisition, different simultaneous action parts at one landmark, a run that continues after a landing, or return to the exact bound non-neutral starting pose. Its Phase 3 subset is also grounded/in-place, and its Phase 7 run-then-wave settles locomotion before waving. Treating those limits as the permanent planner contract would force later phases to fork the format or smuggle mechanics into action labels.

Current code confirms the implementation has not outrun the plan. `StickBodySafetyFrameContextV1` has one foot-only `both|left|right|airborne` support enum, two planted-foot anchors, literal target points, broad limb intents, and no facing transition, hand/pelvis support, base-pose completion, or requested-part composition. `finalizeStickSpec0005MotionCandidate` remains the sole safety completion seam, and the command transaction reaches Preview only through it when body-safety completion is supplied. D-0051 therefore changes future contract and proof only; no shipped runtime behavior needs migration in this task.

## 3. Final shared contract

### 3.1 Final bounded-sequence `stick.movement-goal/v1`

`stick.movement-goal/v1` remains the only future planner-to-engine format and has never shipped as runtime. D-0051 supersedes D-0050's single-state field shape before implementation. It is strict JSON-compatible data, cloned/frozen on entry, bound to the exact project/transaction/base digest, bounded to `32,768` canonical UTF-8 bytes, finite/dense, duplicate-key rejected, and unknown-field rejected.

| Field | Exact meaning |
| --- | --- |
| `contractVersion`, `goalId`, `binding` | Exact `stick.movement-goal/v1`; a `1..64` lowercase ASCII slug; and exact `projectId`, `transactionId`, `baseDocumentRevision`, `baseDocumentDigest`. |
| `basePoseBinding` | Required exact `sourceFrameId` and `sourceFrameDigest` for the current pose from which generation begins. Recovery/return is relative to this bound pose, whether standing, squatting, lunging, or another safe supported pose; neutral is never silently substituted. |
| `frameCount`, `fps`, `motionStyle` | Existing `8..24` frames and `12`/`24` FPS. Canonicalization supplies `natural_smooth` when style is omitted. `mechanical_robotic` and `mechanical_stepped` are accepted only from explicit structured user intent; style never changes anatomy rules. |
| `requestedParts` | One through eight action-independent part records. Each has a unique `partId`, `semanticKind` from `effector_reach`, `effector_oscillation`, `posture_change`, `locomotion`, `airborne_transfer`, `facing_change`, `impact`, `recovery`, or `hold`, a non-empty affected-role set, and required outcome IDs. Recipe/action words are audit metadata only. |
| `landmarks` | Two through twelve ordered landmark records. Each carries the complete state below. Exact kinds are `true_key_pose`, `pass_through_guide`, `plane_transition`, `hold`, `contact`, and `impact`. Guides/transitions never imply a stop. |
| `segments` | Exactly `landmarks.length - 1` ordered transition records binding adjacent landmark IDs, `activePartIds`, `facingTransition`, `supportTransition`, `pathIntent`, and `exitIntent`. No implicit transition or reordering exists. |
| `completion` | Exactly `hold_last`, `return_to_base`, or `continue_sequence`. `return_to_base` binds the final state to `basePoseBinding`; `continue_sequence` names the continuing part IDs and required outgoing facing/support state. |

Every landmark contains these required fields:

| Landmark field | Exact meaning |
| --- | --- |
| `landmarkId`, `kind`, `frameWindow` | Unique `1..64` slug; one kind above; and optional inclusive semantic frame window inside `0..frameCount-1`, never a coordinate. |
| `facing` | `front`, `left`, or `right` for this landmark. Anatomical roles never swap. |
| `supportMode`, `supportContacts` | `grounded` with a non-empty set, or `airborne` with an empty set. Closed contacts are `left_foot_ground`, `right_foot_ground`, `left_hand_ground`, `right_hand_ground`, and `pelvis_ground` (the current hip/pelvis point). Props, chairs, walls, and undeclared surfaces are invalid. |
| `rootGoal` | `hold`, `shift_left`, `shift_right`, `rise`, `lower`, or `travel`, plus `small`/`medium`/`large`; no point or distance coordinate. |
| `torsoLine`, `headLine` | `upright`, `toward_action`, `away_from_action`, `compress`, `extend`, or `hinge`; and `follow_torso`, `look_toward_action`, or `neutral`. |
| `limbs` | All four anatomical limbs appear exactly once with `anatomicalRole`, `movementRole`, `targetRegion`, `limbPlane`, `jointGuide`, and `flexionBand`. Roles are `active`, `passive_relax`, `passive_balance`, `support`, or `recover`. Every declared support limb matches `supportContacts`. |
| `targetRegion` | Active limbs use body-local height `low`/`middle`/`shoulder`/`high`, direction `forward`/`inward`/`outward`/`center`, and reach `near`/`medium`/`far`; non-active limbs use `none`. Never a point, angle, joint ID, or raw coordinate. |
| `limbPlane`, `jointGuide`, `flexionBand` | `frontal`/`sagittal_near`/`sagittal_far`; arm guide `toward_hip`/`outward`/`forward`/qualified `neutral`; leg guide `forward`/qualified `neutral`; and `extended`/`comfortable`/`folded`/`near_extension_limit`/`near_flexion_limit`. |
| `activePartIds` | Zero through four IDs from `requestedParts`. More than one means explicitly requested simultaneous composition at this landmark. Empty means an intentional settle/hold/base state, not permission for an extra action. |
| `requiredOutcomes` | Zero through four values from `reach_apex`, `compression_bottom`, `support_shift_complete`, `wave_inward_apex`, `wave_outward_apex`, `punch_extension`, `push_up_bottom`, `jump_anticipation`, `takeoff`, `flight_apex`, `landing_contact`, `stride_contact`, `stride_pass`, `turn_complete`, `settled_transition`, and `base_pose_restored`. Owner phases enable them. |
| `forbiddenExtraMovement` | Non-empty closed set drawn from `other_arm_gesture`, `clap`, `unrequested_wave`, `unrequested_hop`, `unrequested_head_motion`, `foot_lift`, `root_travel`, `extra_peak`, `pre_action`, `crab_projection`, and `neutral_reset`. |

Each segment's `facingTransition` is `hold`, `turn_left`, `turn_right`, or `through_front`; endpoints must match. A direct `left ↔ right` change requires an explicit intermediate front-facing landmark and two segments. `supportTransition` is `hold`, `release`, `acquire`, or `airborne`; only Phase 4 may enable anything but a proven constant grounded set. `pathIntent` is `natural_arc`, `direct_mechanical`, or `ballistic`; Phase 5 owns its motion law. `exitIntent` is `continue`, `settle`, `return_to_base`, or `continue_cycle` and must agree with the next segment and top-level completion.

Composition is explicit and fail-closed. Multiple parts may overlap only when every overlapping `partId` is requested, every affected role has one non-conflicting semantic obligation, Phase 4 proves the contacts/weight/airborne sequence, Phase 5 proves the joint motion law, and the current owner phase supports the combination. An unrequested jump-plus-wave fails `composition_unrequested`; an explicitly requested jump-plus-wave is not forbidden merely by its label, but fails if mechanics, safety, frame capacity, or owner-phase support cannot prove it. Sequential parts must name their handoff and continuation state; no part may silently add a clap, hop, head motion, arm shake, crab projection, or neutral reset.

The contract rejects raw joint IDs/points/`x`/`y`, stored angles, executable code, arbitrary curves, action-specific coordinate tables, omitted whole-body landmark state, unbound parts, inconsistent transitions/completion, ambiguous facing/plane, or unknown metadata. Phase 3 implements only constant-ground-contact, in-place compound pose sequences. Phase 4 enables contact changes and airborne mechanics, Phase 5 paths/styles, Phase 6 travel/gait/turns, Phase 7 full recipes/composition, and Phase 8 planners. Unsupported, ambiguous, unsafe, or below-threshold output produces no Preview.

### 3.2 Deterministic body and units

- The only body is `humanoid-11-v1` in `stick-stage-1920x1080-v1`: ordered joints `head`, `neck`, `hip`, `leftElbow`, `leftHand`, `rightElbow`, `rightHand`, `leftKnee`, `leftFoot`, `rightKnee`, `rightFoot`; and segments `head-neck`, `neck-hip`, `neck-leftElbow`, `leftElbow-leftHand`, `neck-rightElbow`, `rightElbow-rightHand`, `hip-leftKnee`, `leftKnee-leftFoot`, `hip-rightKnee`, `rightKnee-rightFoot`. The engine roots body solving at `hip`, uses `hip → neck → head`, `neck → elbow → hand`, and `hip → knee → foot`, and preserves the starter pose's ten segment lengths.
- The stage origin is the top-left. `+x` is screen-right and `+y` is screen-down. Internal solving uses finite IEEE-754 double coordinates. Final coordinates use JavaScript `Math.round` independently per axis, then safety is recomputed from those integers; every final document point is inside `0..1919 × 0..1079`. Character `left` and `right` are anatomical role names and never silently swap because of facing or travel. A mirror reflects unrounded points about the transported neutral hip's vertical axis and then swaps anatomical left/right roles. Mirrored unrounded geometry must agree within `1e-6H`; separately rounded mirror results may differ by at most one pixel per axis, and pass/fail plus failure reason must be identical after swapping named roles.
- For a vector `v`, `angle(v) = atan2(v.y, v.x)` in degrees. Because stage `+y` points down, positive angular change is clockwise on screen. `wrap(a)` returns the unique equivalent in `(-180°, 180°]`. A two-bone joint's signed bend is `wrap(angle(joint → effector) - angle(root → joint))`; `0°` is straight, magnitude is flexion, and sign identifies the actual IK branch. Torso lean is `wrap(angle(hip → neck) - (-90°))`. Head-to-torso angle is `wrap(angle(neck → head) - angle(hip → neck))`.
- Corrected safety never treats that screen sign as anatomy. For every pose it constructs a body-local projection frame: `up = normalize(neck - hip)` and `screenRight = (-up.y, up.x)`. Facing `left`/`right` maps anatomical forward to `-screenRight`/`screenRight`; facing `front` permits the frontal plane and maps performer anatomical right to `-screenRight`. A front/sagittal or profile/frontal request is visually ambiguous for this 2D rig and fails `facing_projection` before Preview. Profile `near`/`far` remains declared semantic depth for ordering/clearance only; it adds no stored z-coordinate.
- Each active chain is checked against its declared projected plane and joint-guide half-plane. The joint must remain on the allowed side of the root→effector chord by at least `0.01H` (`0.015H` for a moving knee), except inside an explicitly requested near-extension band. Every non-exempt knee, including a flexed stationary/support knee, uses the facing-specific `forward` convention in §3.2.1; only the unchanged qualified straight-neutral exception may use `neutral`. An elbow must follow its declared `toward_hip`, `outward`, or `forward` guide. An opposite half-plane is `backward_bend` even when its absolute 2D bend lies inside the old numeric corridor. Knee projection, ambiguity, and positive-side clearance are resolved exactly by §3.2.1; this rule does not require an undefined front-view sagittal-forward vector.
- The unchanged hard geometric corridors remain elbow `8°..150°` and moving knee `6°..125°`. Corrected semantic bands are exact: elbow `extended 15..60` (preferred `35`), `comfortable 45..110` (preferred `75`), `folded 95..140` (preferred `115`), `near_extension_limit 8..20` (preferred `14`), and `near_flexion_limit 140..150` (preferred `145`); moving knee `extended 10..35` (preferred `20`), `comfortable 25..80` (preferred `50`), `folded 70..115` (preferred `90`), `near_extension_limit 6..14` (preferred `10`), and `near_flexion_limit 115..125` (preferred `120`). The selected band is a hard requested corridor; naturalness scores distance from its preferred value. Near-limit bands require their named landmark and are forbidden for a passive/support chain unless that exact endpoint is independently required.
- `standingBodyHeight`, abbreviated `H`, is exactly `groundY - neutralHead.y` for the transported neutral pose; the current line head has no vertical radius to add. `groundY` is the larger neutral foot `y`. Relative planner and safety values are converted from `H` before rounding.
- Unless a rule names a pixel tolerance, distance comparisons use unrounded Euclidean values with boundary epsilon `1e-9H`, angular comparisons use `1e-9°`, and values inside that epsilon are treated as equal to the boundary. A two-circle solution is tangent when its perpendicular intersection height is at most `1e-9H`. Non-finite operands always fail rather than receiving epsilon treatment.
- The existing 80-unit horizontal line head remains derived from the stored head joint. No circle, head rotation field, custom head, or custom body data is introduced.
- Posture intensity remains semantic engine data: `small`, `medium`, and `large` directional leans target `5°`, `10°`, and `15°`; compression/extension/root offsets target `0.08H`, `0.16H`, and `0.24H` before safety selection. These are requested targets, not permission to violate the corridors below.
- Facing, support, limb role, and active-part meaning are evaluated per landmark and per final frame, not once for the whole goal. A declared turn changes projection only through its bound transition; a contact may become support or stop being support only through its bound Phase 4 transition. Phase 2 must reject context/geometry disagreement in either direction: an unsafe pose cannot pass under a stale safe context, and a safe body-local mirror or allowed transition cannot fail merely because its screen-space sign changed.
- `basePoseBinding` transports the complete safe starting pose, not a neutral-pose label. `return_to_base` must restore the bound pose within the ordinary rounded-length and role-specific transported-base corridors; `hold_last` preserves its final declared state; `continue_sequence` preserves the exact outgoing facing, support/contact, active-part, and gait/continuation obligations. A squat, lunge, support pass, push-up base, or other valid non-neutral starting pose may not be normalized, reset, or silently abandoned.
- Generation ends before Preview. Every output frame owns distinct ordinary IDs/content and remains independently editable after Apply.

### 3.2.1 Front-view knee projection correction (D-0052)

This is the explicit stylized **`front-outward-v1`** convention for the existing flat `humanoid-11-v1`, not a claim that real anatomical forward projects outward in a frontal camera. A 2D stick cannot recover hidden knee depth or diagnose real anatomy. In this contract, front-facing `jointGuide: forward` means the following role-local outward flexion projection. It adds no planner field, guide enum, z-coordinate, rig, alternate safety contract, or per-action exception. It replaces only the previously undefined front-knee interpretation; profiles retain anatomical-forward projection.

1. Use the exact bound pose and each landmark/final frame's independently validated transported context. Compute `up = normalize(neck - hip)` and `r = (-up.y, up.x)` from that frame's geometry, never from a fixed stage axis or the preceding knee's sign. For `front/frontal`, guide vector `g = +r` for the anatomical left leg and `g = -r` for the anatomical right leg. For either profile leg, retain `g = -r` when facing left and `g = +r` when facing right. The existing facing/plane restrictions remain.
2. First apply the existing finite/topology/segment gates and the exact qualified straight-neutral exception; only a fully qualified exception skips steps 2–3. For every other anatomical leg let `R = hip`, `E = foot`, and `K = knee`. Reject `length(E-R) <= 1e-9H` as `branch_singularity` before normalization or band checks; likewise apply the existing non-exempt tangent/singularity rejection before the bands. With valid nonzero torso and chain geometry, compute `d = normalize(E - R)` and `p = g - dot(g,d)*d`. If `length(p) <= 1e-9` (dimensionless), the guide cannot distinguish the two chord sides: reject `facing_projection`. Otherwise set `n = p / length(p)` and signed knee clearance `q = dot(K - R,n)`. This perpendicular guide works for asymmetric foot placement and a tilted/translated torso; comparing knee `x` to hip/foot `x`, assigning a fixed signed angle, or copying the base/prior branch is forbidden.
3. After the unchanged straight-neutral exception and numeric/band checks, every other knee must satisfy this guide, whether active, recovering, passive, or supporting a stationary flexed pose. With `e = 1e-9H`, `q < -e` fails `backward_bend` (wrong side of this declared projection, not a real-world diagnosis); `abs(q) <= e` fails the existing `branch_singularity`. A positive side below `0.015H - e` fails the distinct `joint_guide_clearance`, not `backward_bend`. Only an explicitly permitted `near_extension_limit` band waives that clearance minimum; it still requires `q > e`, the `6°..14°` knee band, and all existing restrictions on passive/support near-limit use. No guide test grants a rest exception: only §3.3's exact qualified straight-neutral case skips the flexed-knee guide. Its dead corridor, endpoint/stationary restrictions, and prohibition on moving straight knees remain unchanged.
4. Enumerate both IK circle solutions, qualify each with the same independently derived `n`, and retain only candidates passing every whole-body rule. Never select the nearer prior branch before qualification; never label every front pose unsupported; never inherit an invalid base knee as the allowed side. The bound non-neutral base must itself qualify, and recovery must preserve/restore that exact safe base. A guide-correct knee alone does not prove lengths, comfort, crossings, balance, support, motion continuity, or naturalness.
5. Recompute the frame, guide, clearance, and context on every important and final rounded/post-repair frame. A change of facing does not grant a branch switch or relabel anatomical legs. §3.3's declared projected-transition constraints still apply; a support knee may not flip, and an undeclared/unsafe turn still fails. Later mechanics/gait owners must arrange any required release and valid transition; this correction neither invents those mechanics nor enables their Preview.
6. Under the specified mirror plus anatomical role swap (and left/right facing swap for profiles), `g`, `d`, `n`, and `K-R` transform together, so `q`, guide degeneracy, bands, and qualification are invariant before rounding. Apply the existing rounded mirror tolerance and final-frame recheck too. No fixed screen sign or caller-supplied guide vector is admissible.

**Mandatory independent acceptance/rejection evidence.** Before runtime edits, the Phase 2 oracle must bind named front-facing safe symmetric compression, asymmetric grounded support shift, a stationary flexed non-neutral base and return, permitted near-extension, and anatomical mirrors. Include translated and mildly torso-tilted variants, both IK solutions, both anatomical legs, positive clearance just below/at/above the threshold, negative-side mutation, tangent/zero chord, parallel-guide ambiguity, front/sagittal mismatch, forged facing/role context, and final rounding/contact-repair mutations. Isolated wrong-side cases must report `backward_bend`; positive insufficient-clearance cases `joint_guide_clearance`; indistinguishable guides `facing_projection`; and singular chains `branch_singularity`. Safe constant-contact front cases must remain in the qualification graph, not be deferred merely for facing; independently safe later-owner contexts proceed only to their unchanged `unsupported_owner_phase` door. Natural-looking compression/support cases must be authored independently and pass all whole-body gates, not merely this dot product.

Design-only leg seeds in normalized `H=1` units are hip `(0,0)`, neck `(0,-0.32)`, head `(0,-0.45)`, feet `(+0.20,+0.55)` / `(-0.20,+0.55)`, and equal thigh/shin lengths `0.30`; anatomical left is the positive side. Hold feet fixed and lower hip/torso/head by `0.05`, then shift them by `+0.04` for a modest asymmetric support seed. In each seed, choose the positive-guide circle solution, not fixed-angle signs; its mirror must also qualify at the knee gate. These are analytical examples, not complete saved projects, fixtures, accepted motion, or a replacement for independent whole-body proof. The inward alternative is outside this declared front projection; other plausible 3D interpretations remain unproved, not permission to weaken safety or to claim every real front-view inward knee is injured.

### 3.3 Permanent body-safety and candidate-selection rules

The published v1 rules below remain the historical numeric floor proved by GIT-043. The Phase 2 correction adds `stick.body-safety-selection/v2`, `stick.body-safety-selection-result/v2`, and `stick.body-safety-completion/v2`; it does not relabel or overwrite the v1 manifest. The v2 kernel is planner-, action-name-, style-, and sequence-position-independent and adds per-landmark performer-facing projection, allowed limb planes, body-local joint guides, semantic flexion bands, controlled projected transitions, and final-frame context validation. Planner identity, prompt text, action label, fixture ID, materializer name, caller trust, an explicit injury/deformation request, or a request for unusual motion is neither an input nor an exception. The built-in humanoid has no broken-limb, injury, deformation, or unusual-motion escape hatch; any future capability to depict injury or deformation requires a separate approved spec and separate declared anatomy/safety contract.

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

Every future SPEC-0005 route must obtain checked important poses before baking and then use the sole final candidate door before returning any document or Preview. Current published SPEC-0004 `phase-1-holds`, `phase-2-baked-motion`, and `phase-2.5-timed-motion` entrypoints remain frozen compatibility paths and are not planner doors; their inputs, outputs, defaults, and visible behavior are revalidated unchanged even when approved extension code shares their files, and they are never selectable by a SPEC-0005 planner. Adding another planner-selected or ungated materializer/finalizer is a contract failure, not an extension point.

#### Corrected v2 qualification and transition rules

Phase 2 v2 separates hard safety from later naturalness selection. `qualifyStickBodySafetyCandidateSequencesV2` accepts the exact starter binding, neutral metrics, the ordered per-landmark facing/support/role/plane/guide/band context, declared context transitions, sparse landmark kinds, and bounded whole-body candidate sets. It returns a deep-cloned/deep-frozen graph of only safe candidates and safe transition edges; it does not choose a winner, return a document, or expose Preview. `finalizeStickBodySafetyCandidateV2` receives the original bound semantic sequence, exact qualification graph, the Phase 3-selected landmark sequence, every final rounded frame with its derived semantic context, and the candidate document; it recomputes the binding, base-pose obligation, candidate membership, context interpolation, every body-local/hard rule, final-frame derivation, rounded geometry, forbidden movement, and whole-animation semantics before the sole motion-engine door may return Preview.

The old v1 operations remain historical testable numeric evidence, but the executor's SPEC-0005 Preview door must reject a v1 completion after the correction lands. No compatibility literal, v1 digest, legacy materializer, or caller flag can substitute for v2. This is the one intentionally superseded technical behavior; normal user-visible behavior and SPEC-0004 compatibility routes remain unchanged.

A projected screen-sign change is not automatically an anatomical reversal. Without an explicit `plane_transition` landmark it remains a hard `branch_flip`. With that landmark, only an active arm or non-support leg may change projected sign, and only between two declared allowed planes while both endpoints satisfy the same anatomical guide, `12°..30°` projected flexion, per-frame joint travel at most `0.035H`, bend change at most `35°`, no zero-degree sample, no contact/impact/support ownership, and at least two final transition frames. A support knee, one-frame branch jump, undeclared change, opposite body-local guide, or straight-through sample fails `projected_branch_transition` or `backward_bend`. Final rounded-frame validation repeats the decision; rounding cannot create an allowed transition.

The closed v2 failure vocabulary retains every v1 reason and adds `facing_projection`, `limb_plane`, `backward_bend`, `joint_guide_clearance`, `flexion_band`, `projected_branch_transition`, `context_transition`, `base_pose_mismatch`, `composition_unrequested`, `forbidden_extra_movement`, and `naturalness_unproven`. `context_transition` covers missing, stale, contradictory, out-of-order, or caller-forged facing/support/role context. Any ambiguity, missing required semantic context, empty safe graph, invalid selected membership, unsafe rounded frame, or unprovable natural output returns no Preview and leaves document/history/storage/latch/view state unchanged. False acceptance and false rejection are both contract failures: every unsafe mutation must fail with its named reason/stage, and every independently authored safe case and valid mirror must survive to the exact next owner boundary.

Phase 2 proves anatomy/safety for all bounded contract contexts even where later phases do not yet generate them: all three facings, allowed plane transitions, constant or changing foot/hand/pelvis contact declarations, non-neutral bases, multiple active limbs, holds, recovery, impacts, airborne intervals, and simultaneous/sequential part metadata. Before Phase 4, safety may classify a context as anatomically safe but the sole Preview door still returns `unsupported_owner_phase` for contact changes, hand/pelvis support, or airborne mechanics. Before Phase 7 it does the same for unsupported compositions. Neither owner deferral nor an action label may turn a safe case into `backward_bend`, or an unsafe case into accepted geometry.

#### Bounded naturalness selection

Phase 3, not Phase 2 safety, owns candidate generation and the separate deterministic naturalness selector. Each non-hold true key pose must generate `4..32` distinct whole-body candidates when its degrees of freedom permit: both IK solutions, at least two root/torso staging variants, and allowed passive-relax/balance variants. Exact rest/hold/contact endpoints may have one candidate. After v2 hard-safety pruning, every non-hold movement goal must retain at least two complete safe sequences; otherwise it fails `naturalness_unproven`. A deterministic beam of at most `128` complete sequences is scored lexicographically by: (1) prompt/required-landmark match and forbidden-action absence; (2) distance from joint-band preferred comfort; (3) line-of-action agreement; (4) balance/support staging; (5) silhouette/readability and negative space; (6) body-local continuity including declared plane transitions; (7) minimum unrequested movement; and finally canonical candidate bytes. Unsafe candidates are never repaired into the score and a lower-priority naturalness term can never defeat a higher-priority prompt match.

#### Sparse landmark and motion-meaning rule

A true key pose is only an intentional rest, anticipation, action apex/extreme, recovery, or later mechanics-owned contact/impact. A `pass_through_guide` is a semantic corridor checked across frames between surrounding true keys; it is not a keyframe endpoint, hold, timing-profile boundary, or zero-velocity event. A `plane_transition` is the same non-stopping kind of corridor plus exact source/destination allowed planes; it cannot become a key or easing boundary. Phase 3 may use at most four true keys for one grounded micro-movement and at most two pass-through/plane-transition guides between adjacent true keys. A `hold` is explicit intended stillness baked as distinct ordinary frames. `contact` and `impact` are structurally distinct but fail closed until Phase 4. Phase 3 may use the existing Phase 2.5 baker only where one continuous transition can satisfy a guide without turning it into another easing restart; otherwise it returns no Preview and waits for Phase 5's continuous-path ownership.

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

The named independent benchmark is **`SPEC0005-HUMANOID-NATURALNESS-v1`**. Its primary oracle, safe cases, expected unsupported cases, and adversarial mutations are human-authored without importing the pose/safety engine; self-generated coordinates, snapshots, digests, or score reports are secondary evidence only. Runtime cannot branch on fixture IDs or on `wave`, `walk`, `run`, `run_then_wave`, `punch`, `jump`, `push_up`, `squat`, or `lunge`. The benchmark contains left/right/front/profile cases; non-neutral squat/lunge/pass/push-up bases; multiple-active-limb poses; per-landmark turns; foot/hand/pelvis contact changes; takeoff/airborne/landing; and sequential/overlapping compositions. Required visible examples include wave from a valid non-neutral pose, squat-plus-wave, push-up-plus-wave with supporting hand/feet contacts, walk/run in both directions, direction change without crab projection, and run-plus-jump-plus-wave-plus-land-plus-continue. It also contains near-extension/flexion boundaries and paired false-accept/false-reject mutations: wrong branch versus valid mirror, undeclared versus declared turn, forged versus valid contact transition, unrequested versus explicitly requested jump-plus-wave, lost versus restored base pose, same-side/crab versus valid gait, and unsafe deformation under ordinary versus injury/deformation wording. Phase 3 owns only constant-contact grounded compound landmarks from the matrix; Phase 4 owns contact/airborne mechanics, Phase 5 motion law, Phase 6 gait/turns, Phase 7 complete actions/compositions, and Phase 8 adapter equivalence. Until its owner phase lands, an otherwise safe case must return `unsupported_owner_phase`, not a false anatomy rejection or partial Preview.

For every phase-supported case, hard safety, required landmark/prompt match, forbidden-extra-movement, deterministic/editability, and both expected rejection and expected acceptance assertions must pass `100%`; one false accept or false reject fails the phase. The independent visible-quality rubric scores prompt match `25`, joint comfort `15`, line of action `15`, balance/support `15`, silhouette/readability `15`, continuity `10`, and minimum unrequested movement `5`; each supported sample must score at least `85/100`, the supported-set mean at least `90/100`, and Arthur must accept every required visible sample after two complete loops and landmark scrubbing. Any hard-gate failure or one rejected required sample rejects the phase. These thresholds cover only the named built-in-humanoid set and do not promise universal human-motion perfection.

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

Review links are human evidence, not publication surfaces. The permanent tester must pass before any link is sent. The restructured Phase 2 remains technical-only and creates no new visible action or permanent review UI. After every non-review technical gate passes, it may leave exactly one ordinary app instance served directly from the exact unpublished executor worktree at `http://127.0.0.1:<random-non-3000-port>/` solely for Arthur's regression smoke review. A correction may reuse the existing process or verify/stop it and then start one replacement in the same worktree; processes cannot overlap and no second app copy is allowed. It must use the unmodified ordinary root with no query/hash flag, blue/private-review box, picker, overlay, tester control, fixture injection, preloaded new action/project, public asset, permanent route, or review import. Its manifest binds the URL, port, launch command, PID/process group, exact worktree path, base/HEAD, empty index, exact eight-path dirty set and hashes/sizes, startup/network logs, purpose `existing_app_regression_smoke_only`, explicit `phase2SafetyDemonstrated: false` and `newMotionReviewed: false`, and exact cleanup instructions. Arthur may check Home, New Project, the ordinary blank Stick workspace and controls, Creator → Back, and other existing flows, but that check is not Phase 2 body-safety or motion evidence. Phase 3 is still the first review of new safety-gated body motion.

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

### Phase 2 — Planner-Independent Body-Local Natural Safety Correction

**Lifecycle/status.** GIT-047 published D-0052 at `5d0299a00459d39d6c4bff5eeb345f72c5abde4e`. D-0053 records the accepted SPEC-0005 Phase 2 v2 result as technically Verified, pending separate GIT-048 publication/integration. Phase 1 and Phase 2 v1 remain published history; canonical main still contains v1 until that publication. Corrected Phase 3 and Phases 4–8 remain Unauthorized/Not started. It remains Phase 2, not a new or fractional phase. GIT-043 v1 and every rejected-result record remain immutable history.

**Owner summary.** Add body-local anatomy and projection meaning to the published number-safety floor before another pose maker may create visible output.

**Goal.** Implement the §3.2–3.3 v2 per-landmark performer-facing projection, allowed limb plane, semantic joint guide, flexion band, controlled facing/projected transition, non-neutral base binding, complete final-frame context validation, backward-bend rejection, candidate qualification, post-rounding validation, and fail-closed sole Preview seam. The safety kernel must classify independently authored safe and unsafe candidates across every bounded future contract context without action-name, style, injury/deformation wording, or owner-phase exceptions. Phase 2 qualifies safety only; it does not generate or score a new visible action or enable later-phase Preview.

**Current problem / before and after.** Published v1 can accept a visibly bad `57°` elbow because magnitude, crossings, support, and screen continuity all pass; D-0050's unpublished future shape also cannot distinguish successive facings, supports, active parts, or non-neutral completion. After correction, both IK branches are interpreted in each landmark's declared body-local projection; safe turns/mirrors are not falsely rejected; backward/ambiguous planes, forged context, broken/deformed chains, and unsafe/undeclared transitions fail even when numerically legal or explicitly requested. The safe output is a bounded qualified sequence graph for Phase 3's separate naturalness selection, never a v1-selected closest-screen branch.

**Execution path.** Bound starting `humanoid-11-v1` pose + ordered per-landmark v2 facing/support/role/plane/guide/band semantics + declared transitions/completion + bounded supplied test candidates → `qualifyStickBodySafetyCandidateSequencesV2` hard-safety graph → test-local selector/baker used only for integration proof → `finalizeStickBodySafetyCandidateV2` recomputation on every final rounded frame and derived context → sole motion-engine/executor candidate door → Preview, `unsupported_owner_phase`, or fail closed. The test-local selector/baker is not product pose generation or naturalness scoring.

**Historical executor entry gate (fulfilled).** A fresh executor started from exact GIT-047 `5d0299a00459d39d6c4bff5eeb345f72c5abde4e` in the accepted `/8673/` worktree; D-0053 now records acceptance, not another execution authorization. The following entry checks remain historical requirements for that completed execution. A fresh executor uses a `codex/` branch. It must prove canonical `main` and `origin/main` clean/equal, empty index, no pre-existing dirty paths, the GIT-043 v1 manifest hashes preserved, and the current three runtime source SHA-256 anchors `de9fc8e72bd322841ab566cc5294643f22404c882736f7e9ab3c17be559ffc03`, `63210745a068f37c087a9daa7eeb43d1190dacd0f4fbd4320df12a11269b0020`, and `066777d4ea396dcfe98f77127519abcb375b1c7915cdb96db641dd4dc46ed0d2`. It must not enter, copy from, or mutate the rejected Phase 3 worktree or any other task worktree. Any publication, anchor, scope, ownership, or base mismatch stops before edits.

**Scope and exact allowlist.** Exactly eight tracked paths:

```text
src/lib/ai/stickFigureBodySafety.ts
src/lib/ai/stickFigureMotionEngine.ts
src/lib/ai/stickFigureCommandExecutor.ts
scripts/fixtures/spec0005-stick/v2/body-safety-natural-correction-cases.json
scripts/spec0005-stick/recordPhase2NaturalSafetyCorrectionProof.ts
scripts/spec0005-stick/validatePhase2NaturalSafetyCorrectionProof.ts
scripts/validateStickBodyNaturalSafety.ts
scripts/validateStickBodySafetyIntegration.ts
```

Ignored output may exist only under `output/spec-0005/phase-2-natural-safety-correction/**`. The published `scripts/fixtures/spec0005-stick/v2/body-safety-cases.json`, its v1 recorder/manifest validator, the GIT-043 manifest, all Phase 1 files, and every file outside this allowlist are read-only. No component, workspace/UI, current saved project/history/storage, provider, dependency/configuration, documentation, or review-only product byte may change.

**Implementation boundary.** `stickFigureBodySafety.ts` owns v2 parsing, per-landmark body-local projection, hard candidate/context-transition qualification, base-pose completion validation, and final-frame recomputation through exactly the two v2 callable operations defined above. It may retain v1 exports only for historical direct validation; the executor Preview route rejects v1. `stickFigureMotionEngine.ts` preserves the three SPEC-0004 compatibility materializers and exposes one v2-only SPEC-0005 final door. `stickFigureCommandExecutor.ts` accepts no caller-selected materializer, v1 completion, trust/skip/injury/deformation flag, planner/action/fixture identity, unchecked helper, or selected sequence outside the qualified graph. Failure or unsupported owner context is a document/history/storage/latch/view no-op.

**Non-goals.** No movement-goal parser/pose generator, naturalness scorer, new action/motion, mechanics insertion, contact/support mechanics enablement, new path/timing/gravity, gait, recipe/composition enablement, planner, visible UI, provider, custom rig, injury/deformation depiction, or cap expansion. The rejected Phase 3 result is not corrected or reused. Future custom creatures and injury/deformation requests require separate approved specs and anatomy contracts.

**Entry evidence.** Phase 1 remains published at `2436a941…`; GIT-043 v1 and its `e8a3fbbb…` correction manifest remain historical anchors; GIT-044 is complete at `269ac823…`; GIT-045 published D-0050 at `a4589664…`; D-0051 is published by GIT-046 at `55b05e2daad649ac1e0027722a75762a9714d281`; D-0052's GIT-047 publication at `5d0299a00459d39d6c4bff5eeb345f72c5abde4e` satisfied the fresh-entry gate for the accepted implementation.

**Proof independence.** The new fixture and `validateStickBodyNaturalSafety.ts` are human-authored before runtime implementation and may import only stable project topology/contract primitives, never the safety, motion, executor, or future pose modules. They independently recompute per-landmark facing projection, allowed guide half-planes, bands, context transitions, base return, rounding, and expected reason/stage. Preserve the existing `10,000 + 10,000` v1 numeric/property floor and add at least `10,000` fixed-seed v2 cases plus `10,000` mirrors across all three facings, allowed planes/bands, grounded/airborne classifications, foot/hand/pelvis contacts, non-neutral bases, and single/multiple active roles. Exact engine output is secondary only. Integration must run qualification → test-local selection/bake → v2 finalization → sole final door, and source/AST-prohibit every v1/trust/materializer/unchecked/injury/deformation Preview bypass.

**Required positive/property cases.** Every independently authored D-0052 §3.2.1 front-knee acceptance/rejection and mirror case is mandatory; an all-front `facing_projection`/`unsupported_owner_phase` shortcut fails the phase. Front/frontal and left/right profile projections; anatomical left/right mirrors; explicit through-front turns; both IK branches qualified when body-locally allowed; wrong screen-nearest branch removed by guide; every ordinary and near-limit band boundary; unchanged rest-knee exception; relaxed/passive/multiple-active limbs; recovery to neutral and non-neutral bound bases; grounded foot/hand/pelvis support classifications; declared release/acquire and airborne contexts classified without enabling their Preview; declared arm and non-support-leg projected transitions inside every cap; exact segment preservation before/after rounding; deterministic frozen candidate graph; supported safe cases survive to the next owner boundary; and no-safe-graph/no-Preview. These prove corrected safety only, not natural action quality or later mechanics.

**Required negative cases.** The rejected `57°` Reach High Right projection; each alternate mathematically valid but body-locally backward branch; front/sagittal and profile/frontal ambiguity; missing/stale/contradictory facing, support, role, plane, guide, band, base, transition, or completion context; opposite guide half-plane; support-knee projected switch; undeclared, one-frame, over-travel, over-turn, zero-degree, rounded-only, and contact/impact branch changes; false planted support; broken segment, dislocation, crossing, or deformation under ordinary, injury, or unusual-motion wording; every v1 numeric negative; tampered qualification/selection/binding/final frame; v1-to-Preview; alternate materializer; planner/action/fixture/trust/skip/unchecked/injury/deformation bypass. Paired safe mirrors, declared turns/transitions, and non-neutral returns must not be falsely rejected. Every unsafe case must produce the named v2 reason/stage, no Preview, and no state mutation.

**Required inherited proof.** Run the current Phase 1 quality, Stick AI contract/transaction, motion/timing, UI adapter, history/persistence, and timeline validators; TypeScript; scoped lint and full-lint non-regression; both diff checks; exact allowlist/index; permanent browser tester; source/AST bypass scan; and zero-egress/process cleanup. Historical manifests retain their exact recorded hashes but are not regenerated or falsely rerun under old HEAD/live-process assumptions.

**Review decision.** Phase 2 correction is technical-only. After all gates pass it may leave exactly one manifest-bound ordinary root served from the fresh executor worktree for existing-app smoke only, with no preloaded action, injected source, special route/query, overlay, picker, public asset, or safety/new-motion claim. It must not reuse the rejected Phase 3 process or worktree.

**Measurable acceptance.** `100%` of §3.2–3.3 (including D-0052 §3.2.1) v2 expected-accept, expected-reject, mirror, all-context/facing, band-boundary, context-transition, base-completion, rounding, bypass, and state-no-op assertions pass; false accepts and false rejects are both zero. Both circle solutions are observed and classified by body-local meaning; the `57°` bad projection fails while a guide-correct alternative passes; explicit injury/deformation wording never changes the result; property counts meet the stated floors; v1 historical fixture/manifest bytes remain unchanged; inherited gates pass; exact dirty set is eight paths; index is empty; network/provider count is zero; and any ordinary smoke process is singular, bound, and later cleaned.

**Proof.** `output/spec-0005/phase-2-natural-safety-correction/proof-manifest.json` binds the actual authorized implementation base/HEAD/branch/index and the separately identified exact GIT-047 spec commit/bytes under the continuation/fresh-entry gate, the exact eight paths/hashes/sizes, GIT-043 historical manifest anchors, human-authored independent-oracle provenance, seeds/counts, expected-accept and expected-reject matrices, false-accept/false-reject totals, all context/facing/contact/base/composition classifications, v2 reason matrix, API/final-door order, no-v1-or-bypass Preview proof, inherited commands, lint/diff/permanent tester, zero-egress, any smoke process, and cleanup. Its validator must mutate every material field. It cannot mark human naturalness accepted.

**Protected regressions.** Phase 1, every accepted SPEC-0004 behavior, the non-safety user experience, complete editable frames, Preview/Cancel/Apply/history/storage/onion/Creator, and all §4 systems. Only v1 completion-to-SPEC-0005-Preview authority is intentionally superseded.

**Stop boundary / later relationship.** Return the Spec Executor Implementation Review Packet and stop with an empty index. No Phase 3 code, control-plane edit, Git action, provider/external operation, or natural-motion claim. After Arthur/PM acceptance, sequential CPA closeout and separate publication are required before corrected Phase 3 may be authorized.

**Recommended executor.** `gpt-5.6-sol`, `ultra`, because anatomical invariants, candidate sequencing, adversarial proof, and bypass prevention are foundational.

### Accepted Phase 2 v2 evidence — 2026-09-08

Arthur accepted the ordinary existing-app smoke; the Project Manager accepted the technical result and transferred exclusive ownership after the executor stopped. The exact eight technical paths above remain byte-frozen in `/Users/arthurcarlin/.codex/worktrees/8673/stick-animation-app`, branch `codex/spec0005-phase2-v2-fresh-safety`, base/HEAD `5d0299a00459d39d6c4bff5eeb345f72c5abde4e`. No rejected executor bytes were reused.

The accepted 30,333-byte manifest is `output/spec-0005/phase-2-natural-safety-correction/proof-manifest.json`, SHA-256 `a8c8db1bc81dbc6191975b7544027139f581a7493345e3b9e8bfeba6ecc29c65`. CPA independently reran the unchanged validator before shutdown: PASS, 744 material-field mutations, exact eight paths and empty index. It binds 15 technical receipts and 49 unique file bindings, including eight accepted source files and the original specification. The independent natural-safety oracle passed 20,047 assertions with 10,000 cases plus 10,000 mirrors; inherited v1 oracle coverage remains 10,000 plus 10,000 mirrors and 68 negatives. Integration passed 40,658 assertions, 81 named negatives, 80 band-boundary checks, 41 transaction attacks, and stationary-hold Preview/Apply; request/candidate binding, stale/final-frame tampering, owner gating, knee/elbow projection, and no-bypass checks passed. TypeScript, zero-finding scoped lint, unchanged full-lint baseline (5 errors/72 warnings), inherited suites, and diff/scope checks passed. Zero false accepts/rejects is a claim about this bounded tested corpus, not every future motion.

The permanent tester passed 40 operations and 13 screenshots in a clean isolated exact-base clone, with zero real API/non-loopback/provider attempts and cleanup. It protects the existing app, not the eight dirty v2 implementation files; direct safety/integration suites cover those. Arthur's ordinary root review at `http://127.0.0.1:54945/` is separate smoke evidence, not new safety visualization, full-playback/new-action review, a naturalness score, or universal human-motion acceptance.

The accepted path is v2 qualification → test-local selection/bake → final rounded/context safety → sole motion-engine/executor door. The test-local builder is not product generation. No visible wave/run creation, naturalness ranking, later-owner Preview, provider, UI, history/storage change, or Phase 3 implementation is claimed. Existing SPEC-0004 compatibility routes remain protected; v1-to-SPEC-0005 Preview is intentionally fail-closed.

CPA verified and stopped only review process group `63034` (parent `63034`, listener `63035`), then verified port `54945` closed. The accepted manifest remains unchanged, including its historical executor/review-pending/live-server fields. This phase has no dedicated tracked-state finalizer: final closeout uses the successful pre-cleanup validator result, complete offline source/receipt/artifact hash-and-size revalidation (original spec against its bound base commit; live logs by their bound prefixes), exact technical-plus-record path audit, memory/link/lifecycle/diff checks, empty index, no hidden flags, and process/port checks. The strict live eight-path CLI is not misreported as passing after cleanup or record propagation. Phase 2 v2 is accepted/technically Verified, not yet published/integrated; Phases 3–8 remain Unauthorized/Not started.

### Phase 3 — Action-Independent Whole-Body Key-Pose Maker

**Lifecycle/status.** The executor result produced under D-0049/GIT-044 is rejected and closed without acceptance, propagation, or publication. None of its bytes may be copied or patched. This rewritten contract is decision-complete but Unauthorized/Not started until the Phase 2 v2 correction is accepted, CPA-closed, separately published/integrated, and Arthur explicitly authorizes a fresh Phase 3 executor.

**Owner summary.** Turn the constant-contact grounded slice of a bounded semantic sequence into several safe coordinated whole-body alternatives and select the one that best reads as the requested natural pose without forcing a neutral base.

**Goal.** Implement the corrected grounded, in-place, constant-contact subset of `stick.movement-goal/v1`, including non-neutral base bindings, a constant per-sequence facing with separate front/left/right profile cases, multiple active limbs, simultaneous compound pose obligations, sparse semantic landmarks, bounded whole-body candidate generation, and the separate deterministic naturalness score in §3.3. No user or fixture supplies raw joint coordinates.

**Current problem / before and after.** The rejected solver lacked facing, limb planes/guides, comfort bands, body staging, required landmark, and forbidden motion; D-0050's published-but-unimplemented interim shape also flattened the whole goal to one state. After this phase, each grounded landmark fully states the sequence's unchanged facing and support/contact, root/torso line, hand/foot target region, joint guide/plane, flexion band, all active/passive/support limbs, simultaneous part IDs, required outcomes, forbidden extras, and landmark type. A wave may begin from and return to a valid squat/lunge/pass pose; a squat-plus-wave may coordinate posture and arm at the same landmarks; neither is reset to neutral. Unsafe, unclear, facing-changing, contact-changing, airborne, traveling, or not-yet-owned goals produce no Preview.

**Execution path.** Strict bounded semantic sequence → validate each complete whole-body landmark, active-part overlap, base/completion, one constant facing, and constant grounded contacts → construct the body-local facing frame → generate `4..32` candidates per non-hold true key → Phase 2 v2 hard qualification graph → deterministic naturalness scoring of at least two safe complete sequences → sparse true keys plus non-stopping guide/plane corridors → existing baker only where it does not create guide stops → Phase 2 v2 final rounded/context validation → sole candidate door → independent ordinary keyframes → existing Preview transaction.

**Scope and exact allowlist.** Exactly ten tracked paths:

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
scripts/validateStickNaturalPoseQuality.ts
```

Ignored output: `output/spec-0005/phase-3/**`. No UI, old fixture, provider, package/config, corrected safety module/kernel, or control-plane edit. Phase 3 consumes v2 as-is; it may not duplicate safety/IK qualification, accept v1 completion, export raw geometry, or add a second finalizer/Preview door.

**Non-goals.** No facing change/turn, contact-set change, weight/contact mechanics insertion, hand/pelvis support enablement, airborne output, root travel, continuous-path/timing rewrite, gait cycle, full wave/walk/run/composed-run/punch/jump/push-up recipe, language routing, planner connection, UI, provider, or cap expansion. Action-family labels may exist only in the independent oracle; the core branches on semantic fields.

**Entry gate.** One fresh Plan-mode executor/worktree begins only from the future clean canonical publication SHA that contains accepted Phase 2 v2 plus its CPA record and a later explicit Phase 3 authorization. It verifies the v2 manifest/source anchors, current safety/integration tests, empty index, exclusive ownership, exact ten-path ceiling, and absence of reused rejected-worktree bytes. Any need to change Phase 2 returns to a separately authorized Phase 2 correction; Phase 3 cannot patch safety.

**App-copy review.** Ordinary unpublished links show eight representative constant-contact grounded sequences: right and left high-outward reach mirrors, front-facing both-arm coordinated reach, profile lunge/pass-pose reach, squat compression-and-wave-in/out compound landmarks, right punch-extension pose/recovery, left support-shift recovery, and return from a gesture to the exact bound non-neutral base. Labels must state that these are pose/transition probes, not complete wave, punch, jump, push-up, run, or gait actions. Arthur watches two loops, scrubs sparse true keys/guides, and checks prompt match, per-landmark facing, elbow/knee direction, comfort, line of action, balance, multiple-limb coordination, base preservation, continuity, and absence of neutral reset or extra movement.

**Measurable acceptance.** Inputs contain zero raw points/angles/joint IDs and all required bounded-sequence semantic fields; each non-hold true key generates `4..32` candidates and each non-hold goal retains at least two safe complete sequences; prompt/landmark/composition/forbidden-movement hard gates pass before scoring; the lexicographic score order is exact; fixed lengths stay within two pixels; effectors finish inside their semantic region; body-local guides/bands and per-landmark facing pass; the unchanged grounded contacts stay within two pixels; two to four active limbs coordinate when requested; squat-plus-wave, lunge/pass-pose, and non-neutral return cases preserve the bound base instead of inserting neutral; mirrors agree within rounding tolerance; no pass-through/plane-transition guide becomes a key endpoint, hold, or easing restart; true keys are at most four per grounded micro-movement; deterministic repeat is byte exact; the Phase 3 benchmark slice meets `85` per case/`90` mean with `100%` expected accepts/rejects and zero false accepts/rejects; every frame is independently editable and passes Phase 1 full playback.

**Required negative cases.** Raw coordinates/angles/joint IDs/code; missing facing/support/root/torso/whole-body role/guide/plane/band/landmark/part/completion/forbidden field; ambiguous projection; wrong binding/version/count; fewer than two safe sequences; target-first selection of an uncomfortable/backward silhouette; incorrect score priority; generic reach labelled wave; unrequested raised-arm start; forced neutral start/ending from a non-neutral base; serialized arms when simultaneous motion was requested; conflicting multiple-part role obligations; guide converted to hard key; eight small easing-restart keys; backward bend; unsafe/near-limit misuse; uncoordinated one-joint-first movement; extra gesture/peak/pre-action; and unsupported contact change/hand-or-pelvis support/impact/airborne/locomotion/full-action composition all fail before Preview.

**Proof.** The Phase 3 fixture plus `validateStickNaturalPoseQuality.ts` form the independent human-written Phase 3 slice of `SPEC0005-HUMANOID-NATURALNESS-v1`; they are authored before implementation and do not import the pose/safety/motion/executor modules. They cover front/left/right grounded compound poses, all mirrors, squat-plus-wave landmarks, lunge/pass-pose reach, multiple active limbs, neutral and non-neutral base return, near limits, one-joint-first and neutral-reset rejection, plus expected unsupported contact/airborne/gait/full-composition cases. Unit/property, score-order, mirror/metamorphic, guide/non-stop, source/AST, v2 qualification/finalization, eight two-viewport full-playback flows, paired false-accept/false-reject mutations, one-frame edit/Undo/Redo/Save/Open, inherited validators, permanent tester, zero-egress ledger, independently validated manifest, and Arthur review are mandatory. Coordinate snapshots and self-generated goldens are secondary only.

**Protected regressions.** Phase 1, accepted corrected Phase 2 v2, all §4 boundaries, manual editability/transactions, and published SPEC-0004 compatibility paths. The Phase 3 executor cannot edit the safety layer.

**Stop boundary / later relationship.** Stop after the constant-contact grounded compound pose/transition set. It proves only the named Phase 3 benchmark slice—not full actions, support changes, gait, physics, continuous paths, or universal perfection. Phase 4 retains foot/hand/pelvis contact and airborne mechanics, Phase 5 permanent motion law and smooth in-betweens, Phase 6 walk/run gait and turns, Phase 7 semantic action recipes/compositions, and Phase 8 the shared Pretend-AI/future-Terra entry.

**Recommended executor.** `gpt-5.6-sol`, `ultra`, because body-chain architecture and future compatibility are foundational.

### Phase 4 — Mechanics, Weight, Contact, and Required-Pose Insertion

**Owner summary.** Make foot/hand/pelvis support, contact release/acquisition, and grounded/airborne transitions mechanically readable, and let the engine insert poses that physics requires.

**Goal.** Add per-landmark foot/hand/pelvis support ownership, ground-contact validation, support-set changes, center-of-mass/support-polygon proxy, anticipation/takeoff/airborne/landing/contact/compression/recovery rules, and deterministic mechanically required key-pose insertion.

**Current problem / before and after.** A pose can be anatomically safe yet float, slide, fall outside support, claim a hand/pelvis contact that geometry does not make, or omit release/takeoff/landing/acquisition. After Phase 4, ordered support transitions—including push-up hand/foot support and foot-to-flight-to-foot transfer—generate the missing structural poses before baking and route every repaired result back through Phase 2 safety.

**Execution path.** Bounded movement sequence → whole-body requested landmarks → exact contact-set/support state machine → support-polygon and center-of-mass proxy → release/acquire/takeoff/contact required-pose insertion → re-solve body chains → validate contact/weight → mechanics-qualified Phase 2 checked selection → existing timing/baker → mechanics-qualified Phase 2 final rounded/post-repair/continuity revalidation → one final candidate door → transaction.

**Scope and exact allowlist.** Exactly twelve tracked paths:

```text
src/lib/ai/stickFigureMovementGoal.ts
src/lib/ai/stickFigurePoseEngine.ts
src/lib/ai/stickFigureMechanicsEngine.ts
src/lib/ai/stickFigureBodySafety.ts
src/lib/ai/stickFigureMotionEngine.ts
src/lib/ai/stickFigureCommandExecutor.ts
scripts/fixtures/spec0005-stick/v4/body-mechanics-cases.json
scripts/spec0005-stick/phase4BrowserProof.ts
scripts/spec0005-stick/recordPhase4Proof.ts
scripts/spec0005-stick/validatePhase4Proof.ts
scripts/validateStickBodySafety.ts
scripts/validateStickBodySafetyIntegration.ts
```

Ignored output: `output/spec-0005/phase-4/**`.

The three Phase 2 safety paths are authorized only for the mechanics-qualified grounded/takeoff/airborne/contact extension and its current independent/integration proof. No Phase 2 fixture is rewritten; Phase 4 cases belong to the v4 fixture. No other Phase 2 source/proof path is reopened.

**Mechanics-qualified safety contract.** Phase 2 classifies airborne and changing-contact anatomy but the sole Preview door rejects those owner contexts until Phase 4. Phase 4 may extend that same safety module to enable them only when the complete ordered important-pose/mechanics sequence proves every declared release/acquisition and, for flight, `grounded anticipation → takeoff → airborne → landing contact → compression → recovery` at selection time; the full baked sequence proves the same transitions again at completion. Selection never requires or receives final frames. The safety module derives qualification from the bound sequence and mechanics context; callers cannot assert an `allowAirborne`, `allowContact`, trusted, skip, injury, action, fixture, planner, or materializer flag. A valid contact names one of the closed ground contacts and has matching geometry; the support polygon uses every declared ground point, including hand or pelvis where applicable. A valid airborne interval has no ground contact, is preceded and followed by valid grounded support, stays above the fixed ground without penetration, and completes landing/recovery inside the same bounded sequence. Isolated airborne frames, undeclared/false contacts, missing/reordered transitions, long unexplained hover, stale mechanics context, or a legacy route fail before Preview. Every important, inserted, rounded, and post-repair frame still passes unchanged anatomy/crossing/clearance/continuity/semantic rules.

**Non-goals.** No mechanics enablement in Phase 2, caller-selectable airborne/contact bypass, prop/wall/chair contact, new path interpolation, Earth-gravity implementation, locomotion cycle, action recipe, language/planner route, UI, provider, numerical anatomy change, injury/deformation bypass, or frame/FPS expansion.

**Entry gate.** Published/integrated Phase 3 and the corrected/published Phase 2 two-stage API, source anchors, independent 10,000+10,000 property floor, bypass matrix, and current safety/integration validators must revalidate. The Plan-mode trace must show the twelve paths suffice and must freeze the exact grounded/takeoff/airborne/contact state-machine contract before edits; otherwise stop before edits. No future phase may quietly stop rerunning bend or continuity checks.

**App-copy review.** Ordinary links show weight shift, double-foot-to-single-foot transfer, push-up hand/foot support, pelvis-supported recovery, deep compression/recovery, takeoff/airborne/landing/recovery, and direction-change settle. Arthur watches two loops and inspects all declared contacts, pelvis/torso weight, knees/elbows, release, flight, and landing frames.

**Measurable acceptance.** The ground line is the bound starting pose's declared ground and stays fixed for the transaction. Every declared foot, hand, or pelvis contact lies on `groundY ± 2px`, moves at most two pixels until explicit release, and contributes its ground point to the support interval; every undeclared contact is non-support. The 2D center-of-mass proxy is `balanceX = (2*hip.x + neck.x + head.x) / 4`; with multiple support it projects between the extreme declared support points plus/minus `5%` of `H`, and with one support point it stays within `8%H` of that point. Single support places pelvis/torso visibly toward the support side. Every contact-set change has ordered release/acquire landmarks. Grounded→airborne inserts anticipation/takeoff, airborne→grounded inserts landing contact/compression/recovery, and unsupported reversal inserts settle/weight transfer when capacity permits; insertion is deterministic, never exceeds 24 frames, and preserves the requested continuation/base completion. The same safety module rejects isolated airborne or forged contact input but accepts every complete mechanics-qualified sequence at both selection and final rounded/post-repair completion stages.

**Required negative cases.** Foot/hand/pelvis slide, false or undeclared contact, support-side mismatch, center outside the exact support set, contact change without release/acquire, airborne without takeoff, takeoff without prior grounded anticipation, any contact during flight, landing without contact/compression/recovery, reordered/missing mechanics state, stale mechanics binding/context, caller-supplied airborne/contact/skip/trust/injury flag, long unexplained hover, knee/elbow inversion, ground penetration, instant reversal, required insertion beyond the frame cap, rounded/post-repair safety failure, and post-bake repair that changes an applied document all fail.

**Proof.** Support/contact traces, auto-insertion decisions, independent mechanics invariants, mutated failures, safety-module and integration-validator extensions covering both rejection and mechanics-qualified acceptance, source/AST proof against airborne flags or alternate doors, full-cycle capture at both viewports, manual edit persistence, protected suites, manifest, and Arthur review. Numeric proxies are supporting evidence; visible weight acceptance is mandatory.

**Protected regressions.** Phase 1 reference; Phase 2 two-stage safety API, bend/crossing/clearance/continuity/semantic rules, 10,000+10,000 property floor, and one-final-door bypass protections; Phase 3 semantic solver; §4 boundaries; ordinary manual post-Apply ownership/editability; and published SPEC-0004 Phase 2.5 timing math. The airborne extension may change only support-state qualification and may not relax numerical anatomy or grounded rejection.

**Stop boundary / later relationship.** No new in-between path model, Earth-gravity curve, gait, final recipe, or planner route. Phase 5 consumes the mechanics states.

**Recommended executor.** `gpt-5.6-sol`, `ultra`, because support/contact defects are subtle and foundational.

### Phase 5 — Paths, Timing, Gravity, and In-Betweens

**Owner summary.** Establish the permanent motion law that connects good mechanical poses with coordinated motion that accelerates, decelerates, arcs, follows through, and obeys gravity.

**Goal.** Make `natural_smooth` the default permanent motion law across all moving roles, replace one generic segment interpolation assumption with mechanics-aware body/limb paths and velocity-continuous timing, and permit intentionally mechanical/stepped motion only through explicit `mechanical_robotic` or `mechanical_stepped` structured intent, while still baking ordinary keyframes.

**Current problem / before and after.** Existing timing curves space frames but all joints still derive from one root/angle interpolation, so output can teleport, stutter, stop unintentionally, move one joint first, or space every joint with the same mechanical rhythm. After Phase 5, root/torso/support chains, swing limbs, simultaneous parts, impact/recovery, and airborne roots follow coordinated appropriate paths; every rounded frame passes Phase 2 safety. Laggy visible playback is always a failure, including for an explicitly mechanical style.

**Execution path.** Requested/inserted landmarks + segment active-part/facing/support transitions + explicit/default motion style → coordinated per-role path selection → tangent/velocity continuity → natural acceleration/deceleration and follow-through, or explicitly requested mechanical/stepped cadence → fixed-length reconstruction/rounding → Phase 2 final-frame/context and whole-animation gate → complete baked frames → transaction.

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

**Measurable acceptance.** Omitted style canonicalizes to `natural_smooth`. Natural swing effectors have non-collinear intermediate samples inside their declared arc corridor; coordinated active/root/support roles begin and settle according to one declared segment rather than a one-joint-first cascade; unrelated roles do not receive identical normalized spacing by default. Phase 2's stricter joint-specific final-frame caps remain mandatory. For adjacent moving samples that each exceed `2%H` per frame, non-impact velocity magnitude ratio is at most `2.5×` and direction changes by at most `90°`; a transition to/from the lower threshold must align with an endpoint, settle, anticipation, contact, or recovery sample. Direction reversal includes a near-zero/settle sample; natural transitions are not equal-gap constant pace; planted contacts preserve Phase 4 ownership. Explicit `mechanical_robotic` may use coordinated direct motion and `mechanical_stepped` may use deliberate holds/steps, but neither permits teleport, missing frames, accidental stall, unrequested role motion, unsafe anatomy, or playback lag. Airborne vertical root samples use `g = 9.81m/s²` after mapping neutral standing height to `1.75m`, with takeoff/contact endpoints and a single apex; tolerance is two stage pixels after rounding. Follow-through occurs only on declared free chains and decays by recovery.

**Required negative cases.** Teleport/snap; missing or duplicate movement sample; stutter; unintended stop; laggy playback; one-joint-first sequencing when coordinated movement was requested; equal-gap or equal-role mechanical spacing under default/natural style; zigzag arc; overshoot; velocity cusp without impact; two apexes; float/linear airborne root; wrong gravity sign/scale; planted-contact drift; follow-through on a support limb; endless oscillation; implicit mechanical/stepped style; and `direct_mechanical` without explicit structured intent fail. Explicit mechanical style is a visible cadence choice, never a safety, editability, continuity-cap, or performance bypass.

**Proof.** Human-authored natural and explicit-mechanical examples; unrounded per-role path/velocity traces; independent physics/metamorphic checks; paired false-accept/false-reject mutations for every forbidden artifact and valid explicit style; full playback/time capture including frame-index timing and no-lag threshold; body integrity/editability/history/storage regressions; manifest; and Arthur review. Exact baked coordinates and self-generated traces alone are insufficient. Hard checks and expected accept/reject outcomes are `100%`; the Phase 5 visible slice must meet `85` per sample/`90` mean and Arthur must accept every required sample.

**Protected regressions.** All prior phase invariants and §4. Published SPEC-0004 Phase 2.5 formulas remain available but path selection may combine them only as specified; no live curve is stored and no rounded/repaired frame bypasses Phase 2 safety.

**Stop boundary / later relationship.** No walk/run cycle planner or final action recipe. Phase 6 composes gait from these shared paths.

**Recommended executor.** `gpt-5.6-sol`, `ultra`, because temporal/physics behavior needs high-confidence reasoning and browser proof.

### Phase 6 — Walk and Run Locomotion

**Owner summary.** Produce distinct believable left/right walk and run locomotion, turns, and direction changes instead of a crab walk or a sped-up walk.

**Goal.** Implement one-cycle left/right walk and run planning, passing/contact/up/down states, facing turns, travel-direction changes, and a valid continuation state through the shared contract and engine.

**Current problem / before and after.** Labels and alternating-leg checks can pass while root travel, arm opposition, contacts, flight, facing, or turn handoff are wrong. After Phase 6, walk and run have distinct mechanics, visibly travel left or right, turn through explicit facing landmarks, change direction with support transfer, and expose a continuation state that Phase 7 can resume after another part ends.

**Execution path.** Ordered `locomotion` part with facing/travel/completion → gait-cycle planner → contact/down/passing/up landmarks for both sides plus explicit turn/direction-change/continuation landmarks → Phase 3 pose maker → Phase 4 support/contact mechanics → Phase 5 motion law → Phase 2 final safety/context/continuity gate → ordinary frames → transaction.

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

**App-copy review.** Six ordinary links: walk right, walk left, run right, run left, walk turn-and-reverse, and run turn/direction-change with continued gait. Arthur watches two loops and answers: does it travel in the requested direction, alternate support, swing opposite arms, show all contact/down/passing/up states, turn through front instead of swapping roles, read as walk versus run, continue cleanly, and avoid sideways crab motion?

**Measurable acceptance.** Each gait has ordered contact → down → passing → up landmarks for both sides; left/right support alternates; when left leg is forward the right arm is forward and vice versa at the corresponding landmark; root displacement is monotonic in the current requested direction with no backtracking over `3%` of that travel segment; planted feet remain within two pixels until release; walk always retains at least one ground contact and has no flight; run includes at least one both-feet-airborne interval and a shorter contact proportion than its paired walk; run changes cadence/flight/vertical dynamics, not merely playback speed. Every turn uses explicit per-landmark facing, passes through front for a left↔right reversal, preserves anatomical role identity, transfers support, and begins the new direction without crab projection or neutral reset. `continue_cycle` ends in the declared outgoing gait/facing/support state; final travel is at least one short stride and within stage bounds.

**Required negative cases.** Same-side arm/leg swing, non-alternating support, crab/sideways posture, in-place leg cycling, sliding planted feet, walk flight, run without flight, run byte-identical to time-scaled walk, wrong-direction/backtracking root, missing contact/down/passing/up landmark, direct left↔right facing swap, turn without support transfer, anatomical role swap, lost continuation state, unintended neutral reset, leg crossing/broken length, and out-of-bounds travel fail.

**Proof.** Human-authored left/right/turn examples; contact, facing, travel, continuation, and opposition traces; gait-phase/state receipts; walk/run structural comparison independent of labels; paired valid/invalid mirror, turn, crab, and sped-up-walk fixtures; two-viewport full playback; manual-edit/Undo/Redo/Save/Open; permanent tester; manifest; and Arthur acceptance. Hard and expected accept/reject checks are `100%`; the visible slice meets `85` per sample/`90` mean with every required sample accepted.

**Protected regressions.** All prior engine and §4 rules. Locomotion planner emits the same movement-goal semantics and cannot bypass shared mechanics/path validation.

**Stop boundary / later relationship.** No natural-language routing, action-recipe catalog, real provider, cap expansion, or UI change. Phase 7 reuses gait/engine but does not rewrite it.

**Recommended executor.** `gpt-5.6-sol`, `ultra`, because gait requires coordinated temporal mechanics and visible judgment.

### Phase 7 — Core Actions Through the Shared Engine

**Owner summary.** Rebuild complete actions and explicit simultaneous/sequential compositions—including wave from a valid base, squat-plus-wave, push-up-plus-wave, and run-plus-jump-plus-wave-plus-land-plus-continue—as semantic recipes, then accept them in the ordinary app.

**Goal.** Replace raw coordinate recipe piles with bounded ordered `stick.movement-goal/v1` recipes consumed by Phases 2–6, preserving exact requested parts, overlap, handoffs, contact/facing state, base-pose completion, and locomotion continuation.

**Current problem / before and after.** Existing/rejected examples hard-code whole bodies, flatten composition, and can preserve unrelated poses or bad mechanics. After Phase 7, recipes state ordered movement intent only, explicitly declare simultaneous/sequential part activation, and share all safety/pose/mechanics/path/gait code. The engine performs every requested part and no unrequested action; it neither rejects a safe requested combination by label nor invents movement to make a recipe look lively.

**Execution path.** Local fixed recipe data → strict bounded movement sequence → shared pose/mechanics/path/gait engine → Phase 2 final safety/context/semantic/continuity gate → complete ordinary frames → transaction → full-playback proof and ordinary review.

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

**App-copy review.** Ten ordinary links for wave from standing, wave from a valid non-neutral pose and return, punch, jump, hop, bow, dodge, squat-plus-wave, push-up-plus-wave, and run-plus-jump-plus-wave-plus-land-plus-continue. Arthur watches two full loops, scrubs every named base/anticipation/action/contact/turn/landing/recovery/continuation landmark, and compares against the paired false-accept/false-reject mutations.

**Measurable acceptance.** Recipe and fixture source contain no joint coordinate/angle arrays; every action/composition uses the same public engine call. Wave has readable alternating hand extremes, does not disturb unrequested feet/root/other arm, and obeys `hold_last`, exact `return_to_base`, or declared continuation from any valid supported base. Punch has guard, extension, impact, recoil, and no head/foot flourish. Jump and hop visibly compress, take off, reach one apex, land, compress, and recover, with hop lower/shorter than jump. Bow has readable anticipation/hinge/bottom settle/recovery and maintained support. Dodge transfers weight, moves in the requested direction, settles before reversal, returns without foot slide, and includes no unrequested gesture. Squat-plus-wave has both requested parts active where intended and never forces neutral between them. Push-up-plus-wave preserves the declared supporting hand/feet contact set, releases only the waving hand, keeps mechanically valid support, and returns/recontinues the push-up base. Run-plus-jump-plus-wave-plus-land-plus-continue retains gait/facing, overlaps only the requested parts, completes takeoff/landing mechanics, and resumes the declared run cycle without settling to neutral. Every action passes the named naturalness threshold, full-cycle, mechanics, path, ownership, composition, base, and transaction gates.

**Required negative cases.** Raw-coordinate recipe; action-name switch in lower engine; wave with unrequested clap/hop/other-arm motion; unrequested jump-plus-wave; explicitly requested jump-plus-wave rejected only because of its label; requested part omitted; unrequested part added; conflicting overlap silently serialized; simultaneous request performed one-joint-first; squat-plus-wave neutral reset; push-up-plus-wave with lost/false hand or foot support; run/jump/wave that loses facing/gait, omits landing recovery, settles to neutral, or fails to continue; hop with unrequested head nod/shake; floating apex dwell; compressed unreadable bow; instant dodge reversal; sliding contacts; extra pre/post action; and recipe-specific direct keyframe writer fail.

**Proof.** Source/AST scan plus runtime rejection; human-authored semantic recipe examples and action/composition landmark/invariant catalog; paired false-accept/false-reject mutations authored outside the engine; exact per-frame active-part, facing, support/contact, required-outcome, forbidden-extra, base-return, and continuation traces; full-playback captures; permanent tester; manifest; and Arthur's explicit decision on every required visible example. Self-generated exact goldens remain secondary only. Hard and expected accept/reject checks are `100%`; the Phase 7 visible set meets `85` per sample/`90` mean and every required sample is accepted.

**Protected regressions.** The historical accepted wave remains available/protected until this phase is accepted and deliberately routed in a later authorized task. All §4 systems remain unchanged.

**Stop boundary / later relationship.** Do not connect normal chat, Pretend AI, or Terra. Do not modify lower engine bytes. Phase 8 creates the shared planning door and final gate.

**Recommended executor.** `gpt-5.6-sol`, `xhigh`, because the engine is established but visible action quality remains demanding.

### Phase 8 — Shared Pretend-AI / Terra-Ready Planning Door and Final Gate

**Owner summary.** Prove that local Pretend AI and a future Terra-shaped planner describe the same bounded semantic sequence and use the same engine, without contacting a provider.

**Goal.** Add one strict planner door, connect a local Pretend-AI adapter to the Phase 7 ordered recipes, validate a provider-free Terra-shaped test adapter against the identical bounded sequence contract, and run the complete quality/ownership regression gate.

**Current problem / before and after.** Planner formats could fork, flatten facing/support/composition into one state, or return raw coordinates. After Phase 8, all accepted planning output is the same ordered `stick.movement-goal/v1` sequence—including base binding, landmarks, transitions, active-part overlap, contacts, and completion—and only the local safety-gated engine may create poses/frames.

**Execution path.** Pretend recipe adapter **or** provider-free Terra-shaped fixture adapter → identical planner-door validation/binding/canonicalization → same bounded movement sequence → one shared candidate/safety/pose/mechanics/path/gait/recipe/final-gate pipeline → existing Preview/Apply/Cancel transaction → full-playback and Arthur review.

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

**App-copy review.** Ordinary links expose the Phase 7 required set plus walk/run/turn through both the Pretend-AI and Terra-shaped provider-free adapters, including squat-plus-wave, push-up-plus-wave, and run-plus-jump-plus-wave-plus-land-plus-continue. Arthur watches two full loops of each required equivalence pair, scrubs landmarks/transitions, edits one in-between joint in at least one action, verifies Undo/Redo and Save/Open, and gives one explicit final shared-engine acceptance decision.

**Measurable acceptance.** Pretend and Terra-shaped test adapters that express the same intent yield the same canonical bounded-sequence digest and engine result, including exact landmark order, per-landmark facing/contact, simultaneous active-part sets, segment handoffs, base return, and continuation. Both reject raw coordinates/code/curves/unknown fields, flattened single-state alternatives, or omitted transition/composition fields; planner identity cannot select a different engine/materializer. Every Phase 7 action/composition and Phase 6 locomotion/turn sample passes its prior hard, visible, full-playback, and mechanics gates at both viewports; every frame remains complete/independent/editable; one-shot and transaction invariants pass; provider/API/external request counts are zero; source scan finds no provider client/key/env/config or second animation format.

**Required negative cases.** Planner-specific schema/engine, flattened whole-goal facing/support/limb state, raw points or executable code, unbounded landmarks/parts/frames, wrong/stale base or transaction binding, inconsistent transition/completion, unknown field, planner-selected materializer, provider client construction, network attempt, fake “Terra” result in a second format, adapter-dependent accepted/rejected result, hidden AI data in applied project, post-Apply regeneration, and any prior bad-motion/composition mutation fail.

**Proof.** Human-authored cross-adapter sequence pairs; canonical byte/digest equivalence; strict schema/security and false-accept/false-reject mutations; source scan; all prior engine/action/composition tests; full-cycle browser evidence; manual ownership/history/storage/Creator/onion/permanent tester; zero-egress ledger; technical manifest; and Arthur final review. Self-generated adapter fixtures or digests are secondary. All hard and equivalence checks are `100%`; the final visible set retains `85` per sample/`90` mean with every required sample accepted.

**Protected regressions.** Everything in §4 plus all earlier accepted manifests and the current SPEC-0004 future-provider ownership.

**Stop boundary / later relationship.** Stop after the provider-free planner door and final acceptance packet. Do not contact Terra or another model, change a key/config/route/UI, move SPEC-0004's real-provider phase, publish, or resume SPEC-0004 Phase 3. SPEC-0004 resumes only after Phase 8 is accepted, CPA-closed, separately published/integrated, and a later task explicitly authorizes its next phase.

**Recommended executor.** `gpt-5.6-sol`, `ultra`, because the final shared boundary must prevent format/authority drift and reprove the whole system.

## 7. Phase lifecycle and manifest rules

Exactly eight phases exist. There is no Phase 2.5, Phase 2.6, Phase 2A/2B, Phase 8.5, or silent repair phase inside SPEC-0005.

D-0051 does not create a ninth or fractional phase. It preserves D-0050/GIT-045 as published history, supersedes only their incomplete single-state goal and executor-start gate, closes the GIT-044 Phase 3 attempt as rejected, and required the now-published GIT-046. D-0052/GIT-047 resolve only the front-knee projection rule and continuation gate; the corrected Phase 2 lifecycle still has to complete before any fresh Phase 3 authorization. Rejection never transfers implementation bytes forward.

For each phase:

1. the preceding phase and control-plane record must be accepted, published, and integrated in canonical `main`;
2. one new dedicated Spec Executor starts in Plan mode from that exact SHA, verifies clean base/empty index/exclusive ownership/exact path ceiling, traces the real execution path, and executes only that phase;
3. the executor changes only the phase allowlist plus its ignored output root, creates and independently validates a technical proof manifest, provides new-motion review links only for visible phases and only after the permanent tester passes, permits technical-only Phase 2 solely the one manifest-bound ordinary existing-app regression-smoke root after all technical gates pass, returns a Spec Executor Implementation Review Packet, and completely stops;
4. Arthur and the Project Manager accept or reject. Rejection returns to a separately authorized correction executor; it causes no propagation/publication;
5. after acceptance and explicit worktree transfer, one Control Plane Architect verifies unchanged accepted bytes/evidence, updates canonical records, runs memory/tracked-state closeout, returns a CPA PM Review Packet, and stops with empty index;
6. only a later explicit publication instruction authorizes staging the exact reviewed implementation/control-plane set, committing, fast-forwarding clean canonical `main`, pushing normally, and verifying `0/0` synchronization;
7. only then may the next phase begin.

Every manifest binds its own phase's exact base/HEAD/branch, index, observed/expected allowlist, source hashes/sizes, human-authored fixture provenance, command order, receipts/artifacts, network ledger, cleanup state, and mutation self-tests. Visible phases additionally bind browser URLs/processes/viewports, full-playback traces, score rows, and human-review status. Technical-only Phase 2 binds new-motion/full-playback human review as `not-applicable`, but after all technical gates pass it must bind exactly one ordinary regression-smoke root URL, port, launch command, PID/process group, exact executor-worktree path, base/HEAD/index/dirty-set source identity, startup/network logs, explicit non-claims, and cleanup instructions. A manifest rejects a second review process/copy, any injected/preloaded/review-only source, or a one-byte/status/base/path/count/order/tolerance/reference/network/lifecycle change. The Phase 2 v2 correction manifest binds the accepted GIT-043 v1 manifest as immutable bounded history, the earlier `ea7ab9c5…` manifest as immutable non-acceptance evidence, all eight v2 dirty-path hashes, expected-accept/reject and false-accept/reject matrices across all contexts/facings/final frames, the no-injury/deformation bypass scan, and the exact qualification-before-selection/final-rounded-revalidation/no-v1-Preview trace. Later phases verify earlier work through current focused suites, published source/control-plane anchors, and immutable recorded manifest hashes; self-generated goldens remain secondary and old activation-HEAD/dirty-set/live-process validators are not misreported as rerun. A manifest cannot mark the phase accepted; only Arthur/PM review can.

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

Its proof claims are bounded to the current single built-in humanoid, one creation transaction, and current 8–24-frame/12-or-24-FPS limits. They do not promise zero bugs forever or correctness for future rigs, caps, actions, travel, or providers. Every later phase and future extension must rerun the current bend and continuity gates; no future-work label may quietly drop them.

## 9. Decision-complete vs named gates

Decision-complete now:

- final pipeline and one shared movement-goal contract;
- the v2 hard-safety qualification graph, separate Phase 3 naturalness selection, and final rounded completion/revalidation API, with exactly one final candidate/Preview door;
- action-independent/raw-coordinate prohibition;
- eight exact sequential phases and phase-specific allowlists;
- Phase 4's explicit twelve-path ceiling and mechanics-qualified grounded/takeoff/airborne/contact safety-module extension;
- full-playback definition, independent-reference rule, ordinary-review method, editability/transaction/regression boundaries;
- whole-body, mechanics, path/gravity, gait, action-recipe, and planner-door outcomes;
- no-provider/no-scope-expansion boundary.

Named later-phase gates that do not block Phase 2 after the D-0052 publication/continuation gate:

- later-phase numeric thresholds may be tightened by independent evidence during that phase, but may not weaken the visible outcome or protected boundary without Arthur/PM review;
- if 24 frames cannot contain a required mechanically complete sample, stop and return to SPEC-0004 Phase 3's owner decision rather than silently widen the cap;
- exact current Terra alias/pricing/privacy/retention/budget and any live request remain the later SPEC-0004 provider gate;
- product-wide “professional-grade” release claims still require the later representative benchmark, comparison, cost, privacy, and release decisions. Passing SPEC-0005 proves only the accepted shared Stick motion scope.

## 10. Handoff

GIT-047 published D-0052 at `5d0299a00459d39d6c4bff5eeb345f72c5abde4e`. D-0053 records the accepted SPEC-0005 Phase 2 v2 result as technically Verified, pending separate GIT-048 publication/integration. Phase 1 and Phase 2 v1 remain published history; canonical main still contains v1 until that publication. Corrected Phase 3 and Phases 4–8 remain Unauthorized/Not started. GIT-045 remains immutable at `a4589664b6857eb10a828189e177e0e7d47e3f69`; no runtime byte is rewritten.

Next step: independent PM review of this unstaged CPA packet, then a separate publication-only instruction for the exact frozen eight technical paths plus reviewed records. Recheck source/main/origin/live remote at `5d0299a00459d39d6c4bff5eeb345f72c5abde4e`, publish on the existing `codex/spec0005-phase2-v2-fresh-safety` branch, fast-forward clean main, push normally, and verify clean `0/0`. If any accepted byte/path or main/remote base differs, stop without pull, merge, rebase, force, or scope expansion. Only after successful publication and clean verification may the obsolete `/Users/arthurcarlin/.codex/worktrees/8673/stick-animation-app` worktree and completed feature branch be safely removed under the owner instruction and repository policy. Preserve required proof/recovery evidence first; never remove canonical main or the active PM worktree. Verify no finished Phase 2 review server or executor app-copy worktree remains. Phase 3 still needs separate explicit authorization and a fresh Plan-mode worktree. Preserve the exact eight-path Phase 2 boundary and every later-phase authorization gate. No provider, deployment, rejected-worktree reuse, or scope expansion.
