# SPEC-0013 — Version 1 Home Finalizer Removal and Shorter Home Scroll

Status: **Phase 1 Verified and accepted; publication explicitly authorized and in progress**
Owner: Arthur
Implementer: completed Phase 1 Spec Executor; current owner is the Control Plane Architect for authorized publication
Created: 2026-09-24
Last updated: 2026-09-24
Decision links: D-0135
TODO IDs: HOME-013; GIT-097
Baseline branch/commit: clean canonical `main`/`origin/main` at `8ddc534691a154d2f3ab25cceb61d91690446abb`
Last verified branch/commit: accepted seven-path result in `codex/spec0013-phase1-publication` before publication; immutable proof manifest SHA-256 `bf8e51c68fe67015a97a6428c39a73bffc2c7a92b08e2f326554a1cf35e2db63`
Authorization boundary: Arthur accepted the exact review copy and explicitly authorized control-plane propagation, commit, canonical-main integration and GitHub push on 2026-09-24. This authority covers only the accepted seven technical paths plus reviewed SPEC-0013 records; it does not authorize deployment, provider changes, any SPEC-0008 resumption, or SPEC-0014 implementation.

## 1. Exact goal

Diamond Animator Version 1 removes the visible **AI Project Finalizer — Apply final AI touches to your project** Home card because the card is inert and the feature is not part of the Version 1 launch scope.

The Home **Tools** section keeps **Export — Export your animation** as its only card and the final interactive card on Home. The Home scroll range becomes only as deep as the remaining content requires: at the bottom of the scroll, Export is fully visible with the existing intentional bottom breathing room and there is no former-Finalizer-sized blank tail.

The future idea of careful AI-assisted finishing is deferred, not claimed as implemented and not erased from historical planning. A later Version 2 specification may decide whether finishing belongs inside AI Animator or deserves a separate product surface.

SPEC-0013 has exactly **one implementation phase**:

1. **Phase 1 — Remove the inert Finalizer surface and shorten Home's intrinsic scroll range.**

## 2. Current behavior and evidence

### 2.1 Exact reproduction

At clean canonical `main` on 2026-09-24:

1. Open `/` after the startup recovery gate permits Home.
2. Dismiss the first-use welcome dialog when it appears.
3. Scroll the Home content to **Tools**.
4. Observe functional **Export** followed by **AI Project Finalizer**.
5. Activate **AI Project Finalizer**.

### 2.2 Visible and state result

- **Live verified:** the Finalizer card is visible as the final Home card.
- **Live verified:** activating it leaves the URL at `/`, leaves Home mounted, leaves the card visible and produces no new screen or other user-visible behavior.
- **Code verified:** the button in `app/page.tsx` has hover handlers and card styling but no `onClick` handler.
- **Code verified:** `HomeCardId` includes `aiProject` solely for that card's hover state.
- **Code verified:** Home owns its vertical scrolling through `main.home-main-scroll` with `overflowY: auto`, `30px` top padding and `60px` bottom padding. The page root remains fixed-height and overflow-hidden.
- **Code verified:** `app/globals.css` owns the accepted thin, activity-revealed/fading Home scrollbar presentation. The scrollbar style is not the cause of the excessive depth.
- **Code verified:** `src/lib/assistant/assistantKnowledge.ts` currently tells the guidance Assistant that the unavailable Finalizer has a non-working Home card. That fact becomes stale when the card is removed and needs one directly corresponding catalog correction.

### 2.3 Measured baseline and bounded target

Real Chromium measurements were taken against canonical port `3000`. The target column was also measured by removing only the Finalizer button from the live DOM as a transient diagnostic; it is not an implementation claim.

| Viewport | Current Home client/scroll height | Current maximum scroll | Diagnostic maximum after removing only Finalizer | Reduction |
| --- | ---: | ---: | ---: | ---: |
| `1440×900` | `810 / 1218` | `408px` | `290px` | `118px` |
| `1024×768` | `678 / 1218` | `540px` | `422px` | `118px` |
| `390×844` | `721 / 1303` | `582px` | `428px` | `154px` |

