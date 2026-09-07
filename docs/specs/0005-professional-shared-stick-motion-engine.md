# SPEC-0005 — Professional Shared Stick Motion Engine

Status: **Approved with a formal safety correction. Phase 1 is Verified/published/integrated. Phase 2 v1 remains published historical numeric-safety evidence at `e52454354c39b962ac2710a8602a5306ffd62ad5`, but D-0050 supersedes it as the gate for future generated Preview: the Phase 2 body-local natural-safety correction is Approved/Authorized/Not started pending GIT-045. GIT-044 published the former Phase 3 authorization at `269ac82335ee4576cb471bd9dffc8f7ce9bdec0f`; that Phase 3 executor result was rejected and is closed without acceptance. Corrected Phase 3 is rewritten below but Unauthorized/Not started until corrected Phase 2 is accepted, published, and integrated. Phases 4–8 remain Unauthorized/Not started.**

Owner: Arthur
Spec role: Spec Architect
Created: 2026-09-04
Last updated: 2026-09-07
Decision links: [D-0043 through D-0050](../DECISIONS.md)
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

## 3. Final shared contract

### 3.1 Corrected `stick.movement-goal/v1`

`stick.movement-goal/v1` is still the only future planner-to-engine format because it has never shipped as runtime. D-0050 supersedes D-0049's incomplete field set before any accepted implementation. It is strict JSON-compatible data, cloned/frozen on entry, bound to the exact project/transaction/base digest, bounded to `32,768` canonical UTF-8 bytes, finite/dense, duplicate-key rejected, and unknown-field rejected.

| Field | Exact meaning |
| --- | --- |
| `contractVersion`, `goalId`, `binding` | Exact `stick.movement-goal/v1`; a `1..64` lowercase ASCII slug; and exact `projectId`, `transactionId`, `baseDocumentRevision`, `baseDocumentDigest`. |
| `frameCount`, `fps`, `travel` | Existing `8..24` frames and `12`/`24` FPS; `in_place`, `left`, or `right` travel with bounded semantic displacement. Phase 3 accepts only `in_place`; later ownership is unchanged. |
| `performerFacing` | `front`, `left`, or `right`. Anatomical left/right never swaps; front-facing performer-right projects to viewer-left. |
| `support` | Required `both`, `left`, `right`, or `airborne`. Phase 3 accepts grounded support only; Phase 4 owns mechanics-qualified airborne behavior. |
| `rootGoal` | Required `hold`, `shift_left`, `shift_right`, `rise`, `lower`, or `travel`, with `small`/`medium`/`large` semantic magnitude and no coordinate. |
| `torsoLine` / `headLine` | Required closed staging: `upright`, `toward_action`, `away_from_action`, `compress`, `extend`, or `hinge`; and `follow_torso`, `look_toward_action`, or `neutral`. |
| `limbs` | All four limbs appear exactly once. Each item has exact keys `anatomicalRole`, `movementRole`, `targetRegion`, `limbPlane`, `jointGuide`, and `flexionBand`. `movementRole` is `active`, `passive_relax`, `passive_balance`, `support`, or `recover`; Phase 3 permits `support` only for a leg whose foot matches declared grounded support. Every limb declares `frontal`/`sagittal_near`/`sagittal_far` plane, its semantic elbow/knee guide, and one named flexion band. Active limbs declare a hand/foot body-relative target; non-active limbs set `targetRegion` to `none`, not an omitted or free target. |
| `targetRegion` | Active limbs use closed body-local height `low`/`middle`/`shoulder`/`high`, direction `forward`/`inward`/`outward`/`center`, and reach `near`/`medium`/`far`; non-active limbs use the literal `none`. It is never a point, angle, or user coordinate. Facing/projection converts it locally. |
| `jointGuide` | Active/balance arms: `toward_hip`, `outward`, or `forward`; non-active transported-rest/recovery arms may use `neutral`. Moving legs use `forward`; a passive/support/recover leg may use `neutral` only while it qualifies the transported-rest branch. `backward` is not a valid value. |
| `flexionBand` | `extended`, `comfortable`, `folded`, `near_extension_limit`, or `near_flexion_limit`. Near-limit bands require an explicit near-limit landmark and never waive the hard corridor. |
| `landmarks` | Two through six sparse ordered semantic landmarks. Every item is exactly one of `true_key_pose`, `pass_through_guide`, `plane_transition`, `hold`, `contact`, or `impact`; it carries a semantic role/region and optional frame window, never coordinates. A plane transition is a non-stopping guide that declares its two allowed planes. Phase 3 accepts true keys, guides, plane transitions, and grounded holds; Phase 4 first enables contact/impact mechanics. |
| `requiredActionLandmarks` | One through four values from the closed set `reach_apex`, `compression_bottom`, `support_shift_complete`, `wave_inward_apex`, `wave_outward_apex`, `punch_extension`, `jump_anticipation`, `takeoff`, `flight_apex`, `landing_contact`, `stride_contact`, `stride_pass`, `settled_transition`, and `neutral_recovered`. Owner-phase rules determine which are currently enabled. A generic high reach cannot satisfy either wave apex. |
| `forbiddenExtraMovement` | Required closed roles/categories that must remain absent, including `other_arm_gesture`, `foot_lift`, `root_travel`, `head_gesture`, `extra_peak`, and `pre_action`. |
| `energy`, `path`, `locomotion` | `soft`/`natural`/`sharp`; `natural_arc`/`direct_mechanical`/`ballistic`; and optional bounded walk/run intent. Phase 5 owns continuous paths/timing, Phase 6 locomotion, and unsupported earlier combinations fail closed. |

