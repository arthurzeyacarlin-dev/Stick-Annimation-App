# SPEC-0003 — Tutorials and Cleaner Home Screen

Status: Verified (accepted; publication/integration pending)
Owner: Arthur
Implementer: completed by one stopped product Spec Executor; accepted worktree transferred exclusively to the Control Plane Architect
Created: 2026-08-16
Last corrected: 2026-08-31
Lifecycle: the one product implementation is accepted and technically Verified; control-plane propagation is complete in the unpublished worktree and separate publication/integration remains pending
Owner outcome: fixed directly by Arthur on 2026-08-24; no visible product decision remains open in this spec
TODO ID: SPEC-003
Decision links: D-0030, D-0031, and D-0032 in `../DECISIONS.md`
Implementation basis: exact published prerequisite/canonical-main SHA `2cd25fd0bdfb8a775370641ffd65db315cc94532`; accepted ten-path product proof manifest SHA-256 `4b63e1dc171cf9536aecbed067f271793dffc17137200afc8d136e1072d04d6d`
Recovered proposal source: complete reference-only file at `/Users/arthurcarlin/.codex/worktrees/6aac/stick-animation-app/docs/specs/0003-tutorials-and-cleaner-home-screen.md`

## 1. Status and authorization boundary

This is Arthur's approved corrected product specification. D-0030 fixes the exact visible result, D-0031 records the tester prerequisite, and D-0032 records Arthur's acceptance of the completed product result. The one product implementation is now **accepted and technically Verified; publication/integration pending**.

SPEC-0001 Phases 1 through 6 are Verified, published, and integrated. Phase 6's corrected deterministic Stick chat is integrated in `caa6c2d946780f384d0a8c58f4ea75a771483bcd`, and its later canonical publication record is integrated at the current-main basis above. SPEC-0001 Phase 7 remains Unauthorized and Not started. SPEC-0002 is complete, protected, and integrated, including the realistic-size Drawing Save correction at `5c36870f7671033e30dc9341ba757e36c6572cc2`.

SPEC-0003 contains exactly **one small implementation** and no phases. Actual tutorial recording, video assets, playback, captions, delivery, progress, and analytics require a different future specification after the app is much more complete.

The D-0030 approval/activation is published in exact canonical-main commit `4cd1a98b2f0b53c89d50ede453d1ab14bccbc9c7`, and D-0031's authorization is published in `57ef6ff5ff9d2da7ca3ab1e154aac9f506cc6b81`. The accepted prerequisite plus reviewed records were published/integrated in exact canonical-main commit `2cd25fd0bdfb8a775370641ffd65db315cc94532`, and the corrected clean permanent tester passed before product implementation. The stopped product executor started from that exact SHA, changed only section 8.2's ten paths, proved the result, and left the unpublished worktree for Arthur's review. Arthur accepted that exact copy; the Project Manager accepted the recovered technical result; and the Control Plane Architect took exclusive ownership without changing any accepted product or proof byte.

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

- SPEC-0001 Phase 6 did not change `app/page.tsx`; its Stick runtime, UI, contracts, fixtures, and proof remain protected.
- SPEC-0002 did change `app/page.tsx` for validated Drawing Open behavior. SPEC-0003 may add only the narrow Tutorials local-view/focus transition there and must preserve active-project state, Open callbacks, component keys, and Save/Open behavior.
- D-0030 is published in `4cd1a98b2f0b53c89d50ede453d1ab14bccbc9c7`; no visible product decision remains open.
- the permanent tester's versioned catalog, schemas, contracts, recorder, validator, finalizers, action adapters, and plan-mode meanings remain protected. The shared runner alone contains one stale no-plan network rule: it predates Phase 6's mounted Stick availability check and rejects every `/api/ai` request outside the older Drawing step.
- D-0031 therefore authorizes one narrow tester-compatibility prerequisite before product work. It is infrastructure entry work, not a second product phase and not a waiver of the permanent gate.

No conflict requires splitting the work. The exact corrected result remains feasible as one implementation.