The larger compact reduction is expected because the Finalizer copy wraps and makes its card taller. The compact page remained `390px` wide with zero horizontal page overflow.

At the current maximum scroll, the final card ends approximately `60px` above the Home scroller's lower edge. The accepted target preserves that breathing room with Export as the final card; it does not collapse Export against the viewport edge.

Evidence labels: **live verified**, **code verified**, and **diagnostic projection only** for the post-removal measurements. No runtime byte changed while gathering this evidence.

## 3. Root cause and missing foundation

The extra Home depth is not a generic scrollbar defect. It is the intrinsic height of an obsolete final card plus the card stack's `24px` gap. The browser correctly represents that content height.

The smallest correct fix is therefore:

1. remove the Finalizer button and its icon/copy from the Home card tree;
2. remove its now-unused `aiProject` hover identity;
3. keep Export as the only Tools card;
4. let the existing intrinsic layout automatically shorten `scrollHeight` while retaining the current `60px` Home bottom padding; and
5. correct the guidance Assistant's one stale Finalizer/Home fact without changing Assistant behavior, provider policy or session semantics.

No custom scrollbar length, hard-coded scroll maximum, forced `min-height`, compensating spacer or manual scroll clamp is needed or allowed.

## 4. Scope

Phase 1 is limited to:

- removing the complete visible AI Project Finalizer Home button, icon, subtitle and hover state;
- making Export the only card under the existing Tools heading and the last interactive Home card;
- preserving Home's existing `60px` bottom padding while allowing the content/scroll range to shrink naturally;
- keeping the existing Home scrollbar owner, activity/fade behavior, colors, width and track/thumb styling unchanged;
- refreshing only the guidance Assistant's checked-in Finalizer availability fact so it truthfully says that Finalizer is not included on the Version 1 Home screen and remains unshipped future intent;
- advancing the local guidance catalog identity/source binding only as required for that factual correction, without changing saved chat content or behavior;
- adding narrow deterministic and real-browser proof for the exact removal, scroll bounds, responsive layout, keyboard order, Export route and protected regressions; and
- preserving the future concept in the accepted control-plane record after implementation acceptance.

## 5. Non-goals

Phase 1 does **not**:

- build, prototype, route, hide-behind-a-flag or otherwise implement AI Project Finalizer;
- add smoothing, blur, glow, cleanup, finishing or animation-polishing behavior;
- change the Export card's appearance, wording, route, project selection, rendering, encoding, audio, destination, progress, cancellation, Finder/download or failure behavior;
- redesign, reorder, rename or restyle Workspace, Learn, Tools or any remaining card;
- alter the Home header, welcome flow, recovery startup gate, menu, notification preview or AI Dashboard link;
- change global or Home scrollbar CSS, fade timing, thumb/track styling, scrollbar gutter, body/root overflow or another screen's scrolling;
- add a fixed Home height, artificial spacer, manual scroll limit or viewport-specific scroll hack;
- change AI Assistant sessions, reasoning, Terra prompts other than the directly required factual catalog projection, search, citations, dictation, reveal, limits, persistence, retry, offline recovery or provider behavior;
- change AI Animator, the Animation Workspace, drawing/manual tools, timeline, playback, Save/Open/Save As/Save and Exit, recovery, My Projects or Tutorials;
- resume, rewrite or implement any paused SPEC-0008 phase;
- delete historical Finalizer references from completed specs, decisions, changelogs, proof or archive material;
- add a dependency, environment variable, schema migration, database change, credential, API, external request, provider call or paid operation; or
- implement any product/runtime change in this planning task.

## 6. Canonical user flow

### 6.1 Home flow

1. User opens Diamond Animator at `/`.
2. Existing startup recovery and welcome behavior completes unchanged.
3. Home shows the existing Workspace cards, Learn cards and Tools heading in the existing order.
4. Tools contains exactly one card: **Export — Export your animation**.
5. AI Project Finalizer text, icon, subtitle and interactive semantics are absent from the rendered DOM and accessibility tree.
6. User scrolls to the bottom.
7. Export is fully visible and ends with approximately the existing `60px` lower breathing room.
8. The scroller stops there; it does not preserve the old Finalizer depth as blank space.
9. Activating Export follows the already accepted SPEC-0009 Home → Export flow without behavioral change.

