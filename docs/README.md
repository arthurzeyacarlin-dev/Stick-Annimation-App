# Diamond Animator Control Plane

## D-0180 — SPEC-0017 Phase 2 Round A (walk + run) published; Round B is next (current)

Arthur passed SPEC-0017 Phase 2 Round A on 2026-10-04 (D-0180): walk and run are "great for version one"; no more tweaks needed. Product commit `3e40515c99b04c370b07b9aeb93fcf5fe4e3b2cf` is on main and GitHub.

- **Moves library (no AI):** `src/lib/animator/moves/` — walk and run made from foot plants by recipe (no hard-coded frames): a long-striding run with flight, lean and full arm drive; styles natural, robot, sneaky, tired, happy, angry, heavy, hurt; speed slow/normal/fast; energy low/normal/high; left or right. Review-only **Moves** test section (Move, Style, Speed, Energy, Direction, Color, Head, Neck → Make), behind the same `NEXT_PUBLIC_SPEC0017_ENGINE_TEST=1` flag.
- **Lessons the engine now knows (apply to every move):** no frozen "ready" pose; speeding up and slowing down take about half a second (arms and legs grow, then shrink; a slow run swings the arms only a little); tired/heavy/hurt/low energy take longer (hurt hesitates), lively/angry quicker, robot has no speed-up/slow-down; a knee never touches the floor in a crouch.
- **Page rule (strict):** every animation stays fully inside the page and the whole animation is centered (not the figure's start point) at the figure's normal size, on any page shape (`src/lib/animator/stageFit.ts`); a move covers only as much ground as fits.
- **Classic stick figure by default:** solid head sitting right on the body, no neck; hollow head and neck are options. Figure colors with the color words the AI will use (`src/lib/animator/colors.ts`).
- **Engine changes Arthur asked for:** per-key facing (for turning), optional neck, default look. Phase 1 motion unchanged; its scenes now use the classic look and are centered.
- **Checks:** 53 automated tests (`npm run test:animator`): body rules for every style × speed × energy × direction, speed-up/slow-down timing, page fit on 4 page shapes, look. An independent frame-by-frame audit found 0 canvas failures in 288 moves × 4 page shapes.

**Next:** SPEC-0017 Phase 2 Round B — the rest of the moves library (stand/breathe, jump, wave, sit, squat, kick, punch, turn around, fall, high-five), object moves for Symbols (slide, bounce, spin, grow/shrink) and the AI lessons. Short plan → Arthur's OK → review copy. Then Phase 3 (AI director; needs the xAI key + OK for small paid calls).

## D-0179 — SPEC-0017 Phase 1 published; Phase 2 is next (current)

Arthur approved SPEC-0017 (AI Animator engine and director) and passed Phase 1 on 2026-10-04 (D-0179): "the most natural AI-made animation" he has seen; the engine must stay untouched. Product commit `b7a0800c61973d7729e1d9cf2f7a0bea90f537b2` is on main and GitHub.

- **Engine (no AI yet):** `src/lib/animator/` — stick-figure rig stored as angles (bones never stretch), joint limits, smooth in-betweens with soft starts/stops, planted feet (two-bone IK), ground rules, more than one character per scene, 17 automated checks (`npm run test:animator`). Scenes go on a new top layer as ordinary editable frames; one Undo removes the whole scene. A review-only **Engine test** list (Jump, Wave, Squat and stand, Two figures high-five, Fast vs slow) appears only with `NEXT_PUBLIC_SPEC0017_ENGINE_TEST=1` in a review copy's `.env.local`; it is hidden in the main app.
- **Compact frames (Arthur-authorized fix to the protected drawing/save area):** the editor stored every frame as a full "authoring world" picture (~93–238 MB each), so a 2-second scene used ~2.9 GB and Play froze. Now AI scene frames and reopened plain drawings are stored as the smallest centered box (`src/lib/animation/compactRasterBitmap.ts`) that remembers its full size. Saving writes exactly the same file as before (verified byte-identical, brush data included); drawing, Undo/Redo, playback, onion skin, Movie Viewer, export preview and recovery verified. 31-frame scene: +77 MB instead of +2.6 GB; Play starts in ~0.4 s; Arthur's 34-frame project reopens with +34 MB. Limits: frames hand-drawn during a session stay full-size until save + reopen; motion tweens (no UI to create them today) stay full-size.

**Next:** Arthur has something to say before SPEC-0017 Phase 2 (moves library). Then Phase 2 plan → OK → review copy.

## D-0178 — Phase 6 published; SPEC-0016 complete (current)

Arthur passed SPEC-0016 Phase 6 on 2026-10-03 (D-0178). Product commit `c63810d4ef0e634b6aa13883ec24fd1bf4300198` is on main and GitHub. The Assistant and the editor AI Animator now share one chat box (`src/components/ui/ChatComposerParts.tsx` + `chatComposer.module.css`): Reasoning dropdown, then Dictate (microphone) and Send (white check mark); while working, Send becomes Stop (white X). Dictate/Send/Stop are plain white icons with no bubble — the #0066FF fill shows only on hover; Reasoning keeps its box. The editor AI Animator gains dictation (same capture as the Assistant). Every notification bell hovers icon-only #0066FF. A shared design kit (`--da-*` tokens in `app/globals.css`) sets one error red, warning amber and success green, one Back button, one pop-up/menu/input/focus-ring look. Export and the Movie Viewer moved from the old slate/cyan look to navy; Home hover glows removed; browser tab title "Diamond Animator". Protected items (Dashboard bars/red line/dashes, gray frames, white canvas) and all behavior unchanged. Editor dictation was not live-tested (microphone blocked in the preview panel).

**Next:** SPEC-0016 is complete. Claude recommends SPEC-0017 — AI Animator engine foundation (character rig + pose format + in-between engine that writes normal editable frames), built before the Blender files arrive so both AI Animator tests (D-0173) can run on it. Awaiting Arthur's OK.

## D-0177 — Phase 5 published; Phase 6 is next (current)

Arthur passed SPEC-0016 Phase 5 on 2026-10-03 (D-0177). Product commit `49eb13e4b6882c9711db2d3756c7f457b132e577` is on main and GitHub. The signed-out entry now offers **Create account** (formerly "Sign in") and **Log in** with polished step-by-step screens. The AI Dashboard uses the same global header as Home (logo, bell, menu, account; the nav link reads **Home** on the Dashboard and **AI Dashboard** on Home), has plain-language wording ("How much AI you've used this week", "Sent to AI / Written by AI", "Web searches", "Estimated AI cost — our estimate, not a bill"), and keeps the same numbers, bar colors, red line and dashed line; the bar hover/selected outline is #0066FF. Header bell and nav-link hover change only the icon/text color. The recovery screen, welcome pop-up, side menu, account popover and project Rename/Delete dialogs use the app palette. Login/logout, accounts, saving, recovery behavior and usage math are unchanged.

**Next:** SPEC-0016 Phase 6 — shared design kit + agreed consistency checklist (Arthur's list + Claude's audit). Then the AI Animator tests (D-0173).

## D-0175 — Phase 4 published; Phase 5 is next (current)

Arthur passed SPEC-0016 Phase 4 on 2026-10-03 (D-0175). Product commit `282ddd91809a8d6512298f546334e71a4482d8be` is on main and GitHub. The drawing editor now matches Home/Help/Assistant: brighter navy (#071120) top bar, timeline bar, Properties panel and tool bar; dark navy (#030914) canvas area and AI Animator section; an Assistant-style brighter chat box; one divider color (#163058); dull blue rest/selected states and instant #0066FF hover. Timeline frames are gray with black dots (dull blue outline = current frame, bright outline = hover); Play/Pause is one button; the tool bar is evenly spaced; property sliders are dull until hovered/dragged; the save status is one chip. Top bar shows File, Edit, View, Window, Help with no logo — only File works (the editor Help menu from Phase 3 was turned off at Arthur's request; Home Help is unchanged). App-wide, buttons now use native CSS :hover; the custom `useInstantHover` tracker was removed because a click on empty space could disable it in Google Chrome. Drawing, frames, saving, export, login and AI behavior are unchanged.

**Next:** SPEC-0016 Phase 5 (account entry, Dashboard, recovery and shared dialogs polish). After SPEC-0016, run the two AI Animator tests side by side once Arthur's Blender files arrive (see D-0173).

## D-0174 — Phase 3 published; Phase 4 is next (current)

Arthur passed SPEC-0016 Phase 3 on 2026-10-03 (D-0174). Product commit `b7bc3dcd08d51f9156b2de848e0773cc3f0066c1` is on main and GitHub. Home **Help** now opens one Help page with **Ask the Assistant** and **Tutorials**; the Assistant and Tutorials screens were restyled (navy, brighter Assistant sidebar, new diamond logo, dull blues with instant #0066FF hover); the editor's **Help** menu works and opens the Assistant or Tutorials *over* the drawing so unsaved work stays put. Assistant answers, chats, dictation, search, login, saving, drawing and export are unchanged. D-0173 replaced the old multi-role process with the simple workflow in `AGENTS.md`.

**Next:** SPEC-0016 Phase 4 (editor shell polish), then Phase 5 (account/Dashboard/recovery). After SPEC-0016, run the two AI Animator tests side by side once Arthur's Blender files arrive (see D-0173).

## Current entry point for Claude

Arthur transfers whole-product continuity from Codex PM V5 to Claude on 2026-10-03 (D-0171). Read `AGENTS.md`, then this map and the latest sections of the canonical files. [`SESSION_HANDOFF.md`](SESSION_HANDOFF.md) owns the complete onboarding message; `CLAUDE.md` is only a bootstrap pointer. D-0172 records actual publication/integration of accepted Phase 2 in product commit `8b8ba6453df01a18492bedeffa1ac2bca5037416` with fresh clean local/origin/live-remote 0/0. Claude receives orientation only and waits for Arthur to assign the next action; no audit or Phase 3 starts automatically. Older Phase 2 unstarted/publication-pending headings are dated history.


## D-0169 — Phase 1 published; Phase 2 is next

Phase 1 is published and integrated on canonical/GitHub main in exact 21-path commit `2cea6de9103c21d21a4aec8d933740d64c66239b`, parent `413f71ba4cd3e6b12e05040aacfb8038b67bcd28`. Canonical main, origin/main and a fresh live GitHub read matched clean `0/0`. Main Home returned `200`; unsigned usage returned `401`; Chrome reached the unchanged main account entry. A new signed-in main walkthrough is not claimed; Arthur's accepted isolated Home/functional review and frozen-byte comparison remain the evidence.

Original technical seal `faa93f21d6c87b7be2685ba06c9f0326cf549e9bfc5070b32676071bb03cf32d` and 25 ignored review/config/account files are hash-verified in restricted canonical `.local/recovery/spec0016-phase1-accepted-20261002`; copied SQLite quick checks pass. No review account is imported into main. Exact review server stopped and port 58584 closed. The disposable review worktree is eligible for managed archival after this records-only closeout synchronizes. No accepted app byte, user project, account owner, AI/provider/save behavior or later phase changed.

Next starting point: the clean canonical main SHA containing this closeout, for separately authorized SPEC-0016 Phase 2 only. Combine Projects into one library with explicit Edit/Watch/eligible Export and polish library/viewer/export presentation; preserve repository/player/encoder/save/account engines and the accepted Home/header. Freeze G-016-PROJECT-ACTIONS during the bounded Phase 2 entry trace. SPEC-0015 Phases 6–8 and SPEC-0008 remain paused. D-0168's publication-pending status below is historical.

## D-0168 — SPEC-0016 Phase 1 accepted; publication authorized

Arthur passed the final Home/header review copy, including its instant #0066FF interactions, full recent-project target, no-scroll desktop fit, brighter #071120 header and pencil-only empty state. The exact eight technical paths from published planning base `413f71ba4cd3e6b12e05040aacfb8038b67bcd28` are frozen by manifest SHA-256 `faa93f21d6c87b7be2685ba06c9f0326cf549e9bfc5070b32676071bb03cf32d`. Root's executor stopped; Arthur/PM accepted; root now owns the same worktree exclusively as Control Plane Architect. Arthur separately and explicitly authorized records propagation, commit, canonical-main integration and GitHub push. This record is the acceptance checkpoint, not proof that publication has already succeeded.

SPEC-0016 Phase 2 is next after this accepted result and its records are durably integrated and synchronized. It unifies Projects with explicit Edit/Watch/eligible Export and polishes library/viewer/export presentation without changing engines. No Phase 2 implementation has started. SPEC-0015 Phases 6–8 and SPEC-0008 remain paused. Historical D-0167 proposal status below is superseded by planning publication `413f71b` and Arthur's later explicit phase/correction authorization.

## D-0167 proposes SPEC-0016 before remaining SPEC-0015 work

Arthur has directed a docs-only [SPEC-0016 UI compression and polish plan](specs/0016-professional-workspace-compression-and-polish.md) from clean synchronized canonical baseline `988531e3a3e1f65558d32952256877c366a04c9d`. The proposed five-phase sequence targets completion in under seven calendar days at one or two accepted phases per day without relaxing proof, review, sequential ownership or publication gates. Phase 1 is narrowly limited to compact Home and quiet global chrome, with direct one-click routes to the unchanged Edit library, Watch library, Assistant, Tutorials and Export. Later phases own Projects/Export, Help, the editor shell, then account/Dashboard/recovery integration. SPEC-0015 Phases 6–8 are **paused, not cancelled**, until SPEC-0016 closes; SPEC-0008 remains paused. This planning package is unaccepted/unpublished and authorizes no implementation.

## D-0166 Phase 5 published, locally active, and review copy retired

Arthur's accepted SPEC-0015 Phase 5 result and visual correction are published in exact 30-path commit `1b4acd7db0b57188e95cb8474816c4e453172abd`, parent `ee93d10121b82fcb256174caa5d7d0ab08886ade`. Clean canonical `main`, local `origin/main`, and a fresh live GitHub read matched at `0/0`. The main app returned Home `200` and an unauthenticated `/api/account/usage` read `401`; a signed-in main-browser walkthrough was blocked by browser policy and is **not** claimed. Arthur's earlier accepted isolated A/B and visual review remains the functional evidence. The port-58666 review server is stopped, its accepted worktree retired, and restricted proof/account-data recovery is preserved at `/Users/arthurcarlin/Projects/stick-animation-app/.local/recovery/phase5-accepted-20261002`. Phase 6 is the next possible separately authorized phase; G-ECON/G-CAPS and financial-retention decisions remain open. No real allowance, refill, AI call cap, billing, cross-device sync or deployment was delivered.

## Historical D-0165 Phase 5 accepted in review; publication pending at that checkpoint

Arthur passed the same isolated Phase 5 review copy, including its visual-only blue-to-red bar and neutral-blue warning correction. The stopped executor's 13 account-usage implementation/test paths and two Dashboard-presentation paths are frozen from canonical base `ee93d10121b82fcb256174caa5d7d0ab08886ade`. Original ignored manifest SHA-256 `3e7281d099e514e9e8ea21663bec190c2bd22a42d3e6da0c975e839cd49c3cd3` binds the 13 paths; the separate ignored visual-correction proof binds the two later presentation hashes. The Phase 5 result is **accepted in review but not yet published or integrated**. Canonical main still has Phases 1–4.5. Phase 6 starts only after separate publication and clean synchronization; no real allowance, refill, AI cap, billing, cross-device sync or deployment is included.

## D-0164 Phase 4.5 published; Phase 5 is next

The accepted 22 technical and 14 reviewed record/tree paths were published in exact commit `47bfe1ab376606a2b05de9d15fff958046521425`, parent `52b906919eb07367c23125847c0e07b47a6ebd4e`. Clean canonical `main`, local `origin/main` and a fresh live GitHub read matched at `0/0`. The existing port-3000 main server returned Home `200` and an unauthenticated account-data read `401`, proving the route is active; an authenticated main-browser walkthrough was not available for this closeout. The accepted review proof remains SHA-256 `3b662a47272a6c47c2d8feea919cde8a0d5c6327a6c1ba4626a6cba1f231eb74`. Phase 5 account usage is the next phase to authorize from integrated main; no Phase 5 implementation has begun. The D-0163 prepublication entry below is historical as to Git state.

## D-0163 accepted Phase 4.5 — publication pending

Arthur passed the local account-continuity review copy. The stopped executor's exact 22 technical paths from canonical base `52b906919eb07367c23125847c0e07b47a6ebd4e` are accepted with immutable proof-manifest SHA-256 `3b662a47272a6c47c2d8feea919cde8a0d5c6327a6c1ba4626a6cba1f231eb74`. The review app at port 58645 showed account-private Assistant chats, AI job records, notifications, recovery and preferences across account switches and server restarts. The existing account-storage connection was restored in that review server's process settings; the later PM AI and synthetic Dictate smoke checks are separate from the original proof's zero paid-provider-call claim. Phase 4.5 remains uncommitted and absent from canonical `main` until the separately authorized publication operation. Phase 5 account usage can start only after Phase 4.5 and these records are integrated. The dated D-0162 planning text below is historical where it calls Phase 4.5 unauthorized.

Status: canonical repository memory
Established: 2026-08-09
Last reconciled with current records and source: 2026-10-02 through D-0167's proposed SPEC-0016 planning package. SPEC-0015 Phases 1–5 are integrated locally; Phases 6–8 are paused behind the unpublished SPEC-0016 proposal. The earlier `/84bf/` and port-58582 Phase 4 reviews remain rejected/unpublished. D-0162 defers cross-device access and the new account-linked MP4 archive to Version 2 or later; older hosted Phase 4.5 passages below are historical.
Snapshot basis: pull request `#1` merged into `main` as `093bbac82fd3b4d97984448b6c6dbd716153354d`; functional anchor `c7de444536f3e0dd578a2063f70b0914e6af60b1`; tag `baseline-2026-08-09-control-plane`; SPEC-0014 Phase 1 GIT-099 `06365eacffe493ea3550de71b3baff0f57bf03b2`; Phase 2 GIT-100 `318566d6d20acec672c3d8c6a0e5620ad70c7d66`; Phase 4 GIT-102 product commit `283c297d1df01371dc599a52719d35dc78e1d2f4` plus this records-only closeout.

## D-0160 published Phase 4 — canonical local app running

The accepted 28-path Phase 4 product/technical result and nine reviewed record/tree paths were published as exact commit `c10cd39c2acea99c11ba87428e5182242a44cec9`. Clean local main and live GitHub main matched; the existing main account store remained intact and the integrated local app reported Ready on port 3000. The isolated review is Arthur-passed, but a fresh authenticated browser walkthrough on canonical main is not claimed. Mutable SQLite sidecar proof hashes and incomplete remote-latency/fault/protected-regression evidence remain disclosed. Phase 4.5 hosted continuity, Phase 5 account usage and billing are not included.

## Historical D-0159 accepted isolated Phase 4 — publication checkpoint

Arthur visibly passed private editable account projects and switching between two accounts in the isolated review copy. The one older original-main project is disposable test work by Arthur's explicit statement; its continued visibility is not required, but no transfer or deletion is authorized. The accepted 28 source/technical-test paths remain unchanged and match the ignored manifest; fresh production build and focused checks pass. Strict manifest revalidation is not green because mutable review-account SQLite sidecars drifted; remote p95, full induced faults and full protected real-app regressions remain unproven. Canonical main has not yet received this result. No Phase 4.5 hosted account continuity, Phase 5 usage, billing or public launch is implied.

## Historical D-0158 narrow Phase 4 save-proof amendment — published planning

D-0157's exactly two-part Phase 4/4.5 plan is published at `b3a6d35`. [SPEC-0015 §14.3.1](specs/0015-functional-ai-dashboard.md) now records a confirmed canonical encoder false-cycle defect for valid shared frame coverage and the rejected port-58582 `encode_failed prepare` evidence; it does not claim this conclusively caused Arthur's exact project failure. Phase 4 requires a fresh isolated executor, noncolliding namespace/command gate, encoder repair, efficient truthful account saves/checkpoints/logout and the real owner-visible flow with latency/regression proof. Both rejected copies and user drafts remain preserved. This is docs-only and grants no implementation or publication authority; Phase 4.5 hosted work and Phase 5 usage remain unchanged.

## Historical D-0157 two-part Phase 4 planning draft — published at `b3a6d35`

Arthur replaced the five 4A–4E user review checkpoints with exactly Phase 4 (reliable, private account project saving on the current installation) and Phase 4.5 (hosted identity/cross-device access, remaining account work and required private MP4 archive). The former planning package was published at `0176c4e4a186b84be25bbda04c7c5e05ccdfd7af`, but the isolated `/84bf/` review is **USER-FAILED** on a real “good dog” Save/Save and Exit; its code, data and proof remain preserved and unpublished. [SPEC-0015 §14.3](specs/0015-functional-ai-dashboard.md) records the new outcomes, no-transfer/privacy gates and real-flow proof. This docs-only draft neither diagnoses a Supabase cause nor authorizes implementation, publication or a date. Accepted Phase 3 runtime is unchanged; Dashboard account usage remains Phase 5.

## Historical D-0156 Phase 4A amendment — planning only

Arthur selected **Amend then new executor**. [SPEC-0015 §14.3](specs/0015-functional-ai-dashboard.md) replaces the old broad Phase 4 with 4A account-saved projects, 4B hosted Better Auth identity/recovery, 4C account chats/jobs/notifications/recovery/preferences, 4D required private MP4 account archive and 4E closure. Live types prove legacy local projects have no durable account owner. Arthur forbids moving/importing them—or one account's project—into another account. Phase 4A therefore reviews only new account projects on a fresh browser origin with zero legacy projects. A separate preservation decision is required before implementation rollout on any legacy-bearing origin; no full-main/no-regression claim is made. No runtime, Supabase, Git index or remote was changed by this planning task.

## D-0155 published local closeout — SPEC-0015 Phase 3

D-0154's accepted 28-path technical result and 15 reviewed control-plane/tree paths were committed, integrated and pushed as `b3607ae7ed1e88294bf61bb514d6acc39fe62ba0`. Pinned dependencies and a fresh, separate ignored main-local account store were installed; it began with zero users/sessions and 0700/0600 permissions. The canonical port-3000 Home/auth checks returned 200, unauthenticated usage returned 401, wrong-Host usage returned 403, and the 27-check local-origin oracle passed. Review accounts were not imported. D-0054 then stopped the 58580 review server, archived its worktree, removed the merged local publication branch and preserved its two-account store in restricted ignored recovery (see `SESSION_HANDOFF.md`). Phase 3 is Verified, published and integrated locally; D-0155 itself did not authorize public deployment, account-owned content, billing or Phase 4. D-0156 later supplies only the separately gated 4A authority above. The D-0154 paragraph below is its prepublication checkpoint.

## D-0154 accepted technical result — SPEC-0015 Phase 3 (historical prepublication checkpoint)

Arthur passed the corrected Sign in / Log in review copy and PM accepted its exact 28-path technical result from detached base `c53ed494d55f8314ed9d07783fbb1765615c01e6`. The current ignored manifest is SHA-256 `fd6a82ee6716469f5da0257dfbea12491c8f56252dfd74a11b0b36640e6f5648`; the original pre-correction manifest is preserved at SHA-256 `3b60c3a7b028e49c98db2578502587e65478ff2fcc65562028f87da2dfa803d9`. In the review app, real local sessions reach the existing full app, while projects/chats/notifications/Dashboard receipts remain shared browser-local data. The local-origin correction supports configured loopback ports 3000 and 58580. Canonical main needs its own fresh ignored account store/secret and safe port-3000 server cutover before activation; no review account is imported. This control-plane result is **accepted/technically Verified, unpublished**. Phases 4–8 remain unauthorized; publication and canonical runtime verification are separate.

## D-0153 correction — SPEC-0015 Phase 3

Arthur rejected the unpublished signed-in placeholder review copy. [SPEC-0015 §14.2](specs/0015-functional-ai-dashboard.md) now supersedes its old three-choice/guest-only outcome: Sign in and Log in alone lead to the existing full Diamond Animator; new-account Sign in alone selects one inert, clearly marked local test preview. Browser-local projects/chats/notifications/usage remain shared on that browser and are not account-owned until later phases; no public/multi-user deployment or account-privacy claim is authorized. D-0054 preserves/retires the rejected copy before one fresh Plan-mode executor starts from the separately published exact main SHA. The following D-0152 text is historical where it conflicts with D-0153.

## D-0152 activation record — SPEC-0015 Phase 3

Arthur selected real, file-backed local review accounts and separately authorized **Phase 3 implementation only** after this exact activation amendment is reviewed and published. [SPEC-0015 §14.2](specs/0015-functional-ai-dashboard.md) pins Better Auth/SQLite, the app entry's **Sign in / Log in / Continue privately** choices, the signed-in Menu avatar and one-click **Log out → entry** flow, server-verified guest/account isolation, the route/path/command ceiling and two-hour executor stop. Email is unverified and self-service recovery is deferred until hosted delivery is separately chosen. The ignored review database and secret must be restricted, hash-inventoried, preserved and restore-tested before D-0054 retirement. The accepted Phase 1–2 runtime is unchanged; Phases 4–8 remain unauthorized. This activation record itself does not publish or implement the app; a separately verified publication is required before Phase 3 execution.

## Historical planning correction — D-0150 / SPEC-0015 Option B

Arthur product-rejected the unpublished Dashboard-only Alex/Sam/Sign Out Phase 3 review copy: its account labels did not change the browser-local Phase 1 bars. D-0149 verifies GIT-105 records-only publication at clean canonical/local-origin/live GitHub `main` `cfcdaf05dfa2faad02a9c291d4a2252ddbee8dfd`. D-0150 revises [SPEC-0015](specs/0015-functional-ai-dashboard.md) **from Phase 3 onward** to one app-wide account in navigation, then separate account data ownership, account-scoped Dashboard usage, entitlements, sandbox billing and launch proof (Phases 3–8). D-0151 records completed hash-verified rejected-copy D-0054 cleanup and Arthur's separate docs-only publication authority. Accepted/published Phases 1–2 remain unchanged; the 90-day local journal is not an account bill. All revised phases are Unauthorized / Not started. Phase 3 is not implementation-ready until G-AUTH/G-PRIV, an exact selected-stack scope and separate Arthur implementation authorization. This docs-only revision changes no runtime, provider, account, payment, SPEC-0008 or deployment state.

## Historical pre-D-0150 implementation checkpoint

D-0144/D-0145 are the historical research and original planning decisions. D-0146 records Arthur's visible PASS of the final [`SPEC-0015 — Functional AI Dashboard, Usage, Accounts and Billing`](specs/0015-functional-ai-dashboard.md) Phase 1 review copy. GIT-103 published its 10,000 recorded-token UTC-week TEST PREVIEW and left-justified chart as `02a80577f562e9524d2e177c222d19f99f517278`. D-0147 records Arthur's subsequent visible PASS of Phase 2 and PM V5 acceptance of an exact 22-path, local, content-free, 90-day usage journal observing current Project AI, Assistant, hosted search and dictation. D-0148/GIT-104 publishes those 22 paths plus 15 reviewed records/tree paths in `5f0fbb673e54d530889113115fba5f9c3c94b55f`; canonical/local-origin/live GitHub `main` matched clean `0/0`, all 32 ignored proof files were preserved at inventory SHA-256 `dde41452a8d391870ba9fbfd15cf5f3fed7d98dca92f15b34ce5745a40ca1801`, and D-0054 removed only the obsolete review copy/local branch after port 58540 closed. Phase 2's immutable technical manifest SHA-256 remains `4659c66ae6c88c09b962e77abb0b7a70510faa0008677975f4e639026c0a9e72`. Phase 3 is ready for Arthur's separate authorization but **Unauthorized / Not started**; Phases 4–6 likewise remain unauthorized. The Phase 1 Dashboard presentation remains byte-identical. xAI/Grok animation metering is a reserved future integration, not current coverage. No billing, real balance, AI request limit or SPEC-0008 resumption is implied.

## Purpose

This directory is the single control plane for Diamond Animator. It exists so a new Codex task can recover the product direction, actual implementation state, current priorities, active specification, decisions, verification baseline, and exact handoff without relying on chat history.

`AGENTS.md` is the automatic bootloader. This file is the navigation and authority layer it loads.

## Required Read Order

Every task begins in this order:

1. `AGENTS.md`
2. This file
3. `00_MASTER_PROJECT.md`
4. `PROJECT_MANAGER_CONTEXT.md`
5. `CURRENT_STATE.md`
6. `TODO.md`
7. `DECISIONS.md`
8. `SESSION_HANDOFF.md`
9. `specs/README.md`
10. The active spec, if one is named in `SESSION_HANDOFF.md`
11. Relevant architecture, testing, AI, and domain reference files
12. The live code and real application path

## Canonical Files

| File | Canonical responsibility | Update trigger |
| --- | --- | --- |
| `00_MASTER_PROJECT.md` | Product charter, intended users, product principles, strategic boundaries | Product direction changes |
| `PROJECT_MANAGER_CONTEXT.md` | Owner context, latest direction, collaboration expectations, unresolved product questions | PM direction or constraints change |
| `CURRENT_STATE.md` | Current evidence-backed implementation and quality state | A task changes or disproves current state |
| `architecture.md` | Runtime path, subsystem ownership, data flow, and protected hotspots | Architecture or ownership changes |
| `AI_SYSTEM.md` | Current AI architecture, task availability, prompt assets, cost and safety gaps | AI behavior or policy changes |
| `ROADMAP.md` | Ordered product and engineering phases | Priorities or phase definitions change |
| `TODO.md` | Actionable work queue with stable IDs and proof conditions | Work is added, blocked, started, or completed |
| `DECISIONS.md` | Accepted and pending durable decisions | A durable decision is made or superseded |
| `TERMINOLOGY.md` | Canonical product, workspace, AI, and animation vocabulary | Terms are added or normalized |
| `testing_workflow.md` | Verification tiers, current gate baseline, and regression matrix | Tooling or required proof changes |
| `specs/README.md` | Spec lifecycle, active-spec index, and promotion rules | A spec is created or changes status |
| `SESSION_HANDOFF.md` | Exact last-known stopping point and next start point | End of every state-changing task |
| `changelog.md` | Append-only record of meaningful changes | Meaningful behavior/control-plane change |
| `baselines/2026-08-09-repository-audit.md` | Frozen initial repository snapshot | Corrections only; never roll forward |
| `archive/README.md` | Classification of legacy, duplicate, and non-normative material | Archival status changes |

## Source-of-Truth Precedence

Use different chains for intent and reality.

For **intended behavior and authorization**:

1. the user's latest explicit instruction
2. `AGENTS.md` for the required working/proof method
3. an approved, non-superseded spec and accepted decision

For **factual current behavior**:

1. fresh real-app observation, executed checks/tests, logs, and directly traced live code, reconciled together
2. `CURRENT_STATE.md` and `SESSION_HANDOFF.md` as dated snapshots
3. `diamond-animator-docs/`, build-book prose, paste packs, spreadsheets, old logs, and old checklists as reference or history unless provisionally promoted by `specs/README.md`

If documentation and code disagree, do not silently rewrite one to match the other. Record the mismatch, prove the real path, and decide separately whether the implementation or the intended behavior should change.

## Evidence Labels

Control-plane claims use these labels:

- **Live verified**: observed in the running app during the dated flow.
- **Code verified**: traced directly through current source.
- **Check verified**: proven by a named deterministic command.
- **Intended**: approved product direction not yet proven in the app.
- **Risk**: evidence-backed concern that still needs a dedicated reproduction.
- **Unknown**: not inspected or not safely testable in the current pass.

Never turn a risk into a confirmed bug or an intention into an implemented feature without proof.

## Documentation Boundaries

`docs/` owns current project memory. `diamond-animator-docs/` remains a domain reference library. Its motion-tween specification is only provisionally promoted in `specs/README.md`; its other files remain non-normative until reconciled.

Do not create another current-state file, TODO, changelog, roadmap, decision log, or handoff under a different directory. Historical notes may be preserved, but they must point back here and carry a clear archival label.

## End-of-Task Memory Contract

Canonical memory propagation belongs to the Control Plane Architect, not the Spec Executor. The permanent phase workflow is:

```text
Spec Executor
→ one authorized phase implementation and technical proof
→ Implementation Review Packet
→ stop

Arthur and Project Manager
→ accept or reject

Control Plane Architect, after exclusive worktree transfer
→ canonical memory propagation and final tracked-state proof
→ Control Plane Architect PM Review Packet
→ stop

Separate explicit publication instruction
→ Control Plane Architect stages, commits, integrates into main, pushes, and verifies
```

The Spec Executor may create validated technical proof evidence but must not edit `AGENTS.md`, canonical `docs/` files, or `project/project_structure.txt`, and must never stage, commit, merge, push, or publish. The Control Plane Architect may enter the same worktree only after the executor has completely stopped and the implementation is accepted. The two roles never edit one worktree concurrently.

For every accepted task that changes code, behavior, architecture, priorities, or proof, the Control Plane Architect:

1. Update the active spec with implementation and verification evidence.
2. Update `CURRENT_STATE.md` only where reality changed.
3. Move or close the relevant stable IDs in `TODO.md`.
4. Append a dated entry to `changelog.md`.
5. Record durable decisions in `DECISIONS.md`.
6. Rewrite `SESSION_HANDOFF.md` so the next task can start without chat history.
7. Run `bash scripts/update_memory.sh` to validate memory and regenerate the sanitized tree. Use `--check-only` only for a read-only task with no filesystem changes.
8. Revalidate the executor's technical manifest, complete the final tracked-state closeout, and report the exact Git state with an empty index.

The Control Plane Architect then stops. Staging, committing, integrating, and pushing require a later explicit publication instruction. Rejected implementation returns to a separately authorized Spec Executor correction task without control-plane propagation.

SPEC-0001 Phase 1 remains the completed historical exception under the former combined workflow; its Verified and published record is not changed by this process decision.
