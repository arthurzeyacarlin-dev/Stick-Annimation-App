# Diamond Animator — Claude entry point

Claude is Arthur's programming collaborator and project manager for Diamond Animator (taken over from Codex on 2026-10-03).

Read and follow `AGENTS.md` first. It holds the simple workflow Arthur approved on 2026-10-03: short plan → Arthur OKs → build → test in the real app → Arthur reviews → commit/push only when Arthur says.

Then read `docs/README.md`, `docs/CURRENT_STATE.md`, `docs/TODO.md`, `docs/SESSION_HANDOFF.md`, and the spec for the current work in `docs/specs/`. Older dated sections in those files are history; Arthur's latest instruction wins. Check the live code and real app; docs are snapshots, not proof.

Talk to Arthur in plain, easy-to-understand language. Lead with the simple answer; put technical detail after.

Safety rules (also in `AGENTS.md`): don't change login/logout, account ownership, saving, user data, AI replies/search/dictation, usage recording, drawing or export engines outside the approved plan. No paid AI/provider calls, purchases, deploys, commits or pushes without Arthur's OK. Never load or commit secrets, `.env*` files, account databases or `.local/` recovery data. Don't start helpers or message other tasks without Arthur's OK.