### 6.2 Guidance fact flow

1. A user opens the existing AI Assistant.
2. A question about AI Project Finalizer retrieves the local Finalizer knowledge entry.
3. The supplied fact says Finalizer is not included in Version 1 and remains unshipped future intent with no confirmed release date.
4. It does not tell the user to locate or activate a removed Home card.
5. No search, provider-policy, session, persistence, project or animation behavior changes because of this catalog-only fact correction.

## 7. Execution path

### 7.1 Current Home path

```text
app/page.tsx Page
  → view === "home"
  → main.home-main-scroll
      padding-bottom: 60px
      overflow-y: auto
  → Tools section
  → card stack with 24px gap
      → Export button
          → setExportOrigin("home")
          → setView("animationExport")
      → AI Project Finalizer button
          → hover state only
          → no activation handler
```

`app/globals.css` styles `.home-main-scroll` and its activity state. That styling is protected.

### 7.2 Target Home path

```text
app/page.tsx Page
  → view === "home"
  → main.home-main-scroll (same owner/style/padding)
  → Tools section
  → card stack
      → Export button (same handler and presentation)
      → end of Home content
  → browser computes the shorter intrinsic scrollHeight
```

### 7.3 Target guidance path

```text
AI Assistant request
  → retrieveKnowledge(request)
  → existing mandatory Finalizer entry
  → corrected Version 1 unavailable/deferred fact
  → existing Assistant provider/request/session path unchanged
```

There is no Home state migration, project mutation, persisted animation change, Export change or new Finalizer route.

## 8. Data, AI, cost, security and privacy impact

### 8.1 Project and persistence data

- Project schema/version/migration: none.
- Save/Open/Save As/Save and Exit/recovery: unchanged.
- Existing Assistant chat database/session schema: unchanged.
- Existing saved Assistant messages and titles: unchanged.
- Browser storage keys or limits: unchanged.

### 8.2 AI

- Model: fixed existing Terra behavior unchanged.
- Reasoning levels/default: unchanged.
- Prompt behavior: unchanged except that the supplied local Finalizer fact must no longer claim a Home card exists.
- Search/tools/citations/dictation/reveal/retry/offline behavior: unchanged.
- AI Animator and SPEC-0008: untouched and paused.

The executor must trace whether the knowledge-catalog identity requires a narrow version/source-binding advance. If advanced, the change must preserve existing saved sessions and use the existing restart/interruption handling for any transient in-flight job; historical accepted SPEC-0012 proof bytes remain immutable and any regression adaptation is additive under SPEC-0013.

### 8.3 Cost, security and privacy

- Real provider requests: zero during deterministic and browser proof.
- Paid calls: zero.
- New credentials/secrets: none.
- Authentication, ownership and rate limits: unchanged.
- New user data sent/stored/logged/deleted: none.
- External network traffic: zero; loopback app traffic only.

## 9. Touch matrix

| System/file | Intended Phase 1 change | Why required | Protected behavior |
| --- | --- | --- | --- |
| `app/page.tsx` | Remove `aiProject` from `HomeCardId` and remove the complete Finalizer button subtree | Removes the inert card and naturally shortens Home content | Every remaining Home card, Export handler, section spacing, `60px` bottom padding, recovery/welcome/view state |
| `src/lib/assistant/assistantKnowledge.ts` | Correct only the Finalizer entry's current-availability/Home wording and its verification/source binding | Prevents guidance from describing a removed card | Retrieval, other entries, base instructions, search instructions, provider and session behavior |
| `src/lib/assistant/assistantContracts.ts` | Only if required by the traced catalog contract: advance the catalog identity without changing schemas/limits/model/reasoning | Keeps the checked-in fact set honestly versioned | All session/request/job shapes, validation, costs, limits and stored chats |
| Additive `scripts/spec0013-home/phase1*.ts` proof files | Static oracle, real-browser flow, protected regression adapter, recorder and independent validator | Produces exact evidence without editing historical proof | Every accepted SPEC-0001–0012 proof/runtime meaning |
| `app/globals.css` | **No change allowed** | Existing scrollbar styling is correct | Home/global scrollbar appearance, activity and fade behavior |
| SPEC-0008 and animation/project systems | **No change allowed** | Outside this one-card cleanup | All accepted product state and paused AI Animator boundary |