The contract rejects joint IDs, point arrays, `x`/`y` coordinates, stored angles, executable code, arbitrary curves, action-specific coordinate tables, omitted whole-body roles, an unresolvable facing/plane combination, or unknown metadata. An external human-readable action label is audit-only and discarded before the goal digest; runtime may not branch on it. Phase 3 implements only the rewritten grounded subset. Later phases enable already named mechanics/path/locomotion semantics without changing the contract identity. Unsupported, ambiguous, unsafe, or below-threshold output produces no Preview.

### 3.2 Deterministic body and units

- The only body is `humanoid-11-v1` in `stick-stage-1920x1080-v1`: ordered joints `head`, `neck`, `hip`, `leftElbow`, `leftHand`, `rightElbow`, `rightHand`, `leftKnee`, `leftFoot`, `rightKnee`, `rightFoot`; and segments `head-neck`, `neck-hip`, `neck-leftElbow`, `leftElbow-leftHand`, `neck-rightElbow`, `rightElbow-rightHand`, `hip-leftKnee`, `leftKnee-leftFoot`, `hip-rightKnee`, `rightKnee-rightFoot`. The engine roots body solving at `hip`, uses `hip → neck → head`, `neck → elbow → hand`, and `hip → knee → foot`, and preserves the starter pose's ten segment lengths.
- The stage origin is the top-left. `+x` is screen-right and `+y` is screen-down. Internal solving uses finite IEEE-754 double coordinates. Final coordinates use JavaScript `Math.round` independently per axis, then safety is recomputed from those integers; every final document point is inside `0..1919 × 0..1079`. Character `left` and `right` are anatomical role names and never silently swap because of facing or travel. A mirror reflects unrounded points about the transported neutral hip's vertical axis and then swaps anatomical left/right roles. Mirrored unrounded geometry must agree within `1e-6H`; separately rounded mirror results may differ by at most one pixel per axis, and pass/fail plus failure reason must be identical after swapping named roles.
- For a vector `v`, `angle(v) = atan2(v.y, v.x)` in degrees. Because stage `+y` points down, positive angular change is clockwise on screen. `wrap(a)` returns the unique equivalent in `(-180°, 180°]`. A two-bone joint's signed bend is `wrap(angle(joint → effector) - angle(root → joint))`; `0°` is straight, magnitude is flexion, and sign identifies the actual IK branch. Torso lean is `wrap(angle(hip → neck) - (-90°))`. Head-to-torso angle is `wrap(angle(neck → head) - angle(hip → neck))`.
- Corrected safety never treats that screen sign as anatomy. For every pose it constructs a body-local projection frame: `up = normalize(neck - hip)` and `screenRight = (-up.y, up.x)`. Facing `left`/`right` maps anatomical forward to `-screenRight`/`screenRight`; facing `front` permits the frontal plane and maps performer anatomical right to `-screenRight`. A front/sagittal or profile/frontal request is visually ambiguous for this 2D rig and fails `facing_projection` before Preview. Profile `near`/`far` remains declared semantic depth for ordering/clearance only; it adds no stored z-coordinate.
- Each active chain is checked against its declared projected plane and joint-guide half-plane. The joint must remain on the allowed side of the root→effector chord by at least `0.01H` (`0.015H` for a moving knee), except inside an explicitly requested near-extension band. A moving knee may guide only anatomically forward; an elbow must follow its declared `toward_hip`, `outward`, or `forward` guide. An opposite half-plane is `backward_bend` even when its absolute 2D bend lies inside the old numeric corridor.
- The unchanged hard geometric corridors remain elbow `8°..150°` and moving knee `6°..125°`. Corrected semantic bands are exact: elbow `extended 15..60` (preferred `35`), `comfortable 45..110` (preferred `75`), `folded 95..140` (preferred `115`), `near_extension_limit 8..20` (preferred `14`), and `near_flexion_limit 140..150` (preferred `145`); moving knee `extended 10..35` (preferred `20`), `comfortable 25..80` (preferred `50`), `folded 70..115` (preferred `90`), `near_extension_limit 6..14` (preferred `10`), and `near_flexion_limit 115..125` (preferred `120`). The selected band is a hard requested corridor; naturalness scores distance from its preferred value. Near-limit bands require their named landmark and are forbidden for a passive/support chain unless that exact endpoint is independently required.
- `standingBodyHeight`, abbreviated `H`, is exactly `groundY - neutralHead.y` for the transported neutral pose; the current line head has no vertical radius to add. `groundY` is the larger neutral foot `y`. Relative planner and safety values are converted from `H` before rounding.
- Unless a rule names a pixel tolerance, distance comparisons use unrounded Euclidean values with boundary epsilon `1e-9H`, angular comparisons use `1e-9°`, and values inside that epsilon are treated as equal to the boundary. A two-circle solution is tangent when its perpendicular intersection height is at most `1e-9H`. Non-finite operands always fail rather than receiving epsilon treatment.
- The existing 80-unit horizontal line head remains derived from the stored head joint. No circle, head rotation field, custom head, or custom body data is introduced.
- Posture intensity remains semantic engine data: `small`, `medium`, and `large` directional leans target `5°`, `10°`, and `15°`; compression/extension/root offsets target `0.08H`, `0.16H`, and `0.24H` before safety selection. These are requested targets, not permission to violate the corridors below.
- Generation ends before Preview. Every output frame owns distinct ordinary IDs/content and remains independently editable after Apply.

