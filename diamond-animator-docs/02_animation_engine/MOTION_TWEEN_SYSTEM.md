# MOTION_TWEEN_SYSTEM.md

## Status

This document is provisionally promoted legacy V1 intent for Drawing Workspace motion tween. It is the most detailed inherited reference, but this audit does not claim new owner approval. The user's latest instruction and accepted decisions/specifications in the canonical control plane at [docs/README.md](../../docs/README.md) take precedence.

This document exists because repeated implementation attempts have failed by:
- guessing behavior from current code
- mixing endpoint preview logic with playback logic
- letting fallbacks hide real failures
- treating visual endpoint bitmaps as if they were authoritative motion data

This document is intentionally strict about the intended V1 behavior. Current code and runtime behavior remain evidence of what the application actually does. Any mismatch is evidence to record and reconcile against the latest user instruction and accepted decisions; do not silently assume either the implementation or this document has already been superseded.

---

## Purpose

Motion tween exists to create visible in-betweens between a start endpoint and an end endpoint.

Motion means visible movement.

Motion tween does not mean:
- fade
- dissolve
- crossfade
- flicker
- hold
- blank playback
- guessed movement
- inferred preview behavior
- unstable sprite reconstruction during playback

The purpose of V1 motion tween is to make one authored object appear to move from one position to another position in a clean, stable, understandable way.

---

## Scope

This document defines only V1 motion tween for the Drawing Workspace.

This document does not define:
- morphing
- shape tweening
- symbol nesting systems
- rotation tweening
- scale tweening
- skew tweening
- easing curves
- path handles
- bezier motion editing
- bone systems
- advanced transform rigs

Those may exist later.

They do not exist in this V1 system.

V1 motion tween is intentionally narrow:
- one start endpoint
- one end endpoint
- one stored motion payload
- one moving sprite
- x/y interpolation only
- whole-pixel playback only

---

## Non-Negotiable User Behavior

### 1. Start and end editing

The owner keyframe is always the START endpoint.

Any tween cell to the right of the owner keyframe is always the END endpoint.

There is no midpoint split.
There is no “if near the left side do this” rule.
There is no percentage-based guess.
There is no fallback guess from cell type if context is missing.

Allowed:
- explicit tween edit context

Forbidden:
- position-based guessing
- midpoint logic
- cell-type guessing when explicit context is missing

### 2. Paused endpoint display

When paused, the user is editing one deterministic endpoint.

If editing start:
- show start endpoint as the active endpoint

If editing end:
- show end endpoint as the active endpoint

Paused tween editing must never show:
- a live in-between
- a blended frame
- a guessed interpolated view
- a random previous/next frame preview

### 3. Onion behavior

When editing tween start:
- onion shows only tween end

When editing tween end:
- onion shows only tween start

During tween endpoint editing, normal previous/next onion behavior is disabled.

Forbidden during tween endpoint editing:
- generic previous frame onion
- generic next frame onion
- tween interior ghost frames
- duplicate endpoint ghosts
- blue guide clutter if it hides or confuses the actual endpoint

### 4. Click-away behavior

If the user has an active lasso/selection/transform interaction and clicks away:
- commit the current endpoint change
- clear transient editing state
- leave the endpoint in a saved, stable state

Click-away must not immediately start a new lasso unless a true new drag begins.

### 5. Playback start behavior

Before playback begins, the system must do these steps in this order:

1. save current endpoint edits
2. update the tween owner frame payload
3. clear transient editing state
4. build playback descriptors/cache
5. start playback

This order is mandatory.

It is not acceptable to:
- start playback first
- clear later in an effect
- hope save already happened
- let playback build from stale endpoint data

### 6. Playback result

A valid motion tween must show:
- one visible object
- stable movement
- start-to-end motion
- clean in-betweens
- no weird visual side effects

Forbidden playback results:
- fade
- dissolve
- crossfade
- blank tween span
- start-hold across a valid tween
- teleporting inside the tween
- jitter
- flashing
- endpoint flicker
- alternating left/right dots
- disappearing artwork
- random null frames

### 7. Looping

Looping may reset at the normal timeline loop boundary.

Inside the tween span:
- motion must be stable
- descriptor identity must stay stable
- sprite identity must stay stable
- no in-span snapping
- no in-span oscillation
- no per-frame instability

---

## Core Architectural Rule

Preview data is not motion data.

Endpoint bitmaps are preview/editing data.

Motion payload is playback data.

Do not confuse them.

Specifically:

- `bitmap` is not the authoritative motion playback source
- `tweenEndBitmap` is not the authoritative motion playback source
- endpoint thumbnails are not the authoritative motion playback source
- onion previews are not the authoritative motion playback source

Playback must use explicit motion data stored on the tween owner frame.

If playback still depends on inferring movement from endpoint bitmaps during playback, the implementation is wrong.

---

## Authoritative V1 Data Model

The tween owner frame must hold an explicit `motionTween` payload.