### 4.4 Fresh proven pre-implementation blocker

The clean command below was run in a dedicated worktree before any tracked edit at exact published base `4cd1a98b2f0b53c89d50ede453d1ab14bccbc9c7`:

```bash
npm run test:spec0001-browser
```

It failed during the first protected Stick flow with:

```text
AssertionError [ERR_ASSERTION]: Unexpected /api/ai request outside Drawing proof.
at browserRoute (.../scripts/runSpec0001BrowserProof.ts:1371:12)
```

The execution path is exact:

```text
app/page.tsx
  -> StickFigureWorkspace
  -> StickFigureRightPanel
  -> StickFigureAiPanel mount
  -> fetch("/api/ai", {
       method: "GET",
       headers: {
         "X-Diamond-AI-Workspace": "stick-figure",
         Accept: "application/json"
       },
       cache: "no-store"
     })
  -> app/api/ai/route.ts GET
  -> handleStickFigureAiAvailabilityGet
  -> resolveStickFigureAiAvailability
```

That GET is already-integrated, same-origin Phase 6 behavior. In the proof-scrubbed environment it is provider-free and resolves to `{"available":false,"reason":"server_not_configured"}`. The no-plan runner intercepts all browser requests first, reaches its older `/api/ai` assertion, and fails before the real route runs. Its two viewport Stick flows mount Stick once, open Creator, and mount Stick again after Back, so the protected flow produces exactly four such GETs in this order: two in `stick-1440x900`, then two in `stick-1024x768`.

The Phase 6 registered plan already has an explicit real-route mode for availability. The blocker is limited to the older no-plan branch. No Tutorials runtime, Home behavior, product API, or provider behavior is at fault.

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

## 8. Exact prerequisite and product touch matrices

### 8.1 Pre-implementation tester-compatibility prerequisite — exactly seven paths

After this D-0031 correction is separately published, one dedicated prerequisite Spec Executor may change only:

- `scripts/runSpec0001BrowserProof.ts`
- `scripts/fixtures/spec0001-browser/spec0003-prerequisite/v1/stick-availability-contract.json` (new)
- `scripts/fixtures/spec0001-browser/spec0003-prerequisite/v1/proof-commands.json` (new)
- `scripts/fixtures/spec0001-browser/spec0003-prerequisite/v1/proof-manifest.schema.json` (new)
- `scripts/spec0001-browser/spec0003TesterCompatibilityContract.ts` (new)
- `scripts/spec0001-browser/recordSpec0003TesterCompatibilityProof.ts` (new)
- `scripts/spec0001-browser/validateSpec0003TesterCompatibilityProof.ts` (new)

Ignored prerequisite proof output may exist only under `output/spec-0003/permanent-tester-prerequisite/**`.

The runner change is limited to its no-plan `browserRoute`/context ledger path. It must recognize and deterministically fulfill only the exact already-integrated availability GET contract in section 10.1. It may not continue that request to the real API route. It may not permit another method, path, origin, query, hash, body, workspace header, context, count, order, API request, or network destination.

Every existing tester path other than the shared runner remains byte-identical, including `package.json`, lockfiles, `browserTesterContract.ts`, `browserTesterExtensionContract.ts`, `networkDeny.cjs`, all existing v1–v6 fixtures/schemas/catalog entries/action adapters, all existing recorders/validators/finalizers, and all product/runtime files. The no-plan action, screenshot, driver, Drawing POST, production-scan, denial, and cleanup meanings remain exact. All registered plan selectors and Phase 3–6 registration meanings remain exact.

If the prerequisite needs an eighth tracked path, a product/runtime path, an existing fixture/schema/contract/proof path, a package/dependency/configuration path, or weaker network denial, its executor stops and returns the blocker.

### 8.2 One product implementation — exactly ten paths

Only after the accepted prerequisite is propagated and separately published may one product Spec Executor change these ten tracked paths:

#### Runtime and style — exactly four paths