### 3.3 Permanent body-safety and candidate-selection rules

The published v1 rules below remain the historical numeric floor proved by GIT-043. The Phase 2 correction adds `stick.body-safety-selection/v2`, `stick.body-safety-selection-result/v2`, and `stick.body-safety-completion/v2`; it does not relabel or overwrite the v1 manifest. The v2 kernel is planner- and action-name-independent and adds performer-facing projection, allowed limb planes, body-local joint guides, semantic flexion bands, and controlled projected transitions. Planner identity, prompt text, action label, fixture ID, materializer name, or caller trust is neither an input nor an exception. The built-in humanoid has no unusual-motion escape hatch; future custom creatures require separate declared anatomy contracts with topology, facing/projection, allowed planes, joint guides, flexion bands, and safety ownership.

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

Phase 2 v2 separates hard safety from later naturalness selection. `qualifyStickBodySafetyCandidateSequencesV2` accepts the exact starter binding, neutral metrics, performer-facing/projection contract, per-chain plane/guide/band semantics, sparse landmark kinds, and bounded whole-body candidate sets. It returns a deep-cloned/deep-frozen graph of only safe candidates and safe transition edges; it does not choose a winner, return a document, or expose Preview. `finalizeStickBodySafetyCandidateV2` receives the original request, exact qualification graph, the Phase 3-selected sequence, final rounded frames, and candidate document; it recomputes the binding, candidate membership, every body-local/hard rule, final-frame derivation, rounded geometry, forbidden movement, and whole-animation semantics before the sole motion-engine door may return Preview.

The old v1 operations remain historical testable numeric evidence, but the executor's SPEC-0005 Preview door must reject a v1 completion after the correction lands. No compatibility literal, v1 digest, legacy materializer, or caller flag can substitute for v2. This is the one intentionally superseded technical behavior; normal user-visible behavior and SPEC-0004 compatibility routes remain unchanged.

A projected screen-sign change is not automatically an anatomical reversal. Without an explicit `plane_transition` landmark it remains a hard `branch_flip`. With that landmark, only an active arm or non-support leg may change projected sign, and only between two declared allowed planes while both endpoints satisfy the same anatomical guide, `12°..30°` projected flexion, per-frame joint travel at most `0.035H`, bend change at most `35°`, no zero-degree sample, no contact/impact/support ownership, and at least two final transition frames. A support knee, one-frame branch jump, undeclared change, opposite body-local guide, or straight-through sample fails `projected_branch_transition` or `backward_bend`. Final rounded-frame validation repeats the decision; rounding cannot create an allowed transition.

The closed v2 failure vocabulary retains every v1 reason and adds `facing_projection`, `limb_plane`, `backward_bend`, `flexion_band`, `projected_branch_transition`, `forbidden_extra_movement`, and `naturalness_unproven`. Any ambiguity, missing required semantic context, empty safe graph, invalid selected membership, unsafe rounded frame, or unprovable natural output returns no Preview and leaves document/history/storage/latch/view state unchanged.

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

The named independent benchmark is **`SPEC0005-HUMANOID-NATURALNESS-v1`**. Its human-authored oracle and adversarial mutations are written without importing the pose/safety engine and remain fixture labels only; runtime cannot branch on `wave`, `walk`, `run`, `run_then_wave`, `punch`, or `jump`. It contains left/right mirrors for every asymmetric case, near-extension and near-flexion cases for arms and knees, and extra-action mutations (wave-plus-hop/clap, jump-plus-wave, punch-plus-head gesture, walk/run with same-side or crab limbs, and run-then-wave without a settle). Phase 3 proves only grounded pose/transition landmarks derived from those families; full walk/run stays Phase 6, and full wave/punch/jump/run-then-wave recipes stay Phase 7. Until its owner phase lands, a full unsupported goal must return no Preview.

For every phase-supported case, hard safety, required landmark/prompt match, forbidden-extra-movement, deterministic/editability, and expected rejection assertions must pass `100%`. The independent visible-quality rubric scores prompt match `25`, joint comfort `15`, line of action `15`, balance/support `15`, silhouette/readability `15`, continuity `10`, and minimum unrequested movement `5`; each supported sample must score at least `85/100`, the supported-set mean at least `90/100`, and Arthur must accept every required visible sample after two complete loops and landmark scrubbing. Any hard-gate failure or one rejected required sample rejects the phase. These thresholds cover only the named built-in-humanoid set and do not promise universal human-motion perfection.

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

**Lifecycle/status.** GIT-043's v1 result remains immutable published history and bounded numeric-safety evidence. It is not relabelled failed or erased. D-0050 records that it is insufficient as a natural-pose Preview gate and formally supersedes only that future-gate authority. The correction is Approved/Authorized/Not started, must run as a fresh Phase 2 correction (not Phase 2.1/2.5/2A), and is blocked until GIT-045 publishes this record from exact basis `269ac82335ee4576cb471bd9dffc8f7ce9bdec0f`.