Example V1 shape:

```ts
//type MotionTweenData = {
 // mode: "position";
  //spriteBitmap: ImageData | null;
  //startOrigin: { x: number; y: number } | null;
  //endOrigin: { x: number; y: number } | null;
  //stageWidth: number;
// stageHeight: number;
//};
```

Meaning

spriteBitmap
	•	cropped start sprite used for playback
	•	frozen playback source
	•	not rebuilt every frame

startOrigin
	•	stage-pixel top-left origin of the start sprite

endOrigin
	•	stage-pixel top-left origin of the end destination

stageWidth and stageHeight
	•	frozen playback stage dimensions if needed for safe rendering consistency

Owner frame rule

The owner frame owns the motion payload.

Tween interior cells do not own separate motion payloads.

Tween playback reads the owner’s payload.

If the owner payload is missing or corrupted, the tween is invalid.

⸻

Allowed Endpoint Snapshot Data

The frame may still store:
	•	bitmap
	•	tweenEndBitmap

These remain useful for:
	•	showing start endpoint during editing
	•	showing end endpoint during editing
	•	endpoint previews
	•	onion references
	•	debugging saved endpoint content

These are not allowed to be the live playback motion source.

⸻

Save-Time Derivation Rules

Motion payload must be derived when endpoints are saved.

Playback is not allowed to derive motion payload from scratch.

Start endpoint save must do all of the following

When saving the start endpoint on a tween owner frame:
	1.	save the full-frame bitmap
	2.	derive opaque bounds from that saved start snapshot
	3.	crop the moving sprite once
	4.	write motionTween.spriteBitmap
	5.	write motionTween.startOrigin
	6.	preserve existing motionTween.endOrigin if still valid
	7.	preserve stage dimensions if needed

Start save must not erase a valid existing end origin unless tween structure was explicitly invalidated.

End endpoint save must do all of the following

When saving the end endpoint for a tween owner frame:
	1.	save the full-frame tweenEndBitmap
	2.	derive opaque bounds from that saved end snapshot
	3.	write motionTween.endOrigin
	4.	preserve existing motionTween.spriteBitmap
	5.	preserve existing motionTween.startOrigin
	6.	preserve stage dimensions if needed

End save must not overwrite the start sprite.

Structural invalidation rule

If tween structure is removed or becomes invalid, the system must clear or invalidate the motion payload on that owner frame.

It is forbidden to keep stale motion payload attached to non-tween structure.

⸻

Explicit Validity Rules

A tween is considered valid for motion playback only if all of the following are true:
	•	owner frame exists
	•	tween span exists
	•	owner frame has hasTweenEndpoint === true or equivalent valid tween-end state
	•	motionTween exists
	•	motionTween.spriteBitmap exists
	•	motionTween.startOrigin exists
	•	motionTween.endOrigin exists

If all of those are true, playback must render motion.

If playback does not render motion for that case, it is a bug.

Zero-motion rule

If startOrigin equals endOrigin, that is a valid zero-motion tween.

That is different from:
	•	missing payload
	•	missing descriptor
	•	blank playback
	•	invalid tween

A zero-motion tween is still valid.
A missing payload tween is invalid.

These must not be confused.

⸻

Playback Rules

Playback must read only the motion payload

For valid motion tweens, playback must read only:
	•	motionTween.spriteBitmap
	•	motionTween.startOrigin
	•	motionTween.endOrigin
	•	current tween progress from the timeline

Playback must not:
	•	scan opaque bounds every frame
	•	crop sprites every frame
	•	derive origin from endpoint bitmaps every frame
	•	switch render model inside the tween span
	•	blend endpoint bitmaps
	•	inspect transient overlays
	•	inspect live editable canvas state

V1 playback algorithm

For a valid tween:
	1.	resolve owner frame
	2.	read frozen motion payload
	3.	compute tween progress from frame position inside the span
	4.	interpolate x from startOrigin.x to endOrigin.x
	5.	interpolate y from startOrigin.y to endOrigin.y
	6.	round x and y to whole pixels
	7.	draw spriteBitmap at the whole-pixel position
	8.	use image smoothing disabled for that draw path

That is all.

Forbidden playback behavior

Forbidden:
	•	alpha blending start and end
	•	dissolve
	•	crossfade
	•	blank fallback for valid tweens
	•	start-hold fallback for valid tweens
	•	per-frame live bounds scan
	•	per-frame recropping
	•	subpixel placement
	•	render-path switching during the tween
	•	endpoint bitmap inference during playback

⸻

Render Separation Rules

Authoring render and playback render are separate systems.

When paused/editing

Allowed:
	•	endpoint display
	•	onion reference
	•	transform UI
	•	lasso UI
	•	transient editing overlays

When playing

Allowed:
	•	playback render only

Forbidden:
	•	live transform overlays controlling output
	•	onion controlling output
	•	transient selection state controlling output
	•	later non-playback repaint over playback
	•	endpoint preview replacing playback frame

