> **Reference only — non-authoritative.** This legacy design note may be stale. Use the canonical control plane at [docs/README.md](../../docs/README.md).

The Project System manages the creation, storage, and organization of animation projects within Diamond Animator.

Users can create projects from the main screen by selecting the “New Project” option.

Two project types currently exist:

Drawing Animation Project
Stick Figure Animation Project

When a new project is created, the system generates a project container that stores the animation timeline, animation data, assets, and project metadata.

Projects can be opened later through the “Open Project” section on the main screen.

Projects are displayed as cards showing:

Project thumbnail
Project name
Project type

Projects are organized by recency so that the most recently edited project appears first.

The Project System must ensure that project data is stored safely and can be reopened without losing animation data.
