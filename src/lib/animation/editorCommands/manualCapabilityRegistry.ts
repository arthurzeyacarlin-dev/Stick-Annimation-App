import {
  DESTRUCTIVE_COMMAND_REGISTRY,
  type DestructiveCommandId,
} from "./destructiveRegistry.ts";

export type ManualEditorDeleteClassification =
  | "non-delete"
  | "targeted-delete"
  | "confirmed-broad-delete";

export type ManualEditorHistoryClass =
  | "one-global-history-entry"
  | "history-traversal"
  | "session-state"
  | "persistence-only";

export type ManualEditorCommandDefinition = {
  commandId: string;
  version: number;
  payloadSchema: string;
  manualControl: string;
  validator: string;
  handler: string;
  deleteClassification: ManualEditorDeleteClassification;
  noLossAssertion: string;
  historyClass: ManualEditorHistoryClass;
  persistenceProjection: string;
  noOpOrError: string;
  ownerPhase: `SPEC-0007 Phase ${1 | 2 | 4 | 5}`;
  futureAiEligible: boolean;
  destructiveCommandId?: DestructiveCommandId;
};

const command = <T extends ManualEditorCommandDefinition>(definition: T): T => definition;

/**
 * The closed, UI-independent inventory of mutations reachable in the ordinary
 * Animation Workspace. UI callbacks authorize against this table before they
 * enter the existing coordinator. This is metadata only: it creates no AI
 * route, provider, network request, or second mutation implementation.
 */
