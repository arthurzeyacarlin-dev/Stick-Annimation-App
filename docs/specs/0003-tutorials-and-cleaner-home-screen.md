# SPEC-0003 — Tutorials and Cleaner Home Screen

Status: Approved
Owner: Arthur
Implementer: one Spec Executor, only after this approval/activation is separately published
Created: 2026-08-16
Last corrected: 2026-08-24
Lifecycle: Approved and active; the one single implementation is Authorized; Not started; activation publication pending
Owner outcome: fixed directly by Arthur on 2026-08-24; no visible product decision remains open in this spec
TODO ID: SPEC-003
Decision link: D-0030 in `../DECISIONS.md`
Fresh current-main research basis: clean detached dedicated worktree at `7bfcdebc2763c6ed0ef3cf047b80cc1e15f6536a`; canonical `main` and `origin/main` resolved to the same SHA during the audit
Recovered proposal source: complete reference-only file at `/Users/arthurcarlin/.codex/worktrees/6aac/stick-animation-app/docs/specs/0003-tutorials-and-cleaner-home-screen.md`

## 1. Status and authorization boundary

This is Arthur's approved corrected product specification. It is **Approved and active** through D-0030. The exact visible result is settled, and its one implementation is **Authorized; Not started**.

SPEC-0001 Phases 1 through 6 are Verified, published, and integrated. Phase 6's corrected deterministic Stick chat is integrated in `caa6c2d946780f384d0a8c58f4ea75a771483bcd`, and its later canonical publication record is integrated at the current-main basis above. SPEC-0001 Phase 7 remains Unauthorized and Not started. SPEC-0002 is complete, protected, and integrated, including the realistic-size Drawing Save correction at `5c36870f7671033e30dc9341ba757e36c6572cc2`.

SPEC-0003 contains exactly **one small implementation** and no phases. Actual tutorial recording, video assets, playback, captions, delivery, progress, and analytics require a different future specification after the app is much more complete.

Implementation may begin only after this reviewed approval/activation is separately published to canonical `main` and its exact publication SHA is handed to one new Plan-mode Spec Executor. This approval task performs no implementation or publication.

## 2. Exact one-bite product outcome

After the one approved implementation:

1. Clicking the existing Home **Tutorials** card opens one polished full-screen Tutorials page in Diamond Animator's premium dark-navy/blue visual language.
2. The normal Home header is completely absent there: no Diamond Animator masthead, AI Dashboard, Home, notification control, or menu control.
3. One clear **Back** control returns safely to Home and restores keyboard focus to the existing Home Tutorials card.
4. The page's single main heading is exactly `Welcome to Diamond Animator`.
5. One large featured static placeholder is visually dominant:
   - title: `Start Here`
   - visible status: `COMING LATER`
   - premium blue outlined-card styling
6. Below it is one clear secondary group containing exactly three smaller static placeholders in this order:
   1. `Create Your First Animation`
   2. `Create with AI`
   3. `Finalize Your Animation`
7. Every secondary placeholder visibly says exactly `COMING LATER` and uses the same polished outlined-card family as the feature.
8. All four placeholders are static and non-interactive. None works yet.
9. The inert Home **AI Credits** card is removed.

The Tutorials page contains only the Back control, the exact welcome heading, the one featured placeholder, and the three secondary placeholders. It does not choose, open, or describe a workspace.

## 3. Exact page and card contract

### 3.1 Visible structure and copy

The visible order is fixed:

```text
Back
Welcome to Diamond Animator

Start Here
COMING LATER

Create Your First Animation
COMING LATER

Create with AI
COMING LATER

Finalize Your Animation
COMING LATER
```

The page has no alternate heading, eyebrow, subtitle, descriptive lesson copy, product-capability copy, workspace action, extra card, footer promotion, or status other than `COMING LATER`.

Each placeholder's only visible copy is its exact title and `COMING LATER`. The four titles live in one checked-in static catalog in the exact order above. The catalog has no URL, route, media path, duration, progress, completion, unlock, analytics, provider, or workspace-action field.

### 3.2 Featured-versus-secondary visual hierarchy

The implementation must not render four equal cards. The feature and secondary cards share one family—dark-navy surface, blue outline, consistent corner shape, and premium restrained shadow—but use measurably different scale and emphasis.

At `1440x900`:

- the featured card spans the full tutorial content width;
- the three secondary cards form one three-column row below it;
- the featured card's rendered width is at least `2.8×` each secondary card's width;
- the featured card's rendered height is at least `1.45×` each secondary card's height;
- the featured card's rendered area is at least `4×` each secondary card's area;
- the featured title's computed font size is at least `1.35×` each secondary title's size; and
- the featured outline is at least `2px`, while the secondary outline is at most `1px`.

At `1024x768`:

- the featured card remains full-width above one three-column secondary row;
- its rendered width is at least `2.7×` each secondary card's width;
- its rendered height is at least `1.4×` each secondary card's height;
- its rendered area is at least `3.7×` each secondary card's area;
- its title size remains at least `1.3×` each secondary title's size; and
- the `2px` feature versus at-most-`1px` secondary outline distinction remains visible.

At `390x844`:

- the layout becomes one column with the featured card first and all three secondary cards below it;
- the featured card and secondary cards may share the same available width, but the feature's rendered height is at least `1.65×` each secondary card's height;
- the featured title's computed font size is at least `1.3×` each secondary title's size;
- the feature keeps at least a `2px` blue outline while secondary cards use at most `1px`;
- the feature has visibly greater internal padding than each secondary card; and
- all titles and statuses remain fully readable without horizontal scrolling or clipped text.

At all three viewports:

- the featured card begins above every secondary card;
- the gap between the feature and the secondary group is larger than the gap between secondary cards;
- the feature's outline, title, and interior space make it the first card a user notices;
- all cards use the same approved dark-navy/blue family without changing any shared app color or style token; and
- screenshots plus DOM/computed-style measurements must prove the hierarchy. A screenshot alone is not enough.

### 3.3 Static placeholder semantics

Each placeholder must render as a semantic static article or equivalent non-interactive region. A placeholder must not be:

- a button, link, disabled control, dialog opener, or keyboard target;
- assigned `role="button"`, `tabIndex`, `aria-disabled`, a click handler, an href, or a route;
- styled with a pointer cursor, press state, play affordance, or interactive hover/focus treatment; or
- backed by a video, audio, image thumbnail, iframe, canvas, media URL, public tutorial asset, or analytics call.

There is no play icon, play button, duration, media player, caption track, transcript, progress, completion, locking, or unlocking. `COMING LATER` is visible text, not color-only meaning.

The existing icon on the Home Tutorials card remains part of protected Home presentation. SPEC-0003 changes only that Home card's navigation behavior; it does not restyle the card or turn any Tutorials-page placeholder into a control.

## 4. Fresh evidence and root cause

### 4.1 Real behavior observed on 2026-08-24

Fresh source tracing and a real loopback browser check at the exact current-main basis proved:

- `app/page.tsx` owns Home, Open Project, New Project, Drawing, Stick, and Creator through local React `view` state; there is no Tutorials view and no Tutorials URL route.
- Home's Tutorials card is a real button but has no click handler. Clicking it leaves Home visible and focused on the same button.
- Home's AI Credits card is present and inert. Clicking it also leaves Home visible.
- `MainScreenHeader` renders only while `view === "home"`. A local Tutorials view can omit the whole Home header without editing the shared header component.
- the observed Tutorials and AI Credits clicks caused no page error and no application request.

### 4.2 Corrected product misunderstanding

The earlier proposal treated Tutorials as a general guidance and creation-entry surface. Arthur corrected that misunderstanding. His accepted result is a future-video showcase: one large `Start Here` placeholder followed by three smaller future-video placeholders. New Project remains the only place where a user chooses a workspace.

### 4.3 Fresh conflict and activation audit

- SPEC-0001 Phase 6 did not change `app/page.tsx`; its Stick runtime, UI, contracts, fixtures, permanent tester, and proof remain protected.
- SPEC-0002 did change `app/page.tsx` for validated Drawing Open behavior. SPEC-0003 may add only the narrow Tutorials local-view/focus transition there and must preserve active-project state, Open callbacks, component keys, and Save/Open behavior.
- the permanent tester's current catalog, schemas, contract, runner, recorder, validator, and finalizer are SPEC-0001-only through `phase-6/v1`. They cannot authorize SPEC-0003 and must remain byte-identical.
- D-0030 authorizes the one implementation, but no executor may start before the activation is separately published and its exact canonical-main SHA is recorded. No visible product decision remains open.