**Owner summary.** Add body-local anatomy and projection meaning to the published number-safety floor before another pose maker may create visible output.

**Goal.** Implement the §3.2–3.3 v2 performer-facing projection, allowed limb plane, semantic joint guide, flexion band, controlled projected transition, backward-bend rejection, candidate qualification, post-rounding validation, and fail-closed sole Preview seam. Phase 2 qualifies safety only; it does not generate or score a new visible action.

**Current problem / before and after.** Published v1 can accept a visibly bad `57°` elbow because magnitude, crossings, support, and screen continuity all pass. After correction, both IK branches are interpreted in the declared body-local projection; backward/ambiguous planes and unsafe/undeclared projected transitions fail even when numerically legal. The safe output is a bounded qualified candidate graph for Phase 3's separate naturalness selection, never a v1-selected closest-screen branch.

**Execution path.** Neutral `humanoid-11-v1` + v2 facing/projection/plane/guide/band semantics + bounded supplied test candidates → `qualifyStickBodySafetyCandidateSequencesV2` hard-safety graph → test-local selector/baker used only for integration proof → `finalizeStickBodySafetyCandidateV2` recomputation on final rounded frames → sole motion-engine/executor candidate door → Preview or fail closed. The test-local selector/baker is not product pose generation or naturalness scoring.

**Fresh-executor entry gate.** One new Plan-mode Spec Executor must start in a new exclusive worktree/`codex/` branch from the exact future GIT-045 publication SHA. It must prove canonical `main` and `origin/main` clean/equal, empty index, no pre-existing dirty paths, the GIT-043 v1 manifest hashes preserved, and the current three runtime source SHA-256 anchors `de9fc8e72bd322841ab566cc5294643f22404c882736f7e9ab3c17be559ffc03`, `63210745a068f37c087a9daa7eeb43d1190dacd0f4fbd4320df12a11269b0020`, and `066777d4ea396dcfe98f77127519abcb375b1c7915cdb96db641dd4dc46ed0d2`. It must not enter, copy from, or mutate the rejected Phase 3 worktree or any other task worktree. Any anchor, scope, ownership, or base mismatch stops before edits.

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

**Implementation boundary.** `stickFigureBodySafety.ts` owns v2 parsing, body-local projection, hard candidate/transition qualification, and final recomputation through exactly the two v2 callable operations defined above. It may retain v1 exports only for historical direct validation; the executor Preview route rejects v1. `stickFigureMotionEngine.ts` preserves the three SPEC-0004 compatibility materializers and exposes one v2-only SPEC-0005 final door. `stickFigureCommandExecutor.ts` accepts no caller-selected materializer, v1 completion, trust/skip flag, planner/action/fixture identity, unchecked helper, or selected sequence outside the qualified graph. Failure at any point is a document/history/storage/latch/view no-op.

**Non-goals.** No movement-goal parser/pose generator, naturalness scorer, new action/motion, mechanics insertion, new path/timing/gravity, gait, recipe, planner, visible UI, provider, custom rig, or cap expansion. The rejected Phase 3 result is not corrected or reused. Future custom creatures require separate anatomy contracts.

**Entry evidence.** Phase 1 remains published at `2436a941…`; GIT-043 v1 and its `e8a3fbbb…` correction manifest remain historical anchors; GIT-044 is complete at `269ac823…`; D-0050 and this rewritten spec must be separately published by GIT-045 before execution.

**Proof independence.** The new fixture and `validateStickBodyNaturalSafety.ts` are human-authored before runtime implementation and may import only stable project topology/contract primitives, never the safety, motion, executor, or future pose modules. They independently recompute facing projection, allowed guide half-planes, bands, transition conditions, rounding, and expected reason/stage. Preserve the existing `10,000 + 10,000` v1 numeric/property floor and add at least `10,000` fixed-seed v2 cases plus `10,000` mirrors across all three facings/allowed planes/bands. Exact engine output is secondary only. Integration must run qualification → test-local selection/bake → v2 finalization → sole final door, and source/AST-prohibit every v1/trust/materializer/unchecked-Preview bypass.

**Required positive/property cases.** Front/frontal and left/right profile projections; anatomical left/right mirrors; both IK branches qualified when body-locally allowed; wrong screen-nearest branch removed by guide; every ordinary and near-limit band boundary; unchanged rest-knee exception; relaxed/passive limbs; recovery; grounded support floors; declared arm and non-support-leg projected transition inside every cap; exact segment preservation before/after rounding; deterministic frozen candidate graph; and no-safe-graph/no-Preview. These prove corrected safety only, not natural action quality.

**Required negative cases.** The rejected `57°` Reach High Right projection; each alternate mathematically valid but body-locally backward branch; front/sagittal and profile/frontal ambiguity; missing facing/plane/guide/band; opposite guide half-plane; support-knee projected switch; undeclared, one-frame, over-travel, over-turn, zero-degree, rounded-only, and contact/impact branch changes; every v1 numeric negative; tampered qualification/selection/binding/final frame; v1-to-Preview; alternate materializer; planner/action/fixture/trust/skip/unchecked-helper bypass. Every case must produce the named v2 reason/stage, no Preview, and no state mutation.