export const MANUAL_EDITOR_COMMAND_REGISTRY = {
  "drawing.raster-gesture.commit/v2": command({
    commandId: "drawing.raster-gesture.commit/v2", version: 2,
    payloadSchema: "RasterGestureCommandV2",
    manualControl: "Brush pointer gesture (Brush, Pencil, Sketch, Pixelate, Glow; Draw Rig on/off)",
    validator: "validateRasterGestureCommand",
    handler: "DrawingWorkspace.commitCanvasAuthoringAction",
    deleteClassification: "non-delete",
    noLossAssertion: "bounded raster patch retains every pixel and coverage entry outside the prepared dirty region",
    historyClass: "one-global-history-entry",
    persistenceProjection: "drawing-raster/v1 bitmap plus paintCoverage through canonical V2 repository",
    noOpOrError: "invalid/stale/empty gesture is rejected and the exact committed base is restored",
    ownerPhase: "SPEC-0007 Phase 1", futureAiEligible: true,
  }),
  "drawing.fill-region.commit/v1": command({
    commandId: "drawing.fill-region.commit/v1", version: 1,
    payloadSchema: "current raster owner, canonical seed, normalized fill color, base generation",
    manualControl: "Fill pointer action", validator: "DrawingCanvas bounded connected-region guard",
    handler: "DrawingWorkspace.commitCanvasAuthoringAction", deleteClassification: "non-delete",
    noLossAssertion: "only the connected region containing the validated seed may change",
    historyClass: "one-global-history-entry", persistenceProjection: "current drawing-raster/v1 owner",
    noOpOrError: "out-of-bounds or unchanged fill is a no-op with no history entry",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: true,
  }),
  "drawing.shape.commit/v1": command({
    commandId: "drawing.shape.commit/v1", version: 1,
    payloadSchema: "shape kind, canonical bounds, style, current raster owner and generation",
    manualControl: "Shape pointer action", validator: "DrawingCanvas shape bounds/style validator",
    handler: "DrawingWorkspace.commitCanvasAuthoringAction", deleteClassification: "non-delete",
    noLossAssertion: "shape drawing changes only its bounded mask; Cutout separately requires shape-cutout",
    historyClass: "one-global-history-entry", persistenceProjection: "current drawing-raster/v1 owner",
    noOpOrError: "invalid or zero-size shape is a no-op",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: true,
  }),
  "drawing.placed-asset.commit/v1": command({
    commandId: "drawing.placed-asset.commit/v1", version: 1,
    payloadSchema: "catalog asset digest, canonical placement bounds, rotation and aspect-lock state",
    manualControl: "Assets drag to canvas → Commit Placement", validator: "placed-asset catalog/digest/bounds guard",
    handler: "DrawingWorkspace.commitCanvasAuthoringAction", deleteClassification: "non-delete",
    noLossAssertion: "placement composites only its bounded target and retains the catalog entry",
    historyClass: "one-global-history-entry", persistenceProjection: "current drawing-raster/v1 owner and project asset catalog",
    noOpOrError: "missing/stale catalog asset rejects without changing the canvas",
    ownerPhase: "SPEC-0007 Phase 4", futureAiEligible: true,
  }),
  "drawing.selection.commit/v1": command({
    commandId: "drawing.selection.commit/v1", version: 1,
    payloadSchema: "validated Select/Lasso raster, text, or symbol-instance target plus bounded transform",
    manualControl: "Select/Lasso move, resize, rotate, flip or duplicate", validator: "selection owner/target/bounds guards",
    handler: "DrawingWorkspace.commitCanvasAuthoringAction", deleteClassification: "non-delete",
    noLossAssertion: "transform changes only selected content and preserves all content outside the source and destination bounds",
    historyClass: "one-global-history-entry", persistenceProjection: "current V2 owner items and raster coverage",
    noOpOrError: "stale, missing or unchanged selection is a no-op",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: true,
  }),
  "drawing.text.commit/v1": command({
    commandId: "drawing.text.commit/v1", version: 1,
    payloadSchema: "validated DrawingTextObject array for current owner",
    manualControl: "Text create/edit/move/resize/rotate/duplicate", validator: "updateFrameTextObjects owner and value validation",
    handler: "DrawingWorkspace.handleTextObjectsChange", deleteClassification: "non-delete",
    noLossAssertion: "retains raster, symbols and every unselected text object",
    historyClass: "one-global-history-entry", persistenceProjection: "drawing-text/v1 items in current V2 owner",
    noOpOrError: "equal or invalid text state is a no-op",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: true,
  }),
  "timeline.layer.add/v1": command({
    commandId: "timeline.layer.add/v1", version: 1, payloadSchema: "insertion index plus coordinator-supplied layer/frame IDs",
    manualControl: "Add Layer", validator: "timeline layer insertion and active-owner guard",
    handler: "DrawingWorkspace.addLayer", deleteClassification: "non-delete",
    noLossAssertion: "all existing layers, cells and authored items remain byte-identical",
    historyClass: "one-global-history-entry", persistenceProjection: "V2 document.layers",
    noOpOrError: "pending or stale authoring blocks insertion without changing the document",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: true,
  }),
  "timeline.frame.insert/v1": command({
    commandId: "timeline.frame.insert/v1", version: 1, payloadSchema: "target layer/index, keyframe kind, blank/copy policy and coordinator IDs",
    manualControl: "Add Frame / Add Blank Frame / Add Tween", validator: "timeline insertion and source-owner guard",
    handler: "DrawingWorkspace.addTimelineFrame", deleteClassification: "non-delete",
    noLossAssertion: "existing cells remain reachable and copied content is cloned with its paint coverage",
    historyClass: "one-global-history-entry", persistenceProjection: "V2 layer cells",
    noOpOrError: "invalid target or pending authoring is a no-op",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: true,
  }),
  "timeline.frame.paste/v1": command({
    commandId: "timeline.frame.paste/v1", version: 1, payloadSchema: "clipboard snapshot plus target layer/index and coordinator IDs",
    manualControl: "Paste Frame", validator: "clipboard/target owner and companion coverage guard",
    handler: "DrawingWorkspace.pasteTimelineFrame", deleteClassification: "non-delete",
    noLossAssertion: "only the validated target cell is replaced; every other owner is retained",
    historyClass: "one-global-history-entry", persistenceProjection: "V2 target cell and typed assets",
    noOpOrError: "empty clipboard or invalid target is a no-op",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: true,
  }),
  "timeline.span.resize/v1": command({
    commandId: "timeline.span.resize/v1", version: 1, payloadSchema: "layer/state/span type and bounded end index",
    manualControl: "Resize frame/tween span", validator: "timeline span owner and collision guard",
    handler: "DrawingWorkspace.resizeTimelineSpan", deleteClassification: "non-delete",
    noLossAssertion: "content remains owned by the same state; only hold/tween coverage changes",
    historyClass: "one-global-history-entry", persistenceProjection: "V2 owner/hold cell topology",
    noOpOrError: "invalid or unchanged end index is a no-op",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: true,
  }),
  "timeline.sound.attach/v1": command({
    commandId: "timeline.sound.attach/v1", version: 1, payloadSchema: "validated local sound option and target frame",
    manualControl: "Drop generated sound on frame", validator: "sound option/type/target-frame guard",
    handler: "DrawingWorkspace.attachSoundOptionToFrame", deleteClassification: "non-delete",
    noLossAssertion: "changes only the target frame sound attachment and retains all visual content",
    historyClass: "one-global-history-entry", persistenceProjection: "V2 target cell soundAttachment and typed asset",
    noOpOrError: "invalid/stale sound or target is rejected",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: false,
  }),
  "timeline.fps.set/v1": command({
    commandId: "timeline.fps.set/v1", version: 1, payloadSchema: "integer FPS clamped to 1..55",
    manualControl: "FPS field", validator: "finite integer/clamp guard",
    handler: "DrawingWorkspace.handleTimelineFpsChange", deleteClassification: "non-delete",
    noLossAssertion: "changes playback rate only; document content is retained",
    historyClass: "session-state", persistenceProjection: "V2 document.fps",
    noOpOrError: "unchanged value is a no-op",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: false,
  }),
  "timeline.frame.copy/v1": command({
    commandId: "timeline.frame.copy/v1", version: 1, payloadSchema: "validated source layer/frame identity copied into the local clipboard",
    manualControl: "Copy Frame", validator: "source owner and complete snapshot/coverage guard",
    handler: "DrawingWorkspace.copyTimelineFrame", deleteClassification: "non-delete",
    noLossAssertion: "copy is read-only and retains every authored owner and catalog entry",
    historyClass: "session-state", persistenceProjection: "local clipboard only",
    noOpOrError: "invalid source or failed pending commit leaves the clipboard/document unchanged",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: false,
  }),
  "timeline.position.select/v1": command({
    commandId: "timeline.position.select/v1", version: 1, payloadSchema: "bounded selected timeline index",
    manualControl: "Timeline position select", validator: "finite non-negative timeline index guard",
    handler: "DrawingWorkspace.selectTimelinePosition", deleteClassification: "non-delete",
    noLossAssertion: "selection changes no authored owner, history entry, or persistence state",
    historyClass: "session-state", persistenceProjection: "workspace selection only",
    noOpOrError: "same position is a no-op",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: false,
  }),
  "timeline.layer.activate/v1": command({
    commandId: "timeline.layer.activate/v1", version: 1, payloadSchema: "existing target layer ID after pending-authoring commit",
    manualControl: "Activate layer", validator: "existing layer and pending-authoring commit guard",
    handler: "DrawingWorkspace.activateLayer", deleteClassification: "non-delete",
    noLossAssertion: "navigation cannot replace or clear the prior layer owner",
    historyClass: "session-state", persistenceProjection: "workspace reopen selection",
    noOpOrError: "missing/same target or failed pending commit is a no-op",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: false,
  }),
  "timeline.frame.activate/v1": command({
    commandId: "timeline.frame.activate/v1", version: 1, payloadSchema: "bounded target frame index after pending-authoring commit",
    manualControl: "Activate frame", validator: "timeline bounds and pending-authoring commit guard",
    handler: "DrawingWorkspace.switchToFrame", deleteClassification: "non-delete",
    noLossAssertion: "navigation cannot replace or clear the prior frame owner",
    historyClass: "session-state", persistenceProjection: "workspace reopen selection",
    noOpOrError: "out-of-range/same target or failed pending commit is a no-op",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: false,
  }),
  "timeline.onion.toggle/v1": command({
    commandId: "timeline.onion.toggle/v1", version: 1, payloadSchema: "boolean onion-enabled state",
    manualControl: "Onion Skin", validator: "boolean session-state guard",
    handler: "DrawingWorkspace.handleToggleOnion", deleteClassification: "non-delete",
    noLossAssertion: "display-only onion surfaces cannot edit authored content",
    historyClass: "session-state", persistenceProjection: "V2 reopenState.onionEnabled",
    noOpOrError: "same requested state is a no-op",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: false,
  }),
  "playback.start/v1": command({
    commandId: "playback.start/v1", version: 1, payloadSchema: "committed workspace generation and frozen playback cache",
    manualControl: "Play", validator: "pending-authoring commit and playback-cache validation",
    handler: "DrawingWorkspace.handlePlayTimeline", deleteClassification: "non-delete",
    noLossAssertion: "playback is read-only and cannot create history or document writes",
    historyClass: "session-state", persistenceProjection: "none",
    noOpOrError: "failed pending commit blocks playback without changing authored state",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: false,
  }),
  "playback.pause/v1": command({
    commandId: "playback.pause/v1", version: 1, payloadSchema: "captured pre-playback navigation state",
    manualControl: "Pause", validator: "active playback/return-state guard",
    handler: "DrawingWorkspace.handlePauseTimeline", deleteClassification: "non-delete",
    noLossAssertion: "pause restores the edit surface from the unchanged canonical document",
    historyClass: "session-state", persistenceProjection: "none",
    noOpOrError: "pause while stopped is a no-op",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: false,
  }),
  "drawing.tool.activate/v1": command({
    commandId: "drawing.tool.activate/v1", version: 1, payloadSchema: "enabled ordinary drawing tool name",
    manualControl: "Select / Brush / Eraser / Fill / Text / Lasso / Knife / Shape", validator: "closed DrawingToolName guard",
    handler: "DrawingWorkspace.activateDrawingTool", deleteClassification: "non-delete",
    noLossAssertion: "tool switching cancels only transient previews and retains the last-good owner",
    historyClass: "session-state", persistenceProjection: "workspace tool selection only",
    noOpOrError: "same tool safely reactivates without document mutation",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: false,
  }),
  "drawing.canvas.zoom/v1": command({
    commandId: "drawing.canvas.zoom/v1", version: 1, payloadSchema: "finite zoom clamped to the visible camera range",
    manualControl: "Wheel / zoom field / reset view", validator: "finite clamped zoom guard",
    handler: "DrawingCanvas.updateCameraZoom", deleteClassification: "non-delete",
    noLossAssertion: "camera zoom changes no canvas bytes, owner, history, or persistence state",
    historyClass: "session-state", persistenceProjection: "none",
    noOpOrError: "same or invalid zoom is a no-op",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: false,
  }),
  "drawing.canvas.pan/v1": command({
    commandId: "drawing.canvas.pan/v1", version: 1, payloadSchema: "primary pointer pan gesture in Select move-canvas mode",
    manualControl: "Select → Move canvas", validator: "active tool/mode/pointer capture guard",
    handler: "DrawingCanvas.startSelectPan", deleteClassification: "non-delete",
    noLossAssertion: "camera pan changes no canvas bytes, owner, history, or persistence state",
    historyClass: "session-state", persistenceProjection: "none",
    noOpOrError: "inactive mode or non-primary gesture is a no-op",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: false,
  }),
  "history.undo/v1": command({
    commandId: "history.undo/v1", version: 1, payloadSchema: "current workspace generation and relevant history cursor",
    manualControl: "Undo", validator: "history owner/context/digest guard",
    handler: "DrawingWorkspace.handleUndo", deleteClassification: "non-delete",
    noLossAssertion: "restores the exact recorded predecessor; it never invents a partial snapshot",
    historyClass: "history-traversal", persistenceProjection: "workspace state only until Save",
    noOpOrError: "empty/stale history is a no-op",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: false,
  }),
  "history.redo/v1": command({
    commandId: "history.redo/v1", version: 1, payloadSchema: "current workspace generation and relevant history cursor",
    manualControl: "Redo", validator: "history owner/context/digest guard",
    handler: "DrawingWorkspace.handleRedo", deleteClassification: "non-delete",
    noLossAssertion: "restores the exact recorded successor; it never invents a partial snapshot",
    historyClass: "history-traversal", persistenceProjection: "workspace state only until Save",
    noOpOrError: "empty/stale history is a no-op",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: false,
  }),
  "symbol.definition.create/v1": command({
    commandId: "symbol.definition.create/v1", version: 1, payloadSchema: "validated name/category/dimensions/digest plus explicit source-removal target",
    manualControl: "Convert to Symbol", validator: "symbol name/digest/source owner guard",
    handler: "DrawingWorkspace.createUnifiedSymbolDefinition", deleteClassification: "non-delete",
    noLossAssertion: "source conversion and catalog insertion commit atomically or roll back together",
    historyClass: "one-global-history-entry", persistenceProjection: "V2 catalogs.symbols plus targeted source owner",
    noOpOrError: "duplicate/invalid definition or failed source capture leaves source and catalog unchanged",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: true,
  }),
  "symbol.instances.commit/v1": command({
    commandId: "symbol.instances.commit/v1", version: 1, payloadSchema: "validated symbol-instance array for current owner",
    manualControl: "Library place / symbol move, resize, rotate, flip or duplicate", validator: "definition digest, target owner and transform guard",
    handler: "DrawingWorkspace.commitUnifiedSymbolInstances", deleteClassification: "non-delete",
    noLossAssertion: "retains every unrelated instance and all raster/text/catalog content",
    historyClass: "one-global-history-entry", persistenceProjection: "symbol-instance/v1 items in current V2 owner",
    noOpOrError: "missing definition, stale owner or unchanged array is rejected/no-op",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: true,
  }),
  "asset.catalog.import/v1": command({
    commandId: "asset.catalog.import/v1", version: 1, payloadSchema: "bounded preflighted static PNG/JPEG/WebP batch",
    manualControl: "Assets → Import Images or OS drop", validator: "inspectStaticAssetBytes and catalog batch validation",
    handler: "DrawingWorkspace.importUnifiedAssets", deleteClassification: "non-delete",
    noLossAssertion: "batch is all-or-none and retains the prior catalog on any failure",
    historyClass: "one-global-history-entry", persistenceProjection: "V2 catalogs.assets and typed immutable bytes",
    noOpOrError: "empty/duplicate/invalid/quota-failed batch leaves catalog unchanged",
    ownerPhase: "SPEC-0007 Phase 4", futureAiEligible: true,
  }),
  "project.save/v2": command({
    commandId: "project.save/v2", version: 2, payloadSchema: "complete validated UnifiedAnimationProjectV2 plus captured generation",
    manualControl: "File → Save", validator: "buildUnifiedProjectSnapshot plus V2 repository validation/CAS/readback",
    handler: "DrawingWorkspace.saveProject", deleteClassification: "non-delete",
    noLossAssertion: "a failed/stale save never marks newer work saved or replaces the last-good head",
    historyClass: "persistence-only", persistenceProjection: "immutable V2 version, typed assets and CAS head",
    noOpOrError: "invalid/stale/failing save preserves unsaved state and last-good storage",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: false,
  }),
  "project.save-as/v2": command({
    commandId: "project.save-as/v2", version: 2, payloadSchema: "complete validated project snapshot plus normalized new title",
    manualControl: "File → Save As", validator: "title, snapshot, V2 repository, quota and readback validation",
    handler: "DrawingWorkspace.handleSaveAs", deleteClassification: "non-delete",
    noLossAssertion: "failure changes neither source project nor catalog; success creates an independent copy",
    historyClass: "persistence-only", persistenceProjection: "new immutable V2 project/version/head",
    noOpOrError: "cancel/blank/failure is a no-op that retains the source workspace",
    ownerPhase: "SPEC-0007 Phase 5", futureAiEligible: false,
  }),
  eraser: command({
    commandId: "eraser", version: 1, payloadSchema: "sampled eraser mask and current raster owner",
    manualControl: "Eraser", validator: "authorizeDestructiveCommand plus raster-owner/mask guard",
    handler: "DrawingWorkspace.commitCanvasAuthoringAction", deleteClassification: "targeted-delete",
    noLossAssertion: "only pixels under the sampled eraser mask may be removed",
    historyClass: "one-global-history-entry", persistenceProjection: "current raster and coverage companion",
    noOpOrError: "empty/stale mask is a no-op", ownerPhase: "SPEC-0007 Phase 1", futureAiEligible: true, destructiveCommandId: "eraser",
  }),
  knife: command({
    commandId: "knife", version: 1, payloadSchema: "validated knife path and selected/intersected pieces",
    manualControl: "Knife", validator: "authorizeDestructiveCommand plus intersection/selection guard",
    handler: "DrawingWorkspace.commitCanvasAuthoringAction", deleteClassification: "targeted-delete",
    noLossAssertion: "only explicitly selected/intersected pieces may be removed or moved",
    historyClass: "one-global-history-entry", persistenceProjection: "current raster/text/coverage owner",
    noOpOrError: "no intersection is a no-op", ownerPhase: "SPEC-0007 Phase 1", futureAiEligible: true, destructiveCommandId: "knife",
  }),
  "shape-cutout": command({
    commandId: "shape-cutout", version: 1, payloadSchema: "validated filled shape mask and current raster owner",
    manualControl: "Shape → Cutout", validator: "authorizeDestructiveCommand plus bounded shape guard",
    handler: "DrawingWorkspace.commitCanvasAuthoringAction", deleteClassification: "targeted-delete",
    noLossAssertion: "only pixels inside the validated filled shape mask may be removed",
    historyClass: "one-global-history-entry", persistenceProjection: "current raster and coverage companion",
    noOpOrError: "invalid/empty mask is a no-op", ownerPhase: "SPEC-0007 Phase 1", futureAiEligible: true, destructiveCommandId: "shape-cutout",
  }),
  "delete-selection": command({
    commandId: "delete-selection", version: 1, payloadSchema: "selected raster/text/symbol-instance IDs",
    manualControl: "Delete selection", validator: "authorizeDestructiveCommand plus selection-owner guard",
    handler: "DrawingWorkspace.commitCanvasAuthoringAction", deleteClassification: "targeted-delete",
    noLossAssertion: "only selected IDs/pixels may be removed",
    historyClass: "one-global-history-entry", persistenceProjection: "current V2 owner and coverage companion",
    noOpOrError: "empty/stale selection is a no-op", ownerPhase: "SPEC-0007 Phase 1", futureAiEligible: true, destructiveCommandId: "delete-selection",
  }),
  "remove-frame": command({
    commandId: "remove-frame", version: 1, payloadSchema: "target layer/frame owner with minimum-frame proof",
    manualControl: "Remove Frame", validator: "authorizeDestructiveCommand plus timeline invariant",
    handler: "DrawingWorkspace.removeTimelineFrame", deleteClassification: "targeted-delete",
    noLossAssertion: "only the chosen frame owner/holds are removed and at least one frame remains",
    historyClass: "one-global-history-entry", persistenceProjection: "V2 layer cells",
    noOpOrError: "invalid target or minimum-frame violation is rejected", ownerPhase: "SPEC-0007 Phase 1", futureAiEligible: true, destructiveCommandId: "remove-frame",
  }),
  "delete-layer": command({
    commandId: "delete-layer", version: 1, payloadSchema: "confirmed active/context layer with minimum-layer proof",
    manualControl: "Delete Layer", validator: "authorizeDestructiveCommand plus explicit confirmation",
    handler: "DrawingWorkspace.deleteActiveLayer", deleteClassification: "confirmed-broad-delete",
    noLossAssertion: "only the confirmed layer is removed and at least one layer remains",
    historyClass: "one-global-history-entry", persistenceProjection: "V2 document.layers",
    noOpOrError: "dismissed confirmation or minimum-layer violation is a no-op", ownerPhase: "SPEC-0007 Phase 1", futureAiEligible: true, destructiveCommandId: "delete-layer",
  }),
  "clear-canvas": command({
    commandId: "clear-canvas", version: 1, payloadSchema: "confirmed current raster owner",
    manualControl: "Properties → Clear Canvas", validator: "authorizeDestructiveCommand plus explicit confirmation/current-owner guard",
    handler: "DrawingWorkspace.commitCanvasAuthoringAction", deleteClassification: "confirmed-broad-delete",
    noLossAssertion: "only the confirmed current owner is cleared",
    historyClass: "one-global-history-entry", persistenceProjection: "current raster and coverage companion",
    noOpOrError: "dismissed confirmation or stale owner is a no-op", ownerPhase: "SPEC-0007 Phase 1", futureAiEligible: true, destructiveCommandId: "clear-canvas",
  }),
  "delete-instance": command({
    commandId: "delete-instance", version: 1, payloadSchema: "selected symbol instance ID and current owner",
    manualControl: "Delete Instance", validator: "authorizeDestructiveCommand plus current-owner instance guard",
    handler: "DrawingWorkspace.commitUnifiedSymbolInstances", deleteClassification: "targeted-delete",
    noLossAssertion: "retains the definition, other instances and all unrelated content",
    historyClass: "one-global-history-entry", persistenceProjection: "current owner symbol-instance/v1 items",
    noOpOrError: "missing/stale selection is a no-op", ownerPhase: "SPEC-0007 Phase 1", futureAiEligible: true, destructiveCommandId: "delete-instance",
  }),
  "delete-definition": command({
    commandId: "delete-definition", version: 1, payloadSchema: "unreferenced symbol definition ID",
    manualControl: "Library → Delete definition", validator: "authorizeDestructiveCommand plus zero-live-reference proof",
    handler: "DrawingWorkspace.removeUnifiedSymbolDefinition", deleteClassification: "targeted-delete",
    noLossAssertion: "referenced definitions are rejected; instances and unrelated definitions remain",
    historyClass: "one-global-history-entry", persistenceProjection: "V2 catalogs.symbols",
    noOpOrError: "referenced/missing definition is rejected", ownerPhase: "SPEC-0007 Phase 1", futureAiEligible: true, destructiveCommandId: "delete-definition",
  }),
  "delete-asset": command({
    commandId: "delete-asset", version: 1, payloadSchema: "unreferenced asset catalog ID",
    manualControl: "Assets → Delete asset", validator: "authorizeDestructiveCommand plus zero-live-reference proof",
    handler: "DrawingWorkspace.removeUnifiedAsset", deleteClassification: "targeted-delete",
    noLossAssertion: "referenced assets are rejected; placed pixels and unrelated assets remain",
    historyClass: "one-global-history-entry", persistenceProjection: "V2 catalogs.assets and typed assets",
    noOpOrError: "referenced/missing asset is rejected", ownerPhase: "SPEC-0007 Phase 4", futureAiEligible: true, destructiveCommandId: "delete-asset",
  }),
  "remove-attached-sound": command({
    commandId: "remove-attached-sound", version: 1, payloadSchema: "target frame sound attachment ID",
    manualControl: "Remove Attached Sound", validator: "authorizeDestructiveCommand plus frame/attachment guard",
    handler: "DrawingWorkspace.removeSoundAttachmentFromFrame", deleteClassification: "targeted-delete",
    noLossAssertion: "only the selected frame attachment is removed; unrelated asset bytes remain",
    historyClass: "one-global-history-entry", persistenceProjection: "V2 target cell soundAttachment",
    noOpOrError: "missing/stale attachment is a no-op", ownerPhase: "SPEC-0007 Phase 1", futureAiEligible: false, destructiveCommandId: "remove-attached-sound",
  }),
} as const satisfies Record<string, ManualEditorCommandDefinition>;