No conflict requires splitting the work. The exact corrected result remains feasible as one implementation.

## 5. Execution path and state boundary

Current path:

```text
Home Tutorials button
  -> no onClick transition
  -> Home remains visible
```

Authorized target path:

```text
Home Tutorials button
  -> keep the existing Tutorials button ref and record focus-return intent
  -> set local view to tutorials
  -> render TutorialsScreen without MainScreenHeader

Tutorials Back
  -> mark focus restoration pending
  -> set local view to home
  -> after Home remounts and the ref points to the new Tutorials button DOM node,
     scroll it into view with non-animated nearest-block behavior
  -> restore focus to that remounted Tutorials control and clear the pending flag
```

The `view` union may add only `"tutorials"`. The URL remains `/`. Browser history and Escape behavior remain unchanged. Refresh from Tutorials returns to Home, matching today's local-state navigation model.

These existing paths remain authoritative and unchanged:

```text
Home -> New Project -> Drawing or Stick
Home -> Open Project -> validated Drawing or Stick candidate -> workspace
Stick -> Creator -> Back -> same Stick project root
```

Tutorials does not call any workspace setter, clear an active project, create a project, read or write project storage, or add a workspace callback, route, API, preference, schema, or history state.

## 6. Accessibility and responsive rules

- Tutorials has exactly one page-level Back control in the top-left.
- the exact welcome text is the page's only `h1`.
- all four card titles are headings below the `h1`; the featured title may be `h2`, and each secondary title must use the same correct heading level.
- Back works with Tab, Shift+Tab, Enter, and Space and has a visible focus indicator.
- the four placeholders are skipped by Tab.
- Back is at least `44×44` CSS pixels.
- visible text and focus states meet WCAG AA contrast against their rendered backgrounds.
- `prefers-reduced-motion: reduce` removes decorative transitions; focus restoration uses non-animated scrolling.
- `390x844` has no horizontal scrolling, covered content, clipped controls, missing labels, or unreadable wrapping.
- `1024x768` and `1440x900` keep the feature above the secondary group without hiding the final card.
- the component stylesheet is locally scoped. It may not change global elements, fonts, Home, New/Open, workspaces, or shared chrome.

## 7. Strict scope and non-goals

In scope only:

- make the existing Home Tutorials card open the new local view;
- add the full-screen Tutorials page with the exact fixed structure and copy;
- add Back/focus/scroll restoration;
- add one dominant feature and three smaller static placeholders;
- remove the inert Home AI Credits card; and
- add bounded SPEC-0003 fixtures and proof.

Explicitly out of scope:

- any font change;
- Home redesign, masthead/header change, card restyling, spacing/color/layout cleanup, menu change, notification change, or AI Dashboard change;
- New Project or Open Project change or restyling;
- My Project, Home AI Assistant, Export, or AI Project Finalizer behavior/copy/style changes;
- Drawing, Stick, Creator, timeline, AI panel, toolbar, button-size, color, spacing, layout, or frame-thickness changes;
- workspace selection or navigation from Tutorials;
- real tutorial recording, video/audio/image assets, playback, captions, delivery, progress, completion, unlocking, or analytics;
- workspace Back/Exit, URL routes, deep links, or browser-history behavior; and
- provider, OpenAI, search, Supabase, billing/credits, paid request, deployment, package, dependency, configuration, environment, database, authentication, or cloud work.

The only visible Home changes are: Tutorials opens, and AI Credits is gone. Every retained Home element keeps its existing text, order, geometry, font, size, color, spacing, icon, and behavior.

## 8. Exact implementation touch matrix and allowlist

After this approval/activation is separately published, one Spec Executor may change only these ten tracked paths:

### Runtime and style — exactly four paths

- `app/page.tsx`
- `src/components/tutorials/TutorialsScreen.tsx` (new)
- `src/components/tutorials/TutorialsScreen.module.css` (new)
- `src/lib/tutorials/tutorialCatalog.ts` (new)

### Dedicated fixture and technical proof — exactly six paths

- `scripts/fixtures/spec0003-tutorials/v1/browser-plan.json` (new)
- `scripts/fixtures/spec0003-tutorials/v1/proof-commands.json` (new)
- `scripts/spec0003-tutorials/browserProofContract.ts` (new)
- `scripts/runSpec0003TutorialsBrowserProof.ts` (new)
- `scripts/recordSpec0003TutorialsProof.ts` (new)
- `scripts/validateSpec0003TutorialsProof.ts` (new)

