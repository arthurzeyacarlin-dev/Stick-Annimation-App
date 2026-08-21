export default {
  declarationVersion: 1,
  adapterId: "phase-6-visible-stick-ai",
  authorizationId: "phase-6/v1",
  adapterKind: "phase-6-visible-ui/v1",
  executionProfile: "phase6-visible-ui/v1",
  productPhaseClaimed: true,
  visibleOperations: [
    "verify-protected-initial-presentation",
    "submit-with-checkmark",
    "cancel-preview",
    "apply-preview",
    "undo-redo",
    "play-pause",
    "onion-toggle",
    "save-open",
    "manual-joint-edit",
    "creator-back",
    "drawing-generate-frames"
  ],
  environmentOperations: [
    "real-mock-route",
    "invalid-response-intercept",
    "non-loopback-denial"
  ]
} as const;