**Required inherited proof.** Run the current Phase 1 quality, Stick AI contract/transaction, motion/timing, UI adapter, history/persistence, and timeline validators; TypeScript; scoped lint and full-lint non-regression; both diff checks; exact allowlist/index; permanent browser tester; source/AST bypass scan; and zero-egress/process cleanup. Historical manifests retain their exact recorded hashes but are not regenerated or falsely rerun under old HEAD/live-process assumptions.

**Review decision.** Phase 2 correction is technical-only. After all gates pass it may leave exactly one manifest-bound ordinary root served from the fresh executor worktree for existing-app smoke only, with no preloaded action, injected source, special route/query, overlay, picker, public asset, or safety/new-motion claim. It must not reuse the rejected Phase 3 process or worktree.

**Measurable acceptance.** `100%` of §3.2–3.3 v2 positive/negative, mirror, band-boundary, transition, rounding, bypass, and state-no-op assertions pass; both circle solutions are observed and classified by body-local meaning; the `57°` bad projection fails while a guide-correct alternative passes; property counts meet the stated floors; v1 historical fixture/manifest bytes remain unchanged; inherited gates pass; exact dirty set is eight paths; index is empty; network/provider count is zero; and any ordinary smoke process is singular, bound, and later cleaned.

**Proof.** `output/spec-0005/phase-2-natural-safety-correction/proof-manifest.json` binds GIT-045 base/HEAD/branch/index, the exact eight paths/hashes/sizes, GIT-043 historical manifest anchors, independent-oracle provenance, seeds/counts, v2 reason matrix, API/final-door order, no-v1-Preview proof, inherited commands, lint/diff/permanent tester, zero-egress, any smoke process, and cleanup. Its validator must mutate every material field. It cannot mark human naturalness accepted.

**Protected regressions.** Phase 1, every accepted SPEC-0004 behavior, the non-safety user experience, complete editable frames, Preview/Cancel/Apply/history/storage/onion/Creator, and all §4 systems. Only v1 completion-to-SPEC-0005-Preview authority is intentionally superseded.

**Stop boundary / later relationship.** Return the Spec Executor Implementation Review Packet and stop with an empty index. No Phase 3 code, control-plane edit, Git action, provider/external operation, or natural-motion claim. After Arthur/PM acceptance, sequential CPA closeout and separate publication are required before corrected Phase 3 may be authorized.

**Recommended executor.** `gpt-5.6-sol`, `ultra`, because anatomical invariants, candidate sequencing, adversarial proof, and bypass prevention are foundational.

### Phase 3 — Action-Independent Whole-Body Key-Pose Maker

**Lifecycle/status.** The executor result produced under D-0049/GIT-044 is rejected and closed without acceptance, propagation, or publication. None of its bytes may be copied or patched. This rewritten contract is decision-complete but Unauthorized/Not started until the Phase 2 v2 correction is accepted, CPA-closed, separately published/integrated, and Arthur explicitly authorizes a fresh Phase 3 executor.

**Owner summary.** Turn a closed semantic pose goal into several safe whole-body alternatives and select the one that best reads as the requested natural pose.

**Goal.** Implement the corrected grounded subset of `stick.movement-goal/v1`, sparse semantic landmarks, bounded whole-body candidate generation, and the separate deterministic naturalness score in §3.3. No user or fixture supplies raw joint coordinates.

**Current problem / before and after.** The rejected solver lacked facing, limb planes/guides, comfort bands, body staging, required landmark, and forbidden motion; it produced too few alternatives and turned guide samples into easing stops. After this phase, every goal fully states facing, support/root/torso line, hand/foot target region, joint guide/plane, flexion band, active/passive limbs, required outcome, forbidden extras, and landmark type. Unsafe or unclear goals produce no Preview.

**Execution path.** Strict semantic goal → validate complete whole-body intent → construct body-local frame → generate `4..32` candidates per non-hold true key → Phase 2 v2 hard qualification graph → deterministic naturalness scoring of at least two safe complete sequences → sparse true keys plus non-stopping guide corridors → existing baker only where it does not create guide stops → Phase 2 v2 final rounded validation → sole candidate door → independent ordinary keyframes → existing Preview transaction.

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

**Non-goals.** No weight/contact mechanics insertion, airborne output, continuous-path/timing rewrite, gait cycle, full wave/walk/run/run-then-wave/punch/jump recipe, language routing, planner connection, UI, provider, or cap expansion. Action-family labels may exist only in the independent oracle; the core branches on semantic fields.

**Entry gate.** One fresh Plan-mode executor/worktree begins only from the future clean canonical publication SHA that contains accepted Phase 2 v2 plus its CPA record and a later explicit Phase 3 authorization. It verifies the v2 manifest/source anchors, current safety/integration tests, empty index, exclusive ownership, exact ten-path ceiling, and absence of reused rejected-worktree bytes. Any need to change Phase 2 returns to a separately authorized Phase 2 correction; Phase 3 cannot patch safety.

**App-copy review.** Ordinary unpublished links show six representative grounded sequences: right and left high-outward reach mirrors, right punch-extension pose/recovery, centered jump-anticipation compression, left support-shift recovery, and a settled run-then-wave transition pose probe. Labels must state that these are pose/transition probes, not complete wave, punch, jump, run, or gait actions. Arthur watches two loops, scrubs sparse true keys and guides, and checks prompt match, elbow/knee direction, comfort, line of action, balance, silhouette, continuity, and absence of extra movement.