### 9.1 Proposed Phase 1 technical ceiling

The activation review should bind an exact additive ceiling no broader than these runtime/proof families:

1. `app/page.tsx`
2. `src/lib/assistant/assistantKnowledge.ts`
3. `src/lib/assistant/assistantContracts.ts` only if the catalog identity must advance
4. `scripts/spec0013-home/phase1Oracle.ts`
5. `scripts/spec0013-home/phase1BrowserProof.ts`
6. `scripts/spec0013-home/phase1Regressions.ts`
7. `scripts/spec0013-home/recordPhase1Proof.ts`
8. `scripts/spec0013-home/validatePhase1Proof.ts`

If implementation requires another runtime, package, configuration, API, storage, provider, animation, Export or CSS path, the Spec Executor must stop and return to Project Manager review. Ignored proof artifacts belong only under `output/spec-0013/phase-1/`.

## 10. One-phase implementation plan

### Phase 1 — Remove the inert Finalizer surface and shorten Home's intrinsic scroll range

1. Start from the exact separately authorized clean canonical-main SHA in Plan mode.
2. Re-run the Home code trace and real-browser baseline before editing.
3. Confirm the Finalizer is still inert and no new legitimate runtime owner has appeared.
4. Remove only the Finalizer button subtree and the unused `aiProject` hover identity.
5. Keep Export's card bytes/handler and Home scrollbar CSS unchanged except for formatting that is mechanically unavoidable and proven semantic-zero.
6. Correct the directly stale Finalizer knowledge fact. Advance the catalog identity only if required by the current contract and prove existing saved sessions remain valid.
7. Add narrow static/browser proof and additive adapters for intentionally superseded Finalizer-presence/catalog-version assertions. Do not edit accepted historical proof files.
8. Verify the exact user flow, scroll geometry, accessibility tree, tab order and Export behavior at every required viewport.
9. Run protected Home, Assistant, Export, project, recovery and workspace regressions with zero external/provider calls.
10. Re-read every touched runtime and proof file, run the independent manifest validator and return the Spec Executor Implementation Review Packet.
11. Stop. Do not update canonical records, stage, commit, merge, push, publish or begin another phase.

No second product phase exists. After Arthur and the Project Manager accept Phase 1, one Control Plane Architect may take exclusive ownership and record the accepted result. Publication remains a later separate instruction.

## 11. Acceptance criteria

### 11.1 Exact visible result

1. The Home screen contains no visible `AI Project Finalizer` text, subtitle or icon.
2. No Finalizer button/link/control appears in the DOM, accessibility tree, tab order or focus order.
3. Tools remains visible and contains exactly one card, Export.
4. Export remains visually identical except for becoming the last card.
5. Export is the final interactive Home control after ordinary forward keyboard traversal of the Home cards.
6. No disabled card, placeholder, empty card wrapper, former-card-height spacer or blank tail replaces Finalizer.

### 11.2 Scroll result

At an idle Home state with no startup dialog/recovery prompt covering the page:

| Viewport | Required Home `maxScroll` | Required bottom result |
| --- | ---: | --- |
| `1440×900`, DPR 1 | `290px ± 2px` | Export fully visible; its bottom is `60px ± 2px` above the Home scroller bottom |
| `1024×768`, DPR 1 | `422px ± 2px` | same |
| `390×844`, DPR 2 emulation | `428px ± 2px` | same; zero horizontal page overflow |

In addition:

- Home `scrollHeight` is intrinsic to remaining content and not hard-coded.
- The page/body does not become the Home vertical scroller.
- The Home scrollbar keeps its accepted activity/fade appearance and gutter.
- Scrolling stops after Export plus the existing bottom padding.
- Returning from Tutorials, Export, My Projects, Open Project or Assistant does not restore an impossible stale `scrollTop`; the browser clamps safely to the new maximum without blank content or focus loss.

### 11.3 Functional and factual result

1. Activating Export still enters the accepted Animation Export flow from Home.
2. Export's project chooser, destination and download behavior are byte/behavior protected.
3. New Project, Open Project, My Projects, Tutorials and AI Assistant still activate their accepted destinations.
4. Home header/menu/welcome/recovery behavior remains unchanged.
5. The local Finalizer knowledge entry states that AI Project Finalizer is not included in Version 1 and remains future/unshipped intent with no confirmed release date.
6. The knowledge entry does not direct a user to a removed Home card.
7. Existing saved Assistant chats validate and remain readable; no catalog correction deletes or blocks them.
8. No AI/provider/search/transcription request is made by Home or by deterministic proof.

### 11.4 Scope result

- No `app/globals.css` change.
- No package, lockfile, environment, database, schema, credential or API change.
- No AI Animator, workspace, editor, project, Export implementation, recovery or SPEC-0008 change.
- No historical spec/proof rewrite.
- Exactly one implementation phase.

Any failure above is a Phase 1 failure, even if the card appears gone.

## 12. Regression matrix

| ID | Protected flow | Why at risk | Required proof |
| --- | --- | --- | --- |
| REG-01 | Startup recovery gate and first-use welcome | Both precede Home rendering | Clean/no-draft Home plus valid/invalid recovery gate smoke; welcome can open/close unchanged |
| REG-02 | New Project | Shares Home view/card union and focus state | Button visible, keyboard reachable and opens the unified workspace |
| REG-03 | Open Project | Shares Home layout and return focus | Button opens existing Open Project flow and returns safely |
| REG-04 | My Projects | Shares Home layout and return focus | Button opens the accepted project library/movie path |
| REG-05 | Tutorials | Return uses `scrollIntoView` and focus restoration against the shortened scroller | Open/Back restores focus without excess scrolling or blank tail |
| REG-06 | AI Assistant | Home card and static Finalizer fact are adjacent scope | Open/Back focus works; saved chats, reasoning, search, citations, dictation and reveal protected; no real provider call |
| REG-07 | Export | Export becomes the last card | Identical card presentation/handler and accepted chooser route; focused Export regression suite |
| REG-08 | Home scrollbar | User explicitly requests shorter range, not a restyle | Computed metrics, screenshot and activity/fade class proof at three viewports |
| REG-09 | Keyboard/accessibility | Removing a button changes order | No Finalizer semantics; Export last; no serious/critical Axe findings; focus visible and stable |
| REG-10 | Animation Workspace and AI Animator | `app/page.tsx` owns their mount | Protected smoke proves no mutation/import/provider change; SPEC-0008 stays paused |
| REG-11 | Save/Open/recovery/project data | Shared shell changes can accidentally remount owners | Existing project/storage sentinels and protected suites remain unchanged |
| REG-12 | Network/cost | Assistant catalog is touched narrowly | Loopback-only request ledger; zero real provider/search/transcription/external/paid calls |

Historical Finalizer mentions in completed specifications, proof, decisions and changelog are intentionally not retested or rewritten; they are historical records, not live product paths.

## 13. Verification plan

### 13.1 Environment and evidence

- Fresh dedicated Phase 1 worktree from the exact later authorized canonical-main SHA.
- One loopback server on a phase-owned port, with exact PID/process-group/cwd/port ownership recorded.
- Chromium desktop `1440×900` DPR 1, medium `1024×768` DPR 1 and compact `390×844` DPR 2 emulation.
- Fresh/controlled browser storage fixtures for normal Home, welcome and recovery states.
- No real credential; provider/search/transcription egress denied; loopback only.
- Screenshots at Home top and maximum scroll for all three viewports.
- DOM/accessibility/card-order, bounding-rectangle, client/scroll-height, maximum-scroll, bottom-gap and horizontal-overflow receipts.
- Exact request, console/page-error, process/port and cleanup ledgers.

