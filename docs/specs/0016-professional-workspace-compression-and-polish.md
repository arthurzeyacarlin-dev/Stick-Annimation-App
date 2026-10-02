# SPEC-0016 — Professional Workspace Compression and Polish

Status: **Proposed; planning authorized by Arthur; no implementation phase is authorized or started**
Owner: Arthur
Planning role: docs-only Spec Architect; Project Manager reviews before any implementation authorization
Created: 2026-10-02
Last updated: 2026-10-02
Decision links: D-0167; D-0166; D-0093; D-0134; D-0136; D-0143
TODO IDs: PLAN-016; POLISH-016-1 through POLISH-016-5; PUB-016-PLAN; RESUME-015-6
Planning baseline: clean synchronized canonical `main` / `origin/main` at `988531e3a3e1f65558d32952256877c366a04c9d`
Runtime baseline inside that record: accepted SPEC-0015 Phase 5 product commit `1b4acd7db0b57188e95cb8474816c4e453172abd`
Delivery target: **five phases planned to finish in under seven calendar days from Phase 1 start, aiming for one or two accepted implementation phases per day; this is not a 30-day program. The target never relaxes proof, human review, sequential ownership or publication gates.**

## 1. Exact goal

Make Diamond Animator feel dramatically simpler, denser and professionally finished without removing, weakening or pretending to complete any existing capability.

The final Version 1 presentation has:

- one prominent **New Project** action;
- one **Projects** destination using genuine saved-project posters and explicit **Edit**, **Watch** and **Export** actions;
- one-click **Help** leading to the existing Assistant and Tutorials, with Assistant chats, deep links and notification targets preserved;
- quiet but immediately accessible **AI Dashboard**, notification bell, menu and account controls;
- contextual Export from the editor and project rows rather than a second disconnected Home picker;
- a compact desktop Home that fits at the normal `1440×900` review size without vertical scrolling;
- responsive smaller and zoomed layouts that reflow and may scroll vertically, but never hide controls or require horizontal page scrolling; and
- a restrained premium charcoal/near-black system with a subtle navy undertone, strong white legibility, genuine project imagery, and cyan/ocean-blue reserved for hover, focus, selected and active states.

The project, save, account, export and AI engines remain the same owners. This is information architecture, presentation and narrow UI-seam work—not a rewrite of the application or an excuse to hide capabilities in one menu.

## 2. Current behavior and evidence

### 2.1 Evidence boundary

- **Code verified on 2026-10-02 at `988531e`:** the route/component and action paths below were reread directly.
- **Previously live/owner verified:** the accepted SPEC-0011 project library/viewer, SPEC-0012 Assistant, SPEC-0014 notification and SPEC-0015 account/Dashboard flows remain the current functional evidence recorded in D-0119, D-0134, D-0143 and D-0165/D-0166.
- **Fresh canonical visual walkthrough unproven:** the built-in browser currently blocks this local app under browser security policy. Arthur rejected alternate browser/DevTools workarounds. This planning task therefore makes no new visual or latency claim.
- **Check verified:** canonical `main` and `origin/main` both resolve to `988531e3a3e1f65558d32952256877c366a04c9d`; the planning worktree was clean before these docs edits.

### 2.2 Current route and component map

