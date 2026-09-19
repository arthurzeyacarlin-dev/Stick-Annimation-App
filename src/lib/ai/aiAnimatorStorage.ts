import {
  isAiAnimatorTerminalStatus,
  type AiAnimatorConversationMessage,
  type AiAnimatorJobSnapshot,
} from "./aiAnimatorContract.ts";

const AI_ANIMATOR_LEDGER_PREFIX = "diamond_ai_animator_ledger_v1:";
const MAX_MESSAGES = 80;
const MAX_JOBS = 40;

export type AiAnimatorLedger = {
  version: 1;
  projectId: string;
  messages: AiAnimatorConversationMessage[];
  jobs: AiAnimatorJobSnapshot[];
  updatedAt: string;
};

const keyForProject = (projectId: string) => `${AI_ANIMATOR_LEDGER_PREFIX}${encodeURIComponent(projectId)}`;

export const createEmptyAiAnimatorLedger = (projectId: string): AiAnimatorLedger => ({
  version: 1,
  projectId,
  messages: [],
  jobs: [],
  updatedAt: new Date(0).toISOString(),
});

export const readAiAnimatorLedger = (projectId: string, storage: Storage | null = typeof window === "undefined" ? null : window.localStorage) => {
  if (!storage || !projectId.trim()) {
    return createEmptyAiAnimatorLedger(projectId);
  }
  try {
    const parsed = JSON.parse(storage.getItem(keyForProject(projectId)) ?? "null") as AiAnimatorLedger | null;
    if (parsed?.version !== 1 || parsed.projectId !== projectId || !Array.isArray(parsed.messages) || !Array.isArray(parsed.jobs)) {
      return createEmptyAiAnimatorLedger(projectId);
    }
    return {
      version: 1 as const,
      projectId,
      messages: parsed.messages.slice(-MAX_MESSAGES),
      jobs: parsed.jobs.slice(-MAX_JOBS),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return createEmptyAiAnimatorLedger(projectId);
  }
};

export const writeAiAnimatorLedger = (
  ledger: AiAnimatorLedger,
  storage: Storage | null = typeof window === "undefined" ? null : window.localStorage,
) => {
  if (!storage || !ledger.projectId.trim()) {
    return;
  }
  const bounded: AiAnimatorLedger = {
    version: 1,
    projectId: ledger.projectId,
    messages: ledger.messages.slice(-MAX_MESSAGES),
    jobs: ledger.jobs.slice(-MAX_JOBS),
    updatedAt: new Date().toISOString(),
  };
  storage.setItem(keyForProject(ledger.projectId), JSON.stringify(bounded));
};

export const upsertAiAnimatorJob = (ledger: AiAnimatorLedger, job: AiAnimatorJobSnapshot): AiAnimatorLedger => {
  const existing = ledger.jobs.find((entry) => entry.jobId === job.jobId);
  if (existing && isAiAnimatorTerminalStatus(existing.status)) {
    return ledger;
  }
  return {
    ...ledger,
    jobs: [...ledger.jobs.filter((entry) => entry.jobId !== job.jobId), job].slice(-MAX_JOBS),
  };
};
