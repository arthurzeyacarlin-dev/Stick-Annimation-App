"use client";

import { AppChrome as MainScreenHeader } from "@/src/components/chrome/AIcreditspage";
import { TutorialsScreen } from "@/src/components/tutorials/TutorialsScreen";
import { HelpHub } from "@/src/components/help/HelpHub";
import { AnimationWorkspace } from "@/src/components/workspace/AnimationWorkspace";
import { AnimationExportFlow } from "@/src/components/export/AnimationExportFlow";
import { ProjectRecoveryPrompt } from "@/src/components/recovery/ProjectRecoveryPrompt";
import { ProjectLibrary } from "@/src/components/project-library/ProjectLibrary";
import { ProjectPoster } from "@/src/components/project-library/ProjectPoster";
import { createProjectLibraryController } from "@/src/lib/project-library/projectLibraryController";
import { filterAndSortProjectEntries, formatProjectEditedAgo, type ProjectLibrarySnapshot } from "@/src/lib/project-library/projectLibraryModel";
import homeStyles from "@/src/components/home/HomeWorkspace.module.css";
import welcomeStyles from "@/src/components/account/welcomeOverlay.module.css";
import { createUntitledWorkspace, prepareCollectionWorkspace, prepareRecoveryWorkspace, WorkspaceBootstrap, type MountedWorkspace } from "@/src/lib/animation/unifiedWorkspaceBootstrap";
import { createAccountProjectRepositoryV2, createAccountProjectSourceReader, readAccountProjectV2 } from "@/src/lib/account/projectClient";
import { withAccountProjectWrite } from "@/src/lib/account/projectPending";
import { digestUnifiedProjectV2 } from "@/src/lib/animation/unifiedProjectStorageV2";
import { useAccountSession } from "@/src/components/account/AccountSessionProvider";
import { acquireProjectOpenLeaseV2 } from "@/src/lib/animation/unifiedProjectManagementV2";
import { UNIFIED_PROJECT_EDITOR_IDENTITY_EVENT_V2 } from "@/src/lib/animation/unifiedProjectRepositoryV2";
import type { ProjectCollectionEntry } from "@/src/lib/animation/unifiedProjectCollection";
import { listProjectCollection } from "@/src/lib/animation/unifiedProjectCollection";
import { useNotificationCenterV1 } from "@/src/components/notifications/NotificationCenterProvider";
import { publishNotificationNavigationIntentV1, registerNotificationNavigationHandlerV1 } from "@/src/lib/notifications/notificationNavigation";
import type { NotificationTargetV1 } from "@/src/lib/notifications/notificationContracts";
import type { ProjectRecoveryEnvelopeV1 } from "@/src/lib/animation/projectRecoveryContractV1";
import {
  claimProjectRecoveryDraftV1,
  discardProjectRecoveryDraftV1,
  getOrCreateProjectRecoverySessionIdV1,
  inspectProjectRecoveryDraftV1,
  writeProjectRecoveryDraftV1,
} from "@/src/lib/animation/projectRecoveryStorageV1";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readAccountJson, writeAccountJson } from "@/src/lib/account/accountDataClient";
import { getAppSettings } from "@/src/lib/account/appSettings";
import { CloseButton } from "@/src/components/ui/CloseButton";

// SPEC-0020 Phase 5: Home shows the account's most recently saved project, read
// with the same one list call the Open Project library uses (newest first). Only
// that one project is loaded for its preview picture; a failed preview never
// hides the card.
type RecentHomeState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "failed" }
  | { status: "ready"; entry: ProjectCollectionEntry; project: ProjectLibrarySnapshot | null; previewFailed: boolean };
const recentEntryKey = (entry: ProjectCollectionEntry) => `${entry.id}:${entry.sourceRevision ?? ""}:${entry.sourceDigest ?? ""}`;

type StartupRecoveryState =
  | { kind: "checking" }
  | { kind: "home" }
  | { kind: "valid"; envelope: ProjectRecoveryEnvelopeV1; message?: string }
  | { kind: "invalid"; error: string; envelope?: ProjectRecoveryEnvelopeV1; message?: string; allowContinueHome?: boolean };

type HomePreferencesV1 = {
  schema: "account-home-preferences/v1";
  welcomeSeen: boolean;
  neverShowWelcome: boolean;
  guidedChoices: string[];
};