### 13.2 Fast deterministic gates

The activated executor must run at least:

```bash
git diff --check
npx tsc --noEmit
npx eslint app/page.tsx src/lib/assistant/assistantKnowledge.ts src/lib/assistant/assistantContracts.ts scripts/spec0013-home/*.ts
node --experimental-strip-types scripts/spec0013-home/phase1Oracle.ts
node --experimental-strip-types scripts/spec0013-home/phase1Regressions.ts
```

If `assistantContracts.ts` remains untouched, focused lint/diff/manifest scope must record that fact rather than staging a no-op edit.

### 13.3 Focused real-app flow

`phase1BrowserProof.ts` must:

1. reach Home through the real startup gate;
2. verify the exact remaining card sequence and Tools child count;
3. prove Finalizer absence in text, DOM, role tree and keyboard order;
4. measure scroll bounds and Export bottom gap at all three viewports;
5. prove scrollbar owner/class/activity/fade behavior without CSS mutation;
6. activate Export and verify the accepted Home Export entry path;
7. open/return from Tutorials and Assistant with correct focus/scroll clamping;
8. cover welcome and recovery overlays sufficiently to prove Home remains reachable;
9. record zero page errors, serious/critical Axe findings, horizontal overflow, external/provider requests and project mutations; and
10. restore every temporary browser/process/source condition.

### 13.4 Protected suites

- Run the additive SPEC-0013 regression adapter against the accepted SPEC-0012 Phase 6 oracles/protected browser sources while preserving their files and hashes.
- Run the relevant SPEC-0009 Export oracle/browser entry regression under its controlled test environment.
- Run focused New/Open/My Projects/Tutorials/workspace smoke through the permanent protected browser path or an exact source-hash-bound additive adapter.
- Run a focused production build. Any inherited whole-repository failure must match the exact pre-implementation baseline; no new or changed-file failure is allowed.

### 13.5 Proof manifest

The recorder binds:

- exact base/HEAD and empty index;
- exact dirty-path allowlist and source hashes;
- all command receipts and exit codes;
- browser metrics/screenshots/accessibility/network/error receipts;
- protected-regression source bindings and results;
- real-provider/external/paid call counts fixed at zero;
- unchanged protected runtime/proof hashes;
- process/port/source restoration; and
- `humanAcceptance: pending Arthur`.

The independent validator must reject at least wrong base, extra/missing path, changed runtime hash, edited historical proof, missing viewport, stale baseline, out-of-tolerance scroll metric, missing Export proof, Finalizer still present, altered scrollbar CSS, external request, missing cleanup and forged human acceptance.

Passing technical proof does not accept the visible result. Arthur and the Project Manager must review the app copy.

## 14. Implementation record

Arthur separately authorized Phase 1 from exact clean base `8ddc534691a154d2f3ab25cceb61d91690446abb`. One stopped Spec Executor produced the accepted seven-path result in dedicated worktree `/Users/arthurcarlin/.codex/worktrees/spec0013-phase1/stick-animation-app`, then transferred exclusive ownership to the Control Plane Architect after Arthur's visible PASS.

Exact accepted technical paths:

- `app/page.tsx`
- `src/lib/assistant/assistantContracts.ts`
- `src/lib/assistant/assistantKnowledge.ts`
- `scripts/spec0013-home/phase1Oracle.ts`
- `scripts/spec0013-home/phase1BrowserProof.ts`
- `scripts/spec0013-home/recordPhase1Proof.ts`
- `scripts/spec0013-home/validatePhase1Proof.ts`

The Finalizer card and its `aiProject` hover identity were removed. Export remains the final Home card. The existing Home scroll owner, bottom padding and scrollbar CSS were not changed. The Assistant's single Finalizer fact now truthfully states that the feature is absent from Version 1 and remains unshipped; the catalog identity advanced to `2026-09-24`. No Assistant request/provider/session behavior changed.

