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
import type { ProjectLibrarySnapshot } from "@/src/lib/project-library/projectLibraryModel";
import homeStyles from "@/src/components/home/HomeWorkspace.module.css";
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

// Visit-only UI memory; login/logout reloads reset it. No persistent writes.
const visitRecentProjectIds = () => {
  if (typeof window === "undefined") return new Map<string, string>();
  // Keep Home's visit-only UI memory across client-side route remounts.
  const visitWindow = window as Window & { diamondHomeRecentProjects?: Map<string, string> };
  return visitWindow.diamondHomeRecentProjects ??= new Map<string, string>();
};
type RecentHomeProject = { entry: ProjectCollectionEntry; project: ProjectLibrarySnapshot };

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
  const recentProjectIdRef = useRef<string | null>(ownerId ? visitRecentProjectIds().get(ownerId) ?? null : null);
  const [recentProject, setRecentProject] = useState<RecentHomeProject | null>(null);
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
    recentProjectIdRef.current = projectId;
    if (ownerId) visitRecentProjectIds().set(ownerId, projectId);
    let release = acquireProjectOpenLeaseV2(projectId, "editor");
    const identityChanged = (event: Event) => {
      const nextProjectId = (event as CustomEvent<{ projectId?: unknown }>).detail?.projectId;
      if (typeof nextProjectId !== "string" || nextProjectId === projectId) return;
      release();
      projectId = nextProjectId;
      recentProjectIdRef.current = projectId;
      if (ownerId) visitRecentProjectIds().set(ownerId, projectId);
      release = acquireProjectOpenLeaseV2(projectId, "editor");
    };
    window.addEventListener(UNIFIED_PROJECT_EDITOR_IDENTITY_EVENT_V2, identityChanged);
    return () => {
      window.removeEventListener(UNIFIED_PROJECT_EDITOR_IDENTITY_EVENT_V2, identityChanged);
      release();
    };
  }, [workspace, ownerId]);

  useEffect(() => {
    if (view !== "home" || !ownerId || !recentProjectIdRef.current) return;
    const projectId = recentProjectIdRef.current;
    let cancelled = false;
    const controller = createProjectLibraryController(createReader);
    void controller.list().then(async entries => {
      const matches = entries.filter(entry => entry.classification === "canonical" && entry.sourceId === projectId);
      if (matches.length !== 1) {
        if (!cancelled) {
          setRecentProject(null);
          setRecentNotice("Open Projects to choose another saved animation.");
        }
        return;
      }
      const project = await controller.evaluate(matches[0]);
      if (!cancelled) {
        setRecentProject({ entry: matches[0], project });
        setRecentNotice(null);
      }
    }).catch(() => {
      if (!cancelled) {
        setRecentProject(null);
        setRecentNotice("Preview unavailable. Your saved projects are still in Projects.");
      }
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
    background: view === "home" || view === "help" || view === "tutorials" ? "#030914" : "rgb(26, 27, 36)",
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
      onClick={(e) => {
        // IMPORTANT: Do NOT allow clicking outside the welcome to close it.
        // Users must choose buttons inside the welcome.
        e.stopPropagation();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.50)",
        opacity: welcomeOpen ? 1 : 0,
        transition: "opacity 180ms ease",
        pointerEvents: welcomeOpen ? "auto" : "none",
        zIndex: 60,
      }}
    />

    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Diamond Animator"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top: 14,
        left: "50%",
        transform: welcomeOpen
          ? "translateX(-50%) translateY(0)"
          : "translateX(-50%) translateY(-18px)",
        opacity: welcomeOpen ? 1 : 0,
        transition: "transform 220ms ease, opacity 180ms ease",
        width: "min(860px, calc(100vw - 40px))",
        borderRadius: "12px",
        border: "1px solid rgba(110, 170, 255, 0.22)",
        background: "rgba(18,22,28,0.98)",
        boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
        padding: "16px 16px",
        zIndex: 70,
        pointerEvents: welcomeOpen ? "auto" : "none",
      }}
    >
  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px" }}>
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div
        style={{
          fontSize: "12px",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "rgba(180,220,255,0.75)",
        }}
      >
        {welcomeStep === 0 ? "Welcome" : "Guided setup"}
      </div>
      <div style={{ fontSize: "18px", fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>
        {welcomeStep === 0 ? "Welcome to Diamond Animator" : "Choose your guided setup"}
      </div>
    </div>

    <button
      aria-label="Close welcome"
      onClick={() => closeWelcome({ markSeen: true })}
      style={{
        appearance: "none",
        border: "none",
        background: "transparent",
        padding: "4px 8px",
        margin: 0,
        color: "rgba(255,255,255,0.85)",
        fontSize: "28px",
        lineHeight: 1,
        cursor: "pointer",
      }}
    >
      ×
    </button>
  </div>

  <div style={{ height: 10 }} />

  {/* Step 0: intro */}
  {welcomeStep === 0 && (
    <>
      <div style={{ color: "rgba(255,255,255,0.72)", fontSize: "13px", lineHeight: 1.55 }}>
        Welcome to Diamond Animator. Would you like a guided setup?
      </div>

      <div style={{ height: 12 }} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
        <button
          type="button"
          onClick={() => setWelcomeStep(1)}
          style={{
            padding: "10px 12px",
            borderRadius: "10px",
            border: "1px solid rgba(110, 170, 255, 0.30)",
            background: "rgba(110, 170, 255, 0.10)",
            color: "rgba(255,255,255,0.92)",
            fontSize: "13px",
            fontWeight: 650,
            cursor: "pointer",
            appearance: "none",
          }}
        >
          Continue with guided setup
        </button>

        <button
          type="button"
          onClick={() => closeWelcome({ neverShow: true, markSeen: true })}
          style={{
            padding: "10px 12px",
            borderRadius: "10px",
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.035)",
            color: "rgba(255,255,255,0.72)",
            fontSize: "13px",
            cursor: "pointer",
            appearance: "none",
          }}
        >
          Don&apos;t show again
        </button>
      </div>
    </>
  )}

  {/* Step 1: choose guided setup */}
  {welcomeStep === 1 && (
    <>
      <div style={{ color: "rgba(255,255,255,0.80)", fontSize: "13px", lineHeight: 1.55 }}>
        What guided setup would you like?
      </div>

      <div style={{ height: 12 }} />

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <button
          type="button"
          onClick={() => toggleGuidedChoice("beginner")}
          style={{
            textAlign: "left",
            padding: "12px 12px",
            borderRadius: "12px",
            border: guidedChoices.includes("beginner")
              ? "1px solid rgba(110, 170, 255, 0.50)"
              : "1px solid rgba(255,255,255,0.10)",
            background: guidedChoices.includes("beginner")
              ? "rgba(110, 170, 255, 0.10)"
              : "rgba(255,255,255,0.035)",
            color: "rgba(255,255,255,0.90)",
            cursor: "pointer",
            appearance: "none",
          }}
        >
          <div style={{ fontWeight: 750, fontSize: "13px" }}>Learn animation fundamentals</div>
          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: "12px", marginTop: 4 }}>
            Smooth start + confidence boosters.
          </div>
        </button>

        <button
          type="button"
          onClick={() => toggleGuidedChoice("pro")}
          style={{
            textAlign: "left",
            padding: "12px 12px",
            borderRadius: "12px",
            border: guidedChoices.includes("pro")
              ? "1px solid rgba(110, 170, 255, 0.50)"
              : "1px solid rgba(255,255,255,0.10)",
            background: guidedChoices.includes("pro")
              ? "rgba(110, 170, 255, 0.10)"
              : "rgba(255,255,255,0.035)",
            color: "rgba(255,255,255,0.90)",
            cursor: "pointer",
            appearance: "none",
          }}
        >
          <div style={{ fontWeight: 750, fontSize: "13px" }}>Speed up your workflow</div>
          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: "12px", marginTop: 4 }}>
            Faster production and efficient tools.
          </div>
        </button>

        <button
          type="button"
          onClick={() => toggleGuidedChoice("visionary")}
          style={{
            textAlign: "left",
            padding: "12px 12px",
            borderRadius: "12px",
            border: guidedChoices.includes("visionary")
              ? "1px solid rgba(110, 170, 255, 0.50)"
              : "1px solid rgba(255,255,255,0.10)",
            background: guidedChoices.includes("visionary")
              ? "rgba(110, 170, 255, 0.10)"
              : "rgba(255,255,255,0.035)",
            color: "rgba(255,255,255,0.90)",
            cursor: "pointer",
            appearance: "none",
          }}
        >
          <div style={{ fontWeight: 750, fontSize: "13px" }}>Build ambitious animation projects</div>
          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: "12px", marginTop: 4 }}>
            Scale your ideas with optional AI assistance.
          </div>
        </button>
      </div>

      <div style={{ height: 12 }} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
        <button
          type="button"
          disabled={guidedChoices.length === 0}
          onClick={() => closeWelcome({ markSeen: true })}
          style={{
            padding: "10px 12px",
            borderRadius: "10px",
            border: guidedChoices.length === 0
              ? "1px solid rgba(255,255,255,0.10)"
              : "1px solid rgba(110, 170, 255, 0.30)",
            background: guidedChoices.length === 0
              ? "rgba(255,255,255,0.035)"
              : "rgba(110, 170, 255, 0.10)",
            color: guidedChoices.length === 0
              ? "rgba(255,255,255,0.45)"
              : "rgba(255,255,255,0.92)",
            fontSize: "13px",
            fontWeight: 650,
            cursor: guidedChoices.length === 0 ? "not-allowed" : "pointer",
            appearance: "none",
          }}
        >
          Finish setup
        </button>

        <button
          type="button"
          onClick={() => closeWelcome({ neverShow: true, markSeen: true })}
          style={{
            padding: "10px 12px",
            borderRadius: "10px",
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.035)",
            color: "rgba(255,255,255,0.72)",
            fontSize: "13px",
            cursor: "pointer",
            appearance: "none",
          }}
        >
          Don&apos;t show again
        </button>
      </div>
    </>
  )}
    </div>
  </>
)}

      {/* HOME: presentation and visit-only recent-project state. */}
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
                      const candidate = await createUntitledWorkspace();
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
                {recentProject ? (
                  <button ref={recentButtonRef} type="button" className={homeStyles.recentProjectButton}
                    aria-label={`Continue creating ${recentProject.entry.title}`}
                    onClick={() => {
                      homeFocusRef.current = "recent";
                      void openProject(recentProject.entry).then(result => {
                        if (result.status === "failed") setRecentNotice("This project changed. Open Projects to choose its latest saved version.");
                      }).catch(() => setRecentNotice("This project could not be opened. Choose it from Projects."));
                    }}>
                    <p className={homeStyles.recentLabel}>PICK UP WHERE YOU LEFT OFF</p>
                    <div className={homeStyles.poster}>
                      <ProjectPoster key={recentProject.project.snapshot.projectDigest} project={recentProject.project} />
                    </div>
                    <div className={homeStyles.recentFooter}>
                      <div className={homeStyles.recentTitle}><strong>{recentProject.entry.title}</strong><span>Edited during this visit</span></div>
                      <span className={homeStyles.continue}>
                        Continue creating <span aria-hidden="true">→</span>
                      </span>
                    </div>
                  </button>
                ) : (
                  <div className={homeStyles.emptyRecent}>
                    <svg className={homeStyles.emptyMark} viewBox="0 0 48 48" fill="none" aria-hidden="true">
                      <path d="M10 37 13 27 31 9l8 8-18 18-11 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                      <path d="m28 12 8 8M13 27l8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    <p>No recent projects edited</p>
                    <small>Your next creation starts here.</small>
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
{bootstrapMessage && view === "home" ? <div role="status" style={{ position: "fixed", bottom: 12, left: 12, color: "white", background: "#182334", padding: 12, borderRadius: 8 }}>{bootstrapMessage}</div> : null}
{workspace && (view === "animationWorkspace" || (view === "animationExport" && exportOrigin === "workspace")) && (
  <div style={{ display: view === "animationWorkspace" ? "contents" : "none" }}>
    <AnimationWorkspace
      root={workspace}
      onExport={() => { setExportOrigin("workspace"); setView("animationExport"); }}
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
  <AnimationExportFlow origin={exportOrigin} onBack={() => setView(exportOrigin === "workspace" && workspace ? "animationWorkspace" : "home")} />
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