**Measurable acceptance.** Inputs contain zero raw points/angles/joint IDs and all required semantic fields; each non-hold true key generates `4..32` candidates and each non-hold goal retains at least two safe complete sequences; prompt/landmark/forbidden-movement hard gates pass before scoring; the lexicographic score order is exact; fixed lengths stay within two pixels; effectors finish inside their semantic region; body-local guides/bands pass; grounded contacts stay within two pixels; mirrors agree within rounding tolerance; no pass-through guide becomes a key endpoint, hold, or easing restart; true keys are at most four; deterministic repeat is byte exact; the named benchmark meets `85` per case/`90` mean with `100%` hard gates; every frame is independently editable and passes Phase 1 full playback.

**Required negative cases.** Raw coordinates/angles/joint IDs/code; missing facing/support/root/torso/whole-body role/guide/plane/band/landmark/forbidden field; ambiguous projection; wrong binding/version/count; fewer than two safe sequences; target-first selection of an uncomfortable/backward silhouette; incorrect score priority; generic reach labelled wave; raised-arm neutral start; guide converted to hard key; eight small easing-restart keys; backward bend; unsafe/near-limit misuse; uncoordinated single-joint movement; extra gesture/peak/pre-action; and unsupported contact/impact/airborne/locomotion/full-action goal all fail before Preview.

**Proof.** The Phase 3 fixture plus `validateStickNaturalPoseQuality.ts` form the independent human-written `SPEC0005-HUMANOID-NATURALNESS-v1` oracle and adversarial mutation set. They do not import the pose/safety/motion/executor modules and cover wave, walk, run, run-then-wave, punch, jump, all mirrors, near limits, and extra-action rejection as grounded pose probes or expected unsupported no-Preview cases. Unit/property, score-order, mirror/metamorphic, guide/non-stop, source/AST, v2 qualification/finalization, six two-viewport full-playback flows, one-frame edit/Undo/Redo/Save/Open, inherited validators, permanent tester, zero-egress ledger, independently validated manifest, and Arthur review are mandatory. Coordinate snapshots are secondary only.

**Protected regressions.** Phase 1, accepted corrected Phase 2 v2, all §4 boundaries, manual editability/transactions, and published SPEC-0004 compatibility paths. The Phase 3 executor cannot edit the safety layer.

**Stop boundary / later relationship.** Stop after the grounded pose/transition set. It proves only the named natural-pose benchmark slice—not full actions, gait, physics, continuous paths, or universal perfection. Phase 4 retains weight/contact/support mechanics, Phase 5 continuous paths/timing/smooth in-betweens, Phase 6 walk/run gait, Phase 7 semantic action recipes including wave, punch, jump, and run-then-wave composition, and Phase 8 the shared Pretend-AI/future-Terra entry.

**Recommended executor.** `gpt-5.6-sol`, `ultra`, because body-chain architecture and future compatibility are foundational.

### Phase 4 — Mechanics, Weight, Contact, and Required-Pose Insertion

**Owner summary.** Make grounded/airborne transitions mechanically readable and let the engine insert poses that physics requires.

**Goal.** Add support ownership, ground contact, center-of-mass proxy, anticipation/contact/compression/recovery rules, and deterministic mechanically required key-pose insertion.

**Current problem / before and after.** A pose can be anatomically safe yet float, slide, fall outside support, or omit takeoff/landing. After Phase 4, support transitions generate the missing structural poses before baking and route every repaired result back through Phase 2 safety.

**Execution path.** Movement goal → whole-body requested poses → support/ground state machine → support-polygon and center-of-mass proxy → required-pose insertion → re-solve body chains → validate contact/weight → mechanics-qualified Phase 2 checked selection → existing timing/baker → mechanics-qualified Phase 2 final rounded/post-repair/continuity revalidation → one final candidate door → transaction.

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

**Mechanics-qualified safety contract.** Phase 2 continues to reject every airborne frame. Phase 4 may teach the same safety module to accept `airborne` only when the complete ordered important-pose/mechanics sequence proves `grounded anticipation → takeoff → airborne → contact → compression → recovery` at selection time, and the full baked sequence proves that same transition again at completion. Selection never requires or receives final frames. The safety module derives qualification from the bound sequences and mechanics context; callers cannot assert an `allowAirborne`, trusted, skip, action, fixture, planner, or materializer flag. A valid airborne interval has no planted anchor, is preceded and followed by valid grounded contact, stays above the fixed ground without penetration, and completes contact/compression/recovery inside the same bounded sequence. Isolated airborne frames, missing/reordered transition states, long unexplained hover, stale mechanics context, or a legacy route fail before Preview. Every important, inserted, rounded, and post-repair frame still passes the unchanged bend/crossing/clearance/continuity/semantic rules, and final results remain ordinary independent editable frames under existing manual post-Apply ownership.

**Non-goals.** No airborne generation in Phase 2, caller-selectable airborne bypass, new path interpolation, Earth-gravity implementation, locomotion cycle, action recipe, language/planner route, UI, provider, numerical anatomy change, or frame/FPS expansion.

