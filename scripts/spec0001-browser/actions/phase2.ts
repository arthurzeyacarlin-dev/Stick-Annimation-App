export default {
  declarationVersion: 1,
  adapterId: "phase-2-ui-restoration-correction",
  authorizationId: "phase-2/v1",
  adapterKind: "phase-2-product-ports/v1",
  executionProfile: "phase2-workspace-ports/v1",
  workspacePortBinding: "spec0001Phase2BrowserPortsV1",
  productPhaseClaimed: true,
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
    {targetId: "phase-2-stick-canvas", targetKind: "authorized-canvas"},
  ],
  checkpointKinds: ["environment", "workspace"],
} as const;