const recoveryProblemMessage = (error: string) => {
  if (error === "recovery_storage_blocked") return "The local recovery store is busy in another tab. Close the other tab, then try again.";
  if (error === "recovery_candidate_missing") return "Part of the safety backup is missing, so it cannot be opened safely.";
  if (error === "recovery_asset_missing" || error === "recovery_asset_mismatch") return "An asset in the safety backup is missing or damaged.";
  if (error === "project_too_large" || error === "recovery_invalid_record") return "The safety backup is invalid, unsupported, or too large to open safely.";
  return "The safety backup could not be opened safely. Your officially saved projects are unchanged.";
};

const sameRecoveryGeneration = (left: ProjectRecoveryEnvelopeV1, right: ProjectRecoveryEnvelopeV1) =>
  left.ownerSessionId === right.ownerSessionId &&
  left.workspaceInstanceId === right.workspaceInstanceId &&
  left.draftSequence === right.draftSequence &&
  left.workspaceGeneration === right.workspaceGeneration &&
  left.candidateDigest === right.candidateDigest;

export default function Page() {
  const account = useAccountSession();
  const ownerId = account?.id;
  const createReader = useCallback(() => {
    if (!ownerId) throw new Error("account_session_required");
    return createAccountProjectSourceReader(ownerId);
  }, [ownerId]);
  const router = useRouter();
  const { snapshot: notificationSnapshot } = useNotificationCenterV1();
  const terraTargetKey = useMemo(() => JSON.stringify(notificationSnapshot.rows.filter(row => row.target.kind === "workspace-terra-turn").map(row => row.target)), [notificationSnapshot.rows]);
  const [view, setView] = useState<
    "home" | "help" | "tutorials" | "openProject" | "animationWorkspace" | "animationExport"
  >("home");
  const [exportOrigin, setExportOrigin] = useState<"home" | "workspace">("home");
  const [exportProjectId, setExportProjectId] = useState<string | null>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [welcomeStep, setWelcomeStep] = useState<0 | 1>(0);
  const [guidedChoices, setGuidedChoices] = useState<string[]>([]);
  const homePreferencesRef = useRef<{ revision: number; value: HomePreferencesV1 }>({
    revision: 0,
    value: { schema: "account-home-preferences/v1", welcomeSeen: false, neverShowWelcome: false, guidedChoices: [] },
  });
  const [bootstrap] = useState(() => new WorkspaceBootstrap());
  const [workspace, setWorkspace] = useState<MountedWorkspace | null>(null);
  const [bootstrapMessage, setBootstrapMessage] = useState<string | null>(null);
  const [startupRecovery, setStartupRecovery] = useState<StartupRecoveryState>({ kind: "checking" });
  const [recoveryBusyAction, setRecoveryBusyAction] = useState<"recover" | "discard" | null>(null);
  const homeFocusRef = useRef<"new" | "open" | "recent">("new");
  const recentButtonRef = useRef<HTMLButtonElement | null>(null);
  const [recentProject, setRecentProject] = useState<RecentHomeState>(() => ownerId ? { status: "loading" } : { status: "empty" });
  const recentPreviewRef = useRef<{ key: string; project: ProjectLibrarySnapshot } | null>(null);
  const [recentNotice, setRecentNotice] = useState<string | null>(null);
  const newProjectButtonRef = useRef<HTMLButtonElement | null>(null);
  const openProjectButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreHomeFocus = useRef(false);
  const homeMainRef = useRef<HTMLElement | null>(null);
  const homeScrollHideTimeoutRef = useRef<number | null>(null);
  const assistantButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreHelpFocusRef = useRef(false);
  const [helpFocus, setHelpFocus] = useState<"assistant" | "tutorials" | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setWelcomeOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void inspectProjectRecoveryDraftV1(ownerId).then(result => {
      if (cancelled) return;
      if (result.kind === "none") setStartupRecovery({ kind: "home" });
      else if (result.kind === "valid") setStartupRecovery({ kind: "valid", envelope: result.envelope });
      else setStartupRecovery({
        kind: "invalid",
        error: result.error,
        envelope: result.envelope,
        message: recoveryProblemMessage(result.error),
      });
    });
    return () => { cancelled = true; };
  }, [ownerId]);

  useEffect(() => {
    if (startupRecovery.kind !== "home") return;
    // Returning from Assistant continues the current visit without reopening setup.
    if (window.location.hash === "#ai-assistant" || window.location.hash === "#help") return;
    // First-time welcome (client-only)
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      void readAccountJson<HomePreferencesV1>("preferences", "home").then(record => {
        if (cancelled) return;
        const value = record?.value;
        const valid = value?.schema === "account-home-preferences/v1" && typeof value.welcomeSeen === "boolean" && typeof value.neverShowWelcome === "boolean" && Array.isArray(value.guidedChoices) && value.guidedChoices.every(choice => typeof choice === "string");
        const preferences = valid ? value : homePreferencesRef.current.value;
        homePreferencesRef.current = { revision: record?.revision ?? 0, value: preferences };
        setGuidedChoices(preferences.guidedChoices);
        if (!preferences.neverShowWelcome && !preferences.welcomeSeen) {
          setWelcomeStep(0);
          setWelcomeOpen(true);
        }
      }).catch(() => undefined);
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [startupRecovery.kind]);

  useEffect(() => {
    if (view !== "home" || startupRecovery.kind !== "home" || welcomeOpen) return;
    const restoreAssistantFocus = () => {
      if (window.location.hash === "#help") {
        // Assistant's back link returns to the Help page it was opened from.
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
        setHelpFocus("assistant");
        setView("help");
        return;
      }
      if (window.location.hash !== "#ai-assistant") return;
      const button = assistantButtonRef.current;
      if (!button) return;
      button.scrollIntoView({ behavior: "auto", block: "nearest" });
      button.focus({ preventScroll: true });
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    };
    const timeoutId = window.setTimeout(restoreAssistantFocus, 0);
    window.addEventListener("hashchange", restoreAssistantFocus);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("hashchange", restoreAssistantFocus);
    };
  }, [view, startupRecovery.kind, welcomeOpen]);

  useEffect(() => {
    if (view !== "home") return;

    const main = homeMainRef.current;
    if (!main) {
      return;
    }

    const handleScroll = () => {
      main.classList.add("is-scroll-active");
      if (homeScrollHideTimeoutRef.current !== null) {
        window.clearTimeout(homeScrollHideTimeoutRef.current);
      }
      homeScrollHideTimeoutRef.current = window.setTimeout(() => {
        main.classList.remove("is-scroll-active");
        homeScrollHideTimeoutRef.current = null;
      }, 350);
    };

    main.classList.remove("is-scroll-active");
    main.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      main.removeEventListener("scroll", handleScroll);
      main.classList.remove("is-scroll-active");
      if (homeScrollHideTimeoutRef.current !== null) {
        window.clearTimeout(homeScrollHideTimeoutRef.current);
        homeScrollHideTimeoutRef.current = null;
      }
    };
  }, [view]);

  useEffect(() => {
    if (view !== "home" || !restoreHelpFocusRef.current) return;

    const timeoutId = window.setTimeout(() => {
      const helpButton = assistantButtonRef.current;
      if (!helpButton) return;
      helpButton.scrollIntoView({behavior: "auto", block: "nearest"});
      helpButton.focus({preventScroll: true});
      restoreHelpFocusRef.current = false;
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [view]);

  useEffect(() => {
    if (view === "home" && restoreHomeFocus.current) {
      const target = homeFocusRef.current === "recent"
        ? recentButtonRef.current ?? newProjectButtonRef.current
        : homeFocusRef.current === "new"
        ? newProjectButtonRef.current
        : openProjectButtonRef.current;
      target?.focus();
      restoreHomeFocus.current = false;
    }
  }, [view]);
  useEffect(() => () => bootstrap.cancel(), [bootstrap, view]);
  useEffect(() => {
    const initialProjectId = workspace?.candidate.editor.project.projectId;
    if (!initialProjectId) return;
    let projectId = initialProjectId;
    let release = acquireProjectOpenLeaseV2(projectId, "editor");
    const identityChanged = (event: Event) => {
      const nextProjectId = (event as CustomEvent<{ projectId?: unknown }>).detail?.projectId;
      if (typeof nextProjectId !== "string" || nextProjectId === projectId) return;
      release();
      projectId = nextProjectId;
      release = acquireProjectOpenLeaseV2(projectId, "editor");
    };
    window.addEventListener(UNIFIED_PROJECT_EDITOR_IDENTITY_EVENT_V2, identityChanged);
    return () => {
      window.removeEventListener(UNIFIED_PROJECT_EDITOR_IDENTITY_EVENT_V2, identityChanged);
      release();
    };
  }, [workspace, ownerId]);

  useEffect(() => {
    if (view !== "home" || !ownerId) return;
    let cancelled = false;
    const controller = createProjectLibraryController(createReader);
    void controller.list().then(entries => {
      if (cancelled) return;
      const newest = filterAndSortProjectEntries(entries, "", "updated-desc").find(entry => entry.classification === "canonical") ?? null;
      setRecentNotice(null);
      if (!newest) {
        recentPreviewRef.current = null;
        setRecentProject({ status: "empty" });
        return;
      }
      const key = recentEntryKey(newest);
      const cached = recentPreviewRef.current?.key === key ? recentPreviewRef.current.project : null;
      setRecentProject({ status: "ready", entry: newest, project: cached, previewFailed: false });
      if (cached) return;
      void controller.evaluate(newest).then(project => {
        if (cancelled) return;
        recentPreviewRef.current = { key, project };
        setRecentProject(current => current.status === "ready" && recentEntryKey(current.entry) === key ? { ...current, project } : current);
      }).catch(() => {
        if (cancelled) return;
        setRecentProject(current => current.status === "ready" && recentEntryKey(current.entry) === key ? { ...current, previewFailed: true } : current);
      });
    }).catch(() => {
      if (!cancelled) setRecentProject(current => current.status === "ready" ? current : { status: "failed" });
    });
    return () => { cancelled = true; };
  }, [view, ownerId, createReader]);

  const openProject = useCallback(async (entry: ProjectCollectionEntry) => {
    const result = await bootstrap.open(() => prepareCollectionWorkspace(createReader(), entry));
    if (result.status === "opened") { setWorkspace(result.root); setView("animationWorkspace"); }
    return result;
  }, [bootstrap, createReader]);

  useEffect(() => {
    const targets = JSON.parse(terraTargetKey) as NotificationTargetV1[];
    const handles = targets
      .map(target => registerNotificationNavigationHandlerV1({
        target,
        handler: async target => {
          if (target.kind !== "workspace-terra-turn" || !target.projectId) return "unavailable";
          const mountedProjectId = workspace?.candidate.editor.project.projectId ?? null;
          if (mountedProjectId === target.projectId && view === "animationWorkspace") {
            publishNotificationNavigationIntentV1(target);
            return "handled";
          }
          if (workspace && (view === "animationWorkspace" || view === "animationExport")) return "blocked-unsaved";
          const matches = (await listProjectCollection(createReader()))
            .filter(entry => entry.classification === "canonical" && entry.sourceId === target.projectId);
          if (matches.length !== 1) return "unavailable";
          const result = await openProject(matches[0]);
          if (result.status !== "opened" || result.root.candidate.editor.project.projectId !== target.projectId) return "unavailable";
          publishNotificationNavigationIntentV1(target);
          return "handled";
        },
      }));
    return () => { for (const handle of handles) handle.unregister(); };
  }, [createReader, openProject, terraTargetKey, view, workspace]);

  const toggleGuidedChoice = (key: string) => {
    setGuidedChoices((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  };

  const closeWelcome = (opts?: { neverShow?: boolean; markSeen?: boolean }) => {
    const current = homePreferencesRef.current;
    const next: HomePreferencesV1 = {
      schema: "account-home-preferences/v1",
      welcomeSeen: current.value.welcomeSeen || Boolean(opts?.markSeen),
      neverShowWelcome: current.value.neverShowWelcome || Boolean(opts?.neverShow),
      guidedChoices: opts?.markSeen && guidedChoices.length ? [...guidedChoices] : current.value.guidedChoices,
    };
    homePreferencesRef.current = { ...current, value: next };
    void writeAccountJson("preferences", "home", next, current.revision).then(result => {
      if (homePreferencesRef.current.value === next) homePreferencesRef.current = { revision: result.revision, value: next };
    }).catch(() => undefined);
    setWelcomeOpen(false);
  };

  const recoverStartupDraft = async () => {
    if (startupRecovery.kind !== "valid" || recoveryBusyAction) return;
    const expectedEnvelope = startupRecovery.envelope;
    setRecoveryBusyAction("recover");
    try {
      const fresh = await inspectProjectRecoveryDraftV1(ownerId);
      if (fresh.kind === "none") {
        setStartupRecovery({ kind: "home" });
        return;
      }
      if (fresh.kind === "invalid") {
        setStartupRecovery({
          kind: "invalid",
          error: fresh.error,
          envelope: fresh.envelope,
          message: recoveryProblemMessage(fresh.error),
        });
        return;
      }
      if (!sameRecoveryGeneration(expectedEnvelope, fresh.envelope)) {
        setStartupRecovery({
          kind: "valid",
          envelope: fresh.envelope,
          message: "The safety backup changed in another tab. Review the updated project details, then choose again.",
        });
        return;
      }

      const prepared = await prepareRecoveryWorkspace(fresh.project, fresh.envelope, {
        readOfficialProject: projectId => ownerId
          ? readAccountProjectV2(ownerId, projectId)
          : Promise.reject(new Error("account_session_required")),
      });
      const ownerSessionId = getOrCreateProjectRecoverySessionIdV1(ownerId);
      const workspaceInstanceId = globalThis.crypto?.randomUUID?.() ?? `recovered-workspace-${Date.now()}`;
      const claimed = await claimProjectRecoveryDraftV1({
        expectedOwnerSessionId: fresh.envelope.ownerSessionId,
        expectedWorkspaceInstanceId: fresh.envelope.workspaceInstanceId,
        draftSequence: fresh.envelope.draftSequence,
        candidateDigest: fresh.envelope.candidateDigest,
        ownerSessionId,
        workspaceInstanceId,
      }, ownerId);
      if (typeof claimed === "string") {
        const latest = await inspectProjectRecoveryDraftV1(ownerId);
        if (latest.kind === "valid") {
          setStartupRecovery({ kind: "valid", envelope: latest.envelope, message: "The safety backup changed in another tab. Choose again." });
        } else if (latest.kind === "none") {
          setStartupRecovery({ kind: "home" });
        } else {
          setStartupRecovery({ kind: "invalid", error: latest.error, envelope: latest.envelope, message: recoveryProblemMessage(latest.error) });
        }
        return;
      }

      let recoveryEnvelope = claimed.envelope;
      if (prepared.detached) {
        const detachedProject = prepared.candidate.editor.project;
        const rewritten = await writeProjectRecoveryDraftV1({
          candidate: detachedProject,
          sourceProject: detachedProject,
          ownerSessionId,
          workspaceInstanceId,
          draftSequence: claimed.envelope.draftSequence + 1,
          workspaceGeneration: claimed.envelope.workspaceGeneration,
          lastMeaningfulEditAt: claimed.envelope.lastMeaningfulEditAt,
        }, {}, ownerId);
        recoveryEnvelope = rewritten.envelope;
        prepared.candidate.digest = rewritten.envelope.candidateDigest;
      }
      prepared.candidate.recoveryClaim = {
        ownerSessionId,
        workspaceInstanceId,
        draftSequence: recoveryEnvelope.draftSequence,
        workspaceGeneration: recoveryEnvelope.workspaceGeneration,
        candidateDigest: recoveryEnvelope.candidateDigest,
      };
      const result = await bootstrap.open(async () => prepared.candidate);
      if (result.status !== "opened") throw new Error(result.status === "failed" ? result.code : "recovery_changed");
      setWorkspace(result.root);
      setStartupRecovery({ kind: "home" });
      setView("animationWorkspace");
    } catch (error) {
      const code = error instanceof Error ? error.message : "recovery_storage_failed";
      setStartupRecovery({
        kind: "valid",
        envelope: expectedEnvelope,
        message: code === "recovery_conflict" || code === "recovery_stale_sequence"
          ? "The safety backup changed in another tab. Try again after closing the other copy."
          : recoveryProblemMessage(code),
      });
    } finally {
      setRecoveryBusyAction(null);
    }
  };

  const discardStartupDraft = async () => {
    if ((startupRecovery.kind !== "valid" && startupRecovery.kind !== "invalid") || recoveryBusyAction) return;
    const currentState = startupRecovery;
    setRecoveryBusyAction("discard");
    try {
      const validEnvelope = currentState.envelope;
      const result = await discardProjectRecoveryDraftV1(validEnvelope ? {
        kind: "valid",
        ownerSessionId: validEnvelope.ownerSessionId,
        workspaceInstanceId: validEnvelope.workspaceInstanceId,
        draftSequence: validEnvelope.draftSequence,
        candidateDigest: validEnvelope.candidateDigest,
      } : { kind: "invalid" }, ownerId);
      if (result === "discarded" || result === "none") {
        setStartupRecovery({ kind: "home" });
        return;
      }
      const latest = await inspectProjectRecoveryDraftV1(ownerId);
      if (latest.kind === "valid") setStartupRecovery({ kind: "valid", envelope: latest.envelope, message: "The safety backup changed before it could be discarded. Review it, then choose again." });
      else if (latest.kind === "none") setStartupRecovery({ kind: "home" });
      else setStartupRecovery({ kind: "invalid", error: latest.error, envelope: latest.envelope, message: recoveryProblemMessage(latest.error) });
    } catch (error) {
      const code = error instanceof Error ? error.message : "recovery_storage_failed";
      setStartupRecovery({
        kind: "invalid",
        error: code,
        envelope: currentState.envelope,
        message: "The safety backup could not be deleted because local storage is unavailable. You can continue without deleting it.",
        allowContinueHome: true,
      });
    } finally {
      setRecoveryBusyAction(null);
    }
  };

  if (startupRecovery.kind !== "home") {
    return (
      <ProjectRecoveryPrompt
        mode={startupRecovery.kind}
        projectName={startupRecovery.kind === "checking" ? undefined : startupRecovery.envelope?.sourceTitle}
        lastMeaningfulEditAt={startupRecovery.kind === "checking" ? undefined : startupRecovery.envelope?.lastMeaningfulEditAt}
        busyAction={recoveryBusyAction}
        message={startupRecovery.kind === "checking" ? null : startupRecovery.message ?? null}
        allowContinueHome={startupRecovery.kind === "invalid" && startupRecovery.allowContinueHome === true}
        onRecover={() => { void recoverStartupDraft(); }}
        onDiscard={() => { void discardStartupDraft(); }}
        onContinueHome={() => setStartupRecovery({ kind: "home" })}
      />
    );
  }

  return (
<div
  className="app"
  style={{
    height: "100vh",
    background: "var(--da-page, #030914)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden", // IMPORTANT: keep page scrollbar from being on <body>
  }}
>
      {(view === "home" || view === "help") && <MainScreenHeader theme="home" />}

{/* WELCOME OVERLAY (first-time guided setup) */}
{view === "home" && (
  <>
    <div
      aria-hidden={!welcomeOpen}
      className={welcomeStyles.scrim}
      onClick={(e) => {
        // IMPORTANT: Do NOT allow clicking outside the welcome to close it.
        // Users must choose buttons inside the welcome.
        e.stopPropagation();
      }}
      style={{
        // Shown or hidden instantly: no fade or movement.
        opacity: welcomeOpen ? 1 : 0,
        pointerEvents: welcomeOpen ? "auto" : "none",
      }}
    />

    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Diamond Animator"
      className={welcomeStyles.dialog}
      onClick={(e) => e.stopPropagation()}
      style={{
        opacity: welcomeOpen ? 1 : 0,
        pointerEvents: welcomeOpen ? "auto" : "none",
      }}
    >
  <div className={welcomeStyles.header}>
    <div className={welcomeStyles.heading}>
      <div className={welcomeStyles.eyebrow}>
        {welcomeStep === 0 ? "Welcome" : "Guided setup"}
      </div>
      <div className={welcomeStyles.title}>
        {welcomeStep === 0 ? "Welcome to Diamond Animator" : "Choose your guided setup"}
      </div>
    </div>

    <CloseButton label="Close welcome" onClick={() => closeWelcome({ markSeen: true })} />
  </div>

  {/* Step 0: intro */}
  {welcomeStep === 0 && (
    <>
      <div className={welcomeStyles.body}>
        Welcome to Diamond Animator. Would you like a guided setup?
      </div>

      <div className={welcomeStyles.actions}>
        <button
          type="button"
          className={`${welcomeStyles.button} ${welcomeStyles.primary}`}
          onClick={() => setWelcomeStep(1)}
        >
          Continue with guided setup
        </button>

        <button
          type="button"
          className={welcomeStyles.button}
          onClick={() => closeWelcome({ neverShow: true, markSeen: true })}
        >
          Don&apos;t show again
        </button>
      </div>
    </>
  )}

  {/* Step 1: choose guided setup */}
  {welcomeStep === 1 && (
    <>
      <div className={welcomeStyles.body}>
        What guided setup would you like?
      </div>

      <div className={welcomeStyles.choices}>
        <button
          type="button"
          className={`${welcomeStyles.choice} ${guidedChoices.includes("beginner") ? welcomeStyles.choiceSelected : ""}`}
          onClick={() => toggleGuidedChoice("beginner")}
        >
          <div className={welcomeStyles.choiceTitle}>Learn animation fundamentals</div>
          <div className={welcomeStyles.choiceText}>
            Smooth start + confidence boosters.
          </div>
        </button>

        <button
          type="button"
          className={`${welcomeStyles.choice} ${guidedChoices.includes("pro") ? welcomeStyles.choiceSelected : ""}`}
          onClick={() => toggleGuidedChoice("pro")}
        >
          <div className={welcomeStyles.choiceTitle}>Speed up your workflow</div>
          <div className={welcomeStyles.choiceText}>
            Faster production and efficient tools.
          </div>
        </button>

        <button
          type="button"
          className={`${welcomeStyles.choice} ${guidedChoices.includes("visionary") ? welcomeStyles.choiceSelected : ""}`}
          onClick={() => toggleGuidedChoice("visionary")}
        >
          <div className={welcomeStyles.choiceTitle}>Build ambitious animation projects</div>
          <div className={welcomeStyles.choiceText}>
            Scale your ideas with optional AI assistance.
          </div>
        </button>
      </div>

      <div className={welcomeStyles.actions}>
        <button
          type="button"
          className={`${welcomeStyles.button} ${welcomeStyles.primary}`}
          disabled={guidedChoices.length === 0}
          onClick={() => closeWelcome({ markSeen: true })}
        >
          Finish setup
        </button>

        <button
          type="button"
          className={welcomeStyles.button}
          onClick={() => closeWelcome({ neverShow: true, markSeen: true })}
        >
          Don&apos;t show again
        </button>
      </div>
    </>
  )}
    </div>
  </>
)}

      {/* HOME: presentation and the account's most recently saved project. */}
      {view === "home" && (
        <main ref={homeMainRef} className={`home-main-scroll ${homeStyles.main}`}>
          <div className={homeStyles.frame}>
            <section className={homeStyles.hero} aria-labelledby="home-heading">
              <div className={homeStyles.heroCopy}>
                <p className={homeStyles.eyebrow}><span aria-hidden="true" />YOUR CREATIVE STUDIO</p>
                <h1 id="home-heading" className={homeStyles.heading}>Make something move.</h1>
                <p className={homeStyles.description}>Bring an idea to life, pick up where you left off, or explore what your animation can become.</p>
                <button ref={newProjectButtonRef} type="button" className={homeStyles.newProject}
                  onClick={(event) => {
                    event.currentTarget.blur();
                    homeFocusRef.current = "new";
                    setBootstrapMessage("Creating project…");
                    void bootstrap.open(async () => {
                      if (!ownerId) throw new Error("account_session_required");
                      // SPEC-0020 Phase 3: new projects start at Settings → Frames per second.
                      const { newProjectFps } = await getAppSettings();
                      const candidate = await createUntitledWorkspace({ fps: newProjectFps });
                      const saved = await withAccountProjectWrite(ownerId, () => createAccountProjectRepositoryV2(ownerId).save(candidate.editor.project));
                      candidate.editor.project = saved;
                      candidate.id = saved.projectId;
                      candidate.title = saved.title;
                      candidate.digest = await digestUnifiedProjectV2(saved);
                      return candidate;
                    }).then((result) => {
                      if (result.status === "opened") { setWorkspace(result.root); setView("animationWorkspace"); setBootstrapMessage(null); }
                      else if (result.status === "failed") setBootstrapMessage(`Could not create project (${result.code}).`);
                    });
                  }}>
                  <span className={homeStyles.plus} aria-hidden="true">+</span>
                  <span><strong>New Project</strong><small>Start with a blank canvas</small></span>
                </button>
              </div>
              <div className={homeStyles.recent} aria-label="Recently edited project">
                {recentProject.status === "ready" ? (
                  <button ref={recentButtonRef} type="button" className={homeStyles.recentProjectButton}
                    aria-label={`Continue creating ${recentProject.entry.title}`}
                    onClick={() => {
                      homeFocusRef.current = "recent";
                      setRecentNotice(null);
                      // Same path as clicking the project in Open Project.
                      void openProject(recentProject.entry).then(result => {
                        if (result.status === "failed") setRecentNotice("This project couldn't be opened. Nothing was changed. Try it from Open Project.");
                      }).catch(() => setRecentNotice("This project couldn't be opened. Nothing was changed. Try it from Open Project."));
                    }}>
                    <p className={homeStyles.recentLabel}>PICK UP WHERE YOU LEFT OFF</p>
                    <div className={homeStyles.poster}>
                      {recentProject.project
                        ? <ProjectPoster key={recentProject.project.snapshot.projectDigest} project={recentProject.project} />
                        : <span className={homeStyles.posterStatus}>{recentProject.previewFailed ? "Preview unavailable" : "Loading preview…"}</span>}
                    </div>
                    <div className={homeStyles.recentFooter}>
                      <div className={homeStyles.recentTitle}><strong>{recentProject.entry.title}</strong><span>{formatProjectEditedAgo(recentProject.entry.updatedAt)}</span></div>
                      <span className={homeStyles.continue}>
                        Continue creating <span aria-hidden="true">→</span>
                      </span>
                    </div>
                  </button>
                ) : (
                  <div className={homeStyles.emptyRecent}>
                    {/* SPEC-0020 Phase 3 (Arthur): the same brush as the editor's Brush tool, not a pencil. */}
                    <svg className={homeStyles.emptyMark} viewBox="0 0 40 40" aria-hidden="true">
                      <line x1="9" y1="31" x2="29" y2="11" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
                      <path d="M29 2 C36 2 38 8 34 13 C32 16 30 18 29 19 C28 18 26 16 24 13 C20 8 22 2 29 2 Z" fill="currentColor" transform="rotate(-135 29 11)" />
                      <polygon points="29,16 27,13 31,13" fill="currentColor" />
                    </svg>
                    {recentProject.status === "loading" ? <p>Loading your recent project…</p>
                      : recentProject.status === "failed" ? <><p>Couldn&apos;t load your recent project</p><small>Your projects are still in Open Project.</small></>
                      : <><p>No recent projects edited</p><small>Your next creation starts here.</small></>}
                  </div>
                )}
                {recentNotice && <p className={homeStyles.recentNotice} role="status">{recentNotice}</p>}
              </div>
            </section>
            <nav className={homeStyles.shortcuts} aria-label="Studio shortcuts">
              <section className={homeStyles.shortcutGroup} aria-label="Projects">
                <button ref={openProjectButtonRef} type="button" className={homeStyles.shortcut}
                  onClick={(event) => {
                    event.currentTarget.blur();
                    homeFocusRef.current = "open";
                    setBootstrapMessage(null);
                    bootstrap.cancel();
                    setView("openProject");
                  }}>
                  <svg className={homeStyles.paperIcon} viewBox="0 0 36 36" fill="none" aria-hidden="true">
                    <rect x="5" y="3" width="26" height="30" rx="2" fill="currentColor" />
                    <path d="M10 10h16M10 16h17M10 22h14" stroke="#163663" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <span><strong>Open Project</strong><small>Continue a saved animation.</small></span>
                </button>
              </section>
              <section className={homeStyles.shortcutGroup} aria-label="Help">
                <button id="ai-assistant" ref={assistantButtonRef} type="button" className={homeStyles.shortcut}
                  onClick={(event) => {
                    event.currentTarget.blur();
                    setHelpFocus(null);
                    setView("help");
                  }}>
                  <svg className={homeStyles.robotIcon} viewBox="0 -2 34 36" fill="none" aria-hidden="true">
                    <path d="M17.55 10.2V8.15l-1.8-1.6 1.8-1.5v-2.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="17.55" cy="1.15" r="2.15" fill="currentColor" />
                    <rect x="7.4" y="10.6" width="19.2" height="15.6" rx="4.2" stroke="currentColor" strokeWidth="2.05" />
                    <path d="M7.4 16.45H4.45M29.55 16.45H26.6" stroke="currentColor" strokeWidth="2.05" strokeLinecap="round" />
                    <ellipse cx="13.5" cy="17.5" rx="1.7" ry="2.05" fill="currentColor" />
                    <ellipse cx="20.5" cy="17.5" rx="1.7" ry="2.05" fill="currentColor" />
                  </svg>
                  <span><strong>Help</strong><small>Ask the Assistant or learn the basics.</small></span>
                </button>
              </section>
            </nav>
            <div className={homeStyles.utility}>
              <span>Finished an animation? Take it with you.</span>
              <button type="button" onClick={() => { setExportOrigin("home"); setView("animationExport"); }}>Export animation <span aria-hidden="true">↗</span></button>
            </div>
          </div>
        </main>
      )}
{view === "help" && (
  <HelpHub
    initialFocus={helpFocus}
    onBack={() => {
      restoreHelpFocusRef.current = true;
      setView("home");
    }}
    onOpenAssistant={() => router.push("/assistant")}
    onOpenTutorials={() => setView("tutorials")}
  />
)}
{view === "tutorials" && (
  <TutorialsScreen
    onBack={() => {
      setHelpFocus("tutorials");
      setView("help");
    }}
  />
)}
{bootstrapMessage && view === "home" ? <div role="status" style={{ position: "fixed", bottom: 12, left: 12, color: "#f6f9ff", background: "#071120", border: "1px solid #163058", padding: 12, borderRadius: 12 }}>{bootstrapMessage}</div> : null}
{workspace && (view === "animationWorkspace" || (view === "animationExport" && exportOrigin === "workspace")) && (
  <div style={{ display: view === "animationWorkspace" ? "contents" : "none" }}>
    <AnimationWorkspace
      root={workspace}
      onExport={(savedProjectId) => { setExportProjectId(savedProjectId); setExportOrigin("workspace"); setView("animationExport"); }}
      onExit={() => {
        restoreHomeFocus.current = true;
        homeFocusRef.current = "new";
        setWorkspace(null);
        setExportOrigin("home");
        setView("home");
      }}
    />
  </div>
)}
{view === "animationExport" && (
  <AnimationExportFlow origin={exportOrigin} preferredProjectId={exportOrigin === "workspace" ? exportProjectId : null} onBack={() => setView(exportOrigin === "workspace" && workspace ? "animationWorkspace" : "home")} />
)}
{view === "openProject" && (
  <ProjectLibrary surface="combined" ownerId={ownerId} onOpenProject={openProject} onBack={() => {
    bootstrap.cancel();
    restoreHomeFocus.current = true;
    setView("home");
  }} />
)}
    </div>
  );
}
