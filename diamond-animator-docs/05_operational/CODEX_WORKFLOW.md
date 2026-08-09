> **Reference only — non-authoritative.** This legacy operational note is superseded. Use the canonical control plane at [docs/README.md](../../docs/README.md).

The Codex Workflow describes how Codex should be used during development of the Diamond Animator project.

Codex should always operate within the structure defined by the documentation system.

Before implementing a feature, Codex should review the relevant documentation files to understand how the system is intended to function.

Implementation tasks should be performed incrementally so that changes can be reviewed and validated before additional work is performed.

After completing an implementation task, Codex should summarize the changes that were made and identify the files that were modified.

This workflow ensures that Codex remains aligned with the architecture of the Diamond Animator system.

## Motion Tween Implementation Rule

Do not patch motion tween symptoms without checking the documented motion-tween architecture first.

Mandatory implementation order:
1. Read [`MOTION_TWEEN_SYSTEM.md`](../02_animation_engine/MOTION_TWEEN_SYSTEM.md).
2. Verify current code against the documented model.
3. Verify logs and the broken link.
4. Only then implement.

Operational rules:
- Future Codex work must not guess the model from current code alone.
- The documentation is the source of truth, not accidental behavior in the current implementation.
- If code and documentation disagree, first prove the mismatch. Do not guess which one is wrong.
- Motion tween fixes must stay within the documented V1 position-only model unless the documentation is intentionally changed first.