| User surface | Current execution path | Verified current fact |
| --- | --- | --- |
| Signed-out entry | `app/page.tsx` → `getServerAccountSession()` → `AccountEntry` | Sign in creates a local account and requires one of three `LOCAL TEST PREVIEW` choices; Log in uses the stored choice. No paid plan or allowance is created. |
| Signed-in root | `app/page.tsx` → `ExistingHome` | `ExistingHome` owns startup recovery, first-use welcome, Home and internal project/tutorial/editor/export views. |
| Home | `ExistingHome` `view === "home"` | Six large stacked cards—New Project, Open Project, My Projects, Tutorials, AI Assistant and Export—live in a vertically scrollable Home below a large header. |
| Header | `AppChrome` in `AIcreditspage.tsx` | Home has a bell, AI Dashboard, Home and Menu. Account actions are at the bottom of the opened side menu, not a quiet header avatar. |
| Project editing | Home Open Project → `ProjectLibrary surface="edit"` → `openProject()` → `WorkspaceBootstrap` → `AnimationWorkspace` → `DrawingWorkspace` | A valid saved project opens the one canonical editor. |
| Project watching | Home My Projects → `ProjectLibrary` default watch mode → `ProjectMovieViewer` | The same collection and poster/evaluator path opens playback-only Watch. |
| Project management | `ProjectLibrary` → shared search/sort/rename/duplicate/delete owner | Both modes already share collection, poster, management, concurrency and recovery checks. |
| Editor Export | `DrawingTopBar` → File → Export → `ExistingHome` → `AnimationExportFlow` | Contextual editor Export already exists and uses the last saved project version. |
| Home Export | Home Export card → `AnimationExportFlow` chooser | A second chooser repeats project selection outside the project library. |
| Assistant | `/assistant` → auth guard → `DiamondAssistantScreen` | Existing chats, local knowledge/search, dictation, completion state, Assistant bell and `/#ai-assistant` return/deep-link behavior exist. It cannot edit projects or watch videos. |
| Tutorials | Home internal `TutorialsScreen` | The cards are truthful placeholders backed by `TUTORIAL_STATUS = "COMING LATER"`; no tutorial playback/content exists. |
| Workspace Help | `DrawingTopBar` and legacy `StickFigureTopBar` render Edit/View/Window/Help buttons without handlers | Help is visibly inert. This spec may wire Help, but must not describe it as functional before that phase passes. |
| Dashboard | `/credits` → auth guard → `AppChrome` + `AiDashboardScreen` | Current verified-account usage and display-only 10,000-token test roof remain non-financial; Phase 6 entitlements are paused by this sequencing decision. |
| Notifications | root `NotificationCenterProvider`; Home and Assistant `NotificationTrigger`; registered exact-target destinations | Two bells only. Assistant and project-AI targets navigate to exact content and mark read only after arrival. |

### 2.3 Current visible problem

The interface grew by adding one tall destination at a time. Home now treats primary creation, two modes of the same project library, learning, guidance and export as six equal cards. The large header and long vertical card stack make navigation feel heavier than the underlying workflows.

The project library already shares one data/evaluation/management owner, but a `surface` flag splits it into separate Home destinations and gives each row only one primary action. Export is separately exposed through another Home-level project chooser even though editor Export already exists. Help is fragmented across a Home Tutorials card, a Home Assistant card, a separate Assistant route and inert workspace Help buttons.

Presentation is also fragmented: Home/header use extensive inline styles, project/library/Assistant/Dashboard use independent modules, and the editor keeps older gray controls. The inconsistency is visual and navigational; it is not evidence that project, save, account, export or AI engines should be rewritten.

## 3. Root cause / missing foundation

1. **Destination-first Home architecture.** Each feature received a large independent card instead of a hierarchy built around the creator's next action.
2. **Mode split over one project owner.** Open Project and My Projects are presentation modes over the same saved collection, evaluator and management owner.
3. **Export handoff duplication.** Home Export repeats project choice instead of beginning from the project the user is already editing or viewing in the library.
4. **Fragmented help entry.** Assistant and placeholder Tutorials exist, but no single Help owner coordinates Home, editor Help and safe return/deep-link behavior.
5. **No shared visual contract.** Surface-specific inline/module styling has no small canonical token set for color, spacing, focus and density.

The correction is to consolidate navigation around existing owners and finish each assigned surface once. It is not to bury all capabilities in Menu, replace genuine project state with a mock dashboard, or make broad engine changes.

## 4. Permanent product decisions and invariants

