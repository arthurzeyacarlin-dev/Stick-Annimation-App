export default {
  declarationVersion: 1,
  adapterId: "phase-1.5-compatibility-synthetic",
  authorizationId: "phase-1.5-compatibility-synthetic/v1",
  adapterKind: "in-memory-phase2-shaped-synthetic/v1",
  executionProfile: "synthetic-state-machine/v1",
  workspacePortBinding: null,
  productPhaseClaimed: false,
  driverOperations: [
    {operation: "mountDocument", fixtureKinds: ["stick-workspace-document-mount-v1"]},
    {operation: "dispatchCompletedJointEdit", fixtureKinds: ["stick-completed-joint-edit-v1"]},
    {operation: "beginDocumentPublication", fixtureKinds: ["stick-document-publication-plan-v1"]},
    {operation: "completeDocumentPublication", fixtureKinds: ["stick-document-publication-completion-v1"]},
    {operation: "readCheckpoint", fixtureKinds: []},
  ],
  environmentOperations: [
    {operation: "installEnvironmentPlan", fixtureKinds: ["stick-browser-environment-plan-v1"]},
    {operation: "releaseEnvironmentGate", fixtureKinds: ["stick-browser-environment-gate-release-v1"]},
    {operation: "readEnvironmentCheckpoint", fixtureKinds: []},
    {operation: "clearEnvironmentPlan", fixtureKinds: []},
  ],
  pointerTargets: [
    {targetId: "synthetic-stick-canvas", targetKind: "authorized-canvas"},
  ],
  checkpointKinds: ["environment", "workspace"],
} as const;