The immutable proof manifest is `output/spec-0013/phase-1/proof-manifest.json`, SHA-256 `bf8e51c68fe67015a97a6428c39a73bffc2c7a92b08e2f326554a1cf35e2db63`. Fresh independent validation returned `VALID`, bound all seven source files and ten evidence files, confirmed empty index/exact base/exact worktree, and rejected mutations across base, path, source, evidence, provider, CSS, scroll, acceptance and publication claims. The validator intentionally retains `humanAcceptance: pending Arthur`, `controlPlaneUpdated: false` and `gitPublication: false`; D-0135 is the later owner-acceptance record.

The review server on port `58080` was stopped before Control Plane Architect takeover and the port was verified closed. Browser tooling was closed. The ignored `.env.local` symlink used only to prove live Terra connectivity is excluded from publication.

## 15. Verification record

| Gate/flow | Pass/fail/skipped/unproven | Evidence |
| --- | --- | --- |
| Planning baseline and code trace | Pass for specification evidence only | Clean `8ddc534…`; direct trace of `app/page.tsx`, `app/globals.css` and Assistant catalog |
| Current Finalizer activation | Pass for reproduction | Live click left `/` and Home unchanged; Finalizer remained visible |
| Current responsive scroll measurements | Pass for specification evidence | `408px`, `540px`, `582px` current maxima at required viewports |
| Transient DOM-removal target projection | Pass as diagnostic only | `290px`, `422px`, `428px`; no source/runtime edit |
| Phase 1 implementation | Pass | Exact seven-path result from base `8ddc534…`; empty index; accepted source allowlist above |
| Phase 1 technical proof | Pass | Manifest SHA-256 `bf8e51c…db63`; 12 oracle and 28 real-browser checks; independent validator `VALID` with nine negative mutation classes |
| Responsive Home result | Pass | `1440×900`, `1024×768`, `390×844`; Export last; approximately 60px bottom gap; no horizontal overflow; main remains scroll owner |
| Protected behavior | Pass with one inherited build limitation | Export/Assistant navigation, saved Assistant schema, Home card order, scrollbar activity/fade and zero automated provider calls passed; focused TypeScript/lint passed |
| Production build | Inherited failure only | Product compilation completed; generated PageProps/SearchParams typing still fails in untouched dev AI-cost pages, matching the inherited baseline |
| Live Terra connectivity | Pass, supplemental | Workspace Terra and AI Assistant each returned a short live reply after ignored local credential linkage; no secret or credential byte enters Git |
| Arthur visible acceptance | Pass | Arthur explicitly called the corrected review copy a PASS on 2026-09-24 |
| Publication | Authorized/in progress | Arthur explicitly authorized propagation, commit, canonical-main integration and GitHub push; final commit/synchronization is recorded in the terminal closeout successor |

## 16. Final state and handoff

Current state: **Phase 1 Verified and visibly accepted; exact publication explicitly authorized and in progress.**

Proven now:

- the inert Finalizer surface is absent from Home and accessibility/keyboard order;
- Export is the sole Tools card, remains functional and ends with the existing bottom breathing room;
- Home's scroll range shortens intrinsically with no scrollbar CSS or manual limit change;
- the guidance Assistant no longer directs users to a removed Finalizer card;
- existing saved Assistant data validates; and
- Home, Export, Assistant navigation, scroll behavior and zero-automated-provider boundaries passed focused proof.

Not claimed:

- no AI Project Finalizer feature was built;
- no Export, AI Animator, workspace/project, recovery, dependency, environment, provider, deployment or paused SPEC-0008 behavior changed;
- physical-device/non-Chromium coverage remains unproven; and
- the inherited untouched dev AI-cost generated-type build failure remains.

Exact next step: publish only the accepted seven technical paths plus reviewed SPEC-0013 control-plane paths, fast-forward clean canonical `main`, push normally, preserve proof, complete D-0054 cleanup, record exact synchronization, and then begin SPEC-0014 with a fresh planning task only after Arthur defines its goal.
