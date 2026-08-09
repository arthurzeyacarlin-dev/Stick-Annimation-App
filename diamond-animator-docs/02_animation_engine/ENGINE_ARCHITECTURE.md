> **Reference only — non-authoritative.** This legacy design note may be stale. Use the canonical control plane at [docs/README.md](../../docs/README.md).

Diamond Animator uses a modular animation engine architecture.

The engine is responsible for:
- animation timing
- frame state storage
- playback
- tween behavior

Core animation engine documents:
- `02_animation_engine/FRAME_MODEL.md`
- `02_animation_engine/TIMELINE_SYSTEM.md`
- `02_animation_engine/TIMELINE_ENGINE_ARCHITECTURE.md`
- `02_animation_engine/PLAYBACK_SYSTEM.md`
- `02_animation_engine/MOTION_TWEEN_SYSTEM.md`

Subsystem rules:
- The frame model defines stored animation state.
- The timeline system defines timing and ownership.
- The playback system defines how stored animation state is previewed.
- The motion tween system defines strict V1 drawing-workspace tween behavior.

Architecture rules:
- The engine must remain modular.
- The engine must always respect the timeline structure as the source of truth for timing.
- The engine must not generate timing behavior that contradicts the timeline.
- The engine must support both animation workspaces.

Workspace scope:
- Drawing Animation Workspace
- Stick Figure Animation Workspace

Special rule:
- For any drawing-workspace motion tween implementation or debug task, `02_animation_engine/MOTION_TWEEN_SYSTEM.md` is the authoritative architecture document.