1. **No capability deletion.** New Project, project editing, watching, management, save/reopen, Tutorials, Assistant, Dashboard, notifications, menu/account, Export, drawing, timeline, playback and AI thinking/search remain reachable and behaviorally protected.
2. **One Projects surface.** Open Project and My Projects become one Projects destination. Every valid row exposes explicit **Edit** and **Watch** actions; eligible saved native projects also expose **Export**. Rename/Duplicate/Delete/Search/Sort stay on that same surface.
3. **Contextual Export.** Editor File → Export stays. Projects row → Export hands the exact revalidated saved entry to the existing `AnimationExportFlow`. The standalone Home Export card may disappear only after both contextual paths pass.
4. **One Help entry, not one hiding menu.** Home exposes Help as a visible primary-secondary action, and the global shell keeps it easy to find. Help leads to Assistant and Tutorials. Dashboard, notifications and account/menu controls remain independently visible in quiet chrome.
5. **Tutorial honesty.** Tutorials continue to say **COMING LATER** until real content is separately specified and delivered.
6. **Assistant honesty.** Visual polish does not grant project editing, video watching or new AI ability. Existing chats, citations/search decisions, dictation, persistence, deep links and notification targets remain intact.
7. **Account preview preservation.** New-account signup continues to require one existing preview-plan ID and sends that exact value through the existing signup path. It remains explicitly labeled **LOCAL TEST PREVIEW / no real charge, subscription, allowance or provider limit**. Phase 5 may compact the cards visually but may not delete, default silently, rename as paid, or move the choice after account creation.
8. **SPEC-0015 pause, not cancellation.** Phases 6–8 are paused after published Phase 5 while SPEC-0016 is active. Their economics, entitlement, payment and launch work resumes only through a later explicit handoff after SPEC-0016 closeout.
9. **SPEC-0008 remains paused.** Visual quality never implies that AI can create/edit animation. SPEC-0016 must not change the paused Phase 2–6 plan, AI mutation ownership, prompts, models or provider behavior.
10. **Surface-owned finish.** Each phase completes compression, visual polish, responsive behavior, accessibility and performance proof for its assigned surface. There is no later generic “compress again” or “polish again” pass.

## 5. Scope

### 5.1 Authorized future implementation scope

- navigation and component composition around the existing route/view owners;
- Home, header, Projects, Help, Assistant/Tutorials, editor shell, Dashboard/account entry, Export/viewer/recovery presentation;
- a small shared visual-token layer for charcoal/navy surfaces, white text, cyan/blue interaction states, spacing, borders, radii and focus rings;
- narrow props/state needed to route an exact saved project from Projects into existing Edit, Watch and Export owners;
- focus restoration, keyboard order, reduced motion, reflow, zoom, empty/loading/failure copy and accessible labels;
- additive deterministic/browser proof and phase manifests.

### 5.2 Explicit non-goals

This spec does not:

- change project schemas, account tables, auth/session rules, account IDs, ownership, repository semantics, storage limits, save algorithms, recovery rules or user data;
- change drawing/rendering/history/Undo/Redo/onion/timeline/playback engines or authored project bytes;
- change Export encoding, codecs, destination catalog, geometry, output quality, audio, Finder behavior, cancellation, validation or output bytes;
- change AI prompts, models, reasoning choices, search/citation logic, dictation, retries, provider calls, usage metering or notification producers;
- add funded entitlements, real allowance/refill, billing, checkout, top-ups, cross-device sync, deployment or public launch;
- add tutorial media/content, make inert Settings/Report a Problem functional, or normalize all About/Terms branding while P-0002 remains open;
- add images unrelated to actual project posters or use synthetic project artwork as if it were user work;
- resume or duplicate SPEC-0008; or
- stage, commit, merge, push, publish, deploy or start an executor in this planning task.

## 6. Canonical final user flows

This section describes the completed Phase 5 product, not Phase 1. Phase 1 deliberately keeps compact transitional Projects, Help and Export choices until Phases 2–3 replace them without capability loss.

### 6.1 Sign in and Home

1. Signed-out user sees the existing two account-entry choices.
2. New account creation still requires a clearly labeled local preview choice; returning Log in does not ask again.
3. Startup recovery and first-use welcome complete without change.
4. Desktop Home shows the brand/chrome, prominent **New Project**, **Projects** and **Help** without vertical scrolling at `1440×900` and browser default zoom.
5. Dashboard, bell, menu and account avatar remain visible but visually quiet.
6. New Project creates/saves the same account-owned untitled project and opens the same editor.

### 6.2 Projects

1. User activates **Projects** once.
2. One shared library lists the current account's projects, real poster frames and existing metadata/failure states.
3. Each valid entry exposes separate **Edit**, **Watch** and, when exportable, **Export** controls.
4. Edit follows the current `WorkspaceBootstrap` safety path.
5. Watch follows the current playback-only viewer, never modifying project state.
6. Export revalidates the selected saved entry, then opens the existing export settings for that exact saved version.
7. Search, sort, rename, duplicate, delete, recovery conflict, focus return and cross-tab refresh continue to work.

### 6.3 Help, Assistant and Tutorials

1. User activates visible **Help** from Home or global chrome.
2. Help shows **Assistant** and **Tutorials** as distinct choices; it does not hide Dashboard/account/project controls.
3. Assistant opens the current saved-chat experience. Existing `/#ai-assistant` return and notification exact-target behavior land on the same Assistant/chat target.
4. Tutorials opens the current catalog and truthfully shows **COMING LATER**.
5. Editor Help opens the same Help owner without discarding unsaved work; Phase 3 must select and prove the safe presentation before wiring it.