**Entry gate.** Published/integrated Phase 3 and the corrected/published Phase 2 two-stage API, source anchors, independent 10,000+10,000 property floor, bypass matrix, and current safety/integration validators must revalidate. The Plan-mode trace must show the twelve paths suffice and must freeze the exact grounded/takeoff/airborne/contact state-machine contract before edits; otherwise stop before edits. No future phase may quietly stop rerunning bend or continuity checks.

**App-copy review.** Ordinary links show weight shift, deep compression/recovery, takeoff/contact/recovery, and direction-change settle. Arthur watches two loops and inspects feet, pelvis, knees, and landing frames.

**Measurable acceptance.** The ground line is the starting neutral pose's lowest foot `y` and stays fixed for the transaction. A planted foot moves at most two pixels until release. The 2D center-of-mass proxy is `balanceX = (2*hip.x + neck.x + head.x) / 4`; with double support it projects between the two planted foot anchors plus/minus `5%` of standing body height, and with single support it stays within `8%` of standing body height of that anchor. Single support places the pelvis/torso visibly toward the support side. Grounded→airborne inserts anticipation/takeoff, airborne→grounded inserts contact/compression/recovery, and unsupported reversal inserts a settle/weight-transfer pose when frame capacity permits; insertion is deterministic and never exceeds 24 frames; every inserted pose is complete and independently editable. The same safety module rejects isolated airborne input but accepts the complete mechanics-qualified transition at both important-selection and final rounded/post-repair completion stages, with no planted anchor during flight and valid contact before/after it.

**Required negative cases.** Foot slide, false planted tag, support-side mismatch, center outside support, airborne without takeoff, takeoff without prior grounded anticipation, planted anchor during flight, landing without contact/compression/recovery, reordered/missing mechanics state, stale mechanics binding/context, caller-supplied airborne/skip/trust flag, long unexplained hover, knee inversion, ground penetration, instant reversal, required insertion beyond the frame cap, rounded/post-repair safety failure, and post-bake repair that changes an applied document all fail.

**Proof.** Support/contact traces, auto-insertion decisions, independent mechanics invariants, mutated failures, safety-module and integration-validator extensions covering both rejection and mechanics-qualified acceptance, source/AST proof against airborne flags or alternate doors, full-cycle capture at both viewports, manual edit persistence, protected suites, manifest, and Arthur review. Numeric proxies are supporting evidence; visible weight acceptance is mandatory.

**Protected regressions.** Phase 1 reference; Phase 2 two-stage safety API, bend/crossing/clearance/continuity/semantic rules, 10,000+10,000 property floor, and one-final-door bypass protections; Phase 3 semantic solver; §4 boundaries; ordinary manual post-Apply ownership/editability; and published SPEC-0004 Phase 2.5 timing math. The airborne extension may change only support-state qualification and may not relax numerical anatomy or grounded rejection.

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

**Owner summary.** Rebuild wave, punch, jump, hop, bow, dodge, and run-then-wave composition as semantic recipes, then accept them in the ordinary app.

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

**App-copy review.** Seven ordinary links for wave, punch, jump, hop, bow, dodge, and run-then-wave. Arthur watches two full loops, scrubs named anticipation/action/contact/recovery poses, and compares against the earlier rejected failures.

**Measurable acceptance.** Recipe and fixture source contain no joint coordinate/angle arrays; all seven use the same public engine call; wave has stable feet/root and readable alternating hand extremes with no inherited extra action; punch has guard, extension, impact, recoil, and no head/foot flourish; jump and hop visibly compress, take off, reach one apex, contact, compress, and recover, with hop lower/shorter than jump; bow has readable anticipation/hinge/bottom settle/recovery and maintained support; dodge transfers weight, moves in the requested direction, settles before reversal, returns without foot slide, and includes no unrequested gesture; run-then-wave completes and settles the Phase 6 gait before the Phase 7 wave begins. Every action passes the named naturalness threshold, full-cycle, mechanics, path, ownership, and transaction gates.

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

**App-copy review.** Ordinary links expose wave, punch, jump, hop, bow, dodge, walk, run, and run-then-wave projects produced through the shared door. Arthur watches two full loops of each, scrubs landmarks, edits one in-between joint in at least one action, verifies Undo/Redo and Save/Open, and gives one explicit final shared-engine acceptance decision.

**Measurable acceptance.** Pretend and Terra-shaped test adapters that express the same intent yield the same canonical movement-goal digest and engine result; both reject raw coordinates/code/curves/unknown fields; planner identity cannot select a different engine/materializer; all seven actions pass their prior full-playback and mechanics gates at both viewports; every frame remains complete/independent/editable; one-shot and transaction invariants pass; provider/API/external request counts are zero; source scan finds no provider client/key/env/config or second animation format.

**Required negative cases.** Planner-specific schema/engine, raw points or executable code, unbounded beats/frames, wrong/stale binding, unknown field, planner-selected materializer, provider client construction, network attempt, fake “Terra” result in a second format, hidden AI data in applied project, post-Apply regeneration, and any prior bad-motion mutation fail.

**Proof.** Cross-adapter equivalence, strict schema/security mutations, source scan, all prior engine/action tests, full-cycle browser evidence, manual ownership/history/storage/Creator/onion/permanent tester, zero-egress ledger, technical manifest, and Arthur final review.

