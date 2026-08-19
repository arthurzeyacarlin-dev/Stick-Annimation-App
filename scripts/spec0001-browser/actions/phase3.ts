export default {
  declarationVersion: 1,
  adapterId: "phase-3-history-storage-onion",
  authorizationId: "phase-3/v1",
  adapterKind: "phase-3-product-ports/v1",
  executionProfile: "phase3-workspace-ports/v1",
  workspacePortBinding: "spec0001Phase3BrowserPortsV1",
  productPhaseClaimed: true,
  driverOperations: [
    {operation: "mountEditorHistoryRoot", fixtureKinds: ["stick-workspace-history-mount-v1"]},
    {operation: "dispatchEditorTransaction", fixtureKinds: ["stick-editor-transaction-v1"]},
    {operation: "beginDocumentPublication", fixtureKinds: ["stick-document-publication-plan-v1"]},
    {operation: "completeDocumentPublication", fixtureKinds: ["stick-document-publication-completion-v1"]},
    {operation: "beginMountedOpen", fixtureKinds: ["stick-mounted-open-candidate-v1"]},
    {operation: "completeMountedOpen", fixtureKinds: ["stick-mounted-open-completion-v1"]},
    {operation: "cancelMountedOpen", fixtureKinds: ["stick-mounted-open-cancel-v1"]},
    {operation: "readCheckpoint", fixtureKinds: []},
  ],
  environmentOperations: [
    {operation: "installEnvironmentPlan", fixtureKinds: ["stick-browser-environment-plan-v1"]},
    {operation: "releaseEnvironmentGate", fixtureKinds: ["stick-browser-environment-gate-release-v1"]},
    {operation: "readEnvironmentCheckpoint", fixtureKinds: []},
    {operation: "clearEnvironmentPlan", fixtureKinds: []},
  ],
  pointerTargets: [
    {targetId: "phase-3-stick-canvas", targetKind: "authorized-canvas"},
  ],
  checkpointKinds: ["environment", "workspace"],
} as const;