### 6.4 Editor and Export

1. Editor keeps Save, Save As, Save and Exit, project title/state, Undo/Redo, drawing tools, timeline, panels, AI thinking and playback.
2. File → Export keeps using the last saved version and visibly warns when unsaved edits are excluded.
3. UI density improves without shrinking touch/focus targets below accessible bounds or introducing pointer/paint lag.
4. Export/viewer/recovery surfaces use the same visual language while retaining their exact state and failure semantics.

## 7. Target execution path

This is the final post-Phase-5 path. Phase 1 does not alter ProjectLibrary, AnimationExportFlow, Assistant, Tutorials or editor implementations.

```text
/ → server-verified account session
  ├─ none → AccountEntry (same auth + required preview choice)
  └─ session → ExistingHome
      ├─ Home
      │   ├─ New Project → existing create/save/bootstrap → editor
      │   ├─ Projects → one ProjectLibrary
      │   │   ├─ Edit → existing openProject/bootstrap → editor
      │   │   ├─ Watch → existing ProjectMovieViewer
      │   │   └─ Export → exact entry handoff → existing AnimationExportFlow
      │   └─ Help → Help hub
      │       ├─ Assistant → /assistant (existing chats/deep links/bell)
      │       └─ Tutorials → existing placeholder screen
      └─ quiet AppChrome → Dashboard + bell + Help + menu + account

editor File → Export → existing AnimationExportFlow
editor Help → safe Help presentation chosen/proved in Phase 3
```

The target introduces no second project reader, player, export encoder, help chatbot, account owner or notification store.

## 8. Visual and interaction contract

- Base: near-black/charcoal, with navy visible only as depth—not a bright blue wash.
- Text: primary near-white; muted text remains comfortably legible and WCAG 2.2 AA.
- Accent: cyan/ocean-blue appears only for hover, focus, selected, active, progress/identity and primary action emphasis. Neutral surfaces do not glow continuously.
- Imagery: project visuals come from `ProjectPoster` / the canonical renderer. Empty states use neutral graphics or text, never fake user work.
- Density: avoid tall repeated marketing cards, oversized dead space and multiple section dividers for a two-action Home.
- Motion: short functional transitions only; reduced motion eliminates nonessential movement.
- Focus: visible two-pixel-equivalent focus ring, logical order, restored focus after dialogs/viewer/routes, no color-only state.
- Desktop Home: no vertical scrollbar at `1440×900`, default zoom, after recovery/welcome are closed. The target is `scrollHeight <= clientHeight + 1`.
- Reflow: `1024×768`, `768×900`, `390×844`, `320` CSS px and 200% zoom may scroll vertically; no horizontal page overflow and no unreachable fixed control.
- Responsiveness/performance: visual changes may not add network work, duplicate project evaluation, eager poster rendering or animation-loop work. Every phase compares representative base/result interactions and reports any regression over 10%; no attributable task above 100 ms during the measured interaction flow.

## 9. Data, AI, cost, security and privacy impact

| Area | Contract |
| --- | --- |
| Project/account schema | None. No migration or reinterpretation. |
| Persistence | Existing account projects, chats, jobs, notifications, recovery, preferences and usage remain with their current owners and bounds. |
| Account entry | Same Better Auth/session path and exact preview-plan values; presentation only. |
| AI | No prompt/model/reasoning/search/dictation/tool/job/admission change. Zero automated real provider calls for proof. |
| Export | No encoder/output/destination/Finder change. UI passes an exact revalidated saved entry only. |
| Notifications | Same two bells and exact-target/read-on-arrival contract; no new producer. |
| External services/cost | None. Loopback-only deterministic/browser proof. No payment, Supabase mutation, provider request, purchase, credit or deployment. |
| User data | No deletion, import, transfer, reassignment, account merge or new telemetry. Synthetic fixtures stay in isolated review storage. |
| Security | Auth guards, server-derived owner, CSRF/origin rules, route access and account filtering remain unchanged. UI must not trust a client-supplied owner or project title as identity. |

## 10. Five-phase delivery plan

