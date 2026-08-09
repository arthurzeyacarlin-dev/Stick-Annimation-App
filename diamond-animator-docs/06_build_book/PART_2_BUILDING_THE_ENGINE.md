> **Reference only — non-authoritative.** This legacy build-book narrative may be stale. Use the canonical control plane at [docs/README.md](../../docs/README.md).

Part 2 — Building the Animation Engine

The animation engine is the core technical system that powers Diamond Animator.

The engine manages frames, animation spans, playback behavior, and timeline interaction.

At the center of the system is the timeline, which represents animation time. Frames are displayed horizontally while animation layers appear vertically.

Users interact with the timeline to create and modify animation sequences.

Keyframes define major animation states. Tween frames represent motion between those states.

The animation engine also supports AI-generated frames that assist the user in creating animation more quickly.

Generated frames appear visually highlighted when first created so that the user can identify AI-assisted work before the frames integrate into the normal timeline.

The animation engine also supports synchronization with sound events.

Sound effects can be attached to specific frames so that audio playback aligns with the animation timeline.

The engine must remain efficient and stable even when projects become large and complex.