export type ManualEditorCommandId = keyof typeof MANUAL_EDITOR_COMMAND_REGISTRY;

export const MANUAL_EDITOR_COMMAND_IDS = Object.freeze(
  Object.keys(MANUAL_EDITOR_COMMAND_REGISTRY).sort() as ManualEditorCommandId[],
);

export function authorizeManualEditorCommand(
  commandId: ManualEditorCommandId,
  expectedHandler: string,
): { allowed: boolean; code: "authorized" | "unknown_command" | "handler_mismatch" | "destructive_registry_mismatch" } {
  const entry = MANUAL_EDITOR_COMMAND_REGISTRY[commandId] as ManualEditorCommandDefinition | undefined;
  if (!entry) return { allowed: false, code: "unknown_command" };
  if (entry.handler !== expectedHandler) return { allowed: false, code: "handler_mismatch" };
  if (entry.destructiveCommandId && !(entry.destructiveCommandId in DESTRUCTIVE_COMMAND_REGISTRY)) {
    return { allowed: false, code: "destructive_registry_mismatch" };
  }
  return { allowed: true, code: "authorized" };
}

export function requireManualEditorCommand(commandId: ManualEditorCommandId, expectedHandler: string) {
  const authorization = authorizeManualEditorCommand(commandId, expectedHandler);
  if (!authorization.allowed) throw new Error(`manual_editor_command_${authorization.code}:${commandId}`);
  return MANUAL_EDITOR_COMMAND_REGISTRY[commandId];
}