Every phase starts in Plan mode from the exact published predecessor, uses one dedicated Spec Executor worktree, finishes its assigned surface's visual/responsive/accessibility work, produces an independently validated manifest and stops. Arthur/PM review, CPA propagation and later publication remain sequential. The planning target is one or two phases per day and complete closeout in under one week. Evidence and acceptance are not skipped to meet the date; a genuine blocker pauses or returns only the affected phase while the PM keeps the remaining plan narrow.

### Phase 1 — Compact Home and quiet global chrome

**User-visible result:** Home receives its complete visual/density pass in one bounded phase. It shows one prominent New Project plus compact Projects, Help and Export affordances, while the quiet header keeps Dashboard, bell, menu and account visible. Home fits at `1440×900` without vertical scrolling. No library, Assistant, Tutorials, editor or Export screen is restyled yet.

Until their owner phases land, the compact **Projects** action opens the existing edit library directly and an adjacent **Watch projects** link opens the existing watch library; **Help** opens the existing Assistant directly and an adjacent **Tutorials** link opens the current placeholder catalog. Export remains a compact direct quick action. These explicit transitional links avoid throwaway panel state and preserve every capability at one click while keeping Phase 1 to one plausible implementation day. Phase 2 removes the extra Watch link when the library unifies, and Phase 3 replaces the direct Help/Tutorials pair with the final Help hub.

Phase 1 is the only phase made implementation-ready by this proposal after Arthur/PM accept and publish the plan and Arthur separately authorizes execution. Exact contract is in §11.

### Phase 2 — One Projects library, contextual Export and project-media surfaces

**User-visible result:** the Phase 1 Projects entry goes directly to one project library. Every valid row has explicit Edit, Watch and eligible Export actions. The library, Movie Viewer and Export presentation receive their one final surface pass, using genuine project posters. After editor and row Export pass, the transitional Home Export quick action is removed.

Entry gate **G-016-PROJECT-ACTIONS:** freeze the exact entry-identity handoff, selected-entry revalidation and eligible/failure rules before editing. The phase may touch the compact Home only to replace its transitional Projects/Export routing; it may not restyle Phase 1 Home or chrome. Project repositories, viewer clock/player, export renderer/encoder and output bytes remain protected.

### Phase 3 — Help, Assistant, Tutorials and workspace Help

**User-visible result:** the Phase 1 Help entry goes directly to one finished Help hub. Assistant and Tutorials each receive their one assigned presentation pass; Assistant chats/deep links/notification targets stay intact; Tutorials remain clearly placeholder content. Workspace Help stops being inert without discarding unsaved work.

Entry gate **G-016-HELP-UNSAVED:** from the published Phase 2 base, trace the active editor owner and choose one safe Help presentation that keeps the editor mounted. Recommended default: a shell-owned overlay/drawer; it may link to the existing Assistant route only through a no-loss route/new-window behavior proven in review. Do not mount a duplicate Assistant state owner inside the editor. The phase may touch the compact Home/header only to replace the transitional Help routing; it may not restyle them.

### Phase 4 — Creative editor shell polish

**User-visible result:** the existing editor feels like one premium creative workspace: calmer top bar, clear project/save state, disciplined tool/panel hierarchy, legible timeline and AI panel shell, and restrained selection/focus color. Drawing, playback and AI execution behave identically.

Entry gate **G-016-EDITOR-SHELL:** freeze the then-current presentation-only component allowlist after tracing which Drawing workspace/top bar/tool/right-panel/timeline/AI-shell files actually render. No animation/storage/history/canvas raster/provider module enters scope. Baseline representative paint, select, timeline, playback and AI-thinking timings before editing.

### Phase 5 — Account, Dashboard, recovery and integration closeout

**User-visible result:** account entry, Dashboard, recovery prompt and remaining shared dialogs match the finished shell without implying public hosting or billing. Signup's required local preview choice is compact, explicit and unchanged semantically. Dashboard numbers/account filtering/test-roof math remain unchanged. The end-to-end app passes the full responsive, keyboard, focus, failure and no-regression matrix.

Entry gate **G-016-ACCOUNT-DASH:** freeze presentation-only paths and deterministic snapshots after verifying the current Phase 5 account-usage projection. This is not a second broad polish pass: Phase 5 owns only account/Dashboard/recovery/shared-dialog surfaces and evidence-driven integration seam fixes. No auth API, account database, usage journal/store/projection, entitlement, billing, prior-phase presentation owner or engine may change without returning to its owning phase.

## 11. Phase 1 exact implementation contract