- `app/page.tsx`
- `src/components/tutorials/TutorialsScreen.tsx` (new)
- `src/components/tutorials/TutorialsScreen.module.css` (new)
- `src/lib/tutorials/tutorialCatalog.ts` (new)

#### Dedicated fixture and technical proof — exactly six paths

- `scripts/fixtures/spec0003-tutorials/v1/browser-plan.json` (new)
- `scripts/fixtures/spec0003-tutorials/v1/proof-commands.json` (new)
- `scripts/spec0003-tutorials/browserProofContract.ts` (new)
- `scripts/runSpec0003TutorialsBrowserProof.ts` (new)
- `scripts/recordSpec0003TutorialsProof.ts` (new)
- `scripts/validateSpec0003TutorialsProof.ts` (new)

Ignored product proof output may exist only under `output/spec-0003/single-implementation/**` and must be collision-refusing, validated, and cleaned according to the proof contract.

Everything else is read-only. This includes:

- `AGENTS.md`, every canonical `docs/**` path, and `project/project_structure.txt` during Spec Executor work;
- `app/globals.css`, `app/layout.tsx`, and `src/components/chrome/AIcreditspage.tsx`;
- every New/Open/Drawing/Stick/Creator runtime not listed above;
- the accepted corrected SPEC-0001 runner and every other tester/core/catalog/schema/fixture/proof file at the prerequisite-publication base;
- every SPEC-0002 runtime/fixture/proof path other than the narrow shared `app/page.tsx` edit;
- `package.json`, lockfiles, dependencies, public assets, APIs, database files, configuration, environment, deployment, recovery material, and other worktrees.

If the product result needs any 11th tracked implementation path, the executor stops and returns the exact blocker. It does not expand scope itself.

## 9. One implementation workflow

This remains one product implementation, not phases. Before it starts, the separate infrastructure prerequisite follows D-0010:

1. publish this reviewed D-0031 control-plane correction;
2. start one new Plan-mode prerequisite Spec Executor from that exact clean publication SHA;
3. change only section 8.1's seven technical paths, create and independently validate the prerequisite proof, return its Implementation Review Packet, and stop;
4. Arthur and the Project Manager accept or reject the invisible technical result from the exact evidence; rejection returns to a separate correction executor;
5. after acceptance and exclusive transfer, a Control Plane Architect revalidates the bytes/proof, propagates the prerequisite result, returns its packet, and stops; and
6. a later explicit publication task publishes that accepted prerequisite and reruns the corrected clean permanent tester before canonical-main integration/push.

Only then does the one product executor perform these ordered steps inside one authorized task:

1. complete the required Plan-mode boot and fresh source/real-app audit from the exact prerequisite-publication SHA;
2. prove an empty index, no hidden flags, and the exact ten-path ceiling;
3. verify the exact accepted prerequisite-publication SHA, freeze all corrected permanent tester bytes, run the clean pre-edit permanent SPEC-0001 tester, and record its pass;
4. create only the six dedicated SPEC-0003 proof paths, then capture base Home/New/Open/Tutorials-card/AI-Credits behavior and retained-Home computed presentation at all three required viewports before changing runtime;
5. patch the four runtime/style paths narrowly;
6. run the complete dedicated result proof, including the featured-versus-secondary geometry checks, and compare every protected base measurement;
7. reread all touched code, rerun the exact user flow, and check regressions;
8. create and independently validate the technical proof manifest; and
9. leave the exact unpublished worktree runnable and stop with the Spec Executor Implementation Review Packet.

No second SPEC-0003 product implementation follows. A rejected visible result returns to a separately authorized correction executor. The prerequisite is a gate repair only; it may not implement or preview Tutorials.

## 10. Proof and human-review contract

### 10.1 Permanent tester boundary

The permanent command remains:

```bash
npm run test:spec0001-browser
```

At clean `4cd1a98b…`, this command is a proven failing gate because the no-plan runner rejects Phase 6's mounted Stick availability GET. The failure is not waived. The prerequisite must make only these exact requests test-owned and deterministic:

| Order | Context | Method/path | Required request facts | Test-owned response |
| --- | --- | --- | --- | --- |
| 1 | `stick-1440x900` | `GET /api/ai` | exact loopback app origin; no query/hash/body; `X-Diamond-AI-Workspace: stick-figure`; `Accept: application/json` | `200`, JSON, `cache-control: no-store`, exact body `{"available":false,"reason":"server_not_configured"}` |
| 2 | `stick-1440x900` | same | same | same |
| 3 | `stick-1024x768` | same | same | same |
| 4 | `stick-1024x768` | same | same | same |

The first GET follows Home -> New -> Stick. The second follows Creator -> Back remount. The same two mounts repeat at the second viewport. The runner fulfills these four requests itself, records their exact context/order/request/response evidence, and does not let them reach the real Next route.

Everything else stays fail-closed:

- `requestRecords` remains exactly one deterministic mocked Drawing `POST /api/ai`; availability GETs never enter that Drawing ledger;
- a missing, extra, reordered, repeated, wrong-context, wrong-origin, wrong-method, wrong-path, queried, hashed, body-bearing, wrong-header, or wrong-response availability event fails;
- any other `/api/ai` request outside the exact Drawing POST and four exact availability GETs fails;
- browser/WebSocket/server/child non-loopback traffic and provider/OpenAI/search/Supabase/paid traffic remain denied;
- the real `/api/ai` route count remains exactly zero in the no-plan run;
- the no-plan suite remains exactly 40 ordered operations, 13 screenshots, 4 tester-driver messages, 37 historical negative cases, and one Drawing POST; and
- Phase 3, Phase 4, Phase 5, and Phase 6 registration self-tests must pass with unchanged meanings.

The prerequisite's dedicated proof manifest is `output/spec-0003/permanent-tester-prerequisite/proof-manifest.json`. Its recorder binds the future D-0031 publication SHA as `baseCommit` and `headCommit`, binds `4cd1a98b2f0b53c89d50ede453d1ab14bccbc9c7` as the unchanged product-runtime reference, and runs the exact ordered command fixture. At minimum that fixture includes:

```bash
node --experimental-strip-types scripts/spec0001-browser/validateSpec0003TesterCompatibilityProof.ts --self-test
./node_modules/.bin/tsc --noEmit --incremental false
node --experimental-strip-types scripts/spec0001-proof/measureSpec0001LintRegression.ts --base=<D-0031-publication-SHA>
git diff --check
git diff --cached --check
npm run test:spec0001-browser -- --self-test=phase-3-registration
npm run test:spec0001-browser -- --self-test=phase-4-registration
npm run test:spec0001-browser -- --self-test=phase-5-registration
npm run test:spec0001-browser -- --self-test=phase-6-registration
npm run test:spec0001-browser
git status --short --branch
```

The independent validator must reject missing/extra/reordered receipts or artifacts; wrong base/head/runtime-reference SHA; changed, extra, staged, hidden, or symlinked paths; any product/runtime byte change; any existing tester path change other than the runner; a runner diff outside the no-plan availability handling/ledger; wrong availability request/response/context/order/count; a changed Drawing POST/action/screenshot/driver/negative count; any real API-route or non-loopback request; altered plan selector/registration meaning; console/page errors; and incomplete source/anchor/process/port/profile/output cleanup.

After the prerequisite is accepted, propagated, and published, the product executor runs this corrected clean command on its pre-edit base. The dirty SPEC-0003 product result does not modify or extend the corrected SPEC-0001 tester. After Arthur accepts the unpublished product result and the Control Plane Architect completes reviewed propagation, the later product publication task reruns the corrected permanent tester on the clean committed product branch before any canonical-main integration or push. A failure stops publication. Every corrected tester byte must hash-match the prerequisite-publication base.

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
| AC3-12 | The prerequisite is accepted and published first; its dedicated manifest independently validates; the corrected clean permanent tester passes at the product pre-edit and pre-integration gates; its corrected bytes remain unchanged during product work. |
| AC3-13 | No provider, API, search, Supabase, non-loopback, external, paid, analytics, deployment, or Tutorials-attributable storage operation occurs. |
| AC3-14 | Arthur explicitly accepts the exact unpublished app copy before propagation or publication. |