export function auditManualEditorCommandRegistry(
  candidate: Record<string, ManualEditorCommandDefinition> = MANUAL_EDITOR_COMMAND_REGISTRY,
): string[] {
  const errors: string[] = [];
  const candidateIds = Object.keys(candidate);
  if (!candidateIds.length) errors.push("empty_registry");
  for (const [key, entry] of Object.entries(candidate)) {
    if (entry.commandId !== key) errors.push(`command_id_mismatch:${key}`);
    if (!Number.isSafeInteger(entry.version) || entry.version < 1) errors.push(`invalid_version:${key}`);
    for (const field of ["payloadSchema", "manualControl", "validator", "handler", "noLossAssertion", "persistenceProjection", "noOpOrError"] as const) {
      if (!entry[field].trim()) errors.push(`empty_${field}:${key}`);
    }
    const isDelete = entry.deleteClassification !== "non-delete";
    if (isDelete !== Boolean(entry.destructiveCommandId)) errors.push(`delete_classification_mismatch:${key}`);
    if (entry.destructiveCommandId && !(entry.destructiveCommandId in DESTRUCTIVE_COMMAND_REGISTRY)) {
      errors.push(`unknown_destructive_command:${key}`);
    }
    if (entry.historyClass === "one-global-history-entry" && entry.persistenceProjection === "none") {
      errors.push(`history_without_projection:${key}`);
    }
    const canonical = MANUAL_EDITOR_COMMAND_REGISTRY[key as ManualEditorCommandId] as ManualEditorCommandDefinition | undefined;
    if (canonical) {
      for (const field of ["handler", "deleteClassification", "historyClass", "noLossAssertion", "manualControl"] as const) {
        if (entry[field] !== canonical[field]) errors.push(`protected_${field}_changed:${key}`);
      }
    }
  }
  for (const commandId of Object.keys(MANUAL_EDITOR_COMMAND_REGISTRY)) {
    if (!candidate[commandId]) errors.push(`missing_command:${commandId}`);
  }
  for (const destructiveCommandId of Object.keys(DESTRUCTIVE_COMMAND_REGISTRY) as DestructiveCommandId[]) {
    const entry = candidate[destructiveCommandId];
    if (!entry) errors.push(`missing_destructive_command:${destructiveCommandId}`);
    else if (entry.destructiveCommandId !== destructiveCommandId || entry.deleteClassification === "non-delete") {
      errors.push(`destructive_mapping_mismatch:${destructiveCommandId}`);
    }
  }
  return errors.sort();
}

export function exportManualEditorCommandTable(): string {
  const header = "| Command | Manual control | Delete | History | Future AI |\n| --- | --- | --- | --- | --- |";
  const rows = MANUAL_EDITOR_COMMAND_IDS.map(commandId => {
    const entry = MANUAL_EDITOR_COMMAND_REGISTRY[commandId];
    return `| ${entry.commandId} (v${entry.version}) | ${entry.manualControl} | ${entry.deleteClassification} | ${entry.historyClass} | ${entry.futureAiEligible ? "eligible" : "not eligible"} |`;
  });
  return [header, ...rows].join("\n");
}