### 11.1 Authorized runtime outcome

1. Replace the six tall stacked Home cards with a compact composition containing one prominent New Project; primary Projects and Help actions; adjacent secondary Watch projects and Tutorials links; and a compact Export action. Keep recovery/welcome behavior and the exact New Project create/save/bootstrap path.
2. **Projects** opens the current `openProject` edit view directly; adjacent **Watch projects** opens the current `myProjects` watch view directly. The two library mounts and all library bytes remain unchanged until Phase 2.
3. **Help** opens the existing `/assistant` route directly; adjacent **Tutorials** opens the current tutorials view directly. Preserve `/#ai-assistant` return/focus behavior. Assistant/Tutorial files remain unchanged until Phase 3.
4. Export remains a compact visible quick action to the current Home-origin `AnimationExportFlow`. It is not removed until Phase 2 proves row/editor contextual Export.
5. Recompose `AppChrome` so Dashboard, bell, Menu and account avatar are visible quiet controls on supported widths; keep account popover/logout and pending-save safety. A compact Help affordance may invoke the same direct Assistant path through a callback registered by `ExistingHome`; Dashboard keeps a Home return.
6. Introduce only the minimal shared tokens used by Phase 1. Later phases adopt them in their own surface pass; Phase 1 must not restyle later surfaces preemptively.
7. Home has no vertical scroll at `1440×900` default zoom after recovery/welcome are closed. Smaller/zoomed layouts reflow and may scroll vertically without horizontal overflow.

### 11.2 Exact Phase 1 runtime file ceiling

Existing runtime paths allowed to change:

1. `src/components/account/ExistingHome.tsx`
2. `src/components/chrome/AIcreditspage.tsx`
3. `app/globals.css` only for shared token declarations and Phase 1 root/reflow hooks; editor/canvas/global scrollbar behavior is protected

New runtime paths allowed:

4. `src/components/home/HomeWorkspace.module.css`
5. `src/components/chrome/appChrome.module.css`

The executor may leave either new CSS module absent and keep styles in an allowed existing path; it may not substitute a different runtime path without a PM scope amendment. `ProjectLibrary`, `AnimationExportFlow`, project/viewer/editor, account/auth/session, notification storage/navigation, Assistant and Tutorials paths remain byte-identical in Phase 1.

### 11.3 Exact Phase 1 proof ceiling

New tracked proof paths:

1. `scripts/spec0016-ui/phase1/navigation-oracle.mjs`
2. `scripts/spec0016-ui/phase1/browser-proof.mjs`
3. `scripts/spec0016-ui/phase1/protected-regressions.mjs`
4. `scripts/spec0016-ui/phase1/proof-manifest.mjs`

Ignored evidence may exist only under `output/spec-0016/phase-1/**`. No fixture may contain real account credentials or copied user project content. If an existing generic browser driver needs source modification, stop for review; invoking existing unchanged infrastructure is allowed.

### 11.4 Phase 1 implementation steps

1. Refresh Git/status, the Home/header execution path and accepted navigation baseline in Plan mode; record the exact published base and review surface.
2. Capture baseline Home dimensions and route/focus behavior without external/provider requests or canonical user data.
3. Add minimal visual tokens and implement the compact Home and quiet header.
4. Route Projects, Watch projects, Help, Tutorials and Export directly through their existing destinations with exact focus return; do not add intermediate panels or alter destination components.
5. Re-read touched files; remove temporary logs and confirm every old capability remains reachable.
6. Run deterministic, TypeScript, focused lint, build/baseline, real-app, responsive, keyboard, performance, zero-egress and exact-scope proof.
7. Seal and independently validate the technical manifest; return the Spec Executor Implementation Review Packet and stop with an empty index.

### 11.5 Phase 1 acceptance flows

**P1-A — Desktop Home density**

1. Sign in to an isolated local review account and complete/dismiss recovery/welcome normally.
2. At `1440×900`, default zoom, observe New Project, Projects, Help and Export plus Dashboard/bell/menu/account without scrolling.
3. Assert Home vertical `scrollHeight <= clientHeight + 1`, no horizontal overflow, strong white text and cyan/blue limited to interactions/selection.

**P1-B — New Project preservation**

1. Activate prominent New Project once.
2. Confirm exactly one account project is created and the same editor opens.
3. Draw, Save, play and Save and Exit; use the preserved edit-projects route to reopen the same identity/content.