## 12. Lifecycle, stop gates, and later control-plane ownership

The product executor correctly did not start from `4cd1a98b…` or `57ef6ff…`. It started only after the accepted tester prerequisite was published/integrated at exact SHA `2cd25fd0bdfb8a775370641ffd65db315cc94532` and the corrected clean tester passed. It then completed the exact ten-path implementation from that base and stopped. Any correction to the now-accepted product or proof bytes requires a separately authorized Spec Executor rather than widening this result.

After prerequisite publication, the product executor stops without implementation if its exact base is not clean, the corrected permanent tester fails, another executor owns an overlapping worktree/system, a required product change needs an 11th path, a corrected tester byte would need alteration, the feature is not measurably dominant, a placeholder becomes interactive, protected visual measurements drift, or any acceptance item cannot be proved.

Prerequisite lifecycle:

```text
Prerequisite Spec Executor
  -> seven-path tester correction + dedicated technical proof
  -> Implementation Review Packet
  -> stop

Arthur and Project Manager
  -> accept or reject the technical evidence

Control Plane Architect, only after acceptance and exclusive transfer
  -> revalidate accepted bytes/proof
  -> propagate prerequisite result
  -> PM Review Packet
  -> stop with empty index

Separate explicit publication task
  -> publish prerequisite
  -> rerun corrected clean permanent tester
  -> only then hand exact canonical-main SHA to product executor
```

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

## 13. Accepted implementation and verification record

Arthur accepted the exact unpublished app copy from detached base/HEAD `2cd25fd0bdfb8a775370641ffd65db315cc94532`. The result changes exactly the four authorized runtime/style paths and six dedicated proof paths in section 8.2. The index remains empty and no accepted byte was staged, committed, merged, pushed, published, or deployed by the executor or this Control Plane Architect closeout.

The accepted visible result is exact:

- Home Tutorials opens a full-screen dark-navy/blue page with no Home header;
- the only `h1` is `Welcome to Diamond Animator`;
- one dominant blue-outlined `Start Here` card appears above `Create Your First Animation`, `Create with AI`, and `Finalize Your Animation` in that order;
- all four static non-interactive cards say `COMING LATER`;
- Back returns Home and restores focus to the Home Tutorials card; and
- the inert Home AI Credits card is removed while retained Home, New/Open, Drawing, Stick, Creator, AI-panel, persistence, and outside-service boundaries remain protected.

The fresh accepted technical manifest is `output/spec-0003/single-implementation/proof-manifest.json`, 3,084 bytes, SHA-256 `4b63e1dc171cf9536aecbed067f271793dffc17137200afc8d136e1072d04d6d`, with six successful receipts and four artifacts. It binds three screenshots and a three-viewport browser result for `1440×900`, `1024×768`, and `390×844`; 14 assertion groups; exact card copy/order/geometry/static semantics; Back/focus behavior; zero console/page errors; and zero API/external requests. TypeScript, focused lint with zero findings, both diff checks, the exact ten-path/empty-index audit, and independent manifest validation pass. Full lint remains the accepted repository baseline of 5 errors and 72 warnings with no accepted changed-path finding.

The original accepted proof output was erased before recovery. The regenerated screenshots and manifest prove the same accepted source result but are not claimed byte-identical to the historical manifest whose SHA-256 began `1059c0…`. The accepted product and proof source files are exact replay of the archived accepted patch stream. The Control Plane Architect revalidated the fresh manifest and froze/rechecked all ten accepted source hashes without altering them.

There is no dedicated tracked-state finalizer for SPEC-0003. The Control Plane Architect therefore used the existing manifest validator plus explicit memory, diff, link, lifecycle/status/handoff, exact-scope, accepted-hash, hidden-flag, process/port, index, and untracked-output checks required by this spec. Separate publication must stage only the reviewed implementation and control-plane paths, commit on the feature branch, rerun the corrected clean permanent tester, safely fast-forward a still-clean canonical `main`, push normally, and verify clean `0/0` synchronization.

