> **Reference only — non-authoritative.** This legacy operational note is superseded. Use the canonical control plane at [docs/README.md](../../docs/README.md).

The Debug Playbook describes the process for resolving technical issues during development.

When an issue occurs, the first step is to determine which system is responsible for the problem.

Possible systems include the animation engine, the workspace interface, the AI system, or the product system.

Once the responsible system is identified, the developer should review the documentation describing that system.

The problem should then be reproduced so that the root cause can be identified.

After the issue is understood, a targeted fix should be implemented and tested.

Documenting debugging steps helps maintain long-term system reliability.

## Motion Tween Debug Rule

Do not patch motion tween symptoms without checking [`MOTION_TWEEN_SYSTEM.md`](../02_animation_engine/MOTION_TWEEN_SYSTEM.md) first.

For drawing-workspace motion tween bugs, debugging must follow this order:
1. Verify endpoint save path.
2. Verify `motionTween` payload exists on the owner frame.
3. Verify descriptor or cache build.
4. Verify playback lookup.
5. Verify playback render output.
6. Verify no later overwrite path.

Required behavior:
- Prove the broken link before proposing a fix.
- Use logs or direct state inspection.
- Do not guess from visual symptoms alone.