Ignored proof output may exist only under `output/spec-0003/single-implementation/**` and must be collision-refusing, validated, and cleaned according to the proof contract.

Everything else is read-only. This includes:

- `AGENTS.md`, every canonical `docs/**` path, and `project/project_structure.txt` during Spec Executor work;
- `app/globals.css`, `app/layout.tsx`, and `src/components/chrome/AIcreditspage.tsx`;
- every New/Open/Drawing/Stick/Creator runtime not listed above;
- all accepted SPEC-0001 tester/core/catalog/schema/fixture/proof files;
- every SPEC-0002 runtime/fixture/proof path other than the narrow shared `app/page.tsx` edit;
- `package.json`, lockfiles, dependencies, public assets, APIs, database files, configuration, environment, deployment, recovery material, and other worktrees.

If the result needs any 11th tracked implementation path, the executor stops and returns the exact blocker. It does not expand scope itself.

## 9. One implementation workflow

This is one implementation, not phases. The executor performs these ordered steps inside one authorized task:

1. complete the required Plan-mode boot and fresh source/real-app audit from the exact activation SHA;
2. prove an empty index, no hidden flags, and the exact ten-path ceiling;
3. run the clean pre-edit permanent SPEC-0001 tester and record its result;
4. create only the six dedicated SPEC-0003 proof paths, then capture base Home/New/Open/Tutorials-card/AI-Credits behavior and retained-Home computed presentation at all three required viewports before changing runtime;
5. patch the four runtime/style paths narrowly;
6. run the complete dedicated result proof, including the featured-versus-secondary geometry checks, and compare every protected base measurement;
7. reread all touched code, rerun the exact user flow, and check regressions;
8. create and independently validate the technical proof manifest; and
9. leave the exact unpublished worktree runnable and stop with the Spec Executor Implementation Review Packet.

No later SPEC-0003 implementation follows. A rejected visible result returns to a separately authorized correction executor.

## 10. Proof and human-review contract

### 10.1 Permanent tester boundary

The permanent command remains:

```bash
npm run test:spec0001-browser
```

The executor runs it on the clean pre-edit activation base. The dirty SPEC-0003 result does not modify, extend, or pretend to be compatible with the SPEC-0001-only catalog.

After Arthur accepts the unpublished result and the Control Plane Architect completes reviewed propagation, the later publication task must create the reviewed local phase commit and rerun the permanent tester on that clean committed phase branch before any canonical-main integration or push. A failure stops publication. Every permanent tester/core/catalog/schema/fixture/proof byte must hash-match the activation base.

### 10.2 Dedicated SPEC-0003 proof

The dedicated proof uses the already-installed local Chrome and `playwright-core`; it adds no package or script entry. It must:

- use isolated browser profile/storage and a loopback-only server;
- deny and record browser, server, and child non-loopback traffic;
- run at exactly `1440x900`, `1024x768`, and `390x844`;
- capture source/catalog validation, base/result render facts, keyboard/focus/role facts, screenshots, console/page errors, network ledger, storage ledger, browser/version data, process/port cleanup, exact Git state, and exact path hashes;
- record the featured and all secondary bounding rectangles, computed title font sizes, border widths/colors, padding, DOM order, display/grid structure, and group gaps at every viewport;
- independently calculate and enforce every ratio and ordering threshold in section 3.2;
- prove the catalog and rendered DOM contain exactly four entries, one featured ID and three secondary IDs, exact titles/order/status, and no navigation/media/progress fields or interactive semantics;
- run TypeScript and focused lint, and compare full lint against the accepted current baseline without adding a changed-line/new-file finding;
- run `git diff --check`, `git diff --cached --check`, and an exact dirty-path/index audit;
- record ordered receipts through `recordSpec0003TutorialsProof.ts`; and
- pass independent rejection tests in `validateSpec0003TutorialsProof.ts` for changed/extra paths, missing/reordered receipts, wrong welcome text, equal-card geometry, wrong featured ID, missing/extra card, altered order/status, an interactive placeholder, media/delivery/progress data, focus failure, viewport overflow, protected-style drift, storage mutation, network violation, console/page error, or incomplete cleanup.