**Protected regressions.** Everything in §4 plus all earlier accepted manifests and the current SPEC-0004 future-provider ownership.

**Stop boundary / later relationship.** Stop after the provider-free planner door and final acceptance packet. Do not contact Terra or another model, change a key/config/route/UI, move SPEC-0004's real-provider phase, publish, or resume SPEC-0004 Phase 3. SPEC-0004 resumes only after Phase 8 is accepted, CPA-closed, separately published/integrated, and a later task explicitly authorizes its next phase.

**Recommended executor.** `gpt-5.6-sol`, `ultra`, because the final shared boundary must prevent format/authority drift and reprove the whole system.

## 7. Phase lifecycle and manifest rules

Exactly eight phases exist. There is no Phase 2.5, Phase 2.6, Phase 2A/2B, Phase 8.5, or silent repair phase inside SPEC-0005.

D-0050's correction does not create a ninth or fractional phase. It formally reopens Phase 2's future-gate authority while preserving GIT-043 as published history, closes the GIT-044 Phase 3 attempt as rejected, and requires the corrected Phase 2 lifecycle to complete before any fresh Phase 3 authorization. Rejection never transfers implementation bytes forward.

For each phase:

1. the preceding phase and control-plane record must be accepted, published, and integrated in canonical `main`;
2. one new dedicated Spec Executor starts in Plan mode from that exact SHA, verifies clean base/empty index/exclusive ownership/exact path ceiling, traces the real execution path, and executes only that phase;
3. the executor changes only the phase allowlist plus its ignored output root, creates and independently validates a technical proof manifest, provides new-motion review links only for visible phases and only after the permanent tester passes, permits technical-only Phase 2 solely the one manifest-bound ordinary existing-app regression-smoke root after all technical gates pass, returns a Spec Executor Implementation Review Packet, and completely stops;
4. Arthur and the Project Manager accept or reject. Rejection returns to a separately authorized correction executor; it causes no propagation/publication;
5. after acceptance and explicit worktree transfer, one Control Plane Architect verifies unchanged accepted bytes/evidence, updates canonical records, runs memory/tracked-state closeout, returns a CPA PM Review Packet, and stops with empty index;
6. only a later explicit publication instruction authorizes staging the exact reviewed implementation/control-plane set, committing, fast-forwarding clean canonical `main`, pushing normally, and verifying `0/0` synchronization;
7. only then may the next phase begin.

Every manifest binds its own phase's exact base/HEAD/branch, index, observed/expected allowlist, source hashes/sizes, fixture provenance, command order, receipts/artifacts, network ledger, cleanup state, and mutation self-tests. Visible phases additionally bind browser URLs/processes/viewports, full-playback traces, and human-review status. Technical-only Phase 2 binds new-motion/full-playback human review as `not-applicable`, but after all technical gates pass it must bind exactly one ordinary regression-smoke root URL, port, launch command, PID/process group, exact executor-worktree path, base/HEAD/index/dirty-set source identity, startup/network logs, explicit non-claims, and cleanup instructions. A manifest rejects a second review process/copy, any injected/preloaded/review-only source, or a one-byte/status/base/path/count/order/tolerance/reference/network/lifecycle change. The Phase 2 v2 correction manifest binds the accepted GIT-043 v1 manifest as immutable bounded history, the earlier `ea7ab9c5…` manifest as immutable non-acceptance evidence, all eight v2 dirty-path hashes, and the exact qualification-before-selection/final-rounded-revalidation/no-v1-Preview trace. Later phases verify earlier work through current focused suites, published source/control-plane anchors, and immutable recorded manifest hashes; they do not misreport old activation-HEAD/dirty-set/live-process validators as rerun in a new worktree. A manifest cannot mark the phase accepted; only Arthur/PM review can.

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

Named gates that do not block the restructured Phase 2:

- later-phase numeric thresholds may be tightened by independent evidence during that phase, but may not weaken the visible outcome or protected boundary without Arthur/PM review;
- if 24 frames cannot contain a required mechanically complete sample, stop and return to SPEC-0004 Phase 3's owner decision rather than silently widen the cap;
- exact current Terra alias/pricing/privacy/retention/budget and any live request remain the later SPEC-0004 provider gate;
- product-wide “professional-grade” release claims still require the later representative benchmark, comparison, cost, privacy, and release decisions. Passing SPEC-0005 proves only the accepted shared Stick motion scope.

## 10. Handoff

GIT-044 is complete at exact clean local canonical `269ac82335ee4576cb471bd9dffc8f7ce9bdec0f`; local `origin/main` matched and no remote refetch was performed in this task. D-0050 records the later Phase 3 rejection, the bounded limitation of published Phase 2 v1, the v2 correction, and this Phase 3 rewrite. The exact next lifecycle action is GIT-045: publish only the reviewed control-plane correction and establish the exact executor base.

After GIT-045, one fresh dedicated Plan-mode Phase 2 correction executor may implement exactly the eight-path correction boundary and stop with its technical proof. Do not start corrected Phase 3, Phases 4–8, mutate any rejected worktree or historical manifest, contact a provider, deploy, or expand scope. Corrected Phase 3 requires Phase 2 acceptance, sequential CPA closeout, separate publication/integration, and a later explicit owner authorization.
