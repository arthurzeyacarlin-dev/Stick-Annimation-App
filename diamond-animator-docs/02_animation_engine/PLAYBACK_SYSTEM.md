> **Reference only — non-authoritative.** This legacy design note may be stale. Use the canonical control plane at [docs/README.md](../../docs/README.md).

The playback system controls how animation is previewed inside Diamond Animator.

The playback system reads the timeline structure and plays frames in sequence according to the animation frame rate.

The playback system must support several playback controls.

Play
Pause
Timeline scrubbing
Frame stepping

Playback should always reflect the exact timing defined by the timeline.

The playback system must remain smooth and responsive so the user can accurately evaluate their animation.

Playback must work consistently across both animation workspaces.