The manifest path is `output/spec-0003/single-implementation/proof-manifest.json`. The executor reports its SHA-256, byte length, exact dirty allowlist, assertion/action/screenshot counts, and every proven or unproven item.

### 10.3 Exact real-app acceptance flow

The browser proof must cover, with keyboard checks where applicable:

1. load Home with the welcome state safely controlled in isolated storage;
2. prove all existing Home header controls and retained Home cards are present with base-matching text, order, geometry, computed font, size, color, spacing, icon, and styling;
3. open Tutorials from the exact existing Home button and prove the Home header is absent;
4. prove exactly one `h1` with exact text `Welcome to Diamond Animator`;
5. prove `Start Here` is the sole featured placeholder, appears first, is full-width where required, and passes every dominance threshold at the current viewport;
6. prove the exact three secondary placeholders appear below it in the required order and grouping;
7. prove all four visibly say `COMING LATER`, expose only their exact title/status copy, are absent from the tab order, and have no button/link/disabled/media/player/progress behavior or data;
8. use Back and prove Home returns, Tutorials remains reachable, and focus returns to its Home card;
9. prove AI Credits is absent while My Project, Home AI Assistant, Export, AI Project Finalizer, AI Dashboard, Home, notification, and menu remain unchanged;
10. prove Home -> New -> Drawing and Home -> New -> Stick through the unchanged New Project surface;
11. prove Stick -> Creator -> Back preserves the current Phase 6 same-root flow;
12. prove Home -> Open -> Back with New/Open presentation unchanged;
13. seed one bounded isolated accepted Drawing record through the existing read-only SPEC-0002 storage contract, open it normally, assert its marker, refresh to Home, reopen it, and prove it was not mutated or lost;
14. prove protected Drawing Save/Open, Stick Save/Open, Undo/Redo, bounded Stick AI presentation, and Creator continuity have no source or visible regression attributable to SPEC-0003; and
15. prove zero Tutorials-attributable project/storage mutation, provider/API/search/Supabase/paid/external request, console error, page error, leak, port, profile, or child process.

### 10.4 Exact unpublished app review

The Spec Executor leaves the completed unpublished worktree available after technical proof and stops. Before any Control Plane Architect propagation or publication:

- the Project Manager gives Arthur the exact worktree-served loopback app copy, current screenshots from all three viewports, or both;
- Arthur checks the exact welcome heading, the large featured `Start Here` area, the three visibly smaller later cards, all four statuses, the missing Home header, Back behavior, and unchanged Home/New/Open/workspaces;
- Arthur explicitly accepts or rejects that exact copy; and
- any rejected copy returns to a new correction executor. No rejected runtime byte is propagated or published.

## 11. Acceptance and regression matrix

| ID | Required result |
| --- | --- |
| AC3-01 | Home Tutorials opens the full-screen page; no Home masthead, AI Dashboard, Home, notification, or menu control appears inside it; exactly one page-level Back is visible. |
| AC3-02 | Back returns to Home, keeps Tutorials reachable, and restores focus to the Tutorials card. |
| AC3-03 | The only `h1` says exactly `Welcome to Diamond Animator`. |
| AC3-04 | `Start Here` is the sole feature and passes every width/height/area/title/outline/padding/order threshold in section 3.2 at all three viewports. |
| AC3-05 | Exactly three secondary placeholders appear below the feature in the fixed order and remain clearly smaller and readable. |
| AC3-06 | Exactly four placeholders visibly say `COMING LATER`; none is interactive or contains media, delivery, duration, progress, completion, or analytics behavior/data. |
| AC3-07 | AI Credits is absent from Home; all retained Home cards and Home chrome remain present and visually unchanged. |
| AC3-08 | Home -> New -> Drawing, Home -> New -> Stick, Stick -> Creator -> Back, Home -> Open -> Back, and New/Open presentation remain working and unchanged. |
| AC3-09 | The isolated saved-Drawing open/reload/reopen flow preserves SPEC-0002 selection and stored bytes. |
| AC3-10 | Drawing, Stick, Creator, timelines, AI panels, buttons, colors, spacing, layouts, frames, Save/Open, Undo/Redo, and SPEC-0001 Phase 6 behavior have no attributable regression. |
| AC3-11 | Keyboard semantics, heading structure, focus order, contrast, reduced motion, target size, and all three viewport rules pass. |
| AC3-12 | The dedicated manifest independently validates; the clean permanent tester passes at the required pre-edit and pre-integration gates; its bytes remain unchanged. |
| AC3-13 | No provider, API, search, Supabase, non-loopback, external, paid, analytics, deployment, or Tutorials-attributable storage operation occurs. |
| AC3-14 | Arthur explicitly accepts the exact unpublished app copy before propagation or publication. |