**P1-C — Projects transition without loss**

1. Activate Projects; the unchanged Open Project library opens, Edit opens the editor, Back returns Home and focus restores to Projects.
2. Activate adjacent Watch projects; the unchanged My Projects library opens, Watch opens the viewer, close/back restores focus to Watch projects.
3. Keyboard through both Home actions and confirm neither requires an intermediate choice panel.
4. Existing search/sort/rename/duplicate/delete and genuine poster behavior remain unchanged in focused regression proof.

**P1-D — Help and Export transition without loss**

1. Activate Help; Assistant opens directly, existing chats remain and `/#ai-assistant` returns/focuses the Help affordance.
2. Activate adjacent Tutorials; truthful COMING LATER cards remain and Back restores Tutorials focus.
3. Activate compact Export; the unchanged Home-origin chooser/settings open. Cancel without a Finder write.
4. Confirm editor File → Export also remains reachable and unchanged.

**P1-E — Quiet chrome and account safety**

1. Open Dashboard, notification bell, menu and account popover from visible quiet controls.
2. Verify menu/overlay Escape and focus return.
3. Verify account identity/preview label and logout; a dirty/pending project still blocks logout with the existing truthful error.

**P1-F — Reflow/accessibility/performance**

1. Repeat essential navigation at `1024×768`, `768×900`, `390×844`, `320` CSS px and 200% zoom.
2. Vertical scrolling is allowed where needed; no horizontal page overflow, clipped control, keyboard trap or hidden account action.
3. Keyboard-only and reduced-motion paths pass with visible focus; Axe has zero critical/serious findings in changed surfaces.
4. Home/header navigation shows no >10% attributable regression against the recorded baseline and no new attributable task above 100 ms.

### 11.6 Phase 1 deterministic and command gates

The executor freezes exact commands in its Plan-mode packet, using this minimum contract:

- `node scripts/spec0016-ui/phase1/navigation-oracle.mjs`
- `node scripts/spec0016-ui/phase1/protected-regressions.mjs`
- `npx tsc --noEmit`
- focused ESLint for the exact changed runtime/proof paths
- `npm run build`, compared honestly with the baseline if an inherited unrelated failure remains
- one isolated loopback review app and `node scripts/spec0016-ui/phase1/browser-proof.mjs`
- `git diff --check`, exact dirty-path allowlist, empty index and manifest self-validation

The browser proof uses synthetic/review data only, makes zero non-loopback/provider/paid calls, and captures dimensions, route identity, focus, screenshots and performance samples. Arthur's visible review is still required; automation alone cannot accept visual quality.

## 12. Protected regression matrix

| ID | Protected flow | Required evidence by affected phase |
| --- | --- | --- |
| REG-016-01 | Account Sign in / Log in / Log out, session restart and A/B privacy | Existing route/oracle plus isolated real-app smoke; no account DB/auth source change |
| REG-016-02 | Required signup preview-plan choice and non-financial copy | All three exact IDs selectable; submit blocked without choice; saved choice shown unchanged; no paid claim |
| REG-016-03 | New Project and account-owned project creation | One activation → one project; same owner/revision semantics |
| REG-016-04 | Edit/Save/Save As/Save and Exit/reopen | Real authored two-frame project with identity/digest continuity |
| REG-016-05 | Project Watch/movie viewer | Playback-only, seek/fullscreen/close/focus, zero project mutation |
| REG-016-06 | Search/sort/rename/duplicate/delete/recovery conflict | Existing deterministic commands and real-app synthetic project flow |
| REG-016-07 | Drawing/tools/timeline/onion/Undo/Redo/playback | Focused existing oracles plus one real editor flow; no engine file drift |
| REG-016-08 | Project AI thinking/reply and paused mutation boundary | Deterministic double only; thinking/search/reply presentation preserved; no real call; no animation edit claim |
| REG-016-09 | Assistant chats/search/citations/dictation/offline/retry | Existing phase-owned tests; saved chat/deep-link/notification flow |
| REG-016-10 | Two bells and exact target/read-on-arrival | Home/global and Assistant bells only; target project/chat arrival before read |
| REG-016-11 | Dashboard account isolation and display-only roof | A/B deterministic usage; exact calculations/coverage copy unchanged |
| REG-016-12 | Export chooser/settings/encoding/Finder/cancel | Exact selected saved entry; deterministic encoder/output invariants; no automated Finder write needed for UI-only phases |
| REG-016-13 | Recovery startup Recover/Discard/continue safety | Existing recovery oracle and one prompt/render smoke |
| REG-016-14 | Responsive/zoom/keyboard/reduced motion | Per-phase assigned surfaces plus Phase 5 end-to-end integration |
| REG-016-15 | Zero egress/cost/data mutation | Network ledger, storage before/after and explicit zero provider/payment/deployment operations |

