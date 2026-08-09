> **Reference only — non-authoritative.** This legacy design note may be stale. Use the canonical control plane at [docs/README.md](../../docs/README.md).

The timeline system is the primary interface used to control animation timing.

The timeline displays animation frames across time and allows the user to manipulate animation structure.

Users interact with the timeline to insert frames, extend timing spans, and adjust animation flow.

Frame spans represent held timing.

Tween spans represent motion between animation states.

Frame spans should appear visually as gray spans.

Tween spans should appear visually as blue spans.

Each span should have a clear start marker indicating the beginning of the span.

Users should be able to extend spans by dragging the end of the span to the right.

The timeline must remain easy to read, visually stable, and predictable.

The timeline should allow animators to quickly understand the structure of their animation.