## 12. Lifecycle, stop gates, and later control-plane ownership

Stop without implementation if the activation SHA is not exact/clean, another executor owns an overlapping worktree/system, the permanent tester fails on the clean base, a required change needs an 11th path, the SPEC-0001 core needs alteration, the feature is not measurably dominant, a placeholder becomes interactive, protected visual measurements drift, or any acceptance item cannot be proved.

After successful implementation:

```text
Spec Executor
  -> one implementation + technical proof
  -> Implementation Review Packet
  -> stop

Arthur and Project Manager
  -> exact unpublished visible review
  -> accept or reject

Control Plane Architect, only after acceptance and exclusive transfer
  -> verify accepted bytes and manifest
  -> update canonical spec/state/TODO/changelog/handoff/index/tree
  -> final tracked-state closeout
  -> PM Review Packet
  -> stop with empty index

Separate explicit publication task
  -> stage only accepted implementation and reviewed control-plane paths
  -> commit on the phase branch
  -> run clean permanent tester
  -> fast-forward only if canonical main is still exact and clean
  -> push normally and verify synchronization
```

Neither review packet authorizes Git publication. No one may implement real tutorial media or delivery under this spec.

## 13. Proposal verification record

| Gate | Result |
| --- | --- |
| Exact basis | Pass: the dedicated worktree started clean and detached at `7bfcdebc2763c6ed0ef3cf047b80cc1e15f6536a`; canonical `main` and `origin/main` resolved to the same SHA during the audit. |
| Required boot | Pass: `AGENTS.md`, the canonical control plane, active specs, architecture, relevant source, tester ownership, and the complete current proposal were read. |
| Owner correction and approval | Pass: the showcase-only outcome is fixed and approved through D-0030; the page has one exact welcome heading, one dominant feature, and three smaller placeholders, with no remaining visible product decision. |
| Live current behavior | Pass: real loopback browser evidence from the fresh proposal audit proved Tutorials and AI Credits are inert Home buttons, Home/header stay visible after each click, and no error/application request occurred. |
| SPEC-0001 conflict | Pass: Phase 6 is integrated and protected; its runtime/proof does not own `app/page.tsx`; its permanent tester is SPEC-0001-only and remains read-only. |
| SPEC-0002 conflict | Pass with protected overlap: completed Save/Open uses `app/page.tsx`; the corrected spec freezes its active-project/Open state and requires a saved-record reopen proof. |
| Featured hierarchy feasibility | Pass: the exact four runtime/style paths can express the measurable desktop/tablet/mobile hierarchy without global style or shared component changes. |
| One-bite lifecycle | Pass: one implementation only; D-0010 executor -> Arthur/PM review -> CPA propagation -> separate publication is explicit. |
| Generated tree | Pass: `bash scripts/update_memory.sh` and `bash scripts/update_memory.sh --check-only`; deterministic `project/project_structure.txt` SHA-256 is `4d531d2019293ca4daf530c9d03982d9df287fc531299e064302a1ad7c3d32f9`. |
| Proposal integrity | Pass: relative Markdown links, lifecycle wording, corrected-copy audit, `git diff --check`, and `git diff --cached --check`. |
| Exact scope | Pass: the index is empty; the dirty allowlist is exactly the five proposal/control-plane Markdown paths plus generated `project/project_structure.txt`; `docs/CURRENT_STATE.md`, `docs/DECISIONS.md`, runtime, style, test, fixture, dependency, configuration, and public-asset paths are unchanged. |
| Implementation/proof | Not run. The one implementation is Authorized/Not started but cannot begin until this activation is separately published. No runtime, test, fixture, dependency, configuration, service, deployment, or provider state changed in this approval task. |

Final approved state: **SPEC-0003 is Approved and active; its one single implementation is Authorized; Not started; activation publication is pending; the exact visible outcome is fixed and no product question remains.**