## 13. Later-phase proof and entry gates

Before each later phase, its Plan-mode executor must:

1. start from the exact published predecessor and confirm the prior phase is accepted/integrated;
2. trace the live rendering/event/data path and freeze an exact runtime/proof allowlist;
3. record base screenshots/measurements through Arthur's allowed review surface rather than bypassing browser policy;
4. define exact responsive, keyboard, performance and protected-flow cases for only that phase's surfaces;
5. keep all engines/data owners outside scope; and
6. stop if the user outcome requires a schema, provider, billing, deployment or cross-spec behavior change.

No later phase may be bundled into an earlier executor merely to hit the calendar target. Speed comes from bounded surface ownership and one-or-two completed phases per day, not from skipping review.

## 14. Risks and watchouts

- `ExistingHome.tsx` is large and stateful. Phase 1 may reorganize its rendered presentation, but recovery, preferences, notification destinations, workspace leases and pending-save/logout behavior are high-risk protected seams.
- Moving account controls from the menu into the header can accidentally duplicate popovers or logout handlers. There must remain one account action owner.
- Project row Export must bind immutable entry identity and revalidate; a title/index handoff could export the wrong project.
- Removing Home Export before contextual Export passes would be a capability regression and is forbidden.
- Help navigation can discard unsaved editor work if implemented as a naïve route change. Phase 3's no-loss gate is mandatory.
- Existing tutorials are placeholders and workspace Help is inert today; planning prose must not turn those facts into implementation claims.
- Primary branding remains **Diamond Animator** in current chrome while some About/Terms copy says “Pro.” P-0002 remains open and is not a blocker for this spec; do not silently rewrite legal/about identity.
- The current browser policy prevents this task from producing fresh canonical screenshots. Future implementation still requires Arthur-visible review; if no allowed review surface exists at phase start, that phase may implement deterministic work but cannot be accepted as visually complete.

## 15. Authorization and handoff

This proposal and D-0167 authorize documentation only. No phase executor, runtime edit, test edit, server, account-data action, Git publication or deployment begins automatically.

After Arthur/PM accept this spec and a separate publication task integrates the reviewed docs package:

1. Arthur may separately authorize **Phase 1 only** from that exact published SHA.
2. One Plan-mode Spec Executor executes §11 and stops with its Implementation Review Packet.
3. Arthur/PM accept or reject; accepted work transfers sequentially to a Control Plane Architect, then requires separate publication authorization.
4. Phase 2 starts only after Phase 1 is published/integrated; the same rule repeats through Phase 5.
5. After SPEC-0016 Phase 5 is accepted, propagated, separately published and synchronized, the handoff returns to paused SPEC-0015 Phase 6 planning. G-ECON/G-CAPS and financial-retention decisions remain required; this spec does not pre-approve them.

## 16. Planning-task verification record

| Gate | Result | Evidence |
| --- | --- | --- |
| Canonical Git baseline | PASS | Clean `main...origin/main`; both refs `988531e3a3e1f65558d32952256877c366a04c9d` before docs edits |
| Current route/component trace | PASS | Direct reads of `app/page.tsx`, `app/layout.tsx`, AccountEntry/ExistingHome/AppChrome, ProjectLibrary, Assistant, Tutorials, Export, editor top bars and notification navigation |
| Current behavior distinction | PASS with disclosed limit | Accepted live-review records retained; fresh canonical visual walkthrough blocked by browser policy and not bypassed |
| Capability inventory | PASS | Every owner-named capability maps to a preserved final path and regression ID |
| Five-phase / under-week plan | PASS | Exactly five surface-owned phases; target one or two per day, under seven calendar days |
| Phase 1 implementation readiness | PASS after spec acceptance/publication and separate Arthur authorization | Exact outcome, file ceiling, proof ceiling, flows, commands, regressions and stop conditions defined |
| Runtime/provider/account/Git mutation | NONE | Docs-only task; no app/test/server/user-data/provider/payment/deployment/stage/commit/push action |