If a valid playback frame is rendered and then later overwritten by a non-playback render path, that is a bug.

⸻

Failure Classification

Future debugging must classify failures precisely.

Failure Type A: Start save failure

Examples:
	•	bitmap not updated
	•	motionTween.spriteBitmap missing
	•	motionTween.startOrigin missing
	•	start save silently skipped

Failure Type B: End save failure

Examples:
	•	tweenEndBitmap not updated
	•	motionTween.endOrigin missing
	•	end save route never fires
	•	end save compares against wrong endpoint and skips valid save

Failure Type C: Play-start ordering failure

Examples:
	•	cache builds before save finishes
	•	transient clearing happens at wrong time
	•	playback begins with stale owner payload

Failure Type D: Payload integrity failure

Examples:
	•	motionTween exists but fields are null
	•	payload gets cleared unexpectedly
	•	end origin overwritten
	•	sprite bitmap overwritten incorrectly

Failure Type E: Descriptor/cache failure

Examples:
	•	valid payload but descriptor not built
	•	valid descriptor but wrong key
	•	lookup miss
	•	fallback path hides the actual defect

Failure Type F: Render failure

Examples:
	•	sprite rendered off-stage
	•	blank output returned
	•	wrong stage size
	•	playback frame overwritten later

Failure Type G: Legacy-model contamination

Examples:
	•	old bitmap-preview tween logic still active
	•	preview URL logic pretending to be playback logic
	•	midpoint preview switching still in the code path
	•	side guessing still alive

⸻

No-Hide Rule

A valid tween must not silently degrade.

If a tween appears valid but payload/cache/render is broken, the system must produce strong debug output.

It is not acceptable to quietly make the tween look like:
	•	a hold
	•	a blank span
	•	a start-only display
	•	“nothing happened”

A valid non-zero-distance tween that does not move is a hard bug. A deliberately zero-motion tween remains valid but must render its sprite stably rather than becoming blank or corrupt.

⸻

Mandatory Debug Order

All future debugging must follow this order.

Step 1: Verify start save

Prove:
	•	bitmap exists
	•	motionTween.spriteBitmap exists
	•	motionTween.startOrigin exists

Step 2: Verify end save

Prove:
	•	tweenEndBitmap exists
	•	motionTween.endOrigin exists

Step 3: Verify play-start ordering

Prove:
	•	save happened before clear
	•	clear happened before cache build
	•	cache built from fresh payload

Step 4: Verify descriptor build

Prove:
	•	valid payload produced valid descriptor
	•	descriptor key matches owner/span identity

Step 5: Verify playback lookup

Prove:
	•	tween cells use the correct owner/span
	•	descriptor lookup succeeds
	•	playback does not fall into invalid fallback

Step 6: Verify playback render

Prove:
	•	sprite renders visibly
	•	x/y progress changes monotonically through the tween
	•	whole-pixel rendering is used

Step 7: Verify no overwrite path

Prove:
	•	no non-playback render overwrites playback
	•	no overlay survives into playback output

The broken link must be proven before proposing fixes.

⸻

Required Debug Logs

Future implementations must provide diagnostic evidence that can prove:
	•	start save succeeded
	•	end save succeeded
	•	motion payload exists on owner
	•	descriptor built successfully
	•	descriptor stored successfully
	•	playback lookup found descriptor
	•	playback render source is motion descriptor
	•	no non-playback render occurred during playback
	•	no selection-mismatch happened during saved snapshot capture

If diagnostics are too weak to prove the broken link, add narrowly scoped logs before more implementation guessing happens. Remove temporary logs after verification, or keep only deliberately gated, low-noise diagnostics approved by the active spec.

⸻

Manual Acceptance Tests

A motion tween is not complete until it passes all of these.

Test 1: Left-to-right dot tween
	•	draw a dot on the left
	•	create a tween
	•	edit the end and move dot right
	•	press play

Expected:
	•	one dot moves left to right
	•	no fade
	•	no blank playback
	•	no start-hold across the full tween
	•	no flashing
	•	no teleporting

Test 2: Start/end independence
	•	reopen start and edit it
	•	end stays correct
	•	reopen end and edit it
	•	start stays correct
	•	playback follows updated path

Test 3: Play-start commit ordering
	•	leave lasso move active
	•	press play immediately

Expected:
	•	change saves
	•	transient state clears
	•	playback uses updated motion payload

Test 4: Long loop stability
	•	create 30–60 frame tween
	•	let it loop

Expected:
	•	no jitter
	•	no flashing
	•	no in-span snapping
	•	no disappearing sprite

Test 5: Onion correctness
	•	edit start with onion on
	•	only end appears as onion
	•	edit end with onion on
	•	only start appears as onion

Test 6: Non-tween regression
	•	draw normal keyframes and holds
	•	play and scrub

Expected:
	•	unchanged normal behavior
