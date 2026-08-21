import {
  STICK_AI_CAPABILITY_MANIFEST_V2,
  buildStickAiProjectContext,
  type StickAiRequestV2,
  type StickCommandBatchV1,
} from "./stickFigureAiContract.ts";
import {STICK_FIGURE_AI_MOCK_STARTER} from "./stickFigureAiMockServer.ts";

type StickAiRenderableStructureGraphV2 = {
  joints: ReadonlyArray<{id: string}>;
  limbs: ReadonlyArray<{id: string; startJointId: string; endJointId: string}>;
};

const canonicalRig = STICK_FIGURE_AI_MOCK_STARTER.rigs[0];
const canonicalJointIds = new Set(canonicalRig.joints.map((joint) => joint.jointId));
const canonicalSegments = new Map(canonicalRig.segments.map((segment) => [
  segment.segmentId,
  `${segment.fromJointId}:${segment.toJointId}`,
]));

export const STICK_AI_EDITOR_RENDER_SPACE_V2 = Object.freeze({
  width: STICK_FIGURE_AI_MOCK_STARTER.coordinateSpace.width * 0.5,
  height: STICK_FIGURE_AI_MOCK_STARTER.coordinateSpace.height * 0.55,
});

export const isStickAiCanonicalStructureGraphV2 = (graph: StickAiRenderableStructureGraphV2) =>
  canonicalJointIds.size > 0 && [...canonicalJointIds].every((id) => graph.joints.some((joint) => joint.id === id)) &&
  [...canonicalSegments].every(([id, endpoints]) => graph.limbs.some((limb) =>
    limb.id === id && `${limb.startJointId}:${limb.endJointId}` === endpoints,
  ));

export type StickAiWorkspaceSnapshotV2 = {
  workspaceInstanceId: string;
  workspaceGeneration: number;
  projectId: string;
  documentRevision: number;
  documentDigest: string;
  ready: boolean;
  eligible: boolean;
  playing: boolean;
};

export type StickAiWorkspaceCommandOutcomeV2 = {
  accepted: boolean;
  outcomeCode: string;
  errorCode: string | null;
};

export type StickAiWorkspaceBindingV2 = Pick<
  StickAiWorkspaceSnapshotV2,
  "workspaceInstanceId" | "workspaceGeneration" | "projectId" | "documentRevision" | "documentDigest"
>;

type StickAiWorkspacePortsV2 = {
  getSnapshot: () => StickAiWorkspaceSnapshotV2 | null;
  preview: (envelope: StickCommandBatchV1) => Promise<StickAiWorkspaceCommandOutcomeV2>;
  cancel: (envelope: StickCommandBatchV1) => Promise<StickAiWorkspaceCommandOutcomeV2>;
  apply: (envelope: StickCommandBatchV1) => Promise<StickAiWorkspaceCommandOutcomeV2>;
};

const bindingMatches = (binding: StickAiWorkspaceBindingV2, current: StickAiWorkspaceSnapshotV2 | null) =>
  Boolean(current?.ready && !current.playing && current.workspaceInstanceId === binding.workspaceInstanceId &&
    current.workspaceGeneration === binding.workspaceGeneration && current.projectId === binding.projectId &&
    current.documentRevision === binding.documentRevision && current.documentDigest === binding.documentDigest);

export class StickFigureAiWorkspaceAdapterV2 {
  readonly #ports: StickAiWorkspacePortsV2;

  constructor(ports: StickAiWorkspacePortsV2) {
    this.#ports = ports;
  }

  readSnapshot() {
    return this.#ports.getSnapshot();
  }

  captureBinding(): StickAiWorkspaceBindingV2 | null {
    const current = this.#ports.getSnapshot();
    if (!current?.ready || current.playing || !current.eligible) return null;
    return {
      workspaceInstanceId: current.workspaceInstanceId,
      workspaceGeneration: current.workspaceGeneration,
      projectId: current.projectId,
      documentRevision: current.documentRevision,
      documentDigest: current.documentDigest,
    };
  }

  async preview(binding: StickAiWorkspaceBindingV2, envelope: StickCommandBatchV1) {
    if (!bindingMatches(binding, this.#ports.getSnapshot())) {
      return {accepted: false, outcomeCode: "rejected", errorCode: "stale_document"};
    }
    return this.#ports.preview(envelope);
  }

  async cancel(envelope: StickCommandBatchV1) {
    return this.#ports.cancel(envelope);
  }

  async apply(binding: StickAiWorkspaceBindingV2, envelope: StickCommandBatchV1) {
    if (!bindingMatches(binding, this.#ports.getSnapshot())) {
      return {accepted: false, outcomeCode: "rejected", errorCode: "stale_document"};
    }
    return this.#ports.apply(envelope);
  }
}

export const buildStickAiRequestV2 = async (prompt: string): Promise<StickAiRequestV2> => {
  const context = await buildStickAiProjectContext(STICK_FIGURE_AI_MOCK_STARTER);
  if (!context.ok) throw new Error("The canonical Stick AI starter could not be prepared.");
  return {
    kind: "stick-ai-request",
    requestVersion: 2,
    requestId: globalThis.crypto.randomUUID().toLowerCase(),
    transactionId: globalThis.crypto.randomUUID().toLowerCase(),
    workspaceType: "stick-figure",
    prompt,
    capabilityManifest: STICK_AI_CAPABILITY_MANIFEST_V2,
    projectContext: context.value,
  };
};

export const stickAiPhase4FixtureV2 = (envelope: StickCommandBatchV1) => ({
  starter: STICK_FIGURE_AI_MOCK_STARTER,
  envelope,
});
