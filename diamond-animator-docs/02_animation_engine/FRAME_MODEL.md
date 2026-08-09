> **Reference only — non-authoritative.** This legacy design note may be stale. Use the canonical control plane at [docs/README.md](../../docs/README.md).

The Frame Model defines how animation data is represented in the Diamond Animator timeline.

Each frame represents a unit of animation time. Frames may contain drawing states, stick figure states, or generated animation content.

Frames can belong to spans such as keyframes, tween frames, or generated animation sequences.

The frame system must support both manual animation and AI-generated animation.

AI generated frames follow a specific visual behavior.

When AI generates frames, the generated frames appear with a temporary blue highlight color to indicate that the frames were produced by the AI generation system.

After generation completes, the blue highlight fades gradually to the normal frame color used by the timeline. Once the fade finishes, the frames behave exactly like normal frames.

This behavior ensures that users can visually recognize newly generated frames while still allowing those frames to become part of the normal animation timeline.

The frame model must also support additional timeline data such as sound events.

Sound events may occur at specific frames and are stored as timeline entries separate from animation layers.

These sound entries are used for playback and synchronization but do not belong to a specific animation layer.