## 14. Proposal verification record

| Gate | Result |
| --- | --- |
| Exact basis | Pass: the dedicated correction worktree started clean at published canonical-main SHA `4cd1a98b2f0b53c89d50ede453d1ab14bccbc9c7`; canonical `main` and `origin/main` resolved to the same SHA. |
| Required boot | Pass: `AGENTS.md`, the canonical control plane, active specs, architecture, relevant source, tester ownership, and the complete current proposal were read. |
| Owner correction and approval | Pass: the showcase-only outcome is fixed and approved through D-0030; the page has one exact welcome heading, one dominant feature, and three smaller placeholders, with no remaining visible product decision. |
| Clean blocker reproduction | Pass: before any tracked edit, `npm run test:spec0001-browser` failed at the old no-plan `/api/ai` assertion during the first Stick flow. The test-created temporary anchor edit and ignored output were removed; tracked source returned byte-identical to HEAD. |
| Phase 6 execution trace | Pass: mounted `StickFigureAiPanel` sends one protected same-origin `GET /api/ai` on each Stick mount; the two viewport flows mount before Creator and after Back, producing four exact GETs. The proof-scrubbed response is provider-free. |
| SPEC-0001 conflict | Blocker resolved in specification: Phase 6 runtime/proof remains protected; only one exact seven-path tester prerequisite is authorized, and only the no-plan runner availability rule may change. No gate is waived. |
| SPEC-0002 conflict | Pass with protected overlap: completed Save/Open uses `app/page.tsx`; the corrected spec freezes its active-project/Open state and requires a saved-record reopen proof. |
| Featured hierarchy feasibility | Pass: the exact four runtime/style paths can express the measurable desktop/tablet/mobile hierarchy without global style or shared component changes. |
| One-bite lifecycle | Pass: the Tutorials result remains one implementation only. The tester prerequisite follows its own executor -> Arthur/PM review -> CPA propagation -> separate publication chain and is not a product phase. |
| Generated tree and proposal integrity | Pass after correction: `bash scripts/update_memory.sh`, check-only, relative-link/lifecycle/stale-word audits, both diff checks, and exact scope checks. The generated tree remains deterministic and has no tracked content change. |
| Exact scope | Pass after correction: only the reviewed SPEC-0003/control-plane/testing-workflow Markdown paths are dirty; the index is empty; runtime, test, fixture, dependency, configuration, generated-tree, and public-asset bytes are unchanged. |
| D-0031 prerequisite implementation/proof | Pass, published, and integrated at `2cd25fd0bdfb8a775370641ffd65db315cc94532`: exact seven technical paths; independently validated 14,344-byte manifest SHA-256 `adc3ad5534027470e436d92c0cbeaa6bc51fd5821303bb008f771b57da91edb3`; 11 receipts; 29 artifacts; 40 operations; 13 screenshots; 4 messages; 37 historical negatives; four exact Stick GETs; one mocked Drawing POST; zero real API-route/non-loopback/provider attempts; no product/runtime byte changed. The corrected clean tester passed before the product executor edited. |
| Tutorials implementation/proof | Pass and accepted pending publication: exact ten technical paths from base/HEAD `2cd25fd0bdfb8a775370641ffd65db315cc94532`; independently validated 3,084-byte manifest SHA-256 `4b63e1dc171cf9536aecbed067f271793dffc17137200afc8d136e1072d04d6d`; 6 receipts; 4 artifacts; 3 viewports; 3 screenshots; 14 assertion groups; exact visible hierarchy/static semantics/Back-focus flow; TypeScript and focused lint pass; zero API/external request. The fresh regenerated proof output is not claimed byte-identical to the erased historical `1059c0…` manifest. |

Final accepted state: **SPEC-0003's one implementation is accepted and technically Verified in the unpublished worktree; control-plane propagation is complete and separate publication/integration remains pending. No next feature is authorized or started.**
