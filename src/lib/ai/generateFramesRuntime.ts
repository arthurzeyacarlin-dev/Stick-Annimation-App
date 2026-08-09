import type {
  DrawingAiCameraPlan,
  DrawingAiExecutionBeat,
  DrawingAiExecutionGuidanceProfile,
  DrawingAiExecutionQualityFloor,
  DrawingAiFamilyQualityContract,
  DrawingAiGenerateFramesState,
  DrawingAiGenerateFramesStateForceLevel,
  DrawingAiGenerateFramesStateMotionType,
  DrawingAiGenerateFramesProjectScope,
  DrawingAiProjectMemory,
  DrawingAiPrincipleActivationProfile,
  DrawingAiQualityFailureReport,
  DrawingAiRenderAcceptanceContract,
  DrawingAiRenderingQualityFamily,
  DrawingAiRenderingQualityFloorTier,
  DrawingAiRenderingQualityProfile,
  DrawingAiGenerateFramesStateSubject,
  DrawingAiGenerateFramesStateSubjectSide,
  DrawingAiGenerateFramesShotScope,
  DrawingAiGenerateFramesStateTone,
  DrawingAiGeneratedFrameDraft,
  DrawingAiLayerPlan,
  DrawingAiSearchConfidenceProfile,
  DrawingAiSearchDecision,
  DrawingAiSubjectBinding,
  DrawingAiVariationEnvelope,
  DrawingAiWorkspaceContext,
} from "./drawingAiContract";
import {
  clampFrameDraftsToRequest,
  clampRequestedFrameCount,
  inferDrawingAiFrameRequestKind,
  resolveRequestedFrameCount,
  type DrawingAiFrameRequestKind,
} from "./frameGenerationSafety";

export type GenerateFramesIntentFamily =
  | "effect"
  | "object"
  | "character"
  | "background"
  | "continuation"
  | "mixed";

export type GenerateFramesIntentConcept =
  | "explosion"
  | "lightning"
  | "shockwave"
  | "smoke"
  | "concrete-cracks"
  | "bouncing-ball"
  | "rolling-ball"
  | "morphing-ball"
  | "rod"
  | "block"
  | "stick-figure"
  | "punch"
  | "kick"
  | "fighting-stance"
  | "walking"
  | "running"
  | "dark-room"
  | "school-hallway"
  | "mountain-landscape"
  | "night-city"
  | "zombie-apocalypse"
  | "alien-apocalypse";

export type GenerateFramesRuntimeInteractionMode = "create" | "continue" | "tweak" | "discuss";
export type GenerateFramesPromptVisualKind = "thing" | "event" | "scene" | "mixed";
export type GenerateFramesOutputMode = "animation" | "still";
export type GenerateFramesExpectedVisualClass =
  | "still-object"
  | "still-character"
  | "still-scene"
  | "event-animation"
  | "action-animation"
  | "continuation-edit";
export type GenerateFramesAllowedSubjectFamily = "effect" | "object" | "character" | "background";
export type GenerateFramesSubjectPurityMode =
  | "strict-single-subject"
  | "strict-effect-only"
  | "strict-scene-only"
  | "mixed-allowed"
  | "continuation-anchored";
export type GenerateFramesCompletionProfile =
  | "none"
  | "breathing-loop"
  | "strike-recover"
  | "kick-recover"
  | "jump-land"
  | "explosion-complete"
  | "lightning-vanish"
  | "smoke-dissipate"
  | "fight-resolve"
  | "walk-cycle"
  | "run-cycle"
  | "scene-scroll"
  | "generic-action-complete";
export type GenerateFramesNoPlanBlocker = "deferred-only" | "negation" | "low-confidence" | null;
export type GenerateFramesSearchKnowledgeGap =
  | "subject-shape"
  | "subject-color"
  | "subject-effects"
  | "motion-phases"
  | "scene-staging"
  | "drawing-readability";
export type GenerateFramesEditIntent =
  | "color"
  | "side"
  | "prop"
  | "tone"
  | "timing"
  | "scale"
  | "scene"
  | "transform"
  | "subject"
  | "motion";

type GenerateFramesQuestionGate = {
  blocker: string | null;
  shouldProceedWithoutQuestion: boolean;
  disallowedTopics: string[];
};

type GenerateFramesFamilyConfidence = "high" | "low";
type GenerateFramesExpectationCoverage = "grounded-local" | "needs-reference";
type GenerateFramesShapeConfidence = "grounded-local" | "needs-reference";
type GenerateFramesHumanExpectationRisk = "low" | "medium" | "high";
export type GenerateFramesExecutionReadiness =
  | "ready-local"
  | "ready-search"
  | "ask-clarify"
  | "controlled-fail";
type GenerateFramesVariationProfile = {
  stagingBias: "stable" | "offset" | "dynamic";
  asymmetryBias: "low" | "medium" | "high";
  timingBias: "balanced" | "sharp" | "linger";
  silhouetteBias: "clean" | "angular" | "organic";
};

type GenerateFramesCheapFirstDecision = {
  eligible: boolean;
  trustedFamily: DrawingAiRenderingQualityFamily | null;
  reason: string | null;
};

type GenerateFramesThinkingUncertainty = {
  code: string;
  reason: string;
  risk: "low" | "high";
  question: string | null;
  options: string[];
};

type GenerateFramesSearchConfidenceDimension = keyof Omit<DrawingAiSearchConfidenceProfile, "overall">;
type GenerateFramesThinkingClauseTag = "base" | "additive" | "negative" | "sequence" | "scope" | "correction";
type GenerateFramesThinkingConflictSlot =
  | "subject identity"
  | "subject count"
  | "color"
  | "side"
  | "role"
  | "label"
  | "action"
  | "order"
  | "scene"
  | "scope"
  | "style/look"
  | "negative exclusions"
  | "completion style"
  | "still vs animation";

type GenerateFramesThinkingClause = {
  text: string;
  tags: GenerateFramesThinkingClauseTag[];
  conflictSlots: GenerateFramesThinkingConflictSlot[];
  correctionCue: string | null;
};

type GenerateFramesClausePriorityResolution = {
  clauses: GenerateFramesThinkingClause[];
  appliedCorrections: string[];
  contradictions: string[];
  unresolvedReferences: string[];
  preferredSubjectIds: string[];
  excludedSubjectIds: string[];
  scopeLocks: string[];
};

type GenerateFramesPromptParse = {
  subjects: string[];
  scenes: string[];
  actions: string[];
  constraints: string[];
  modifiers: string[];
  negatives: string[];
  sequenceMarkers: string[];
  scopeCues: string[];
  searchTriggers: string[];
  corrections: string[];
  contradictions: string[];
  unresolvedReferences: string[];
  uncertainties: GenerateFramesThinkingUncertainty[];
};

type GenerateFramesIntentClassification = {
  temporalMode: "still" | "animation" | "continuation";
  visualFamily: "character" | "object" | "effect" | "background" | "mixed";
  complexityTier: "simple" | "medium" | "complex";
};

type GenerateFramesContextDecision = {
  projectScope: DrawingAiGenerateFramesProjectScope;
  shotScope: DrawingAiGenerateFramesShotScope;
  precedenceOrder: string[];
  hasProjectAnchor: boolean;
  hasShotAnchor: boolean;
};

type GenerateFramesSubjectGraphEntry = {
  subjectId: string;
  type: DrawingAiGenerateFramesStateSubject["type"];
  color: string | null;
  side: DrawingAiGenerateFramesStateSubject["side"];
  role: DrawingAiGenerateFramesStateSubject["role"];
  label: string | null;
  aliases: string[];
  included: boolean;
  excluded: boolean;
};

type GenerateFramesSubjectGraph = {
  subjects: GenerateFramesSubjectGraphEntry[];
  activeFocusTargetIds: string[];
  collectiveGroups: string[];
  ambiguityRisk: "low" | "high";
};

type GenerateFramesExpectationTranslation = {
  axes: string[];
  structureAdjustments: string[];
  motionAdjustments: string[];
  completionAdjustments: string[];
};

type GenerateFramesAmbiguityDecision = {
  outcome: "clear" | "ask-clarify" | "controlled-fail";
  highestRiskCode: string | null;
  reason: string | null;
  question: string | null;
  options: string[];
};

type GenerateFramesThinkingSearchDecision = {
  requiredDimensions: GenerateFramesSearchConfidenceDimension[];
  lowConfidenceDimensions: GenerateFramesSearchConfidenceDimension[];
  mediumConfidenceDimensions: GenerateFramesSearchConfidenceDimension[];
  searchRequired: boolean;
  searchForbiddenByDefault: boolean;
  reason: string | null;
};

type GenerateFramesExclusionSet = {
  explicitNegatives: string[];
  derivedExclusions: string[];
  allowedImpliedAdditions: string[];
};

type GenerateFramesCompletionContract = {
  profile: GenerateFramesCompletionProfile;
  mustComplete: boolean;
  partialMomentAllowed: boolean;
  endingRequirements: string[];
};

type GenerateFramesThinkingSystem = {
  promptParse: GenerateFramesPromptParse;
  clausePriorityResolution: GenerateFramesClausePriorityResolution;
  intentClassification: GenerateFramesIntentClassification;
  contextDecision: GenerateFramesContextDecision;
  subjectGraph: GenerateFramesSubjectGraph;
  beatPlan: DrawingAiExecutionBeat[];
  expectationTranslation: GenerateFramesExpectationTranslation;
  ambiguityDecision: GenerateFramesAmbiguityDecision;
  searchDecision: GenerateFramesThinkingSearchDecision;
  exclusionSet: GenerateFramesExclusionSet;
  completionContract: GenerateFramesCompletionContract;
  clarifyingQuestion: string | null;
  clarifyingOptions: string[];
};

type GenerateFramesSequenceBeatCandidate = {
  key: string;
  label: string;
  index: number;
  completionRole: DrawingAiExecutionBeat["completionRole"];
  explicitness: DrawingAiExecutionBeat["explicitness"];
  mandatory: boolean;
};

export type GenerateFramesRuntimeAnalysis = {
  prompt: string;
  normalizedPrompt: string;
  historyContext: string;
  goalContext: string;
  requestKind: DrawingAiFrameRequestKind;
  requestedFrameCount: number;
  promptSubject: string | null;
  visualKind: GenerateFramesPromptVisualKind;
  outputMode: GenerateFramesOutputMode;
  expectedVisualClass: GenerateFramesExpectedVisualClass;
  allowedSubjectFamilies: GenerateFramesAllowedSubjectFamily[];
  subjectPurityMode: GenerateFramesSubjectPurityMode;
  expectedCompletionProfile: GenerateFramesCompletionProfile;
  expectationCoverage: GenerateFramesExpectationCoverage;
  shapeConfidence: GenerateFramesShapeConfidence;
  humanExpectationRisk: GenerateFramesHumanExpectationRisk;
  orderedBeats: string[];
  sequenceBeats: DrawingAiExecutionBeat[];
  executionGuidance: DrawingAiExecutionGuidanceProfile;
  searchConfidence: DrawingAiSearchConfidenceProfile;
  qualityFloor: DrawingAiExecutionQualityFloor;
  renderingQualityProfile: DrawingAiRenderingQualityProfile;
  familyQualityContract: DrawingAiFamilyQualityContract;
  principleActivationProfile: DrawingAiPrincipleActivationProfile;
  variationEnvelope: DrawingAiVariationEnvelope;
  renderAcceptanceContract: DrawingAiRenderAcceptanceContract;
  layerPlan: DrawingAiLayerPlan;
  cameraPlan: DrawingAiCameraPlan;
  variationProfile: GenerateFramesVariationProfile;
  variationCycleIndex: number;
  variationSignature: string;
  recentVariationSignatures: string[];
  cheapFirstDecision: GenerateFramesCheapFirstDecision;
  visualExpectationTags: string[];
  primaryFamily: GenerateFramesIntentFamily;
  componentFamilies: GenerateFramesIntentFamily[];
  concepts: GenerateFramesIntentConcept[];
  negatedConcepts: GenerateFramesIntentConcept[];
  excludedFamilies: GenerateFramesIntentFamily[];
  requestedColor: string | null;
  familyConfidence: GenerateFramesFamilyConfidence;
  noPlanBlocker: GenerateFramesNoPlanBlocker;
  noPlanReason: string | null;
  interactionMode: GenerateFramesRuntimeInteractionMode;
  projectScope: DrawingAiGenerateFramesProjectScope;
  shotScope: DrawingAiGenerateFramesShotScope;
  editIntents: GenerateFramesEditIntent[];
  actionKeywords: string[];
  buildDirection: string | null;
  expectationLines: string[];
  familyLockLines: string[];
  thinkingSystem: GenerateFramesThinkingSystem;
  executionReadiness: GenerateFramesExecutionReadiness;
  executionReadinessReason: string | null;
  questionGate: GenerateFramesQuestionGate;
  continuationState: DrawingAiGenerateFramesState | null;
  subjects: DrawingAiGenerateFramesStateSubject[];
  tone: DrawingAiGenerateFramesStateTone;
  forceLevel: DrawingAiGenerateFramesStateForceLevel;
  motionType: DrawingAiGenerateFramesStateMotionType;
  fps: number;
  modifiers: string[];
  stillFrameRequested: boolean;
  sceneSetting: string | null;
  sceneDescriptors: string[];
  sceneProps: string[];
  sceneElements: string[];
  focusTargets: string[];
  recentEdits: string[];
};

type ValidateGenerateFramesDraftsResult = {
  ok: boolean;
  repairedFrames: DrawingAiGeneratedFrameDraft[];
  reason: string | null;
};

type GenerateFramesValidationFailureCategory =
  | "critical-targeting"
  | "continuity"
  | "anti-weirdness"
  | "geometry"
  | "motion"
  | "completion"
  | "quality-floor";

type GenerateFramesValidationFailure = {
  category: GenerateFramesValidationFailureCategory;
  reason: string;
};

const isGenerateFramesHardNoPlanBlockerValue = (blocker: GenerateFramesNoPlanBlocker) =>
  blocker === "deferred-only" || blocker === "negation";

export const isGenerateFramesHardNoPlanBlocker = (
  analysis: Pick<GenerateFramesRuntimeAnalysis, "noPlanBlocker">,
) => isGenerateFramesHardNoPlanBlockerValue(analysis.noPlanBlocker);

const CONTINUATION_PATTERN =
  /\b(continue|continuation|current drawing|current frame|current sequence|same animation|same sequence|same scene|keep the same|next frame|next beat|after this|after that)\b/i;
const EFFECT_PATTERN =
  /\b(explosion|explode|blast|detonation|fireball|lightning|bolt|smoke|dust|debris|shockwave|fire|flame|glow|spark|rain|crack|cracks|fracture|fractures)\b/i;
const OBJECT_PATTERN =
  /\b(ball|circle|orb|sphere|dot|square|rectangle|block|box|rod|staff|prop|object|crate|door|desk|tree|plant|fan|propeller)\b/i;
const CHARACTER_PATTERN =
  /\b(stick(?:\s|-)?figures?|characters?|fighters?|people|persons?|humans?|creatures?|robots?|zombies?|groundhogs?|him|her|them|punch|kick|stance|guard|run|running|walk|walking)\b/i;
const BACKGROUND_PATTERN =
  /\b(background|backdrop|room|hallway|environment|scene|dark room|school hallway|corridor|landscape|plains?|plain|field|grassland|meadow|mountain(?: range)?s?|hills?|city|cityscape|skyline|buildings?|forest|woods?|grove|jungle|canyon|ravine|gorge|cliffside|rooftop|roof|bedroom|bed room|street|alley|neighborhood|suburb(?:an)?|residential(?: street| area)?|sidewalk|sidewalks|cave|cavern|cavernous|underground|arena|waterfall|falls?|cascade|river|stream|creek|brook|lake|pond|shore|coast|shoreline|ocean|sea|sky|clouds?)\b/i;
const MIXED_CONNECTOR_PATTERN =
  /\b(with|while|and|coming out of|running out of|out of the|inside the|behind the|through the|facing|versus|vs\.?|against|fighting)\b/i;
const ENTRY_SIDELESS_PATTERN =
  /\b(enter|entering|come in|coming in|run in|walk in)\b/i;
const SIDE_PATTERN = /\b(left|right|top|bottom)\b/i;
const BLOB_LIKE_OUTPUT_PATTERN =
  /\b(blob|blobby|amorphous|smudge|smudgy|messy scribble|scribble|unreadable|vague shape)\b/i;
const BROKEN_MOTION_OUTPUT_PATTERN =
  /\b(random motion|randomly|stiff|jerky|jitter(?:y)?|teleport(?:s|ing)?|broken(?: |-)?limbs?|broken(?: |-)?joints?|spaghetti(?: |-)?limbs?)\b/i;
const UNREADABLE_STRUCTURE_OUTPUT_PATTERN =
  /\b(random lines?|messy lines?|distorted structure|unclear silhouette|broken(?: |-)?limbs?|broken(?: |-)?joints?|spaghetti(?: |-)?limbs?|random angles?)\b/i;
const GENERIC_PLACEHOLDER_OUTPUT_PATTERN =
  /\b(generic|placeholder|rough sketch|quick sketch|vague|thing|stuff)\b/i;
const UNRELATED_PROP_INSERTION_PATTERN =
  /\b(tree|fan|propeller|box|crate|house|building|car|chair|table|door|desk)\b/i;
const HUMANOID_DRIFT_PATTERN =
  /\b(stick(?:\s|-)?figures?|characters?|people|persons?|humans?|face|eyes?|mouth|arms?|legs?|hands?|feet|torso|hips?|shoulders?)\b/i;
const OBJECT_ANTHROPOMORPHISM_PATTERN =
  /\b(face|eyes?|mouth|arms?|legs?|hands?|feet|character|creature|person|humanoid)\b/i;
const BACKGROUND_DRIFT_PATTERN =
  /\b(stick(?:\s|-)?figures?|characters?|people|fighters?|ball bouncing|punch|kick|running figure)\b/i;
const EFFECT_VISUAL_PATTERN =
  /\b(explosion|blast|fireball|lightning|bolt|shockwave|smoke|dust|debris|fire|flame|glow|spark|rain|crack|fracture|eruption)\b/i;
const OBJECT_VISUAL_PATTERN =
  /\b(tree|plant|fan|propeller|box|block|square|rectangle|ball|circle|orb|sphere|rod|staff|door|desk|crate|rock|cloud|mountain)\b/i;
const FACIAL_FEATURE_DRIFT_PATTERN =
  /\b(eyes?|mouth|eyebrows?|teeth|nose|facial details?|smil(?:e|ing)|grin(?:ning)?)\b/i;
const EXTRA_ACTOR_PATTERN =
  /\b(another|second|other figure|other subject|opponent|defender|attacker|both figures?|two figures?|crowd|group of fighters?)\b/i;
const EXTRA_SUBJECT_INSERTION_PATTERN =
  /\b(another (?:figure|subject|character|fighter)|second (?:figure|subject|character|fighter)|other (?:figure|subject|character)|opponent|defender|attacker|both figures?|two figures?|crowd|group of fighters?)\b/i;
const GENERIC_FALLBACK_LABEL_PATTERN = /\b(subject|thing|event|object)\b/i;
const WEAK_EXPLOSION_PATTERN =
  /\b(pop|puff|firecracker|gunpowder|tiny burst|small burst|little burst|compact burst|spark burst|cheap fallback)\b/i;
const RESET_IDENTITY_PATTERN =
  /\b(start over|restart|brand new|new character|new subject|different subject|replace the subject)\b/i;
const SCENE_RESET_PATTERN =
  /\b(start over|restart|brand new|new scene|different scene|fresh scene|cut to a new scene|new character|new subject|different subject|replace the subject)\b/i;
const FOLLOW_UP_EDIT_PATTERN =
  /\b(make it|make them|make him|make her|make this|make the|keep the same|same animation|same sequence|same drawing|same result|tweak|refine|polish|add|remove|change|bigger|larger|smaller|taller|shorter|smoother|slow(?:er)?|fast(?:er)?|heavier|weightier|cartoony|more cartoon|more cartoony|more powerful|more smoke|less smoke|shockwave|dust|dusty|spiky|poisonous|toxic|blur|fade|disintegrat(?:e|ing)|dissipat(?:e|ing)|centered|scroll|move the background|background move|brutal|serious|weak|scared|hesitant|solid head|filled head|no face|no visible face|remove the face|face each other|facing each other|guard stance|ready stance|left|right)\b/i;
const CURRENT_SUBJECT_REFERENCE_PATTERN =
  /\b(make (?:him|her|them|it|this)|keep (?:him|her|them|it|this)|turn (?:him|her|them|it|this)|change (?:him|her|them|it|this)|continue from the current (?:drawing|frame|sequence)|continue the current (?:drawing|frame|sequence)|same (?:figure|character|subject|drawing|frame|sequence|result)|current (?:figure|character|subject|drawing|frame|sequence)|existing (?:figure|character|subject|drawing|frame|sequence)|the (?:black|white|red|blue|green|yellow|orange|purple|pink|brown|gray|grey) one|the (?:left|right) one|the (?:left|right) (?:figure|character|fighter)|the (?:black|white|red|blue|green|yellow|orange|purple|pink|brown|gray|grey) (?:stick(?:\s|-)?figure|figure|character|fighter)|make the (?:walk|run|punch|kick|jump|explosion|lightning|smoke)|face each other|facing each other|guard stance|ready stance|no face|no visible face)\b/i;
const CURRENT_WORLD_REFERENCE_PATTERN =
  /\b(for (?:this|the current|the same)\s+(?:attack|move|combo|scene|shot|animation|sequence|project|world)|in (?:this|the current|the same)\s+(?:scene|shot|animation|sequence|project|world)|current (?:scene|shot|attack|move|combo|project|world)|existing (?:scene|shot|attack|move|combo|project|world)|same world|same project)\b/i;
const RELATED_NEW_ASSET_PATTERN =
  /\b(new (?:projectile|effect|attack|asset|prop|element|scene element)|separate (?:asset|effect|projectile|element)|combine(?: it)? later|use(?: it)? later|save(?: it)? for later|i(?:'ll| will) combine(?: it)? later)\b/i;
const SECOND_ACTOR_REQUEST_PATTERN =
  /\b(another|the other|a second|second stick(?:\s|-)?figure|second figure|opponent|target)\b/i;
const EXTERNAL_REFERENCE_PATTERN =
  /\b(youtube|youtu\.be|tiktok|vimeo|reference|references|inspiration|inspirations|find examples|example clips?|look up|search for|style ref(?:erence)?|show me refs?|real-world reference|animation reference)\b/i;
const SEARCH_WORTHY_MODIFIER_PATTERN =
  /\b(alan becker|combat gods|anime|manga|comic(?:\s+book)?|biomechanical|eldritch|morph into anything|transform into anything)\b/i;
const STYLE_REFERENCE_LOOKUP_PATTERN =
  /\b(in the style of|style of|styled like|inspired by|anime|manga|comic(?:\s+book)?|alan becker|combat gods|ghibli|pixar|disney|arcane|naruto|dragon ball|one piece|bleach)\b/i;
const TONE_BRUTAL_PATTERN = /\b(brutal|violent|harsh|savage)\b/i;
const TONE_POWERFUL_PATTERN = /\b(powerful|strong|forceful|dominant)\b/i;
const TONE_SERIOUS_PATTERN = /\b(serious|grounded|controlled)\b/i;
const TONE_WEAK_PATTERN = /\b(weak|timid|frail)\b/i;
const TONE_SCARED_PATTERN = /\b(scared|fearful|afraid|nervous)\b/i;
const TONE_HESITANT_PATTERN = /\b(hesitant|unsure|tentative)\b/i;
const LEFT_SUBJECT_PATTERN = /\b(left(?: one| figure| character| fighter| ball| subject)?|from the left)\b/i;
const RIGHT_SUBJECT_PATTERN = /\b(right(?: one| figure| character| fighter| ball| subject)?|from the right)\b/i;
const ALL_CURRENT_SUBJECTS_PATTERN = /\b(both|them|all of them|each other|both figures?|both stick(?:\s|-)?figures?)\b/i;
const NEGATIVE_FACE_DETAIL_PATTERN =
  /\b(no face|no visible face|without a face|no facial features|face is not visible|face isn't visible|no face is visible|no eyes|no mouth)\b/i;
const SHARED_GUARD_STANCE_PATTERN = /\b(guard stance|ready stance|fight(?:ing)? stance|battle stance)\b/i;
const FACE_EACH_OTHER_PATTERN = /\b(face each other|facing each other)\b/i;
const SOLID_HEAD_PATTERN =
  /\b(solid|filled|fill(?:ed| in)?)(?:\s+\w+){0,3}\s+(?:head|face)\b|\b(?:head|face)(?:\s+\w+){0,6}\s+(?:solid|filled|fill(?:ed| in)?)\b/i;
const SUBJECT_EDIT_ACTION_PATTERN =
  /\b(change|turn|make|recolor|swap|replace|move|shift|put|place|adjust|refine|tweak|needs? to be|should be|must be|solid|filled|fill(?:ed| in)?|no face|no visible face|without a face|taller|bigger|larger|smaller|shorter|guard stance|ready stance|face each other|facing each other)\b/i;
const STILL_SETUP_PATTERN =
  /\b(single frame|still frame|setup frame|opening frame|first frame|start(?:ing)? point|opening scene|starting scene|single setup|still image|do not animate|don't animate|no animation|just the opening|just the first frame)\b/i;
const TWO_CHARACTER_PATTERN =
  /\b(two|2|pair|both)\b(?:[\s-]+\w+){0,5}[\s-]+(stick(?:\s|-)?figures?|characters?|figures?|fighters?|people)\b/i;
const CHARACTER_PAIR_COLOR_PATTERN =
  /\b(one|left|first)\s+(black|white|red|blue|green|yellow|orange|purple|pink|brown|gray|grey)\b|\b(other|right|second)\s+(black|white|red|blue|green|yellow|orange|purple|pink|brown|gray|grey)\b/i;
const UNUSUAL_SCENE_DESCRIPTOR_PATTERN =
  /\b(alien|bioluminescent|ruined|overgrown|ancient|crystalline|volcanic|neon|cyberpunk|floating|storm[- ]?battered|underground temple|swamp)\b/i;
const BROADER_ENRICHMENT_PATTERN =
  /\b(with|plus|fighting|versus|vs\.?|against|holding|wearing|whose|that has|who has|winner|loser|foreground|background|setup|scene)\b/i;
const BROADER_SCENARIO_PATTERN = /\b(apocalypse|outbreak|invasion|onslaught|cataclysm|horde|survival scene)\b/i;
const CHARACTER_ENTITY_PATTERN = /\b(?:a|an|the)\s+((?:[a-z]+(?:-[a-z]+)?\s+){0,3}[a-z]+)\b/gi;
const SUBJECT_PAIR_PATTERN =
  /\b(?:of\s+)?(?:a|an|the)?\s*((?:[a-z]+(?:-[a-z]+)?\s+){0,3}[a-z]+)\s+(?:facing|versus|vs\.?|against|dueling|duel(?:ing)?|fighting(?!\s+(?:stance|pose|guard)\b))\s+(?:a|an|the)?\s*((?:[a-z]+(?:-[a-z]+)?\s+){0,3}[a-z]+)\b/gi;
const SUBJECT_INTERACTION_PAIR_PATTERN =
  /\b(?:of\s+)?(?:a|an|the)?\s*((?:[a-z]+(?:-[a-z]+)?\s+){0,3}[a-z]+)\s+(?:punch(?:es|ing)?|kick(?:s|ing)?|hit(?:s|ting)?|attack(?:s|ing)?|strike(?:s|ing)?|slap(?:s|ping)?|smash(?:es|ing)?)\s+(?:another|the other|a second)\s+(?:a|an|the)?\s*((?:[a-z]+(?:-[a-z]+)?\s+){0,3}[a-z]+)\b/gi;
const ENTITY_LABEL_REJECT_PATTERN =
  /\b(animation|animated|sequence|motion|progression|background|scene|setup|frame|opening|starting|still|forest|woods?|grove|jungle|canyon|ravine|gorge|cliffside|cave|cavern|grotto|underground|subterranean|arena|colosseum|stadium|rooftop|roof|bedroom|city|cityscape|street|alley|skyline|plains?|field|grassland|meadow|mountain(?: range)?s?|hills?|room|hallway|corridor|chamber|temple|shrine|sanctum|tree|trees|boulders?|rock|rocks|stalactites?|stalagmites?|buildings?|bed|ledge|pillars?|columns?|crystals?|mushrooms?|fungi|banners?|flags?|torches?|braziers?|lanterns?|rubble|debris|vines?|ivy|roots?|crowd|spectators?|fence|barrier|gate|lava|magma|cables?|wires?|platform|tram|bridge|walkway|wall|floor|door|window|vehicle|car|truck|ship|spear|sword|shield|staff|rod|blade|hammer|banner|flag|gun|blaster)\b/i;
const GENERIC_SUBJECT_LABEL_PATTERN =
  /^(?:stick(?:\s|-)?figure|figures?|fighter|fighters?|character|characters?|person|people|human|creature|creatures?|robot|robots?)$/i;
const CHARACTER_IDENTITY_HINT_PATTERN =
  /\b(monster|robot|priest|wolf|fighter|figure|character|creature|beast|guardian|soldier|warrior|mage|runner|hunter|knight|alien|zombie|ogre|demon|spirit|mantis|dragon)\b/i;
const SCENE_ELEMENT_HINT_PATTERN =
  /\b(waterfall|falls?|cascade|river|stream|creek|brook|lake|pond|shore|coast|shoreline|ocean|sea|mountain(?: range)?s?|hills?|plains?|field|grassland|meadow|tree|trees|forest|woods?|grove|jungle|boulder|boulders|rock|rocks|stone|cave|cavern|grotto|arena|rooftop|city|skyline|building|buildings|clouds?|sky|sun|moon|stars?|lava|magma)\b/i;
const LOCAL_EXPECTATION_OBJECT_PATTERN =
  /\b(tree|plant|fan|propeller|box|block|square|rectangle|ball|circle|orb|sphere|rod|staff|door|desk|crate|rock|cloud|mountain)\b/i;
const LOCAL_EXPECTATION_CHARACTER_PATTERN = /\b(stick(?:\s|-)?figure|robot|person|human|fighter)\b/i;
const LOCAL_EXPECTATION_SCENE_PATTERN =
  /\b(cave|forest|woods?|grove|jungle|hallway|room|corridor|city|skyline|rooftop|bedroom|plains?|field|grassland|meadow|mountain(?: range)?s?|landscape|arena|neighborhood|suburb(?:an)?)\b/i;
const LOCAL_ANIMATOR_EFFECT_PATTERN =
  /\b(explosion|blast|fireball|lightning|bolt|shockwave|smoke|smoke bomb|impact|bullet hit|bullet hitting|glass shatter(?:ing)?|eruption|volcano eruption|crack|fracture)\b/i;
const LOCAL_ANIMATOR_ACTION_PATTERN =
  /\b(punch|kick|fight|walk|run|jump|breathe|breathing|bounce|bouncing|roll|rolling|guard|stance)\b/i;
const LOCAL_ANIMATOR_SCENE_PATTERN =
  /\b(dark room|room|hallway|forest|cave|city|rooftop|plains?|field|grassland|meadow|mountain(?: range)?s?|waterfall|background|scene)\b/i;
const POSE_ONLY_ENTITY_LABEL_PATTERN =
  /^(?:fighting stance|fight stance|guard pose|guard stance|martial arts guard stance|ready stance|ready pose|battle pose)$/i;
const ENTITY_LABEL_HELPER_WORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "to",
  "into",
  "from",
  "same",
  "subject",
  "subjects",
  "scene",
  "current",
  "drawing",
  "animation",
  "frame",
  "project",
  "existing",
  "keep",
  "first",
  "opening",
  "starting",
  "point",
  "just",
  "give",
  "make",
  "change",
  "turn",
  "add",
  "remove",
  "everything",
  "else",
  "these",
  "those",
  "him",
  "her",
  "them",
  "it",
  "this",
  "that",
  "and",
]);
const SCENE_SETTING_PATTERNS: Array<[string, RegExp]> = [
  ["forest", /\b(forest|woods?|tree line|grove|jungle)\b/i],
  ["canyon", /\b(canyon|ravine|gorge|cliffside)\b/i],
  ["cave", /\b(cave|cavern|cavernous|underground chamber|grotto)\b/i],
  ["underground", /\b(underground|subterranean|tunnel|catacomb|sewer)\b/i],
  ["arena", /\b(arena|colosseum|stadium|pit fight|fighting pit|ring)\b/i],
  ["rooftop", /\b(rooftop|roof top|roof|rooftops)\b/i],
  ["bedroom", /\b(bedroom|bed room|bedside)\b/i],
  ["city", /\b(city|cityscape|street|skyline|urban)\b/i],
  ["neighborhood", /\b(neighborhood|suburb(?:an)?|residential(?: street| area)?|subdivision)\b/i],
  ["alley", /\b(alley|back alley|backstreet)\b/i],
  ["plains", /\b(plains?|field|grassland|meadow)\b/i],
  ["mountains", /\b(mountain(?: range)?s?|hills?)\b/i],
  ["room", /\b(room|interior|hallway|corridor|chamber)\b/i],
  ["temple", /\b(temple|shrine|sanctum|altar chamber|ruins?)\b/i],
];
const SCENE_PROP_PATTERNS: Array<[string, RegExp]> = [
  ["trees", /\b(tree|trees|trunks?|foliage|leafy|branches?)\b/i],
  ["boulders", /\b(boulder|boulders|rock|rocks|stone)\b/i],
  ["waterfall", /\b(waterfall|waterfalls|falls|cascade)\b/i],
  ["stalactites", /\b(stalactites?|stalagmites?|cave teeth|rock spires)\b/i],
  ["buildings", /\b(buildings?|skyscrapers?|windows?|rooftops?)\b/i],
  ["houses", /\b(houses?|homes?|porches?|garages?)\b/i],
  ["sidewalk", /\b(sidewalk|sidewalks|curb|curbs|driveway|driveways)\b/i],
  ["bed", /\b(bed|blanket|pillow|bedframe)\b/i],
  ["ledge", /\b(ledge|railing|roof edge)\b/i],
  ["pillars", /\b(pillars?|columns?)\b/i],
  ["crystals", /\b(crystals?|crystalline shards?)\b/i],
  ["mushrooms", /\b(mushrooms?|fungi|fungus)\b/i],
  ["banners", /\b(banners?|flags?|pennants?)\b/i],
  ["torches", /\b(torches?|braziers?)\b/i],
  ["lanterns", /\blanterns\b/i],
  ["rubble", /\b(rubble|debris piles?|ruined stone|collapsed masonry)\b/i],
  ["vines", /\b(vines?|ivy|overgrowth|roots?)\b/i],
  ["crowd", /\b(crowd|spectators?|audience)\b/i],
  ["neon-signs", /\b(neon signs?|signage|hologram ads?)\b/i],
  ["fence", /\b(fence|barrier|gate)\b/i],
  ["lava-pools", /\b(lava|magma|molten pool)\b/i],
  ["cables", /\b(cables?|wires?|power lines?)\b/i],
  ["platform", /\b(platform|tram|catwalk|walkway|dock)\b/i],
];
const SCENE_ELEMENT_PATTERNS: Array<[string, RegExp]> = [
  ["waterfall", /\b(waterfall|waterfalls|falls|cascade)\b/i],
  ["river", /\b(river|stream|creek|brook)\b/i],
  ["lake", /\b(lake|pond|shore|coast|shoreline)\b/i],
  ["sky", /\b(sky|clouds?|sun|moon|stars?)\b/i],
];
const SCENE_DESCRIPTOR_CAPTURE_PATTERN =
  /\b((?:[a-z]+(?:-[a-z]+)?\s+){0,4})(forest|woods?|tree line|grove|jungle|canyon|ravine|gorge|cliffside|cave|cavern|grotto|underground|subterranean|arena|colosseum|stadium|pit fight|rooftop|roof top|roof|bedroom|city|cityscape|street|neighborhood|suburb(?:an)?|residential(?: street| area)?|alley|skyline|urban|plains?|field|grassland|meadow|mountain(?: range)?s?|hills?|room|interior|hallway|corridor|chamber|temple|shrine|sanctum)\b/gi;
const SCENE_DESCRIPTOR_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "in",
  "on",
  "at",
  "of",
  "to",
  "for",
  "from",
  "into",
  "inside",
  "under",
  "over",
  "near",
  "with",
  "and",
  "setup",
  "frame",
  "scene",
  "still",
  "single",
  "opening",
  "starting",
  "point",
  "background",
  "draw",
  "generate",
  "create",
  "make",
  "stick",
  "figure",
  "figures",
  "fighter",
  "fighters",
  "character",
  "characters",
  "person",
  "people",
  "robot",
  "robots",
  "creature",
  "creatures",
]);
const SUBJECT_DETAIL_CAPTURE_PATTERNS = [
  /(?:with|hold(?:ing|s)?|carry(?:ing|s)?|wield(?:ing|s)?)\s+(?:an?\s+|the\s+)?((?:[a-z]+(?:-[a-z]+)?\s+){0,3}(?:staff|spear|sword|shield|torch|lantern|rod|blade|hammer|banner|flag|blaster|gun))\b/gi,
  /(?:give|add)\s+(?:the\s+)?(?:[a-z]+(?:-[a-z]+)?\s+){0,3}?(?:an?\s+|the\s+)((?:[a-z]+(?:-[a-z]+)?\s+){0,3}(?:staff|spear|sword|shield|torch|lantern|rod|blade|hammer|banner|flag|blaster|gun))\b/gi,
  /(?:wearing)\s+(?:an?\s+|the\s+)?((?:[a-z]+(?:-[a-z]+)?\s+){0,3}(?:cape|cloak|helmet|armor|armour|mask|crown|hood))\b/gi,
  /(?:with)\s+(?:an?\s+|the\s+)?((?:[a-z]+(?:-[a-z]+)?\s+){0,2}(?:wings|horns|tail))\b/gi,
] as const;
const SUBJECT_DETAIL_REMOVE_PATTERNS = [
  /\b(remove|without|lose)\s+(?:the\s+)?((?:[a-z]+(?:-[a-z]+)?\s+){0,3}(?:staff|spear|sword|shield|torch|lantern|rod|blade|hammer|banner|flag|blaster|gun|cape|cloak|helmet|armor|armour|mask|crown|hood|wings|horns|tail))\b/gi,
] as const;
const SUBJECT_DETAIL_LABEL_PATTERNS = [
  /\bwith\s+((?:[a-z]+(?:-[a-z]+)?\s+){0,3}(?:staff|spear|sword|shield|torch|lantern|rod|blade|hammer|banner|flag|blaster|gun|wings|horns|tail))\b/gi,
  /\bwearing\s+((?:[a-z]+(?:-[a-z]+)?\s+){0,3}(?:cape|cloak|helmet|armor|armour|mask|crown|hood))\b/gi,
] as const;
const ACTION_KEYWORD_PATTERNS: Array<[string, RegExp]> = [
  ["explode", /\b(explosion|explode|blast|detonation|fireball)\b/i],
  ["lightning", /\b(lightning|bolt|electric strike)\b/i],
  ["smoke", /\b(smoke|dust|debris|ash)\b/i],
  ["impact", /\b(impact|hit(?:ting)?|collid(?:e|es|ing)|crash(?:es|ing)?|slam(?:ming)?|break(?:ing)?|shatter(?:ing)?|smash(?:ing)?)\b/i],
  ["erupt", /\b(erupt(?:ion|ing|s)?|spew(?:ing)?|burst(?:ing)?|release(?:s|ing)?)\b/i],
  ["bounce", /\b(bounc(?:e|ing|es)|rebound)\b/i],
  ["roll", /\b(roll(?:ing|s)?)\b/i],
  ["morph", /\b(morph(?:ing)?|transform(?:ing|s)?)\b/i],
  ["punch", /\b(punch(?:ing|es)?)\b/i],
  ["kick", /\b(kick(?:ing|s)?)\b/i],
  ["fight", /\b(fight(?:ing)?|duel(?:ing)?|battle|spar(?:ring)?|clash(?:ing)?)\b/i],
  ["lunge", /\b(lunge|lunging|pounce|pouncing|jab|jabbing|attack(?:ing)?)\b/i],
  ["guard", /\b(guard|brace|block|parry|stance|pose)\b/i],
  ["walk", /\b(walk(?:ing|s)?|stride|step(?:ping|s)?)\b/i],
  ["run", /\b(run(?:ning|s)?|sprint|dash|charge)\b/i],
  ["jump", /\b(jump(?:ing|s)?|leap|vault)\b/i],
  ["wave", /\b(wav(?:e|es|ed|ing))\b/i],
  ["breathe", /\b(breath(?:e|es|ing)|pant(?:ing)?|breathing hard|hard breathing|inhale|exhale)\b/i],
  ["spin", /\b(spin(?:ning)?|rotate(?:s|d|ing)?|whirl(?:ing)?|twirl(?:ing)?)\b/i],
  ["fall", /\b(fall(?:ing)?|drop(?:ping)?|tumble)\b/i],
  ["swing", /\b(swing|slash|slice)\b/i],
  ["throw", /\b(throw(?:s|ing)?|hurl|launch(?:es|ing)?)\b/i],
  ["hold", /\b(hold(?:ing)?|carry(?:ing)?|wield(?:ing)?|wear(?:ing)?)\b/i],
  ["hover", /\bhover(?:ing)?\b|\bfloating\b(?!\s+(?:platform|tram|catwalk|walkway|dock|bridge|city|island|rocks?|mushrooms?|cables?))/i],
  ["crawl", /\b(crawl|creep|sneak)\b/i],
  ["stare", /\b(stare|look|glare)\b/i],
  ["roar", /\b(roar|snarl|scream)\b/i],
  ["scroll", /\b(scroll|parallax|camera follow|camera moving|camera movement|camera move|move the background|moving background|background move(?:ment)?)\b/i],
];
const EDIT_INTENT_PATTERNS: Array<[GenerateFramesEditIntent, RegExp]> = [
  ["color", /\b(color|colour|recolor|turn .*?\b(?:black|white|red|blue|green|yellow|orange|purple|pink|brown|gray|grey)\b|make .*?\b(?:black|white|red|blue|green|yellow|orange|purple|pink|brown|gray|grey)\b|solid .*?(?:head|face)|filled .*?(?:head|face)|no face|no visible face)\b/i],
  ["side", /\b(left|right|center|centered|swap sides?|move .*?\b(left|right)\b|put .*?\b(left|right)\b)\b/i],
  ["prop", /\b(hold|holding|carry|carrying|wield|wielding|wearing|with|without|remove .*?(staff|spear|sword|shield|torch|lantern|rod|blade|hammer|banner|flag|blaster|gun|cape|cloak|helmet|armor|armour|mask|crown|hood|wings|horns|tail))\b/i],
  ["tone", /\b(brutal|violent|powerful|serious|weak|scared|fearful|hesitant|ominous|menacing|calm|joyful|happy|sad|tired|exhausted|fatigued)\b/i],
  ["timing", /\b(smooth(?:er)?|cleaner|better in[- ]betweens?|faster|slower|quicker|snappier|sharp(?:er)?|crisper|timing|pace|pacing|fps)\b/i],
  ["scale", /\b(bigger|larger|smaller|wider|taller|shorter|more powerful|heavier)\b/i],
  ["scene", /\b(background|scene|setting|environment|forest|canyon|cave|underground|arena|rooftop|bedroom|city|alley|plains?|mountain(?: range)?s?|room|temple|trees?|boulders?|crystals?|mushrooms?|pillars?|vines?|buildings?|torches?|banners?|rubble)\b/i],
  ["transform", /\b(turn|transform|morph|mutate|become|replace|swap)\b(?:[\s-]+\w+){0,4}\b(?:into|with)\b/i],
  ["subject", /\b(new character|new subject|replace the subject|swap the character|different fighter|different creature)\b/i],
  ["motion", /\b(move|motion|animate|continue|next beat|next frame|then|after that|after this|face each other|facing each other|guard stance|ready stance|fight(?:ing)? stance)\b/i],
];
const DISCUSS_RUNTIME_PATTERN =
  /\?|(?:\bwhat do you think\b|\bany ideas\b|\bbrainstorm\b|\bhelp me decide\b|\bwhich is better\b|\bwhat would look better\b|\bshould (?:i|we)\b|\badvice\b|\btips\b|\boptions\b|\bideas for\b)/i;
const DEFERRED_GENERATION_PATTERN =
  /\b(not right now|not yet|eventually|for later|later on|someday|down the line)\b/i;
const IMMEDIATE_GENERATION_OVERRIDE_PATTERN =
  /\b(first frame|setup frame|still frame|starting point|opening frame|background scene now|scene now|generate now|frame now|sequence now|make now|show it now|build it now)\b/i;
const CREATE_RESET_SCENE_PATTERN = /\b(start over|restart|from scratch|brand new|new scene|different scene|new setup)\b/i;
const EXPLICIT_NEW_PROJECT_PATTERN =
  /\b(new project|different project|separate project|unrelated project|start over|restart|from scratch)\b/i;
const NEW_SHOT_SAME_PROJECT_PATTERN =
  /\b(new scene|different scene|new setup|new shot|cut to|switch to|move to|transition to|outside now|outside scene|next scene)\b/i;
const KEEP_CURRENT_SCENE_CORRECTION_PATTERN =
  /\b(?:actually\s+)?keep (?:the |this |same |current |existing )?(?:scene|shot|drawing|frame|background)\b|\b(?:same|current|existing) (?:scene|shot|drawing|frame) instead\b|\bwithout changing (?:the )?(?:scene|shot|drawing|frame|background)\b/i;
const FORCE_NEW_PROJECT_CORRECTION_PATTERN =
  /\b(?:new|different|separate|unrelated) project instead\b|\b(?:actually|instead)\s+(?:start|make|do|use)?(?:\s+a)?\s*(?:new|different|separate|unrelated) project\b/i;
const LOCAL_INTRINSIC_TOKEN_PATTERN =
  /^(?:left|right|center|same|keep|current|existing|scene|subject|subjects|animation|drawing|sequence|frame|frames|setup|opening|starting|first|point|still|background|foreground|pose|poses|make|change|add|remove|tweak|refine|polish|continue|hold|holding|carry|carrying|wield|wearing|with|without|more|less|bigger|larger|smaller|smoother|smooth|faster|slower|heavier|lighter|stronger|weaker|ominous|glowing|brutal|powerful|serious|weak|scared|hesitant|cleaner|timing|pace|pacing|color|colour|recolor|blue|red|green|yellow|orange|purple|pink|black|white|gray|grey)$/i;
const EXPLICIT_ANIMATION_PATTERN =
  /\b(animation|animate|animated|smooth animation|small animation|sequence|motion|moving|moves?|progression)\b/i;
const FUTURE_ANIMATION_REFERENCE_PATTERN =
  /\b(?:i(?:'ll| will)\s+animate|animate later|animation later|later animate|later animation|eventually animate)\b/i;
const EVENT_VISUAL_PATTERN =
  /\b(explosion|explode|blast|detonation|fireball|lightning|strike|bolt|shockwave|smoke bomb|eruption|erupt|impact|hitting the ground|bullet hit|bullet impact|crash|collision|collid(?:e|es|ing)|slam|burst|release|flash|break(?:ing)? apart|break(?:ing)?|shatter(?:ing)?|smash(?:ing)?)\b/i;
const GENERIC_SCENE_REQUEST_PATTERN =
  /\b(background|backdrop|environment|scene|landscape|room|hallway|corridor|forest|woods?|grove|jungle|canyon|ravine|gorge|cliffside|cave|cavern|underground|arena|colosseum|stadium|rooftop|roof|bedroom|street|alley|city|cityscape|skyline|plains?|field|grassland|meadow|mountain(?: range)?s?|hills?|temple|shrine|sanctum)\b/i;
const REQUEST_LEAD_IN_PATTERN =
  /^(?:please\s+)?(?:(?:generate|create|draw|make|show|give|build|design|animate)\s+(?:me\s+)?|i want\s+|i need\s+|can you\s+|could you\s+)/i;
const EXPLICIT_CREATE_REQUEST_PATTERN =
  /^(?:please\s+)?(?:(?:generate|create|draw|build|design|animate)\b|make\s+(?:me\s+)?(?:a|an|another|two|three|four|\d+|some)\b|show\s+(?:me\s+)?(?:a|an|another|two|three|four|\d+|some)\b|give\s+me\s+(?:a|an|another|two|three|four|\d+|some)\b)/i;
const STAGED_SEQUENCE_CONNECTOR_PATTERN =
  /(?:->|→|\bthen\b|\bafter that\b|\bfollowed by\b|\bending in\b|\bending with\b|\bends in\b|\bends with\b)/i;
const SUBJECT_TRAILING_SCENE_PATTERN =
  /\b(?:in|inside|within|at|on)\s+(?:a|an|the)\s+(?:dark\s+|night\s+|glowing\s+|bioluminescent\s+|alien\s+|ancient\s+|ruined\s+|underground\s+|rocky\s+|volcanic\s+|snowy\s+|stormy\s+|city\s+|forest\s+|cave\s+|bedroom\s+|arena\s+|rooftop\s+|temple\s+)?(?:background|scene|room|hallway|corridor|forest|woods?|grove|jungle|canyon|ravine|gorge|cliffside|cave|cavern|underground|arena|rooftop|bedroom|street|alley|city|cityscape|skyline|plains?|field|grassland|meadow|mountain(?: range)?s?|hills?|temple|shrine|sanctum)\b.*$/i;
const SUBJECT_TRAILING_CONNECTOR_PATTERN =
  /\b(?:with|plus|while|coming out of|running out of|facing|versus|vs\.?|against)\b.*$/i;
const SEARCH_QUERY_COMPONENT_STOPWORDS = new Set([
  "generate",
  "create",
  "draw",
  "make",
  "show",
  "give",
  "animation",
  "animated",
  "smooth",
  "frame",
  "frames",
  "scene",
  "setup",
  "still",
  "image",
  "single",
  "short",
  "just",
  "please",
  "me",
  "now",
  "later",
  "eventually",
  "will",
]);
const SEARCH_EVIDENCE_SHAPE_PATTERN =
  /\b(shape|silhouettes?|structure|proportions?|outline|body|anatomy|form|figures?|fighters?|branch(?:ing|ed)?|plume|column|cloud|crater|pose|stance|profile)\b/i;
const SEARCH_EVIDENCE_COLOR_PATTERN =
  /\b(color|colour|palette|orange|yellow|red|blue|green|purple|pink|gray|grey|ash|lava|glow|bright|dark|charcoal|white|black)\b/i;
const SEARCH_EVIDENCE_EFFECT_PATTERN =
  /\b(smoke|debris|dust|ash|embers?|flash|glow|sparks?|fragments?|haze|mist|shockwave|trail|afterglow|wisps?|plume)\b/i;
const SEARCH_EVIDENCE_MOTION_PATTERN =
  /\b(start|middle|end|phase|phases|progression|anticipation|setup|wind[- ]?up|contact|impact|peak|follow[- ]?through|recovery|aftermath|fade|settle|release|breakout|burst|rebound|reset|clash|exchange|fallout|landing|takeoff|passing|dissipat(?:e|ing|ion)|cooling)\b/i;
const SEARCH_EVIDENCE_SCENE_PATTERN =
  /\b(scene|background|environment|composition|foreground|midground|depth|lighting|floor|ground|walls?|ceiling|cave|forest|room|city|arena|rooftop|plains?|mountain|temple)\b/i;
const SEARCH_EVIDENCE_DRAWING_PATTERN =
  /\b(readable|readability|silhouettes?|outline|contour|proportions?|head|torso|limbs?|arms?|legs?|joints?|tail|spine|branch(?:ing|ed)?|zigzag|taper(?:ed|ing)?|layered|foreground|midground|background|depth|composition)\b/i;
const IMPLICIT_MOTION_ACTION_KEYWORDS = new Set([
  "impact",
  "erupt",
  "fight",
  "punch",
  "kick",
  "lunge",
  "walk",
  "run",
  "wave",
  "jump",
  "breathe",
  "spin",
  "fall",
  "swing",
  "throw",
  "bounce",
  "roll",
  "morph",
  "crawl",
  "scroll",
]);
const ACTION_ONLY_SUBJECT_LABEL_PATTERN =
  /^(?:fight|fighting|run|running|walk|walking|jump|jumping|breathe|breathing|panting|spin|spinning|fall|falling|swing|swinging|throw|throwing|punch|punching|kick|kicking|guard|stance|pose|hover|hovering|crawl|crawling|roar|roaring|stare|staring|impact|collision|crash|slam|break|breaking|shatter|shattering|smash|smashing|eruption|erupting|explode|exploding|explosion|lightning|strike|striking|smoke|burst|bursting)$/i;
const ACTION_DESCRIPTOR_MODIFIER_WORDS = new Set([
  "round",
  "roundhouse",
  "spin",
  "spinning",
  "spinningly",
  "flying",
  "airborne",
  "aerial",
  "jump",
  "jumping",
  "leap",
  "leaping",
  "side",
  "front",
  "back",
  "high",
  "low",
  "forward",
  "backward",
  "upward",
  "downward",
  "rising",
  "falling",
  "sweeping",
  "sweep",
  "turning",
  "turn",
]);
const EDIT_MODIFIER_TOKENS = new Set([
  "more",
  "less",
  "violent",
  "brutal",
  "powerful",
  "stronger",
  "weaker",
  "bigger",
  "larger",
  "smaller",
  "smoother",
  "faster",
  "slower",
  "harder",
  "softer",
  "cleaner",
  "poisonous",
  "toxic",
  "dusty",
  "smoky",
  "greener",
  "redder",
  "bluer",
  "yellow",
  "orange",
  "purple",
  "pink",
  "gray",
  "grey",
  "green",
  "red",
  "blue",
  "black",
  "white",
]);
const GENERIC_FOCUS_TARGETS = new Set([
  "subject",
  "subjects",
  "scene",
  "setup",
  "frame",
  "animation",
  "drawing",
  "project",
]);
const GENERATE_FRAMES_SEARCH_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "make",
  "create",
  "generate",
  "draw",
  "animate",
  "frame",
  "frames",
  "scene",
  "setup",
  "starting",
  "first",
  "point",
  "just",
  "one",
  "two",
  "both",
  "pair",
  "still",
  "single",
  "short",
  "same",
  "keep",
  "continue",
  "change",
  "add",
  "remove",
  "tweak",
  "refine",
  "with",
  "and",
  "into",
  "from",
  "this",
  "that",
  "it",
  "them",
  "him",
  "her",
  "very",
  "more",
  "less",
  "now",
  "later",
  "eventually",
  "will",
  "hold",
  "holding",
  "carry",
  "carrying",
  "wield",
  "wielding",
  "wearing",
  "same",
  "current",
  "existing",
  "subject",
  "subjects",
  "result",
  "drawing",
]);
const CONTINUATION_TRANSFORM_PATTERN =
  /\b(turn|transform|morph|mutate|become|replace|swap)\b(?:[\s-]+\w+){0,4}\b(?:into|with)\b/i;
const QUESTION_TOPIC_PATTERNS: Record<string, RegExp> = {
  explosion_color: /\b(color|colour|orange|red|yellow|glow|smoke)\b/i,
  lightning_color: /\b(color|colour|blue|white|glow|bright)\b/i,
  ball_roundness: /\b(round|sphere|squash|shape|transform)\b/i,
  punch_basics: /\b(anticipation|follow[- ]through|force|direction)\b/i,
  dark_room_darkness: /\b(dark|dim|shadow|light level)\b/i,
  continuation_scope: /\b(next frame|short sequence|what happens next|what kind of character|scope)\b/i,
};

const CONCEPT_PATTERNS: Record<GenerateFramesIntentConcept, RegExp> = {
  explosion: /\b(explosion|explode|blast|detonation|fireball)\b/,
  lightning: /\b(lightning|bolt|lightning strike)\b/,
  shockwave: /\b(shockwave|blast ring|dust ring)\b/,
  smoke: /\b(smoke|dust|dust cloud|mist)\b/,
  "concrete-cracks": /\b(crack|cracks|fracture|fractures)\b.*\bconcrete\b|\bconcrete\b.*\b(crack|cracks|fracture|fractures)\b/,
  "bouncing-ball": /\b(ball|circle|orb|sphere|dot)\b.*\b(bounce|bouncing|rebound|drop|fall|falling|dribble)\b|\b(bounce|bouncing|rebound|drop|fall|falling|dribble)\b.*\b(ball|circle|orb|sphere|dot)\b/,
  "rolling-ball": /\b(ball|circle|orb|sphere|dot)\b.*\b(roll|rolling)\b|\b(roll|rolling)\b.*\b(ball|circle|orb|sphere|dot)\b/,
  "morphing-ball": /\b(ball|circle|orb|sphere|dot)\b.*\b(morph|morphing|transform|transforms|anything)\b|\b(morph|morphing|transform|transforms)\b.*\b(ball|circle|orb|sphere|dot)\b/,
  rod: /\b(rod|staff|pole)\b/,
  block: /\b(square|rectangle|block|box)\b/,
  "stick-figure": /\bstick(?:\s|-)?figures?\b/,
  punch: /\bpunch(?:ing|es)?\b/,
  kick: /\bkick(?:ing|s)?\b/,
  "fighting-stance": /\b(fighting stance|fight stance|guard pose|guard stance|ready stance)\b/,
  walking: /\b(walk|walking|walk cycle)\b/,
  running: /\b(run|running|sprint)\b/,
  "dark-room": /\bdark room\b/,
  "school-hallway": /\bschool hallway\b/,
  "mountain-landscape": /\b(plains?|plain|field|grassland|meadow|landscape)\b|\bmountain(?: range)?s?\b|\bhills?\b/,
  "night-city": /\b(night(?:time)? city|city at night|night city|cityscape|skyline|buildings?)\b/,
  "zombie-apocalypse": /\b(zombie|undead)\b.*\b(apocalypse|horde|outbreak)\b|\b(apocalypse|horde|outbreak)\b.*\b(zombie|undead)\b/,
  "alien-apocalypse": /\b(alien)\b.*\b(apocalypse|invasion|onslaught)\b|\b(apocalypse|invasion|onslaught)\b.*\b(alien)\b/,
};

const NEGATED_CONCEPT_PATTERNS: Partial<Record<GenerateFramesIntentConcept, RegExp>> = {
  explosion: /\b(?:don't|do not|dont|avoid|without|skip|no|not)\b(?:\s+\w+){0,4}\s+(?:an?\s+)?(?:explosion|explode|blast|detonation|fireball)\b/,
  lightning: /\b(?:don't|do not|dont|avoid|without|skip|no|not)\b(?:\s+\w+){0,4}\s+(?:a\s+)?(?:lightning|bolt|lightning strike)\b/,
  shockwave: /\b(?:don't|do not|dont|avoid|without|skip|no|not)\b(?:\s+\w+){0,4}\s+(?:a\s+)?(?:shockwave|blast ring|dust ring)\b/,
  smoke: /\b(?:don't|do not|dont|avoid|without|skip|no|not)\b(?:\s+\w+){0,4}\s+(?:any\s+)?(?:smoke|dust|dust cloud|mist)\b/,
  "concrete-cracks": /\b(?:don't|do not|dont|avoid|without|skip|no|not)\b(?:\s+\w+){0,4}\s+(?:any\s+)?(?:concrete cracks?|cracks? in concrete|fractures? in concrete)\b/,
  "bouncing-ball": /\b(?:don't|do not|dont|avoid|without|skip|no|not)\b(?:\s+\w+){0,4}\s+(?:a\s+)?(?:bouncing|bounce|rebound|falling|dribbling)\s+(?:blue\s+)?(?:ball|circle|orb|sphere|dot)\b|\b(?:don't|do not|dont|avoid|without|skip|no|not)\b(?:\s+\w+){0,4}\s+(?:a\s+)?(?:ball|circle|orb|sphere|dot)\b(?:\s+\w+){0,4}\s+\b(?:bouncing|bounce|rebound|falling|dribbling)\b/,
  "rolling-ball": /\b(?:don't|do not|dont|avoid|without|skip|no|not)\b(?:\s+\w+){0,4}\s+(?:a\s+)?(?:rolling|roll)\s+(?:ball|circle|orb|sphere|dot)\b|\b(?:don't|do not|dont|avoid|without|skip|no|not)\b(?:\s+\w+){0,4}\s+(?:a\s+)?(?:ball|circle|orb|sphere|dot)\b(?:\s+\w+){0,4}\s+\b(?:rolling|roll)\b/,
  "morphing-ball": /\b(?:don't|do not|dont|avoid|without|skip|no|not)\b(?:\s+\w+){0,6}\s+(?:a\s+)?(?:ball|circle|orb|sphere|dot)\b(?:\s+\w+){0,6}\b(?:morph|transform|anything)\b/,
  rod: /\b(?:don't|do not|dont|avoid|without|skip|no|not)\b(?:\s+\w+){0,4}\s+(?:a\s+)?(?:rod|staff|pole)\b/,
  block: /\b(?:don't|do not|dont|avoid|without|skip|no|not)\b(?:\s+\w+){0,4}\s+(?:a\s+)?(?:square|rectangle|block|box)\b/,
  "stick-figure": /\b(?:don't|do not|dont|avoid|without|skip|no|not)\b(?:\s+\w+){0,4}\s+(?:a\s+)?(?:stick(?:\s|-)?figure)\b/,
  punch: /\b(?:don't|do not|dont|avoid|without|skip|no|not)\b(?:\s+\w+){0,4}\s+\b(?:punch|punching)\b/,
  kick: /\b(?:don't|do not|dont|avoid|without|skip|no|not)\b(?:\s+\w+){0,4}\s+\b(?:kick|kicking)\b/,
  "fighting-stance": /\b(?:don't|do not|dont|avoid|without|skip|no|not)\b(?:\s+\w+){0,4}\s+\b(?:fighting stance|fight stance|guard pose|guard stance|ready stance)\b/,
  walking: /\b(?:don't|do not|dont|avoid|without|skip|no|not)\b(?:\s+\w+){0,4}\s+\b(?:walk|walking|walk cycle)\b/,
  running: /\b(?:don't|do not|dont|avoid|without|skip|no|not)\b(?:\s+\w+){0,4}\s+\b(?:run|running|sprint)\b/,
  "dark-room": /\b(?:don't|do not|dont|avoid|without|skip|no|not)\b(?:\s+\w+){0,4}\s+(?:a\s+)?dark room\b/,
  "school-hallway": /\b(?:don't|do not|dont|avoid|without|skip|no|not)\b(?:\s+\w+){0,4}\s+(?:a\s+)?school hallway\b/,
  "mountain-landscape": /\b(?:don't|do not|dont|avoid|without|skip|no|not)\b(?:\s+\w+){0,6}\b(?:plains?|plain|field|grassland|meadow|landscape|mountain(?: range)?s?|hills?)\b/,
  "night-city": /\b(?:don't|do not|dont|avoid|without|skip|no|not)\b(?:\s+\w+){0,6}\b(?:night(?:time)? city|night city|cityscape|skyline|buildings?)\b/,
  "zombie-apocalypse": /\b(?:don't|do not|dont|avoid|without|skip|no|not)\b(?:\s+\w+){0,6}\b(?:zombie|undead)\b(?:\s+\w+){0,6}\b(?:apocalypse|horde|outbreak)\b/,
  "alien-apocalypse": /\b(?:don't|do not|dont|avoid|without|skip|no|not)\b(?:\s+\w+){0,6}\balien\b(?:\s+\w+){0,6}\b(?:apocalypse|invasion|onslaught)\b/,
};

const normalizePrompt = (value: string) =>
  value
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/[^\w\s'/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const unique = <T>(values: readonly T[]) => [...new Set(values)];

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const COLOR_TOKEN_PATTERN = /\b(black|white|red|blue|green|yellow|orange|purple|pink|brown|gray|grey)\b/gi;
const SINGLE_COLOR_TOKEN_PATTERN = /\b(black|white|red|blue|green|yellow|orange|purple|pink|brown|gray|grey)\b/i;
const BACKGROUND_COLOR_MENTION_PATTERN =
  /\b(black|white|red|blue|green|yellow|orange|purple|pink|brown|gray|grey)\b(?:\s+\w+){0,2}\s+\b(background|backdrop|sky|stage)\b/gi;

const stripBackgroundColorMentions = (normalizedPrompt: string) =>
  normalizedPrompt.replace(BACKGROUND_COLOR_MENTION_PATTERN, (_match, _color, target) => target);

const resolveCorrectedChoiceToken = ({
  normalizedPrompt,
  choices,
  windowWords = 4,
}: {
  normalizedPrompt: string;
  choices: readonly string[];
  windowWords?: number;
}) => {
  const choiceGroup = choices.map(escapeRegex).join("|");
  if (choiceGroup.length === 0) {
    return null;
  }

  const notButPattern = new RegExp(
    `\\bnot\\s+(${choiceGroup})\\b(?:\\s+\\w+){0,${windowWords}}\\s+but\\s+(${choiceGroup})\\b`,
    "i",
  );
  const notInsteadPattern = new RegExp(
    `\\bnot\\s+(${choiceGroup})\\b(?:\\s+\\w+){0,${windowWords}}\\s+(${choiceGroup})\\b\\s+instead\\b`,
    "i",
  );
  const ratherThanPattern = new RegExp(
    `\\b(${choiceGroup})\\b(?:\\s+\\w+){0,${windowWords}}\\s+rather\\s+than\\s+(${choiceGroup})\\b`,
    "i",
  );

  const correctedMatch = normalizedPrompt.match(notButPattern) ?? normalizedPrompt.match(notInsteadPattern);
  if (correctedMatch?.[2]) {
    return correctedMatch[2].toLowerCase();
  }

  const preferredMatch = normalizedPrompt.match(ratherThanPattern);
  if (preferredMatch?.[1]) {
    return preferredMatch[1].toLowerCase();
  }

  return null;
};

const detectRequestedColor = (normalizedPrompt: string) =>
  resolveCorrectedChoiceToken({
    normalizedPrompt: stripBackgroundColorMentions(normalizedPrompt),
    choices: ["black", "white", "red", "blue", "green", "yellow", "orange", "purple", "pink", "brown", "gray", "grey"],
  }) ??
  stripBackgroundColorMentions(normalizedPrompt).match(SINGLE_COLOR_TOKEN_PATTERN)?.[1]?.toLowerCase() ??
  null;

const detectRequestedColors = (normalizedPrompt: string) =>
  Array.from(
    new Set(
      [...stripBackgroundColorMentions(normalizedPrompt).matchAll(COLOR_TOKEN_PATTERN)].map(
        (match) => (match[1] ?? "").toLowerCase(),
      ),
    ),
  ).filter((value) => value.length > 0);

const detectExplicitCharacterColorSideAssignments = (normalizedPrompt: string) => {
  const assignments = new Map<"left" | "right", string>();
  const assignmentPatterns: RegExp[] = [
    /\b(black|white|red|blue|green|yellow|orange|purple|pink|brown|gray|grey)\s+(?:stick(?:\s|-)?figure|figure|character|fighter)\b(?:[\s\S]{0,48}?)\bon\s+the\s+(left|right)\b/gi,
    /\b(?:the\s+)?(?:one|figure|stick(?:\s|-)?figure|character|fighter)\s+on\s+the\s+(left|right)\s+(?:is|should be|needs? to be|must be)\s+(black|white|red|blue|green|yellow|orange|purple|pink|brown|gray|grey)\b/gi,
    /\bthe\s+(left|right)\s+(?:one|figure|stick(?:\s|-)?figure|character|fighter)\s+(?:is|should be|needs? to be|must be)\s+(black|white|red|blue|green|yellow|orange|purple|pink|brown|gray|grey)\b/gi,
  ];

  for (const pattern of assignmentPatterns) {
    for (const match of normalizedPrompt.matchAll(pattern)) {
      const first = (match[1] ?? "").toLowerCase();
      const second = (match[2] ?? "").toLowerCase();
      const side = (first === "left" || first === "right" ? first : second) as "left" | "right" | "";
      const color = first === "left" || first === "right" ? second : first;
      if ((side === "left" || side === "right") && color.length > 0) {
        assignments.set(side, color);
      }
    }
  }

  return assignments;
};

const detectSharedCharacterHeadDetail = (normalizedPrompt: string) => {
  const pluralHeadColorMatch = normalizedPrompt.match(
    /\b(black|white|red|blue|green|yellow|orange|purple|pink|brown|gray|grey)\s+heads?\b/i,
  );
  if (pluralHeadColorMatch?.[1]) {
    return `solid ${pluralHeadColorMatch[1].toLowerCase()} head`;
  }

  if (/\bsolid heads?\b|\bfilled heads?\b/i.test(normalizedPrompt)) {
    return "solid head";
  }

  return null;
};

const detectStillFrameRequested = (normalizedPrompt: string) => STILL_SETUP_PATTERN.test(normalizedPrompt);

const detectSceneSetting = (normalizedPrompt: string) =>
  SCENE_SETTING_PATTERNS.find(([, pattern]) => pattern.test(normalizedPrompt))?.[0] ?? null;

const detectSceneSettingTokens = (normalizedPrompt: string) =>
  SCENE_SETTING_PATTERNS.filter(([, pattern]) => pattern.test(normalizedPrompt)).map(([token]) => token);

const detectSceneProps = (normalizedPrompt: string) =>
  SCENE_PROP_PATTERNS.filter(([, pattern]) => pattern.test(normalizedPrompt)).map(([token]) => token);

const detectSceneElements = (normalizedPrompt: string) =>
  SCENE_ELEMENT_PATTERNS.filter(([, pattern]) => pattern.test(normalizedPrompt)).map(([token]) => token);

const normalizeDescriptorToken = (value: string) =>
  value
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !SCENE_DESCRIPTOR_STOPWORDS.has(token))
    .join(" ");

const detectSceneDescriptors = (normalizedPrompt: string) =>
  unique(
    [...normalizedPrompt.matchAll(SCENE_DESCRIPTOR_CAPTURE_PATTERN)]
      .flatMap((match) =>
        (match[1] ?? "")
          .split(/\s+/)
          .map(normalizeDescriptorToken)
          .filter((token) => token.length > 0),
      )
      .filter((token) => token.length > 0),
  );

const matchesActionDescriptorToken = (token: string, actionKeywords: readonly string[]) => {
  const normalizedToken = normalizeDescriptorToken(token);
  if (!normalizedToken) {
    return false;
  }

  return actionKeywords.some((keyword) => {
    const normalizedKeyword = normalizeDescriptorToken(keyword);
    return (
      normalizedKeyword.length >= 3 &&
      (normalizedToken === normalizedKeyword ||
        normalizedToken.startsWith(normalizedKeyword) ||
        normalizedKeyword.startsWith(normalizedToken))
    );
  });
};

const resolveSceneDescriptors = ({
  normalizedPrompt,
  actionKeywords,
  previousSceneDescriptors = [],
}: {
  normalizedPrompt: string;
  actionKeywords: readonly string[];
  previousSceneDescriptors?: readonly string[];
}) => {
  const promptDescriptors = detectSceneDescriptors(normalizedPrompt);
  if (promptDescriptors.length === 0) {
    return [...previousSceneDescriptors].filter((descriptor) => !matchesActionDescriptorToken(descriptor, actionKeywords));
  }

  return unique([...previousSceneDescriptors, ...promptDescriptors]).filter(
    (descriptor) => !matchesActionDescriptorToken(descriptor, actionKeywords),
  );
};

const resolveSceneProps = ({
  normalizedPrompt,
  previousSceneProps = [],
}: {
  normalizedPrompt: string;
  previousSceneProps?: readonly string[];
}) => {
  const detectedProps = detectSceneProps(normalizedPrompt);
  if (detectedProps.length === 0) {
    return [...previousSceneProps];
  }

  return unique([...previousSceneProps, ...detectedProps]);
};

const hasExplicitCharacterIdentityCue = (value: string | null | undefined) =>
  CHARACTER_IDENTITY_HINT_PATTERN.test(normalizeSubjectEntityLabel(value ?? ""));

const isLikelySceneElementLabel = (value: string | null | undefined) => {
  const normalizedLabel = normalizeSubjectEntityLabel(value ?? "");
  if (!normalizedLabel) {
    return false;
  }

  if (hasExplicitCharacterIdentityCue(normalizedLabel)) {
    return false;
  }

  return (
    SCENE_ELEMENT_HINT_PATTERN.test(normalizedLabel) ||
    BACKGROUND_PATTERN.test(normalizedLabel) ||
    ENTITY_LABEL_REJECT_PATTERN.test(normalizedLabel)
  );
};

const resolveSceneElements = ({
  normalizedPrompt,
  promptSubject,
  visualKind,
  sceneSetting,
  sceneProps,
  previousSceneElements = [],
}: {
  normalizedPrompt: string;
  promptSubject: string | null;
  visualKind: GenerateFramesPromptVisualKind;
  sceneSetting: string | null;
  sceneProps: readonly string[];
  previousSceneElements?: readonly string[];
}) => {
  const sceneAnchored =
    visualKind === "scene" ||
    sceneSetting != null ||
    sceneProps.length > 0 ||
    GENERIC_SCENE_REQUEST_PATTERN.test(normalizedPrompt);

  if (!sceneAnchored) {
    return [...previousSceneElements];
  }

  const additionalSceneSettings = detectSceneSettingTokens(normalizedPrompt).filter((token) => token !== sceneSetting);
  const detectedSceneElements = detectSceneElements(normalizedPrompt).filter((token) => token !== sceneSetting);
  const promptSceneSubjectTokens =
    promptSubject != null &&
    !hasExplicitCharacterIdentityCue(promptSubject) &&
    !EVENT_VISUAL_PATTERN.test(promptSubject) &&
    !EFFECT_PATTERN.test(promptSubject) &&
    !OBJECT_PATTERN.test(promptSubject)
      ? unique([
          ...detectSceneSettingTokens(promptSubject),
          ...detectSceneProps(promptSubject),
          ...detectSceneElements(promptSubject),
        ])
      : [];

  return unique([
    ...previousSceneElements,
    ...additionalSceneSettings,
    ...detectedSceneElements,
    ...promptSceneSubjectTokens,
  ]).filter((token) => token !== sceneSetting && !sceneProps.includes(token));
};

const buildFocusCandidatePattern = (candidate: string) => {
  const tokens = candidate.split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return /^$/i;
  }

  const lastToken = tokens.at(-1)!;
  const pluralFriendlyLastToken =
    /s$/i.test(lastToken) || lastToken.length < 4 ? escapeRegex(lastToken) : `${escapeRegex(lastToken)}(?:s|es)?`;
  const patternTokens = [...tokens.slice(0, -1).map(escapeRegex), pluralFriendlyLastToken];
  return new RegExp(`\\b${patternTokens.join("\\s+")}\\b`, "i");
};

const buildSubjectFocusCandidates = (subject: DrawingAiGenerateFramesStateSubject) => {
  const candidates: string[] = [];
  const normalizedLabel = normalizeSubjectEntityLabel(subject.label ?? "");

  if (normalizedLabel.length > 0 && !GENERIC_FOCUS_TARGETS.has(normalizedLabel)) {
    candidates.push(normalizedLabel);
    if (subject.color) {
      candidates.push(`${subject.color} ${normalizedLabel}`.trim());
    }
    if (subject.side && subject.side !== "center") {
      candidates.push(`${subject.side} ${normalizedLabel}`.trim());
    }
  }

  if (subject.role && !["primary", "secondary", "background", "scene-element"].includes(subject.role)) {
    candidates.push(subject.role);
  }

  for (const detail of subject.details ?? []) {
    const normalizedDetail = normalizeSubjectEntityLabel(detail);
    if (normalizedDetail.length > 0 && !GENERIC_FOCUS_TARGETS.has(normalizedDetail)) {
      candidates.push(normalizedDetail);
    }
  }

  return unique(candidates.map((candidate) => candidate.trim()).filter((candidate) => candidate.length > 0));
};

const formatFocusTargets = (focusTargets: readonly string[]) => {
  if (focusTargets.length === 0) {
    return "";
  }
  if (focusTargets.length === 1) {
    return focusTargets[0]!;
  }
  if (focusTargets.length === 2) {
    return `${focusTargets[0]} and ${focusTargets[1]}`;
  }
  return `${focusTargets.slice(0, -1).join(", ")}, and ${focusTargets.at(-1)}`;
};

const resolveFocusTargets = ({
  normalizedPrompt,
  interactionMode,
  previousState,
  subjects,
  sceneSetting,
  sceneProps,
  sceneElements,
  actionKeywords,
  promptSubject,
}: {
  normalizedPrompt: string;
  interactionMode: GenerateFramesRuntimeInteractionMode;
  previousState: DrawingAiGenerateFramesState | null;
  subjects: readonly DrawingAiGenerateFramesStateSubject[];
  sceneSetting: string | null;
  sceneProps: readonly string[];
  sceneElements: readonly string[];
  actionKeywords: readonly string[];
  promptSubject: string | null;
}) => {
  const candidates = unique([
    ...(sceneSetting ? [sceneSetting] : []),
    ...sceneProps,
    ...sceneElements,
    ...subjects.flatMap((subject) => buildSubjectFocusCandidates(subject)),
    ...actionKeywords,
  ])
    .map((candidate) => normalizeSubjectEntityLabel(candidate))
    .filter((candidate) => candidate.length > 0 && !GENERIC_FOCUS_TARGETS.has(candidate));

  const matchedTargets = candidates.filter((candidate) => buildFocusCandidatePattern(candidate).test(normalizedPrompt));
  const matchedActionTargets = actionKeywords.filter((keyword) =>
    normalizedPrompt
      .split(/\W+/)
      .some((token) => token.length > 0 && matchesActionDescriptorToken(token, [keyword])),
  );
  if (matchedTargets.length > 0 || matchedActionTargets.length > 0) {
    return unique([...matchedTargets, ...matchedActionTargets]).slice(0, 4);
  }

  if (interactionMode !== "create" && (previousState?.focusTargets?.length ?? 0) > 0) {
    return unique(
      (previousState?.focusTargets ?? [])
        .map((candidate) => normalizeSubjectEntityLabel(candidate))
        .filter((candidate) => candidate.length > 0),
    ).slice(0, 4);
  }

  if (interactionMode !== "create") {
    const persistedSceneTargets = unique([
      ...sceneProps,
      ...sceneElements,
      ...(sceneSetting ? [sceneSetting] : []),
    ]).slice(0, 4);
    if (persistedSceneTargets.length > 0) {
      return persistedSceneTargets;
    }
  }

  const primarySubjectLabel = subjects.find((subject) => subject.type !== "background")?.label ?? promptSubject;
  const normalizedPrimarySubjectLabel = normalizeSubjectEntityLabel(primarySubjectLabel ?? "");
  if (normalizedPrimarySubjectLabel.length > 0 && !GENERIC_FOCUS_TARGETS.has(normalizedPrimarySubjectLabel)) {
    return [normalizedPrimarySubjectLabel];
  }

  if (sceneSetting) {
    return [sceneSetting];
  }

  return actionKeywords.slice(0, 2);
};

const detectSubjectDetails = (normalizedPrompt: string) =>
  unique(
    SUBJECT_DETAIL_CAPTURE_PATTERNS.flatMap((pattern) =>
      [...normalizedPrompt.matchAll(pattern)]
        .map((match) => normalizeEntityLabel(match[1] ?? ""))
        .filter((value) => value.length > 0),
    ),
  );

const detectRemovedSubjectDetails = (normalizedPrompt: string) =>
  unique(
    SUBJECT_DETAIL_REMOVE_PATTERNS.flatMap((pattern) =>
      [...normalizedPrompt.matchAll(pattern)]
        .map((match) => normalizeEntityLabel(match[2] ?? ""))
        .filter((value) => value.length > 0),
    ),
  );

const detectSubjectDetailsFromLabel = (label: string | null | undefined) => {
  const normalizedLabel = normalizePrompt(label ?? "");
  if (!normalizedLabel) {
    return [];
  }

  return unique(
    SUBJECT_DETAIL_LABEL_PATTERNS.flatMap((pattern) =>
      [...normalizedLabel.matchAll(pattern)]
        .map((match) => normalizeEntityLabel(match[1] ?? ""))
        .filter((value) => value.length > 0),
    ),
  );
};

const mergeSubjectDetails = ({
  label,
  existingDetails,
  addedDetails,
  removedDetails,
}: {
  label: string | null | undefined;
  existingDetails?: readonly string[];
  addedDetails: readonly string[];
  removedDetails: readonly string[];
}) => {
  const detailSet = new Set<string>([
    ...(existingDetails ?? []).map((detail) => normalizeEntityLabel(detail)),
    ...detectSubjectDetailsFromLabel(label),
  ]);

  for (const removedDetail of removedDetails) {
    detailSet.delete(normalizeEntityLabel(removedDetail));
  }

  for (const addedDetail of addedDetails) {
    const normalizedDetail = normalizeEntityLabel(addedDetail);
    if (normalizedDetail.length > 0) {
      detailSet.add(normalizedDetail);
    }
  }

  return [...detailSet].filter((detail) => detail.length > 0);
};

const mergeSubjectLabelDetails = ({
  label,
  addedDetails,
  removedDetails,
}: {
  label: string | null | undefined;
  addedDetails: readonly string[];
  removedDetails: readonly string[];
}) => {
  let nextLabel = label?.trim() ?? "";
  for (const removedDetail of removedDetails) {
    if (!removedDetail) {
      continue;
    }
    nextLabel = nextLabel
      .replace(new RegExp(`\\b(?:with|wearing)\\s+${escapeRegex(removedDetail)}\\b`, "i"), " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  for (const addedDetail of addedDetails) {
    if (!addedDetail || new RegExp(`\\b${escapeRegex(addedDetail)}\\b`, "i").test(nextLabel)) {
      continue;
    }
    nextLabel = nextLabel.length > 0 ? `${nextLabel} with ${addedDetail}` : addedDetail;
  }

  return nextLabel.length > 0 ? nextLabel : null;
};

const normalizeEntityLabel = (value: string) =>
  value
    .replace(/\b(?:just|only|single|setup|frame|scene|starting|opening|still)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeSubjectEntityLabel = (value: string) =>
  normalizeEntityLabel(
    value
      .trim()
      .replace(/^(?:me|us)\s+/i, "")
      .replace(/^(?:a|an|the)\s+/i, "")
      .replace(/^(?:make|keep|turn|change|add|remove|continue|refine|polish|tweak)\s+(?:the\s+)?/i, "")
      .replace(
        /^(?:(?:smooth|short|small|single|simple|readable|clean|clear)\s+)*(?:animation|sequence|motion|setup|scene|frame)\s+of\s+/i,
        "",
      )
      .replace(/^(?:(?:smooth|short|small|single|simple|readable|clean|clear)\s+)*(?:animation|sequence|motion|setup|scene|frame)\s+/i, "")
      .replace(/^(?:of|with)\s+/i, "")
      .replace(/\b(?:of|for|from)\s+(?:a|an|the)\s*$/i, "")
      .replace(
        /\b(?:punch(?:ing)?|kick(?:ing)?|hit(?:ting)?|attack(?:ing)?|strike(?:s|ing)?)\b\s+(?:another|the other|a second|toward|into|at|through|in)\b.*$/i,
        "",
      )
      .replace(/\b(?:lunging|lunge|attacking|attack|charging|charge|running|run|walking|walk|jumping|jump|leaping|leap|swinging|swing|throwing|throw|holding|hold|hovering|hover|floating|float)\b.*$/i, "")
      .replace(/\b(?:facing|versus|vs\.?|against|dueling|duel(?:ing)?|fighting|on|in|at|with)\b.*$/i, "")
      .replace(/\s+/g, " "),
  );

const buildStableSubjectBindings = ({
  subjects,
  previousBindings = [],
}: {
  subjects: readonly DrawingAiGenerateFramesStateSubject[];
  previousBindings?: readonly DrawingAiSubjectBinding[];
}) => {
  const knownSubjectIds = new Set(subjects.map((subject) => subject.id));
  const bindingsByAlias = new Map<string, DrawingAiSubjectBinding>();
  const addBinding = (alias: string, subjectId: string, bindingType: DrawingAiSubjectBinding["bindingType"]) => {
    if (!knownSubjectIds.has(subjectId)) {
      return;
    }

    const normalizedAlias = normalizeSubjectEntityLabel(alias);
    if (!normalizedAlias) {
      return;
    }

    const existing = bindingsByAlias.get(normalizedAlias);
    if (existing && existing.subjectId !== subjectId) {
      return;
    }

    bindingsByAlias.set(normalizedAlias, {
      alias: normalizedAlias,
      subjectId,
      bindingType,
    });
  };

  for (const subject of subjects) {
    const normalizedLabel = normalizeSubjectEntityLabel(subject.label ?? "");
    if (normalizedLabel.length > 0 && !isGenericSubjectLabel(normalizedLabel)) {
      addBinding(normalizedLabel, subject.id, "label");
    }

    if (subject.color) {
      addBinding(subject.color, subject.id, "color");
      addBinding(`${subject.color} one`, subject.id, "color");
      addBinding(`the ${subject.color} one`, subject.id, "color");
      addBinding(`${subject.color} figure`, subject.id, "color");
      addBinding(`the ${subject.color} figure`, subject.id, "color");
      addBinding(`${subject.color} stick figure`, subject.id, "color");
      addBinding(`the ${subject.color} stick figure`, subject.id, "color");
      addBinding(`${subject.color} character`, subject.id, "color");
      addBinding(`${subject.color} fighter`, subject.id, "color");
    }

    if (subject.side === "left" || subject.side === "right") {
      addBinding(subject.side, subject.id, "side");
      addBinding(`${subject.side} one`, subject.id, "side");
      addBinding(`the ${subject.side} one`, subject.id, "side");
      addBinding(`${subject.side} figure`, subject.id, "side");
      addBinding(`the ${subject.side} figure`, subject.id, "side");
      addBinding(`${subject.side} stick figure`, subject.id, "side");
      addBinding(`the ${subject.side} stick figure`, subject.id, "side");
      addBinding(`${subject.side} character`, subject.id, "side");
      addBinding(`${subject.side} fighter`, subject.id, "side");
    }

    switch (subject.role) {
      case "primary":
        addBinding("primary", subject.id, "role");
        addBinding("main", subject.id, "role");
        addBinding("lead", subject.id, "role");
        break;
      case "secondary":
        addBinding("secondary", subject.id, "role");
        addBinding("other", subject.id, "role");
        addBinding("second", subject.id, "role");
        break;
      case "attacker":
        addBinding("attacker", subject.id, "role");
        addBinding("striker", subject.id, "role");
        break;
      case "defender":
        addBinding("defender", subject.id, "role");
        addBinding("target", subject.id, "role");
        break;
      case "target":
        addBinding("target", subject.id, "role");
        break;
    }
  }

  for (const binding of previousBindings) {
    if (binding.bindingType !== "label" || !knownSubjectIds.has(binding.subjectId)) {
      continue;
    }
    addBinding(binding.alias, binding.subjectId, binding.bindingType);
  }

  return [...bindingsByAlias.values()];
};

const resolveStateSubjectBindings = (state: DrawingAiGenerateFramesState | null) =>
  state == null
    ? []
    : buildStableSubjectBindings({
        subjects: state.subjects,
        previousBindings: state.subjectBindings ?? [],
      });

const promptReferencesAllCurrentSubjects = (normalizedPrompt: string) =>
  ALL_CURRENT_SUBJECTS_PATTERN.test(normalizedPrompt);

const promptLocksCurrentScene = (normalizedPrompt: string) =>
  KEEP_CURRENT_SCENE_CORRECTION_PATTERN.test(normalizedPrompt);

const promptForcesNewProjectByCorrection = (normalizedPrompt: string) =>
  FORCE_NEW_PROJECT_CORRECTION_PATTERN.test(normalizedPrompt);

const buildSubjectReferencePattern = (value: string, flags = "i") => {
  const normalizedValue = normalizeSubjectEntityLabel(value);
  if (normalizedValue.length === 0) {
    return null;
  }

  const tokens = normalizedValue.split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return null;
  }

  return new RegExp(`\\b${tokens.map(escapeRegex).join("\\s+")}(?:'s)?\\b`, flags);
};

const buildSubjectPromptReferenceCandidates = ({
  subject,
  subjectBindings = [],
}: {
  subject: DrawingAiGenerateFramesStateSubject;
  subjectBindings?: readonly DrawingAiSubjectBinding[];
}) => {
  const candidates = new Set<string>();
  const normalizedLabel = normalizeSubjectEntityLabel(subject.label ?? "");

  if (normalizedLabel.length > 0 && !isGenericSubjectLabel(normalizedLabel)) {
    candidates.add(normalizedLabel);
  }

  if (subject.color) {
    candidates.add(subject.color);
    candidates.add(`${subject.color} one`);
    candidates.add(`the ${subject.color} one`);
    candidates.add(`${subject.color} figure`);
    candidates.add(`${subject.color} stick figure`);
    candidates.add(`${subject.color} character`);
    candidates.add(`${subject.color} fighter`);
  }

  if (subject.side === "left" || subject.side === "right") {
    candidates.add(subject.side);
    candidates.add(`${subject.side} one`);
    candidates.add(`the ${subject.side} one`);
    candidates.add(`${subject.side} figure`);
    candidates.add(`${subject.side} stick figure`);
    candidates.add(`${subject.side} character`);
  }

  switch (subject.role) {
    case "primary":
      candidates.add("primary");
      candidates.add("main");
      candidates.add("lead");
      break;
    case "secondary":
      candidates.add("secondary");
      candidates.add("other");
      candidates.add("second");
      break;
    case "attacker":
      candidates.add("attacker");
      candidates.add("striker");
      break;
    case "defender":
      candidates.add("defender");
      candidates.add("target");
      break;
    case "target":
      candidates.add("target");
      break;
  }

  for (const binding of subjectBindings) {
    if (binding.subjectId === subject.id) {
      candidates.add(binding.alias);
    }
  }

  return [...candidates]
    .map((candidate) => normalizeSubjectEntityLabel(candidate))
    .filter((candidate) => candidate.length > 0);
};

const collectSubjectPromptWindows = (normalizedPrompt: string, candidates: readonly string[]) => {
  const windows = new Set<string>();

  for (const candidate of candidates) {
    const pattern = buildSubjectReferencePattern(candidate, "gi");
    if (pattern == null) {
      continue;
    }

    for (const match of normalizedPrompt.matchAll(pattern)) {
      const index = match.index ?? -1;
      if (index < 0) {
        continue;
      }

      const start = Math.max(0, index - 48);
      const end = Math.min(normalizedPrompt.length, index + match[0].length + 96);
      const window = normalizedPrompt.slice(start, end).trim();
      if (window.length > 0) {
        windows.add(window);
      }
    }
  }

  return [...windows];
};

type GenerateFramesCorrectedSubjectTargeting = {
  preferredSubjectIds: string[];
  excludedSubjectIds: string[];
  preferredAliases: string[];
  excludedAliases: string[];
};

const resolveCorrectionAwareSubjectTargeting = ({
  normalizedPrompt,
  subjects,
  subjectBindings,
}: {
  normalizedPrompt: string;
  subjects: readonly DrawingAiGenerateFramesStateSubject[];
  subjectBindings: readonly DrawingAiSubjectBinding[];
}): GenerateFramesCorrectedSubjectTargeting => {
  const mentions: Array<{
    subjectId: string;
    alias: string;
    start: number;
    end: number;
  }> = [];
  const seenMentionKeys = new Set<string>();

  for (const subject of subjects) {
    if (subject.type === "background") {
      continue;
    }

    for (const alias of buildSubjectPromptReferenceCandidates({
      subject,
      subjectBindings,
    })) {
      const normalizedAlias = normalizeSubjectEntityLabel(alias);
      if (
        normalizedAlias.length === 0 ||
        isGenericSubjectLabel(normalizedAlias) ||
        (/^(?:left|right|center)$/.test(normalizedAlias)) ||
        (normalizedAlias.split(/\s+/).length === 1 && SINGLE_COLOR_TOKEN_PATTERN.test(normalizedAlias))
      ) {
        continue;
      }

      const pattern = buildSubjectReferencePattern(alias, "gi");
      if (pattern == null) {
        continue;
      }

      for (const match of normalizedPrompt.matchAll(pattern)) {
        const start = match.index ?? -1;
        if (start < 0) {
          continue;
        }

        const key = `${subject.id}:${start}`;
        if (seenMentionKeys.has(key)) {
          continue;
        }

        seenMentionKeys.add(key);
        mentions.push({
          subjectId: subject.id,
          alias,
          start,
          end: start + match[0].length,
        });
      }
    }
  }

  mentions.sort((left, right) => left.start - right.start);

  const preferredSubjectIds = new Set<string>();
  const excludedSubjectIds = new Set<string>();
  const preferredAliases = new Set<string>();
  const excludedAliases = new Set<string>();
  const preferMention = (mention: (typeof mentions)[number]) => {
    preferredSubjectIds.add(mention.subjectId);
    preferredAliases.add(mention.alias);
  };
  const excludeMention = (mention: (typeof mentions)[number]) => {
    excludedSubjectIds.add(mention.subjectId);
    excludedAliases.add(mention.alias);
  };

  for (const mention of mentions) {
    const before = normalizedPrompt.slice(Math.max(0, mention.start - 24), mention.start);
    const after = normalizedPrompt.slice(mention.end, Math.min(normalizedPrompt.length, mention.end + 24));
    if (/\b(?:not|except)\s*$/.test(before)) {
      excludeMention(mention);
    }
    if (/\b(?:actually|instead)\s*$/.test(before) || /^\s*instead\b/.test(after)) {
      preferMention(mention);
    }
  }

  for (let index = 0; index < mentions.length - 1; index += 1) {
    const current = mentions[index]!;
    const next = mentions[index + 1]!;
    const beforeCurrent = normalizedPrompt.slice(Math.max(0, current.start - 24), current.start);
    const between = normalizedPrompt.slice(current.end, next.start);
    const afterNext = normalizedPrompt.slice(next.end, Math.min(normalizedPrompt.length, next.end + 24));
    if (/\bnot\s*$/.test(beforeCurrent) && /\bbut\b/.test(between)) {
      excludeMention(current);
      preferMention(next);
    } else if (/\bnot\s*$/.test(beforeCurrent) && /\binstead\b/.test(afterNext)) {
      excludeMention(current);
      preferMention(next);
    } else if (/\brather than\b/.test(between)) {
      preferMention(current);
      excludeMention(next);
    }
  }

  for (const preferredSubjectId of preferredSubjectIds) {
    excludedSubjectIds.delete(preferredSubjectId);
  }

  return {
    preferredSubjectIds: [...preferredSubjectIds],
    excludedSubjectIds: [...excludedSubjectIds],
    preferredAliases: [...preferredAliases],
    excludedAliases: [...excludedAliases],
  };
};

const detectSharedCharacterDetails = (normalizedPrompt: string) => {
  const details: string[] = [];

  if (NEGATIVE_FACE_DETAIL_PATTERN.test(normalizedPrompt)) {
    details.push("no visible face");
  }

  const sharedHeadDetail = detectSharedCharacterHeadDetail(normalizedPrompt);
  if (sharedHeadDetail) {
    details.push(sharedHeadDetail);
  } else if (SOLID_HEAD_PATTERN.test(normalizedPrompt) && !COLOR_TOKEN_PATTERN.test(normalizedPrompt)) {
    details.push("solid head");
  }

  return unique(details);
};

const detectSubjectSpecificHeadFillDetail = ({
  normalizedPrompt,
  subject,
  subjectPromptWindows,
}: {
  normalizedPrompt: string;
  subject: DrawingAiGenerateFramesStateSubject;
  subjectPromptWindows: readonly string[];
}) => {
  if (subject.type !== "character" || !SOLID_HEAD_PATTERN.test(normalizedPrompt)) {
    return null;
  }

  const color = subject.color?.toLowerCase() ?? null;
  const windows = subjectPromptWindows.length > 0 ? subjectPromptWindows : [normalizedPrompt];

  if (color) {
    const colorPattern = new RegExp(`\\b${escapeRegex(color)}\\b`, "i");
    if (windows.some((window) => colorPattern.test(window) && SOLID_HEAD_PATTERN.test(window))) {
      return `solid ${color} head`;
    }
  }

  if (subjectPromptWindows.length > 0 && windows.some((window) => SOLID_HEAD_PATTERN.test(window))) {
    return color ? `solid ${color} head` : "solid head";
  }

  return null;
};

const detectSubjectSpecificDetails = ({
  normalizedPrompt,
  subject,
  subjectPromptWindows,
  sharedCharacterDetails,
}: {
  normalizedPrompt: string;
  subject: DrawingAiGenerateFramesStateSubject;
  subjectPromptWindows: readonly string[];
  sharedCharacterDetails: readonly string[];
}) => {
  const details = new Set<string>();
  const detailSource = subjectPromptWindows.join(" ");

  if (subject.type === "character") {
    for (const detail of sharedCharacterDetails) {
      if (
        detail === "no visible face" ||
        (detail === "solid head" && subjectPromptWindows.length > 0) ||
        (/^solid\s+(?:black|white|red|blue|green|yellow|orange|purple|pink|brown|gray|grey)\s+head$/.test(detail) &&
          (subjectPromptWindows.length > 0 || promptReferencesAllCurrentSubjects(normalizedPrompt)))
      ) {
        details.add(detail);
      }
    }
  }

  const headFillDetail = detectSubjectSpecificHeadFillDetail({
    normalizedPrompt,
    subject,
    subjectPromptWindows,
  });
  if (headFillDetail) {
    details.add(headFillDetail);
  }

  if (/\bslightly taller|a little taller\b/i.test(detailSource)) {
    details.add("slightly taller");
  } else if (/\btaller\b/i.test(detailSource)) {
    details.add("taller");
  } else if (/\bbigger|larger\b/i.test(detailSource)) {
    details.add("bigger");
  } else if (/\bsmaller|shorter\b/i.test(detailSource)) {
    details.add("smaller");
  }

  return [...details];
};

const normalizeSearchComponent = (value: string | null | undefined) =>
  normalizePrompt(value ?? "")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !SEARCH_QUERY_COMPONENT_STOPWORDS.has(token))
    .join(" ")
    .trim();

const dedupeSearchQueryTokens = (value: string) => {
  const seen = new Set<string>();
  return value
    .split(/\s+/)
    .filter((token) => {
      const normalizedToken = token.trim().toLowerCase();
      if (!normalizedToken) {
        return false;
      }
      if (seen.has(normalizedToken)) {
        return false;
      }
      seen.add(normalizedToken);
      return true;
    })
    .join(" ")
    .trim();
};

const extractPromptSubjectLabel = (normalizedPrompt: string) => {
  const withoutLeadIn = normalizedPrompt
    .replace(REQUEST_LEAD_IN_PATTERN, "")
    .replace(STILL_SETUP_PATTERN, " ")
    .replace(EXPLICIT_ANIMATION_PATTERN, " ")
    .replace(/\b(?:readable|clean|cleaner|simple|nice|cool|good|serious)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const firstSentence = withoutLeadIn.split(/[.!?]/)[0]?.trim() ?? "";
  let candidate = firstSentence
    .replace(SUBJECT_TRAILING_SCENE_PATTERN, "")
    .replace(SUBJECT_TRAILING_CONNECTOR_PATTERN, "")
    .replace(/\bnow\b(?=\s*,?\s*i(?:'ll| will)\s+animate\b)/gi, " ")
    .replace(/\b(?:i(?:'ll| will)\s+animate|animate later|animation later|later on|eventually|not right now|not yet)\b.*$/i, "")
    .replace(/\b(?:do not animate|don't animate|no animation)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  let previousCandidate = "";
  while (candidate.length > 0 && candidate !== previousCandidate) {
    previousCandidate = candidate;
    candidate = candidate.replace(/^(?:(?:of|a|an|the)\s+)+/i, "").trim();
  }

  const normalizedCandidate = normalizeSubjectEntityLabel(candidate);
  if (
    normalizedCandidate.length > 0 &&
    normalizedCandidate.length < candidate.length &&
    !EVENT_VISUAL_PATTERN.test(normalizedCandidate) &&
    !GENERIC_SCENE_REQUEST_PATTERN.test(normalizedCandidate)
  ) {
    return normalizedCandidate;
  }

  return candidate.length > 0 ? candidate : null;
};

const stripPromptForStandaloneSubjectComparison = (normalizedPrompt: string) =>
  normalizedPrompt
    .replace(REQUEST_LEAD_IN_PATTERN, "")
    .replace(STILL_SETUP_PATTERN, " ")
    .replace(EXPLICIT_ANIMATION_PATTERN, " ")
    .replace(/\b(?:please|just)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isStandalonePromptSubjectRequest = ({
  normalizedPrompt,
  promptSubject,
}: {
  normalizedPrompt: string;
  promptSubject: string | null;
}) => {
  const normalizedSubject = normalizeSubjectEntityLabel(promptSubject ?? "");
  if (!normalizedSubject) {
    return false;
  }

  const normalizedBody = normalizeSubjectEntityLabel(
    stripPromptForStandaloneSubjectComparison(normalizedPrompt),
  );
  return normalizedBody.length > 0 && normalizedBody === normalizedSubject;
};

const shouldTreatScenePropsAsStandaloneSubject = ({
  normalizedPrompt,
  promptSubject,
  sceneSetting,
  sceneProps,
}: {
  normalizedPrompt: string;
  promptSubject: string | null;
  sceneSetting: string | null;
  sceneProps: readonly string[];
}) => {
  const normalizedSubject = normalizeSubjectEntityLabel(promptSubject ?? "");
  if (!normalizedSubject || sceneSetting != null || sceneProps.length === 0) {
    return false;
  }

  if (!isStandalonePromptSubjectRequest({ normalizedPrompt, promptSubject })) {
    return false;
  }

  if (/\b(background|backdrop|environment|scene|landscape|camera|full[- ]screen|full screen)\b/i.test(normalizedPrompt)) {
    return false;
  }

  return OBJECT_PATTERN.test(normalizedSubject) || isLikelySceneElementLabel(normalizedSubject);
};

const isActionOnlyPromptSubjectLabel = (
  promptSubjectLabel: string | null,
  actionKeywords: readonly string[],
) => {
  const normalizedLabel = normalizeSubjectEntityLabel(promptSubjectLabel ?? "");
  if (!normalizedLabel) {
    return false;
  }

  if (ACTION_ONLY_SUBJECT_LABEL_PATTERN.test(normalizedLabel)) {
    return true;
  }

  const labelTokens = normalizedLabel.split(/\s+/).filter((token) => token.length > 0);
  if (labelTokens.length === 0) {
    return false;
  }

  const actionTokenSet = new Set<string>([
    ...actionKeywords,
    "fight",
    "fighting",
    "run",
    "running",
    "walk",
    "walking",
    "jump",
    "jumping",
    "fall",
    "falling",
    "swing",
    "swinging",
    "throw",
    "throwing",
    "punch",
    "punching",
    "kick",
    "kicking",
    "guard",
    "stance",
    "pose",
    "hover",
    "hovering",
    "crawl",
    "crawling",
    "roar",
    "roaring",
    "stare",
    "staring",
  ]);

  return labelTokens.every((token) => actionTokenSet.has(token));
};

const isActionDescriptorLikeLabel = (value: string | null | undefined) => {
  const normalizedLabel = normalizeSubjectEntityLabel(value ?? "");
  if (!normalizedLabel) {
    return false;
  }

  if (ACTION_ONLY_SUBJECT_LABEL_PATTERN.test(normalizedLabel)) {
    return true;
  }

  const labelTokens = normalizedLabel.split(/\s+/).filter((token) => token.length > 0);
  if (labelTokens.length === 0) {
    return false;
  }

  const actionTokenSet = new Set<string>([
    "fight",
    "fighting",
    "run",
    "running",
    "walk",
    "walking",
    "jump",
    "jumping",
    "fall",
    "falling",
    "swing",
    "swinging",
    "throw",
    "throwing",
    "punch",
    "punching",
    "kick",
    "kicking",
    "guard",
    "stance",
    "pose",
    "hover",
    "hovering",
    "crawl",
    "crawling",
    "roar",
    "roaring",
    "stare",
    "staring",
    "impact",
    "collision",
    "crash",
    "slam",
    "break",
    "breaking",
    "shatter",
    "shattering",
    "smash",
    "smashing",
    "eruption",
    "erupting",
    "explode",
    "exploding",
    "explosion",
    "lightning",
    "strike",
    "striking",
    "smoke",
    "burst",
    "bursting",
  ]);

  let actionTokenCount = 0;
  for (const token of labelTokens) {
    if (actionTokenSet.has(token)) {
      actionTokenCount += 1;
      continue;
    }

    if (ACTION_DESCRIPTOR_MODIFIER_WORDS.has(token)) {
      continue;
    }

    return false;
  }

  return actionTokenCount > 0;
};

const resolveImplicitCharacterActionLabel = (actionKeywords: readonly string[]) => {
  if (actionKeywords.includes("fight")) {
    return "fighter";
  }
  if (actionKeywords.includes("run")) {
    return "runner";
  }
  if (actionKeywords.includes("walk")) {
    return "walker";
  }
  if (actionKeywords.includes("jump")) {
    return "jumper";
  }
  if (actionKeywords.includes("fall")) {
    return "falling figure";
  }
  if (
    actionKeywords.some((keyword) =>
      ["punch", "kick", "guard", "lunge", "swing", "throw"].includes(keyword),
    )
  ) {
    return "fighter";
  }

  return "character";
};

const classifyPromptVisualKind = ({
  normalizedPrompt,
  promptSubject,
  sceneSetting,
  componentFamilies,
}: {
  normalizedPrompt: string;
  promptSubject: string | null;
  sceneSetting: string | null;
  componentFamilies: readonly GenerateFramesIntentFamily[];
}): GenerateFramesPromptVisualKind => {
  const distinctFamilies = unique(
    componentFamilies.filter((family) => family !== "continuation" && family !== "mixed"),
  );
  const eventSignalPresent =
    EVENT_VISUAL_PATTERN.test(normalizedPrompt) || EVENT_VISUAL_PATTERN.test(promptSubject ?? "");
  const eventCompatibleFamilies =
    distinctFamilies.length > 0 && distinctFamilies.every((family) => family === "effect" || family === "object");

  if (eventSignalPresent && eventCompatibleFamilies) {
    return "event";
  }

  if (distinctFamilies.length >= 2) {
    return "mixed";
  }

  if (sceneSetting != null || GENERIC_SCENE_REQUEST_PATTERN.test(normalizedPrompt)) {
    return "scene";
  }

  if (eventSignalPresent) {
    return "event";
  }

  return "thing";
};

const resolvePromptOutputMode = ({
  normalizedPrompt,
  stillFrameRequested,
  visualKind,
  actionKeywords,
}: {
  normalizedPrompt: string;
  stillFrameRequested: boolean;
  visualKind: GenerateFramesPromptVisualKind;
  actionKeywords: readonly string[];
}): GenerateFramesOutputMode => {
  if (stillFrameRequested) {
    return "still";
  }

  if (visualKind === "scene" && FUTURE_ANIMATION_REFERENCE_PATTERN.test(normalizedPrompt)) {
    return "still";
  }

  if (EXPLICIT_ANIMATION_PATTERN.test(normalizedPrompt)) {
    return "animation";
  }

  if (visualKind === "event") {
    return "animation";
  }

  if (actionKeywords.some((keyword) => IMPLICIT_MOTION_ACTION_KEYWORDS.has(keyword))) {
    return "animation";
  }

  return "still";
};

const inferFamiliesFromPromptSubject = ({
  promptSubject,
  visualKind,
  promptSceneSetting,
  promptSceneProps,
}: {
  promptSubject: string | null;
  visualKind: GenerateFramesPromptVisualKind;
  promptSceneSetting: string | null;
  promptSceneProps: readonly string[];
}) => {
  const families: GenerateFramesIntentFamily[] = [];
  const normalizedSubject = promptSubject ?? "";

  if (visualKind === "mixed") {
    return ["mixed"];
  }

  if (promptSceneSetting != null || promptSceneProps.length > 0 || visualKind === "scene") {
    families.push("background");
  }

  if (visualKind === "event" || EFFECT_PATTERN.test(normalizedSubject)) {
    families.push("effect");
  }

  if (OBJECT_PATTERN.test(normalizedSubject)) {
    families.push("object");
  }

  if (
    normalizedSubject.length > 0 &&
    visualKind !== "event" &&
    visualKind !== "scene" &&
    !EFFECT_PATTERN.test(normalizedSubject) &&
    !OBJECT_PATTERN.test(normalizedSubject) &&
    !GENERIC_SCENE_REQUEST_PATTERN.test(normalizedSubject)
  ) {
    families.push(isCharacterLikeEntityLabel(normalizedSubject) ? "character" : visualKind === "thing" ? "character" : "effect");
  }

  return unique(families.filter((family) => family !== "mixed"));
};

const extractSubjectIdentityKeywords = (value: string | null | undefined) =>
  normalizePrompt(value ?? "")
    .split(/\s+/)
    .filter(
      (token) =>
        token.length >= 4 &&
        !GENERATE_FRAMES_SEARCH_STOPWORDS.has(token) &&
        !SEARCH_QUERY_COMPONENT_STOPWORDS.has(token) &&
        !["figure", "figures", "character", "characters", "fighter", "fighters", "thing", "scene"].includes(token),
    );

const isGenericSubjectLabel = (value: string | null | undefined) => GENERIC_SUBJECT_LABEL_PATTERN.test(normalizeEntityLabel(value ?? ""));

const isCharacterLikeEntityLabel = (value: string | null | undefined) => {
  const normalizedLabel = normalizeSubjectEntityLabel(value ?? "");
  if (!normalizedLabel) {
    return false;
  }

  if (isActionDescriptorLikeLabel(normalizedLabel)) {
    return false;
  }

  if (CHARACTER_IDENTITY_HINT_PATTERN.test(normalizedLabel)) {
    return true;
  }

  if (POSE_ONLY_ENTITY_LABEL_PATTERN.test(normalizedLabel)) {
    return false;
  }

  if (isLikelySceneElementLabel(normalizedLabel)) {
    return false;
  }

  if (EVENT_VISUAL_PATTERN.test(normalizedLabel)) {
    return false;
  }

  if (EFFECT_PATTERN.test(normalizedLabel) || OBJECT_PATTERN.test(normalizedLabel) || BACKGROUND_PATTERN.test(normalizedLabel)) {
    return false;
  }

  const helperTokens = normalizedLabel.split(/\s+/).filter((token) => token.length > 0);
  if (helperTokens.length > 0 && helperTokens.every((token) => ENTITY_LABEL_HELPER_WORDS.has(token))) {
    return false;
  }

  return true;
};

const normalizeCharacterEntityLabel = (value: string) => normalizeSubjectEntityLabel(value);

const isModifierPhraseEntityLabel = (value: string | null | undefined) => {
  const normalizedLabel = normalizeSubjectEntityLabel(value ?? "");
  if (!normalizedLabel) {
    return false;
  }

  if (CHARACTER_IDENTITY_HINT_PATTERN.test(normalizedLabel) || GENERIC_SUBJECT_LABEL_PATTERN.test(normalizedLabel)) {
    return false;
  }

  const tokens = normalizedLabel.split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return false;
  }

  const actionOrEffectTokens = new Set<string>([
    "punch",
    "kick",
    "fight",
    "fighting",
    "walk",
    "walking",
    "run",
    "running",
    "jump",
    "jumping",
    "guard",
    "stance",
    "pose",
    "explosion",
    "explode",
    "lightning",
    "smoke",
    "impact",
    "eruption",
    "fireball",
    "projectile",
    "attack",
    "attacking",
  ]);

  let actionLikeTokenCount = 0;
  let modifierLikeTokenCount = 0;
  for (const token of tokens) {
    if (actionOrEffectTokens.has(token)) {
      actionLikeTokenCount += 1;
      continue;
    }

    if (ACTION_DESCRIPTOR_MODIFIER_WORDS.has(token) || EDIT_MODIFIER_TOKENS.has(token) || ENTITY_LABEL_HELPER_WORDS.has(token)) {
      modifierLikeTokenCount += 1;
      continue;
    }

    return false;
  }

  return actionLikeTokenCount > 0 && modifierLikeTokenCount > 0;
};

const isUsableCharacterEntityLabel = (label: string) =>
  label.length > 0 && !SCENE_DESCRIPTOR_STOPWORDS.has(label) && !isModifierPhraseEntityLabel(label) && isCharacterLikeEntityLabel(label);

const detectCharacterEntityPair = (normalizedPrompt: string): [string, string] | null => {
  for (const pattern of [SUBJECT_INTERACTION_PAIR_PATTERN, SUBJECT_PAIR_PATTERN]) {
    for (const match of normalizedPrompt.matchAll(pattern)) {
      const leftLabel = normalizeCharacterEntityLabel(match[1] ?? "");
      const rightLabel = normalizeCharacterEntityLabel(match[2] ?? "");
      if (isUsableCharacterEntityLabel(leftLabel) && isUsableCharacterEntityLabel(rightLabel)) {
        return [leftLabel, rightLabel];
      }
    }
  }

  return null;
};

const detectCharacterEntityLabels = (normalizedPrompt: string) => {
  const pairedLabels = detectCharacterEntityPair(normalizedPrompt) ?? [];
  return unique(
    [
      ...pairedLabels,
      ...[...normalizedPrompt.matchAll(CHARACTER_ENTITY_PATTERN)].map((match) => match[1] ?? ""),
    ]
      .map((value) => normalizeCharacterEntityLabel(value))
      .filter((label) => isUsableCharacterEntityLabel(label)),
  );
};

const detectActionKeywords = (normalizedPrompt: string) =>
  unique(
    ACTION_KEYWORD_PATTERNS.filter(([, pattern]) => pattern.test(normalizedPrompt)).map(([keyword]) => keyword),
  );

const resolveActionKeywords = ({
  normalizedPrompt,
  previousActionKeywords = [],
  continuationRequested,
}: {
  normalizedPrompt: string;
  previousActionKeywords?: readonly string[];
  continuationRequested: boolean;
}) => {
  const promptKeywords = detectActionKeywords(normalizedPrompt);
  if (!continuationRequested) {
    return promptKeywords;
  }

  return unique([...previousActionKeywords, ...promptKeywords]);
};

const promptReferencesCurrentSubject = (normalizedPrompt: string) =>
  CURRENT_SUBJECT_REFERENCE_PATTERN.test(normalizedPrompt);

const promptReferencesCurrentWorld = (normalizedPrompt: string) =>
  CURRENT_WORLD_REFERENCE_PATTERN.test(normalizedPrompt) || RELATED_NEW_ASSET_PATTERN.test(normalizedPrompt);

const promptLooksLikeFreshCreateRequest = ({
  normalizedPrompt,
  promptHasExplicitNewConcept,
}: {
  normalizedPrompt: string;
  promptHasExplicitNewConcept: boolean;
}) =>
  promptHasExplicitNewConcept &&
  EXPLICIT_CREATE_REQUEST_PATTERN.test(normalizedPrompt) &&
  !promptReferencesCurrentSubject(normalizedPrompt) &&
  !CONTINUATION_PATTERN.test(normalizedPrompt);

const promptRequestsSecondActor = ({
  normalizedPrompt,
  actionKeywords,
}: {
  normalizedPrompt: string;
  actionKeywords: readonly string[];
}) =>
  SECOND_ACTOR_REQUEST_PATTERN.test(normalizedPrompt) &&
  actionKeywords.some((keyword) => ["punch", "kick", "fight", "attack"].includes(keyword));

const detectEditIntents = (normalizedPrompt: string) =>
  unique(
    EDIT_INTENT_PATTERNS.filter(([, pattern]) => pattern.test(normalizedPrompt)).map(([intent]) => intent),
  );

const resolveRuntimeInteractionMode = ({
  normalizedPrompt,
  previousState,
  previousMemory,
  workspaceContext,
  editIntents,
  promptHasExplicitNewConcept,
  deferredOnlyIntent,
}: {
  normalizedPrompt: string;
  previousState: DrawingAiGenerateFramesState | null;
  previousMemory: DrawingAiProjectMemory | null;
  workspaceContext?: DrawingAiWorkspaceContext | null;
  editIntents: readonly GenerateFramesEditIntent[];
  promptHasExplicitNewConcept: boolean;
  deferredOnlyIntent: boolean;
}): GenerateFramesRuntimeInteractionMode => {
  const hasContinuationAnchor =
    previousState != null ||
    previousMemory?.generateFramesState != null ||
    Boolean(workspaceContext?.currentFrameHasBitmap);
  const previousInteractionMode = previousMemory?.interactionMode ?? null;
  const explicitFreshCreateRequest = promptLooksLikeFreshCreateRequest({
    normalizedPrompt,
    promptHasExplicitNewConcept,
  });
  const locksCurrentScene = promptLocksCurrentScene(normalizedPrompt);

  if (DISCUSS_RUNTIME_PATTERN.test(normalizedPrompt) && editIntents.length === 0 && !promptHasExplicitNewConcept) {
    return "discuss";
  }

  if (deferredOnlyIntent) {
    return "discuss";
  }

  if (locksCurrentScene && hasContinuationAnchor) {
    return CONTINUATION_PATTERN.test(normalizedPrompt) ? "continue" : "tweak";
  }

  if (!hasContinuationAnchor) {
    return "create";
  }

  if (promptForcesNewProjectByCorrection(normalizedPrompt)) {
    return "create";
  }

  if (RESET_IDENTITY_PATTERN.test(normalizedPrompt) || CREATE_RESET_SCENE_PATTERN.test(normalizedPrompt)) {
    return "create";
  }

  if (explicitFreshCreateRequest) {
    return "create";
  }

  if (CONTINUATION_PATTERN.test(normalizedPrompt)) {
    return "continue";
  }

  if (editIntents.length > 0 || FOLLOW_UP_EDIT_PATTERN.test(normalizedPrompt)) {
    return "tweak";
  }

  if (!promptHasExplicitNewConcept) {
    return previousInteractionMode === "continue" ? "continue" : "tweak";
  }

  return "create";
};

const hasGenerateFramesProjectAnchor = ({
  previousState,
  previousMemory,
  workspaceContext,
}: {
  previousState: DrawingAiGenerateFramesState | null;
  previousMemory: DrawingAiProjectMemory | null;
  workspaceContext?: DrawingAiWorkspaceContext | null;
}) =>
  previousState != null ||
  previousMemory?.generateFramesState != null ||
  previousMemory?.interactionMode === "continue" ||
  previousMemory?.interactionMode === "tweak" ||
  Boolean(workspaceContext?.currentFrameHasBitmap);

const resolveGenerateFramesProjectScope = ({
  normalizedPrompt,
  previousState,
  previousMemory,
  workspaceContext,
}: {
  normalizedPrompt: string;
  previousState: DrawingAiGenerateFramesState | null;
  previousMemory: DrawingAiProjectMemory | null;
  workspaceContext?: DrawingAiWorkspaceContext | null;
}): DrawingAiGenerateFramesProjectScope => {
  const hasProjectAnchor = hasGenerateFramesProjectAnchor({
    previousState,
    previousMemory,
    workspaceContext,
  });

  if (!hasProjectAnchor) {
    return "new-project";
  }

  if (promptLocksCurrentScene(normalizedPrompt)) {
    return "same-project";
  }

  if (promptForcesNewProjectByCorrection(normalizedPrompt)) {
    return "new-project";
  }

  if (EXPLICIT_NEW_PROJECT_PATTERN.test(normalizedPrompt)) {
    return "new-project";
  }

  return "same-project";
};

const resolveGenerateFramesShotScope = ({
  normalizedPrompt,
  previousState,
  previousMemory,
  workspaceContext,
  interactionMode,
  projectScope,
  promptHasExplicitNewConcept,
}: {
  normalizedPrompt: string;
  previousState: DrawingAiGenerateFramesState | null;
  previousMemory: DrawingAiProjectMemory | null;
  workspaceContext?: DrawingAiWorkspaceContext | null;
  interactionMode: GenerateFramesRuntimeInteractionMode;
  projectScope: DrawingAiGenerateFramesProjectScope;
  promptHasExplicitNewConcept: boolean;
}): DrawingAiGenerateFramesShotScope => {
  const hasProjectAnchor = hasGenerateFramesProjectAnchor({
    previousState,
    previousMemory,
    workspaceContext,
  });

  if (projectScope === "new-project" || !hasProjectAnchor) {
    return "create-first-shot";
  }

  if (promptLocksCurrentScene(normalizedPrompt)) {
    return interactionMode === "continue" ? "continue-current-shot" : "tweak-current-shot";
  }

  if (interactionMode === "discuss") {
    return previousState != null ? "tweak-current-shot" : "create-first-shot";
  }

  if (interactionMode === "tweak") {
    return "tweak-current-shot";
  }

  if (interactionMode === "continue") {
    return "continue-current-shot";
  }

  if (
    NEW_SHOT_SAME_PROJECT_PATTERN.test(normalizedPrompt) ||
    promptReferencesCurrentWorld(normalizedPrompt) ||
    (promptHasExplicitNewConcept && interactionMode === "create")
  ) {
    return "new-shot-same-project";
  }

  return "tweak-current-shot";
};

const resolveBuildDirection = ({
  previousBuildDirection,
  goalContext,
  actionKeywords,
  tone,
  modifiers,
  sceneSetting,
  sceneDescriptors,
  sceneProps,
  sceneElements,
}: {
  previousBuildDirection?: string | null;
  goalContext?: string | null;
  actionKeywords: readonly string[];
  tone: DrawingAiGenerateFramesStateTone;
  modifiers: readonly string[];
  sceneSetting: string | null;
  sceneDescriptors: readonly string[];
  sceneProps: readonly string[];
  sceneElements: readonly string[];
}) => {
  const parts: string[] = [];

  if (sceneSetting) {
    const descriptorPrefix = sceneDescriptors.length > 0 ? `${sceneDescriptors.slice(0, 2).join(" ")} ` : "";
    parts.push(`${descriptorPrefix}${sceneSetting}`.trim());
  }

  if (actionKeywords.length > 0) {
    parts.push(actionKeywords.slice(0, 3).join(" + "));
  }

  if (tone !== "neutral") {
    parts.push(tone);
  }

  if (modifiers.length > 0) {
    parts.push(modifiers.slice(-2).join(" + "));
  }

  if (sceneProps.length > 0) {
    parts.push(sceneProps.slice(0, 2).join(" + "));
  }

  if (sceneElements.length > 0) {
    parts.push(sceneElements.slice(0, 2).join(" + "));
  }

  const summary = parts.join(" | ").trim();
  return summary || previousBuildDirection || goalContext || null;
};

const detectPromptTone = (
  normalizedPrompt: string,
  previousTone: DrawingAiGenerateFramesStateTone = "neutral",
): DrawingAiGenerateFramesStateTone => {
  if (TONE_BRUTAL_PATTERN.test(normalizedPrompt)) return "brutal";
  if (TONE_POWERFUL_PATTERN.test(normalizedPrompt)) return "powerful";
  if (/\b(calm|steady|controlled and calm)\b/i.test(normalizedPrompt)) return "serious";
  if (TONE_SERIOUS_PATTERN.test(normalizedPrompt)) return "serious";
  if (/\b(tired|exhausted|fatigued|worn out)\b/i.test(normalizedPrompt)) return "weak";
  if (TONE_WEAK_PATTERN.test(normalizedPrompt)) return "weak";
  if (TONE_SCARED_PATTERN.test(normalizedPrompt)) return "scared";
  if (TONE_HESITANT_PATTERN.test(normalizedPrompt)) return "hesitant";
  return previousTone;
};

const detectForceLevel = ({
  normalizedPrompt,
  tone,
  previousForceLevel = "medium",
}: {
  normalizedPrompt: string;
  tone: DrawingAiGenerateFramesStateTone;
  previousForceLevel?: DrawingAiGenerateFramesStateForceLevel;
}): DrawingAiGenerateFramesStateForceLevel => {
  if (tone === "brutal" || tone === "powerful" || /\b(harder|heavier|stronger|bigger|more powerful)\b/i.test(normalizedPrompt)) {
    return "high";
  }
  if (
    tone === "weak" ||
    tone === "scared" ||
    tone === "hesitant" ||
    /\b(softer|weaker|smaller|gentler|calm|tired|exhausted|fatigued)\b/i.test(normalizedPrompt)
  ) {
    return "low";
  }
  if (tone === "serious") {
    return "medium";
  }
  return previousForceLevel;
};

const detectPromptSide = (normalizedPrompt: string): DrawingAiGenerateFramesStateSubjectSide | null => {
  const correctedSide = resolveCorrectedChoiceToken({
    normalizedPrompt,
    choices: ["left", "right", "center"],
    windowWords: 3,
  });
  if (correctedSide === "left" || correctedSide === "right" || correctedSide === "center") {
    return correctedSide;
  }
  if (LEFT_SUBJECT_PATTERN.test(normalizedPrompt) && !RIGHT_SUBJECT_PATTERN.test(normalizedPrompt)) return "left";
  if (RIGHT_SUBJECT_PATTERN.test(normalizedPrompt) && !LEFT_SUBJECT_PATTERN.test(normalizedPrompt)) return "right";
  if (/\b(center|centered|middle)\b/i.test(normalizedPrompt)) return "center";
  return null;
};

const detectMotionTypeFromConcepts = (
  concepts: readonly GenerateFramesIntentConcept[],
  actionKeywords: readonly string[],
  normalizedPrompt: string,
  previousMotionType: DrawingAiGenerateFramesStateMotionType = "unknown",
): DrawingAiGenerateFramesStateMotionType => {
  if (/\b(scroll|move the background|moving background|background move|background movement|camera moving|camera move|camera follow|camera movement|parallax)\b/i.test(normalizedPrompt)) return "background-scroll";
  if (concepts.includes("explosion")) return "explosion";
  if (concepts.includes("lightning")) return "lightning";
  if (concepts.includes("shockwave")) return "shockwave";
  if (concepts.includes("smoke")) return "smoke";
  if (concepts.includes("bouncing-ball")) return "bounce";
  if (concepts.includes("rolling-ball")) return "roll";
  if (concepts.includes("morphing-ball")) return "morph";
  if (concepts.includes("punch")) return "punch";
  if (concepts.includes("kick")) return "kick";
  if (concepts.includes("walking")) return "walk";
  if (concepts.includes("running")) return "run";
  if (concepts.includes("fighting-stance")) return "stance";
  if (actionKeywords.includes("impact")) return "impact";
  if (actionKeywords.includes("erupt")) return "eruption";
  if (actionKeywords.includes("bounce")) return "bounce";
  if (actionKeywords.includes("roll")) return "roll";
  if (actionKeywords.includes("morph")) return "morph";
  if (actionKeywords.includes("punch")) return "punch";
  if (actionKeywords.includes("kick")) return "kick";
  if (actionKeywords.includes("fight")) return "fight";
  if (actionKeywords.includes("walk")) return "walk";
  if (actionKeywords.includes("run")) return "run";
  if (actionKeywords.includes("guard")) return "stance";
  if (actionKeywords.includes("scroll")) return "background-scroll";
  if (actionKeywords.some((keyword) => ["jump", "fall", "swing", "throw", "hold", "hover", "crawl", "stare", "roar"].includes(keyword))) return "action";
  if (actionKeywords.length > 0) return "action";
  if (concepts.includes("zombie-apocalypse") || concepts.includes("alien-apocalypse")) return "scene";
  return previousMotionType;
};

const detectStateModifiers = ({
  normalizedPrompt,
  previousModifiers = [],
}: {
  normalizedPrompt: string;
  previousModifiers?: readonly string[];
}) => {
  const modifiers = new Set(previousModifiers);
  const maybeAdd = (token: string, pattern: RegExp) => {
    if (pattern.test(normalizedPrompt)) modifiers.add(token);
  };
  maybeAdd("spiky", /\b(spiky|spikier|jagged|starburst)\b/i);
  maybeAdd("poisonous", /\b(poisonous|toxic|acid(?:ic)?|green instead)\b/i);
  maybeAdd("heavier", /\b(heavier|more weight|weightier)\b/i);
  maybeAdd("smooth", /\b(smoother|smooth|cleaner|better in[- ]betweens?)\b/i);
  maybeAdd("faster", /\b(faster|quicker|snappier)\b/i);
  maybeAdd("sharp", /\b(sharp(?:er)?|crisper)\b/i);
  maybeAdd("calm", /\b(calm|controlled|steady)\b/i);
  maybeAdd("tired", /\b(tired|exhausted|fatigued|worn out)\b/i);
  maybeAdd("cartoony", /\b(cartoony|toon|more cartoon)\b/i);
  maybeAdd("bigger", /\b(bigger|larger|wider|stronger)\b/i);
  maybeAdd("shockwave", /\b(shockwave|dust ring|blast ring)\b/i);
  maybeAdd("dust", /\b(dust|dusty)\b/i);
  maybeAdd("smoke", /\b(smoke|smoky|toward the camera)\b/i);
  maybeAdd("disintegrate", /\b(disintegrat(?:e|ing)|dissipat(?:e|ing)|fade(?: away| out)?)\b/i);
  maybeAdd("sad", /\b(sad|downcast|depressed|gloomy)\b/i);
  maybeAdd("angry", /\b(mad|angry|furious|grumpy|irritated)\b/i);
  maybeAdd("joyful", /\b(joyful|happy|cheerful|playful|bouncy)\b/i);
  return [...modifiers];
};

const buildRecentEdits = ({
  normalizedPrompt,
  previousRecentEdits = [],
  continuationRequested,
}: {
  normalizedPrompt: string;
  previousRecentEdits?: readonly string[];
  continuationRequested: boolean;
}) => {
  if (!continuationRequested) {
    return [];
  }

  const trimmedPrompt = normalizedPrompt.trim();
  if (!trimmedPrompt) {
    return [...previousRecentEdits].slice(-6);
  }

  const nextRecentEdits = [...previousRecentEdits];
  if (nextRecentEdits[nextRecentEdits.length - 1] !== trimmedPrompt) {
    nextRecentEdits.push(trimmedPrompt);
  }

  return nextRecentEdits.slice(-6);
};

const detectStateSubjectType = (
  primaryFamily: GenerateFramesIntentFamily,
  componentFamilies: readonly GenerateFramesIntentFamily[],
): DrawingAiGenerateFramesState["subjectType"] => {
  if (primaryFamily === "mixed" || componentFamilies.length > 1) return "mixed";
  if (primaryFamily === "effect" || componentFamilies.includes("effect")) return "effect";
  if (primaryFamily === "object" || componentFamilies.includes("object")) return "object";
  if (primaryFamily === "background" || componentFamilies.includes("background")) return "background";
  return "character";
};

const detectStateConcepts = (state: DrawingAiGenerateFramesState | null | undefined): GenerateFramesIntentConcept[] => {
  if (!state) return [];
  switch (state.motionType) {
    case "explosion":
      return ["explosion"];
    case "lightning":
      return ["lightning"];
    case "shockwave":
      return ["shockwave"];
    case "smoke":
      return ["smoke"];
    case "bounce":
      return ["bouncing-ball"];
    case "roll":
      return ["rolling-ball"];
    case "morph":
      return ["morphing-ball"];
    case "punch":
      return ["punch"];
    case "kick":
      return ["kick"];
    case "walk":
      return ["walking"];
    case "run":
      return ["running"];
    case "stance":
      return ["fighting-stance"];
    default:
      return [];
  }
};

const detectStateFamilies = (state: DrawingAiGenerateFramesState | null | undefined): GenerateFramesIntentFamily[] => {
  if (!state) return [];
  switch (state.subjectType) {
    case "effect":
      return ["effect"];
    case "object":
      return ["object"];
    case "background":
      return ["background"];
    case "mixed":
      return unique(
        state.subjects
          .map((subject) => {
            switch (subject.type) {
              case "effect":
                return "effect";
              case "object":
                return "object";
              case "background":
                return "background";
              default:
                return "character";
            }
          })
          .filter((family): family is Exclude<GenerateFramesIntentFamily, "continuation" | "mixed"> => family != null),
      );
    default:
      return ["character"];
  }
};

const inferSubjectsFromStateAndPrompt = ({
  previousState,
  previousBindings = [],
  primaryFamily,
  componentFamilies,
  normalizedPrompt,
  promptSubjectLabel,
  actionKeywords,
  requestedColor,
  sceneSetting,
  sceneDescriptors,
  sceneElements,
}: {
  previousState: DrawingAiGenerateFramesState | null;
  previousBindings?: readonly DrawingAiSubjectBinding[];
  primaryFamily: GenerateFramesIntentFamily;
  componentFamilies: readonly GenerateFramesIntentFamily[];
  normalizedPrompt: string;
  promptSubjectLabel: string | null;
  actionKeywords: readonly string[];
  requestedColor: string | null;
  sceneSetting: string | null;
  sceneDescriptors: readonly string[];
  sceneElements: readonly string[];
}): DrawingAiGenerateFramesStateSubject[] => {
  const nextSide = detectPromptSide(normalizedPrompt);
  const subjectType = detectStateSubjectType(primaryFamily, componentFamilies);
  const requestedColors = detectRequestedColors(normalizedPrompt);
  const normalizedPromptSubjectLabel = normalizeSubjectEntityLabel(promptSubjectLabel ?? "");
  const entityPairLabels = detectCharacterEntityPair(normalizedPrompt);
  const explicitCharacterColorSideAssignments = detectExplicitCharacterColorSideAssignments(normalizedPrompt);
  const sharedCharacterHeadDetail = detectSharedCharacterHeadDetail(normalizedPrompt);
  const hasExplicitEntityPair = entityPairLabels != null;
  const wantsTwoCharacters = TWO_CHARACTER_PATTERN.test(normalizedPrompt);
  const entityLabels = detectCharacterEntityLabels(normalizedPrompt);
  const addedSubjectDetails = detectSubjectDetails(normalizedPrompt);
  const removedSubjectDetails = detectRemovedSubjectDetails(normalizedPrompt);
  const wantsOpposedPair =
    (hasExplicitEntityPair || entityLabels.length >= 2) &&
    /\b(facing|versus|vs\.?|against|fighting|dueling|duel)\b/i.test(normalizedPrompt);
  const wantsDirectionalStrike = /\b(punch(?:es|ing)?|kick(?:s|ing)?|strike|hit)\b/i.test(normalizedPrompt);
  const characterLedEffectAttack =
    subjectType === "mixed" &&
    componentFamilies.includes("effect") &&
    componentFamilies.includes("character") &&
    /\b(fireball|projectile|energy ball|orb|blast)\b/i.test(normalizedPrompt) &&
    /\b(right hand|left hand|martial arts|guard stance|ready stance|jump|spin(?:ning)?|airborne|landing|land)\b/i.test(
      normalizedPrompt,
    );
  const includesBackground = componentFamilies.includes("background");
  const sceneLabelPrefix = sceneDescriptors.length > 0 ? `${sceneDescriptors.join(" ")} ` : "";
  const sceneElementLabelSuffix = sceneElements.length > 0 ? ` with ${sceneElements.slice(0, 3).join(", ")}` : "";
  const resetsIdentity = RESET_IDENTITY_PATTERN.test(normalizedPrompt);
  const actionOnlyPromptSubject = isActionOnlyPromptSubjectLabel(promptSubjectLabel, actionKeywords);
  const implicitActionLabel = resolveImplicitCharacterActionLabel(actionKeywords);
  const sharedCharacterDetails = detectSharedCharacterDetails(normalizedPrompt);
  const referencesAllCurrentSubjects = promptReferencesAllCurrentSubjects(normalizedPrompt);
  const allowGlobalColorChange = requestedColors.length > 0 && requestedColors.length <= 1 && !SOLID_HEAD_PATTERN.test(normalizedPrompt);

  if (
    wantsTwoCharacters &&
    (subjectType === "mixed" || subjectType === "character") &&
    (!previousState?.subjects?.length || resetsIdentity)
  ) {
    const leftColor =
      sharedCharacterHeadDetail == null
        ? explicitCharacterColorSideAssignments.get("left") ?? requestedColors[0] ?? requestedColor
        : explicitCharacterColorSideAssignments.get("left") ?? null;
    const rightColor =
      sharedCharacterHeadDetail == null
        ? explicitCharacterColorSideAssignments.get("right") ?? requestedColors[1] ?? null
        : explicitCharacterColorSideAssignments.get("right") ?? null;
    return [
      {
        id: "primary-left",
        type: "character",
        role: "primary",
        side: "left",
        color: leftColor,
        label: "stick figure",
        details: sharedCharacterHeadDetail ? [sharedCharacterHeadDetail] : [],
      },
      {
        id: "secondary-right",
        type: "character",
        role: "secondary",
        side: "right",
        color: rightColor,
        label: "stick figure",
        details: sharedCharacterHeadDetail ? [sharedCharacterHeadDetail] : [],
      },
      ...(includesBackground
        ? [
            {
              id: "background",
              type: "background" as const,
              role: "background" as const,
              side: "center" as const,
              color: null,
              label: sceneSetting ? `${sceneLabelPrefix}${sceneSetting} background${sceneElementLabelSuffix}`.trim() : `background${sceneElementLabelSuffix}`.trim(),
              details: [],
            },
          ]
        : []),
    ];
  }

  if (
    explicitCharacterColorSideAssignments.size >= 2 &&
    (subjectType === "mixed" || subjectType === "character") &&
    (!previousState?.subjects?.length || resetsIdentity)
  ) {
    return [
      {
        id: "primary-left",
        type: "character",
        role: "primary",
        side: "left",
        color: explicitCharacterColorSideAssignments.get("left") ?? requestedColors[0] ?? requestedColor,
        label: "stick figure",
        details: sharedCharacterHeadDetail ? [sharedCharacterHeadDetail] : [],
      },
      {
        id: "secondary-right",
        type: "character",
        role: "secondary",
        side: "right",
        color: explicitCharacterColorSideAssignments.get("right") ?? requestedColors[1] ?? null,
        label: "stick figure",
        details: sharedCharacterHeadDetail ? [sharedCharacterHeadDetail] : [],
      },
      ...(includesBackground
        ? [
            {
              id: "background",
              type: "background" as const,
              role: "background" as const,
              side: "center" as const,
              color: null,
              label: sceneSetting ? `${sceneLabelPrefix}${sceneSetting} background${sceneElementLabelSuffix}`.trim() : `background${sceneElementLabelSuffix}`.trim(),
              details: [],
            },
          ]
        : []),
    ];
  }

  if (
    (hasExplicitEntityPair || wantsOpposedPair || entityLabels.length >= 2) &&
    (subjectType === "mixed" || subjectType === "character") &&
    (!previousState?.subjects?.length || resetsIdentity)
  ) {
    return [
      {
        id: "primary-left",
        type: "character",
        role: wantsDirectionalStrike ? "attacker" : "primary",
        side: "left",
        color: requestedColors[0] ?? requestedColor,
        label: entityPairLabels?.[0] ?? entityLabels[0] ?? "character",
        details: [],
      },
      {
        id: "secondary-right",
        type: "character",
        role: wantsDirectionalStrike ? "defender" : wantsOpposedPair ? "target" : "secondary",
        side: "right",
        color: requestedColors[1] ?? null,
        label: entityPairLabels?.[1] ?? entityLabels[1] ?? entityPairLabels?.[0] ?? "character",
        details: [],
      },
      ...(includesBackground
        ? [
            {
              id: "background",
              type: "background" as const,
              role: "background" as const,
              side: "center" as const,
              color: null,
              label: sceneSetting ? `${sceneLabelPrefix}${sceneSetting} background${sceneElementLabelSuffix}`.trim() : `background${sceneElementLabelSuffix}`.trim(),
              details: [],
            },
          ]
        : []),
    ];
  }

  if (previousState?.subjects?.length && !resetsIdentity) {
    const resolvedPreviousBindings =
      previousBindings.length > 0 ? [...previousBindings] : resolveStateSubjectBindings(previousState);
    const correctedSubjectTargeting = resolveCorrectionAwareSubjectTargeting({
      normalizedPrompt,
      subjects: previousState.subjects,
      subjectBindings: resolvedPreviousBindings,
    });
    const implicitCurrentSubjectReference = promptReferencesCurrentSubject(normalizedPrompt);
    const wantsContinuationSecondActor = promptRequestsSecondActor({
      normalizedPrompt,
      actionKeywords,
    });
    const wantsExplicitSideReposition =
      /\b(move|shift|put|place|reposition|swap|switch)\b.*\b(left|right|top|bottom)\b/i.test(normalizedPrompt) ||
      /\b(on|to|from)\s+the\s+(left|right|top|bottom)\b/i.test(normalizedPrompt);
    const subjectHints = new Map(
      previousState.subjects.map((subject) => {
        const normalizedLabel = subject.label?.toLowerCase() ?? "";
        const subjectPromptWindows = collectSubjectPromptWindows(
          normalizedPrompt,
          buildSubjectPromptReferenceCandidates({
            subject,
            subjectBindings: resolvedPreviousBindings,
          }),
        );
        const labelMentioned =
          normalizedLabel.length > 0 &&
          !isGenericSubjectLabel(normalizedLabel) &&
          normalizedPrompt.includes(normalizedLabel);
        const colorMentioned =
          subject.color != null &&
          new RegExp(`\\b${escapeRegex(subject.color)}\\b`, "i").test(normalizedPrompt);
        const roleMentioned =
          (subject.role === "primary" && /\b(primary|main|lead)\b/i.test(normalizedPrompt)) ||
          (subject.role === "secondary" && /\b(secondary|other|second)\b/i.test(normalizedPrompt)) ||
          (subject.role === "attacker" && /\b(attacker|striker)\b/i.test(normalizedPrompt)) ||
          (subject.role === "defender" && /\b(defender|target)\b/i.test(normalizedPrompt));
        const sideMentioned =
          (subject.side === "left" && LEFT_SUBJECT_PATTERN.test(normalizedPrompt)) ||
          (subject.side === "right" && RIGHT_SUBJECT_PATTERN.test(normalizedPrompt));

        return [
          subject.id,
          {
            colorMentioned,
            correctedExcluded: correctedSubjectTargeting.excludedSubjectIds.includes(subject.id),
            correctedPreferred: correctedSubjectTargeting.preferredSubjectIds.includes(subject.id),
            explicitReference: subjectPromptWindows.length > 0 || labelMentioned || roleMentioned || sideMentioned,
            roleMentioned,
            subjectPromptWindows,
            subjectSpecificDetails: detectSubjectSpecificDetails({
              normalizedPrompt,
              subject,
              subjectPromptWindows,
              sharedCharacterDetails,
            }),
          },
        ] as const;
      }),
    );
    const targetedSubjectIds = previousState.subjects
      .filter((subject) => {
        const hint = subjectHints.get(subject.id);
        if (!hint) {
          return false;
        }

        if (referencesAllCurrentSubjects && subject.type === "character") {
          return true;
        }

        if (correctedSubjectTargeting.preferredSubjectIds.length > 0) {
          return correctedSubjectTargeting.preferredSubjectIds.includes(subject.id);
        }

        if (hint.correctedExcluded) {
          return false;
        }

        if (nextSide != null && subject.side === nextSide && wantsExplicitSideReposition) {
          return true;
        }

        if (hint.explicitReference || hint.roleMentioned) {
          return true;
        }

        if (hint.subjectSpecificDetails.length > 0) {
          return true;
        }

        return hint.colorMentioned && SUBJECT_EDIT_ACTION_PATTERN.test(normalizedPrompt);
      })
      .map((subject) => subject.id);
    const fallbackPrimaryTargetId =
      correctedSubjectTargeting.preferredSubjectIds.length === 1
        ? correctedSubjectTargeting.preferredSubjectIds[0]!
        : targetedSubjectIds.length === 0 &&
            (
              requestedColor != null ||
              addedSubjectDetails.length > 0 ||
              sharedCharacterDetails.length > 0 ||
              entityLabels.length > 0 ||
              implicitCurrentSubjectReference
            )
          ? previousState.subjects.find((subject) => subject.role === "primary")?.id ?? previousState.subjects[0]?.id ?? null
          : null;

    const nextSubjects = previousState.subjects.map((subject, index) => {
      const hint = subjectHints.get(subject.id);
      const isTargeted = targetedSubjectIds.includes(subject.id) || fallbackPrimaryTargetId === subject.id;
      const subjectSpecificDetails =
        hint == null || hint.correctedExcluded || (correctedSubjectTargeting.preferredSubjectIds.length > 0 && !isTargeted)
          ? []
          : hint.subjectSpecificDetails;
      const appliesSharedCharacterDetails = subject.type === "character" && (referencesAllCurrentSubjects || sharedCharacterDetails.includes("no visible face"));
      const applicableAddedDetails = unique([
        ...(isTargeted ? addedSubjectDetails : []),
        ...(appliesSharedCharacterDetails ? sharedCharacterDetails : []),
        ...subjectSpecificDetails,
      ]);
      const shouldUpdateColor = requestedColor != null && allowGlobalColorChange && isTargeted;
      const shouldUpdateSide =
        nextSide != null &&
        isTargeted &&
        wantsExplicitSideReposition &&
        (previousState.subjectType !== "mixed" ||
          subject.role === "primary" ||
          (subject.role === "attacker" && /\b(left .* punch(?:es|ing)? right|right .* punch(?:es|ing)? left)\b/i.test(normalizedPrompt)));
      const requestedLabelCandidate = subject.label ?? entityLabels[index] ?? null;
      const nextLabelCandidate =
        isTargeted &&
        requestedLabelCandidate != null &&
        isModifierPhraseEntityLabel(requestedLabelCandidate) &&
        subject.label != null
          ? subject.label
          : requestedLabelCandidate;
      const nextDetails = mergeSubjectDetails({
        label: subject.label ?? null,
        existingDetails: subject.details ?? [],
        addedDetails: applicableAddedDetails,
        removedDetails: isTargeted ? removedSubjectDetails : [],
      });
      return {
        ...subject,
        role:
          wantsContinuationSecondActor && subject.type === "character" && (subject.role === "primary" || subject.id === fallbackPrimaryTargetId)
            ? "attacker"
            : subject.role,
        color: shouldUpdateColor ? requestedColor : subject.color,
        side: shouldUpdateSide ? nextSide : subject.side,
        details: nextDetails,
        label: mergeSubjectLabelDetails({
          label: nextLabelCandidate,
          addedDetails: nextDetails,
          removedDetails: isTargeted ? removedSubjectDetails : [],
        }),
      };
    });

    if (includesBackground && !nextSubjects.some((subject) => subject.type === "background")) {
      nextSubjects.push({
        id: "background",
        type: "background",
        role: "background",
        side: "center",
        color: null,
        label: sceneSetting ? `${sceneLabelPrefix}${sceneSetting} background${sceneElementLabelSuffix}`.trim() : `background${sceneElementLabelSuffix}`.trim(),
        details: [],
      });
    }

    const characterSubjects = nextSubjects.filter((subject) => subject.type === "character");
    if ((wantsTwoCharacters || hasExplicitEntityPair || entityLabels.length >= 2) && characterSubjects.length < 2) {
      const secondaryLabelCandidate = entityPairLabels?.[1] ?? entityLabels[1] ?? entityPairLabels?.[0] ?? "character";
      nextSubjects.push({
        id: "secondary-right",
        type: "character",
        role: "secondary",
        side: "right",
        color: requestedColors[1] ?? null,
        details: [],
        label: mergeSubjectLabelDetails({
          label: isModifierPhraseEntityLabel(secondaryLabelCandidate) ? "character" : secondaryLabelCandidate,
          addedDetails: [],
          removedDetails: [],
        }),
      });
    }

    if (wantsContinuationSecondActor && characterSubjects.length < 2) {
      const primaryCharacter =
        nextSubjects.find((subject) => subject.type === "character" && (subject.role === "attacker" || subject.role === "primary")) ??
        nextSubjects.find((subject) => subject.type === "character") ??
        null;
      const defenderLabelCandidate = entityPairLabels?.[1] ?? entityLabels[1] ?? "stick figure";
      nextSubjects.push({
        id: "continuation-defender",
        type: "character",
        role: actionKeywords.includes("fight") ? "secondary" : "defender",
        side: primaryCharacter?.side === "left" ? "right" : "left",
        color: requestedColors[1] ?? null,
        details: [],
        label: mergeSubjectLabelDetails({
          label: isModifierPhraseEntityLabel(defenderLabelCandidate) ? "stick figure" : defenderLabelCandidate,
          addedDetails: [],
          removedDetails: [],
        }),
      });
    }

    return nextSubjects;
  }

  if (/\bleft\b.*\bpunch(?:es|ing)?\b.*\bright\b|\bright\b.*\bpunch(?:es|ing)?\b.*\bleft\b/i.test(normalizedPrompt)) {
    const attackerSide = /\bleft\b.*\bpunch(?:es|ing)?\b.*\bright\b/i.test(normalizedPrompt) ? "left" : "right";
    const defenderSide = attackerSide === "left" ? "right" : "left";
    return [
      {
        id: "attacker",
        type: "character",
        role: "attacker",
        side: attackerSide,
        color: requestedColor,
        label: entityPairLabels?.[0] ?? entityLabels[0] ?? "stick figure",
        details: [],
      },
      {
        id: "defender",
        type: "character",
        role: "defender",
        side: defenderSide,
        color: null,
        label: entityPairLabels?.[1] ?? entityLabels[1] ?? entityPairLabels?.[0] ?? "stick figure",
        details: [],
      },
    ];
  }

  if (
    subjectType === "character" &&
    entityLabels.length === 0 &&
    actionKeywords.includes("fight") &&
    (actionOnlyPromptSubject || promptSubjectLabel == null)
  ) {
    return [
      {
        id: "fighter-left",
        type: "character",
        role: "primary",
        side: "left",
        color: requestedColors[0] ?? requestedColor,
        label: "fighter",
        details: [],
      },
      {
        id: "fighter-right",
        type: "character",
        role: "secondary",
        side: "right",
        color: requestedColors[1] ?? null,
        label: "fighter",
        details: [],
      },
    ];
  }

  if (
    subjectType === "character" &&
    entityLabels.length === 0 &&
    actionKeywords.length > 0 &&
    (actionOnlyPromptSubject || promptSubjectLabel == null)
  ) {
    return [
      {
        id: "primary",
        type: "character",
        role: "primary",
        side: nextSide ?? "center",
        color: requestedColor,
        label: implicitActionLabel,
        details: [],
      },
    ];
  }

  if (subjectType === "mixed" && componentFamilies.includes("effect") && componentFamilies.includes("character")) {
    if (characterLedEffectAttack) {
      return [
        {
          id: "character-primary",
          type: "character",
          role: "primary",
          side: nextSide ?? "center",
          color: null,
          label: entityLabels[0] ?? "fighter",
          details: mergeSubjectDetails({
            label: entityLabels[0] ?? "fighter",
            existingDetails: [],
            addedDetails: addedSubjectDetails,
            removedDetails: removedSubjectDetails,
          }),
        },
        {
          id: "effect-secondary",
          type: "effect",
          role: "secondary",
          side: "center",
          color: requestedColor,
          label: promptSubjectLabel ?? (/\bprojectile\b/i.test(normalizedPrompt) ? "projectile effect" : "fireball effect"),
          details: [],
        },
        ...(includesBackground
          ? [
              {
                id: "background",
                type: "background" as const,
                role: "background" as const,
                side: "center" as const,
                color: null,
                label: sceneSetting ? `${sceneLabelPrefix}${sceneSetting} background${sceneElementLabelSuffix}`.trim() : `background${sceneElementLabelSuffix}`.trim(),
                details: [],
              },
            ]
          : []),
      ];
    }

    return [
      {
        id: "effect-primary",
        type: "effect",
        role: "primary",
        side: "center",
        color: requestedColor,
        label: promptSubjectLabel ?? "effect",
        details: [],
      },
      {
        id: "runner",
        type: "character",
        role: "runner",
        side: nextSide ?? "center",
        color: null,
        label: entityLabels[0] ?? "runner",
        details: [],
      },
    ];
  }

  if (subjectType === "mixed" && componentFamilies.includes("background") && componentFamilies.includes("character")) {
    return [
      {
        id: "character-primary",
        type: "character",
        role: "primary",
        side: nextSide ?? "center",
        color: requestedColor,
        label: entityLabels[0] ?? "character",
        details: mergeSubjectDetails({
          label: entityLabels[0] ?? "character",
          existingDetails: [],
          addedDetails: addedSubjectDetails,
          removedDetails: removedSubjectDetails,
        }),
      },
      {
        id: "background",
        type: "background",
        role: "background",
        side: "center",
        color: null,
        label: sceneSetting ? `${sceneLabelPrefix}${sceneSetting} background${sceneElementLabelSuffix}`.trim() : `background${sceneElementLabelSuffix}`.trim(),
        details: [],
      },
    ];
  }

  const baseType: Exclude<DrawingAiGenerateFramesState["subjectType"], "mixed"> =
    subjectType === "mixed"
      ? componentFamilies.includes("effect") && !componentFamilies.includes("character")
        ? "effect"
        : componentFamilies.includes("object") && !componentFamilies.includes("character")
          ? "object"
          : sceneSetting != null && actionKeywords.length === 0 && !hasExplicitCharacterIdentityCue(promptSubjectLabel)
            ? "background"
            : "character"
      : subjectType;
  const resolvedPrimaryLabel =
    entityLabels[0] ??
    (normalizedPromptSubjectLabel.length > 0 ? normalizedPromptSubjectLabel : promptSubjectLabel ?? null);
  return [
    {
      id: "primary",
      type: baseType,
      role: "primary",
      side: nextSide ?? (baseType === "background" || baseType === "effect" ? "center" : "center"),
      color: requestedColor,
      details:
        baseType === "background"
          ? []
          : mergeSubjectDetails({
              label: entityLabels[0] ?? null,
              existingDetails: [],
              addedDetails: addedSubjectDetails,
              removedDetails: removedSubjectDetails,
            }),
      label:
        baseType === "background"
          ? sceneSetting ? `${sceneLabelPrefix}${sceneSetting} background${sceneElementLabelSuffix}`.trim() : `background${sceneElementLabelSuffix}`.trim()
          : mergeSubjectLabelDetails({
              label:
                actionOnlyPromptSubject && baseType === "character"
                  ? implicitActionLabel
                  : resolvedPrimaryLabel,
              addedDetails: addedSubjectDetails,
              removedDetails: removedSubjectDetails,
            }),
    },
  ];
};

const detectConcepts = (normalizedPrompt: string) => {
  const concepts: GenerateFramesIntentConcept[] = [];

  for (const [concept, pattern] of Object.entries(CONCEPT_PATTERNS) as Array<[GenerateFramesIntentConcept, RegExp]>) {
    if (pattern.test(normalizedPrompt)) {
      concepts.push(concept);
    }
  }

  return unique(concepts);
};

const inferContinuationConceptsFromHistory = ({
  normalizedPrompt,
  normalizedHistory,
}: {
  normalizedPrompt: string;
  normalizedHistory: string;
}) => {
  const inferredConcepts: GenerateFramesIntentConcept[] = [];

  if (
    /\b(cartoony|toon|more cartoon|heavier|more weight|weightier|bounce|bigger bounce|heavier bounce|smoother|smooth|faster|quicker|snappier|settle)\b/.test(
      normalizedPrompt,
    ) &&
    /\b(ball|bounce|bouncing|rebound|drop|fall|squash)\b/.test(normalizedHistory)
  ) {
    inferredConcepts.push("bouncing-ball");
  }

  if (
    /\b(hit harder|harder|heavier hit|stronger recoil|stronger impact|more powerful|brutal|powerful|serious|weak|scared|hesitant|left|right)\b/.test(normalizedPrompt) &&
    /\b(punch|impact|strike|hit|follow through|recoil)\b/.test(normalizedHistory)
  ) {
    inferredConcepts.push("punch");
  }

  if (
    /\b(harder|higher|faster|smoother|airborne|round(?:house)?|spinning|violent|brutal|landing|recovery)\b/.test(
      normalizedPrompt,
    ) &&
    /\b(kick|round kick|roundhouse|chamber|extension|contact|landing)\b/.test(normalizedHistory)
  ) {
    inferredConcepts.push("kick");
  }

  if (
    /\b(smoother|faster|quicker|snappier|more energetic|impact|steps?|balanced|run instead|run instead of walk|serious|weak|scared|hesitant|powerful)\b/.test(
      normalizedPrompt,
    ) &&
    /\b(walk|walking|stride|passing beat|step|plant|planted foot|weight transfer)\b/.test(normalizedHistory)
  ) {
    inferredConcepts.push("walking");
  }

  if (
    /\b(bigger|larger|shockwave|dusty|smoke|toward the camera|more powerful|spiky|spikier|jagged|starburst|green|poisonous|toxic|acid(?:ic)?)\b/.test(
      normalizedPrompt,
    ) &&
    /\b(explosion|blast|fire|shockwave|smoke|debris)\b/.test(normalizedHistory)
  ) {
    inferredConcepts.push("explosion");
  }

  if (
    /\b(disintegrat(?:e|ing)|dissipat(?:e|ing)|fade(?: it)? (?:away|out)|fade away|fade out|dust|dusty)\b/.test(
      normalizedPrompt,
    ) &&
    /\b(explosion|blast|fire|shockwave|smoke|debris)\b/.test(normalizedHistory)
  ) {
    inferredConcepts.push("explosion");
  }

  if (
    /\b(faster|snappier|shorter|flash|fade|vanish|disappear|brighter|sharper|bigger)\b/.test(normalizedPrompt) &&
    /\b(lightning|bolt|electric|afterglow|strike)\b/.test(normalizedHistory)
  ) {
    inferredConcepts.push("lightning");
  }

  if (
    /\b(add dust|more dust|dusty|thicker|more smoke|fade slower|fade faster|poisonous|green|toxic|continue|current drawing|current frame|current sequence)\b/.test(
      normalizedPrompt,
    ) &&
    /\b(smoke|cloud|haze|mist|vapor|bomb)\b/.test(normalizedHistory)
  ) {
    inferredConcepts.push("smoke");
  }

  return unique(inferredConcepts);
};

const detectNegatedConcepts = (normalizedPrompt: string) => {
  const concepts: GenerateFramesIntentConcept[] = [];

  for (const [concept, pattern] of Object.entries(NEGATED_CONCEPT_PATTERNS) as Array<
    [GenerateFramesIntentConcept, RegExp | undefined]
  >) {
    if (pattern && pattern.test(normalizedPrompt)) {
      concepts.push(concept);
    }
  }

  return unique(concepts);
};

const stripNegatedConceptPhrases = (normalizedPrompt: string) => {
  let strippedPrompt = normalizedPrompt;

  for (const pattern of Object.values(NEGATED_CONCEPT_PATTERNS)) {
    if (!pattern) {
      continue;
    }

    strippedPrompt = strippedPrompt.replace(pattern, " ");
  }

  return normalizePrompt(strippedPrompt);
};

const mapConceptToFamilies = (concept: GenerateFramesIntentConcept): GenerateFramesIntentFamily[] => {
  switch (concept) {
    case "explosion":
    case "lightning":
    case "shockwave":
    case "smoke":
    case "concrete-cracks":
      return ["effect"];
    case "bouncing-ball":
    case "rolling-ball":
    case "morphing-ball":
    case "rod":
    case "block":
      return ["object"];
    case "stick-figure":
    case "punch":
    case "kick":
    case "fighting-stance":
    case "walking":
    case "running":
      return ["character"];
    case "dark-room":
    case "school-hallway":
    case "mountain-landscape":
    case "night-city":
      return ["background"];
    case "zombie-apocalypse":
    case "alien-apocalypse":
      return ["mixed"];
    default:
      return [];
  }
};

const detectBaseFamilies = (normalizedPrompt: string) => {
  const families: GenerateFramesIntentFamily[] = [];

  if (EFFECT_PATTERN.test(normalizedPrompt)) families.push("effect");
  if (OBJECT_PATTERN.test(normalizedPrompt)) families.push("object");
  if (BACKGROUND_PATTERN.test(normalizedPrompt)) families.push("background");
  if (CHARACTER_PATTERN.test(normalizedPrompt)) families.push("character");

  return unique(families);
};

const shouldTreatAsMixed = (normalizedPrompt: string, families: readonly GenerateFramesIntentFamily[]) =>
  MIXED_CONNECTOR_PATTERN.test(normalizedPrompt) && families.length >= 2;

const buildQuestionGate = ({
  normalizedPrompt,
  primaryFamily,
  concepts,
  hasStoredContinuationState,
  workspaceContext,
}: {
  normalizedPrompt: string;
  primaryFamily: GenerateFramesIntentFamily;
  concepts: readonly GenerateFramesIntentConcept[];
  hasStoredContinuationState: boolean;
  workspaceContext?: DrawingAiWorkspaceContext | null;
}): GenerateFramesQuestionGate => {
  let blocker: string | null = null;
  const explicitCurrentAnchorRequest =
    primaryFamily === "continuation" ||
    promptReferencesCurrentSubject(normalizedPrompt) ||
    promptReferencesCurrentWorld(normalizedPrompt) ||
    promptLocksCurrentScene(normalizedPrompt);

  if (explicitCurrentAnchorRequest && !workspaceContext?.currentFrameHasBitmap && !hasStoredContinuationState) {
    blocker = "There is no current frame or sequence available to continue.";
  } else if (
    ENTRY_SIDELESS_PATTERN.test(normalizedPrompt) &&
    !SIDE_PATTERN.test(normalizedPrompt) &&
    !shouldTreatAsMixed(normalizedPrompt, detectBaseFamilies(normalizedPrompt))
  ) {
    blocker = "The entry side changes the staging in a major way.";
  }

  const disallowedTopics: string[] = [];

  if (concepts.includes("explosion")) disallowedTopics.push("explosion_color");
  if (concepts.includes("lightning")) disallowedTopics.push("lightning_color");
  if (concepts.includes("bouncing-ball") || concepts.includes("rolling-ball")) disallowedTopics.push("ball_roundness");
  if (concepts.includes("punch") || concepts.includes("kick") || concepts.includes("fighting-stance")) {
    disallowedTopics.push("punch_basics");
  }
  if (concepts.includes("dark-room")) disallowedTopics.push("dark_room_darkness");
  if (primaryFamily === "continuation") disallowedTopics.push("continuation_scope");

  return {
    blocker,
    shouldProceedWithoutQuestion: blocker == null,
    disallowedTopics,
  };
};

const buildExpectationLines = ({
  primaryFamily,
  componentFamilies,
  concepts,
  negatedConcepts,
  requestedColor,
  subjects,
  outputMode,
  motionType,
  actionKeywords,
  subjectPurityMode,
  expectedCompletionProfile,
  visualExpectationTags,
}: {
  primaryFamily: GenerateFramesIntentFamily;
  componentFamilies: readonly GenerateFramesIntentFamily[];
  concepts: readonly GenerateFramesIntentConcept[];
  negatedConcepts: readonly GenerateFramesIntentConcept[];
  requestedColor: string | null;
  subjects: readonly DrawingAiGenerateFramesStateSubject[];
  outputMode: GenerateFramesOutputMode;
  motionType: DrawingAiGenerateFramesStateMotionType;
  actionKeywords: readonly string[];
  subjectPurityMode: GenerateFramesSubjectPurityMode;
  expectedCompletionProfile: GenerateFramesCompletionProfile;
  visualExpectationTags: readonly string[];
}) => {
  const expectationLines: string[] = [];

  const add = (line: string) => expectationLines.push(line);

  if (primaryFamily === "effect" || componentFamilies.includes("effect")) {
    add("Effect default: preserve effect identity, readable silhouette, and strong event timing with no unsolicited character.");
  }
  if (primaryFamily === "object" || componentFamilies.includes("object")) {
    add("Object default: preserve object identity, size logic, and material behavior with no anthropomorphic drift.");
  }
  if (primaryFamily === "character" || componentFamilies.includes("character")) {
    add("Character default: preserve readable posing, balanced action flow, and clean anatomy instead of broken limb noise.");
  }
  if (primaryFamily === "background" || componentFamilies.includes("background")) {
    add("Background default: build the environment first and keep it environment-led unless the prompt explicitly adds a subject.");
  }
  if (primaryFamily === "continuation") {
    add("Continuation default: preserve identity, staging, motion family, and scene continuity instead of restarting.");
  }
  if (subjectPurityMode === "strict-effect-only") {
    add("Subject purity: keep the result effect-only and never add a character, object, or unrelated actor unless the prompt explicitly names one.");
  }
  if (subjectPurityMode === "strict-single-subject") {
    add("Subject purity: keep exactly the requested subject family in view and do not invent a second actor, random prop, or unrelated effect.");
  }
  if (subjectPurityMode === "strict-scene-only") {
    add("Subject purity: keep the output scene-led and do not introduce an unsolicited foreground actor or event.");
  }

  if (concepts.includes("explosion")) {
    add("Explosion defaults: hot orange/red/yellow blast, bright core, fast outward force, glow, smoke or debris after the blast, serious impact unless told otherwise.");
  }
  if (concepts.includes("lightning")) {
    add("Lightning defaults: bright electric strike, sharp path, high contrast, fast impact, and brief glow.");
  }
  if (concepts.includes("shockwave")) {
    add("Shockwave defaults: a fast expanding ring or dust wave, strongest near the ground or blast source, with readable outward force instead of random smoke blobs.");
  }
  if (concepts.includes("smoke")) {
    add("Smoke defaults: drifting mass, soft edges, layered fade, and readable flow instead of hard humanoid silhouette.");
  }
  if (concepts.includes("concrete-cracks")) {
    add("Concrete crack defaults: fracture lines radiate from a stress point, stay surface-bound, and may include chips or dust.");
  }
  if (concepts.includes("bouncing-ball")) {
    add(`Bouncing ball defaults: ${requestedColor ? `${requestedColor} ` : ""}ball stays round in the air, uses only a slight impact squash, rebounds clearly, and never morphs into another shape.`);
  }
  if (concepts.includes("rolling-ball")) {
    add(`Rolling ball defaults: ${requestedColor ? `${requestedColor} ` : ""}ball keeps the same circular identity, size, and travel direction all the way through the shot.`);
  }
  if (concepts.includes("morphing-ball")) {
    add(`Morphing ball defaults: start from a readable ball, keep the transition deliberate, and preserve clean object logic instead of random creature drift.`);
  }
  if (concepts.includes("rod")) {
    add("Rod or staff defaults: keep it rigid, straight, and prop-like unless a character is explicitly using it.");
  }
  if (concepts.includes("block")) {
    add("Block defaults: preserve geometric corners, flat faces, and stable object identity.");
  }
  if (concepts.includes("stick-figure")) {
    add("Stick figure defaults: clean readable stick figure, clear line of action, and no broken anatomy.");
  }
  if (
    visualExpectationTags.includes("solid-head") ||
    subjects.some((subject) => normalizePrompt(subject.label ?? "").includes("stick figure"))
  ) {
    add("Stick figure head defaults: use a solid filled head with simple limbs and do not add facial features unless the user explicitly asks for them.");
  }
  if (visualExpectationTags.includes("recognizable-object")) {
    add("Recognizable object default: use a clean readable silhouette that matches the object family instead of a generic blob or humanoid substitute.");
  }
  if (concepts.includes("punch")) {
    add("Punch defaults: anticipation, contact, and follow-through with clear force direction.");
  }
  if (concepts.includes("kick")) {
    add("Kick defaults: anticipation, strike, and recovery with balanced support and readable direction.");
  }
  if (concepts.includes("fighting-stance")) {
    add("Fighting stance defaults: readable guard, balanced footing, readiness, and no weird crouch drift unless asked.");
  }
  if (concepts.includes("walking")) {
    add("Walking defaults: readable contact and passing beats, clean limb opposition, stable balance, and no broken-limb or squatting drift.");
  }
  if (concepts.includes("running")) {
    add("Running defaults: directional stride, clear arm-leg opposition, and no broken limb posing.");
  }
  if (motionType === "background-scroll") {
    add("Camera-follow defaults: keep the subject anchored in screen space while the environment scrolls behind them, so the motion reads like camera travel instead of treadmill drift.");
    add("Background-scroll defaults: extend the scene wide enough to support visible travel, keep environment layers readable, and resolve the scroll with a clear ending offset.");
  }
  if (actionKeywords.includes("breathe")) {
    add("Breathing defaults: rhythmic inhale and exhale motion with a loopable recovery beat instead of a frozen chest pose.");
  }
  if (actionKeywords.includes("spin") && /\b(fan|propeller)\b/i.test(subjects.map((subject) => subject.label ?? "").join(" "))) {
    add("Spinning fan defaults: recognizable hub-and-blade structure with visible spin progression instead of a static object or random swirl.");
  }
  if (concepts.includes("dark-room")) {
    add("Dark room defaults: room staging, readable negative space, dark atmosphere, and environment-first composition.");
  }
  if (concepts.includes("school-hallway")) {
    add("School hallway defaults: corridor layout, spatial clarity, and environment-first read.");
  }
  if (concepts.includes("mountain-landscape")) {
    add("Mountain landscape defaults: open ground in front, mountain ranges behind, clear depth layers, and environment-led composition.");
  }
  if (concepts.includes("night-city")) {
    add("Night city defaults: skyline or buildings first, night lighting, readable silhouettes, and environment-led depth without surprise characters.");
  }
  if (concepts.includes("zombie-apocalypse")) {
    add("Zombie apocalypse defaults: readable undead horde energy, survival pressure, and environment damage without turning the whole shot into unrelated abstraction.");
  }
  if (concepts.includes("alien-apocalypse")) {
    add("Alien apocalypse defaults: hostile invasion energy, readable alien presence, and large-scale threat staging without losing subject clarity.");
  }
  if (negatedConcepts.length > 0) {
    add(`Explicit exclusions: do not define ${negatedConcepts.join(", ")} if the prompt explicitly forbids them.`);
  }
  if (outputMode === "animation") {
    switch (expectedCompletionProfile) {
      case "explosion-complete":
        add("Completion: the explosion must build, peak, break apart, and finish in residue or dissipating aftermath instead of freezing at peak blast.");
        break;
      case "lightning-vanish":
        add("Completion: the lightning must strike fast, flash, and vanish quickly instead of lingering like a slow explosion.");
        break;
      case "smoke-dissipate":
        add("Completion: the smoke must spread, billow, and clearly dissipate instead of cutting off while it is still actively growing.");
        break;
      case "strike-recover":
        add("Completion: the strike must move through anticipation, impact, and recovery instead of stopping with the limb stuck out.");
        break;
      case "kick-recover":
        add("Completion: the kick must include prep, contact, recoil, and settle instead of freezing at extension.");
        break;
      case "jump-land":
        add("Completion: the jump must launch, peak, descend, and land instead of hanging in the middle.");
        break;
      case "breathing-loop":
        add("Completion: the breathing motion must cycle through inhale, peak, exhale, and recovery instead of holding one pose.");
        break;
      case "fight-resolve":
        add("Completion: the exchange must include a readable setup, clash, and recovery or separation instead of stopping mid-fight.");
        break;
      case "scene-scroll":
        add("Completion: the moving background must establish the scroll and resolve the camera-feel motion instead of behaving like a static backdrop.");
        break;
      case "walk-cycle":
      case "run-cycle":
      case "generic-action-complete":
      case "none":
        break;
    }
  }

  return unique(expectationLines);
};

const buildFamilyLockLines = ({
  primaryFamily,
  componentFamilies,
}: {
  primaryFamily: GenerateFramesIntentFamily;
  componentFamilies: readonly GenerateFramesIntentFamily[];
}) => {
  if (primaryFamily === "mixed") {
    return [
      `Primary focus: mixed(${componentFamilies.join(" + ")}). Preserve all named parts at once and do not collapse one into the other.`,
      "Anti-drift: every explicit family named in the prompt must remain visible in the result.",
    ];
  }

  if (primaryFamily === "effect") {
    return [
      "Primary focus: effect-led output. Do not introduce a stick figure, person, or character unless the prompt explicitly asks for one.",
      "Anti-drift: effect requests must stay effect-led.",
    ];
  }

  if (primaryFamily === "object") {
    return [
      "Primary focus: object-led output. Preserve object identity with no limbs, face, or humanoid behavior unless explicitly requested.",
      "Anti-drift: object requests must not turn into creatures or people.",
    ];
  }

  if (primaryFamily === "character") {
    return [
      "Primary focus: character-led output. Keep the output character-led and do not collapse it into object-only or abstract effect-only output.",
      "Anti-drift: character requests must keep readable anatomy and action intent.",
    ];
  }

  if (primaryFamily === "background") {
    return [
      "Primary focus: environment-led output. Build environment first and do not inject a surprise primary subject.",
      "Anti-drift: background requests must stay environment-led.",
    ];
  }

  return [
    "Primary focus: continuation. Continue the current thing instead of restarting, renaming, or replacing it.",
    "Anti-drift: continuation requests must preserve identity and motion family.",
  ];
};

const resolveExpectedVisualClass = ({
  interactionMode,
  primaryFamily,
  visualKind,
  outputMode,
  motionType,
}: {
  interactionMode: GenerateFramesRuntimeInteractionMode;
  primaryFamily: GenerateFramesIntentFamily;
  visualKind: GenerateFramesPromptVisualKind;
  outputMode: GenerateFramesOutputMode;
  motionType: DrawingAiGenerateFramesStateMotionType;
}): GenerateFramesExpectedVisualClass => {
  if (interactionMode !== "create") {
    return "continuation-edit";
  }

  if (outputMode === "still") {
    if (primaryFamily === "background" || visualKind === "scene" || motionType === "scene") {
      return "still-scene";
    }
    if (primaryFamily === "object") {
      return "still-object";
    }
    return "still-character";
  }

  if (
    primaryFamily === "effect" ||
    visualKind === "event" ||
    ["explosion", "lightning", "shockwave", "smoke", "impact", "eruption"].includes(motionType)
  ) {
    return "event-animation";
  }

  return "action-animation";
};

const resolveAllowedSubjectFamilies = ({
  interactionMode,
  primaryFamily,
  componentFamilies,
  subjects,
  sceneSetting,
}: {
  interactionMode: GenerateFramesRuntimeInteractionMode;
  primaryFamily: GenerateFramesIntentFamily;
  componentFamilies: readonly GenerateFramesIntentFamily[];
  subjects: readonly DrawingAiGenerateFramesStateSubject[];
  sceneSetting: string | null;
}): GenerateFramesAllowedSubjectFamily[] => {
  if (interactionMode !== "create") {
    const anchoredFamilies = new Set<GenerateFramesAllowedSubjectFamily>();
    for (const subject of subjects) {
      if (subject.type === "character" || subject.type === "object" || subject.type === "effect" || subject.type === "background") {
        anchoredFamilies.add(subject.type);
      }
    }
    for (const family of componentFamilies) {
      if (family === "character" || family === "object" || family === "effect" || family === "background") {
        anchoredFamilies.add(family);
      }
    }
    return anchoredFamilies.size > 0 ? [...anchoredFamilies] : ["character"];
  }

  const allowedFamilies = new Set<GenerateFramesAllowedSubjectFamily>();
  for (const family of componentFamilies) {
    if (family === "character" || family === "object" || family === "effect" || family === "background") {
      allowedFamilies.add(family);
    }
  }

  if (primaryFamily === "character" || primaryFamily === "object" || primaryFamily === "effect" || primaryFamily === "background") {
    allowedFamilies.add(primaryFamily);
  }

  if (sceneSetting != null || subjects.some((subject) => subject.type === "background")) {
    allowedFamilies.add("background");
  }

  if (allowedFamilies.size === 0) {
    if (primaryFamily === "continuation") {
      allowedFamilies.add("character");
    } else {
      allowedFamilies.add("object");
    }
  }

  return [...allowedFamilies];
};

const resolveSubjectPurityMode = ({
  interactionMode,
  primaryFamily,
  componentFamilies,
  subjects,
}: {
  interactionMode: GenerateFramesRuntimeInteractionMode;
  primaryFamily: GenerateFramesIntentFamily;
  componentFamilies: readonly GenerateFramesIntentFamily[];
  subjects: readonly DrawingAiGenerateFramesStateSubject[];
}): GenerateFramesSubjectPurityMode => {
  if (interactionMode !== "create") {
    return "continuation-anchored";
  }

  if (
    primaryFamily === "effect" &&
    !componentFamilies.includes("character") &&
    !componentFamilies.includes("object") &&
    !componentFamilies.includes("background")
  ) {
    return "strict-effect-only";
  }

  if (
    primaryFamily === "background" &&
    !componentFamilies.includes("character") &&
    !componentFamilies.includes("object") &&
    !componentFamilies.includes("effect")
  ) {
    return "strict-scene-only";
  }

  const visibleSubjects = subjects.filter((subject) => subject.type === "character" || subject.type === "object");
  const mixedFamilies = new Set(componentFamilies.filter((family) => family !== primaryFamily && family !== "continuation"));
  if ((primaryFamily === "object" || primaryFamily === "character") && visibleSubjects.length <= 1 && mixedFamilies.size === 0) {
    return "strict-single-subject";
  }

  return "mixed-allowed";
};

const resolveExpectedCompletionProfile = ({
  outputMode,
  motionType,
  actionKeywords,
}: {
  outputMode: GenerateFramesOutputMode;
  motionType: DrawingAiGenerateFramesStateMotionType;
  actionKeywords: readonly string[];
}): GenerateFramesCompletionProfile => {
  if (outputMode !== "animation") {
    return "none";
  }
  if (motionType === "explosion") return "explosion-complete";
  if (motionType === "lightning") return "lightning-vanish";
  if (motionType === "smoke") return "smoke-dissipate";
  if (motionType === "punch") return "strike-recover";
  if (motionType === "kick") return "kick-recover";
  if (actionKeywords.includes("jump")) return "jump-land";
  if (actionKeywords.includes("breathe")) return "breathing-loop";
  if (motionType === "fight") return "fight-resolve";
  if (motionType === "walk") return "walk-cycle";
  if (motionType === "run") return "run-cycle";
  if (motionType === "background-scroll") return "scene-scroll";
  return "generic-action-complete";
};

const resolveExpectationCoverage = ({
  primaryFamily,
  componentFamilies,
  promptSubject,
  subjects,
  sceneSetting,
  motionType,
  actionKeywords,
  visualKind,
}: {
  primaryFamily: GenerateFramesIntentFamily;
  componentFamilies: readonly GenerateFramesIntentFamily[];
  promptSubject: string | null;
  subjects: readonly DrawingAiGenerateFramesStateSubject[];
  sceneSetting: string | null;
  motionType: DrawingAiGenerateFramesStateMotionType;
  actionKeywords: readonly string[];
  visualKind: GenerateFramesPromptVisualKind;
}): GenerateFramesExpectationCoverage => {
  const subjectLabelText = normalizePrompt(
    [
      promptSubject,
      ...subjects
        .filter((subject) => subject.type !== "background")
        .map((subject) => subject.label ?? null),
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (motionType === "background-scroll") {
    const hasSupportedScrollSubject = subjects.some((subject) => {
      if (subject.type !== "character" && subject.type !== "object") {
        return false;
      }
      const normalizedLabel = normalizePrompt(subject.label ?? "");
      return (
        LOCAL_EXPECTATION_CHARACTER_PATTERN.test(normalizedLabel) ||
        LOCAL_EXPECTATION_OBJECT_PATTERN.test(normalizedLabel) ||
        subject.color != null
      );
    });
    return sceneSetting != null && hasSupportedScrollSubject ? "grounded-local" : "needs-reference";
  }

  if (primaryFamily === "effect" || componentFamilies.includes("effect")) {
    return ["explosion", "lightning", "shockwave", "smoke", "impact", "eruption"].includes(motionType)
      ? "grounded-local"
      : "needs-reference";
  }

  if (actionKeywords.includes("breathe") || (actionKeywords.includes("spin") && /\b(fan|propeller)\b/i.test(subjectLabelText))) {
    return "grounded-local";
  }

  if (primaryFamily === "object") {
    return LOCAL_EXPECTATION_OBJECT_PATTERN.test(subjectLabelText) ? "grounded-local" : "needs-reference";
  }

  if (primaryFamily === "character") {
    return LOCAL_EXPECTATION_CHARACTER_PATTERN.test(subjectLabelText) ? "grounded-local" : "needs-reference";
  }

  if (primaryFamily === "background" || visualKind === "scene") {
    return sceneSetting != null || LOCAL_EXPECTATION_SCENE_PATTERN.test(subjectLabelText) ? "grounded-local" : "needs-reference";
  }

  if (primaryFamily === "mixed") {
    const hasSupportedEffect = componentFamilies.includes("effect") && ["explosion", "lightning", "shockwave", "smoke"].includes(motionType);
    const hasSupportedFigure = subjects.some(
      (subject) =>
        subject.type === "character" &&
        (
          LOCAL_EXPECTATION_CHARACTER_PATTERN.test(normalizePrompt(subject.label ?? "")) ||
          subject.color != null
        ),
    );
    const hasSupportedObject = subjects.some(
      (subject) =>
        subject.type === "object" &&
        (
          LOCAL_EXPECTATION_OBJECT_PATTERN.test(normalizePrompt(subject.label ?? "")) ||
          subject.color != null
        ),
    );
    const hasSupportedScene =
      sceneSetting != null || LOCAL_EXPECTATION_SCENE_PATTERN.test(subjectLabelText);
    if ((hasSupportedFigure || hasSupportedObject) && hasSupportedScene && motionType === "scene") {
      return "grounded-local";
    }
    if (hasSupportedEffect && (hasSupportedFigure || hasSupportedScene)) {
      return "grounded-local";
    }
    return "needs-reference";
  }

  return "needs-reference";
};

const resolveShapeConfidence = ({
  expectationCoverage,
  primaryFamily,
  promptSubject,
  subjects,
  actionKeywords,
  visualKind,
}: {
  expectationCoverage: GenerateFramesExpectationCoverage;
  primaryFamily: GenerateFramesIntentFamily;
  promptSubject: string | null;
  subjects: readonly DrawingAiGenerateFramesStateSubject[];
  actionKeywords: readonly string[];
  visualKind: GenerateFramesPromptVisualKind;
}): GenerateFramesShapeConfidence => {
  if (expectationCoverage === "needs-reference") {
    return "needs-reference";
  }

  const subjectLabelText = normalizePrompt(
    [promptSubject, ...subjects.map((subject) => subject.label ?? null)].filter(Boolean).join(" "),
  );

  if (
    primaryFamily === "object" &&
    !LOCAL_EXPECTATION_OBJECT_PATTERN.test(subjectLabelText) &&
    !/\b(robot|stick(?:\s|-)?figure|person|fighter)\b/i.test(subjectLabelText)
  ) {
    return "needs-reference";
  }

  if (
    visualKind === "event" &&
    actionKeywords.length === 0 &&
    !/\b(explosion|blast|fireball|lightning|bolt|shockwave|smoke|dust|debris|eruption)\b/i.test(subjectLabelText)
  ) {
    return "needs-reference";
  }

  return "grounded-local";
};

function collectHumanExpectedOrderedBeats(normalizedPrompt: string): string[] {
  const beats: Array<{ key: string; index: number }> = [];
  const addBeat = (key: string, pattern: RegExp) => {
    const match = normalizedPrompt.match(pattern);
    if (match?.index != null && match.index >= 0) {
      beats.push({ key, index: match.index });
    }
  };

  addBeat("setup", /\b(start|setup|begin|begins?|ready|loaded)\b/i);
  addBeat("right-hand-projectile", /\bright hand\b[\s\S]{0,64}\b(?:fireball|projectile|energy ball|orb|blast)\b|\b(?:fireball|projectile|energy ball|orb|blast)\b[\s\S]{0,64}\bright hand\b/i);
  addBeat("left-hand-projectile", /\bleft hand\b[\s\S]{0,64}\b(?:fireball|projectile|energy ball|orb|blast)\b|\b(?:fireball|projectile|energy ball|orb|blast)\b[\s\S]{0,64}\bleft hand\b/i);
  addBeat("jump", /\b(jump|leap|vault)\b/i);
  addBeat("spin", /\b(spin(?:ning)?|tornado spin)\b/i);
  addBeat("airborne-projectile", /\b(?:airborne|midair|mid-air|in the air)\b[\s\S]{0,64}\b(?:fireball|projectile|energy ball|orb|blast)\b|\b(?:fireball|projectile|energy ball|orb|blast)\b[\s\S]{0,64}\b(?:airborne|midair|mid-air|in the air)\b/i);
  addBeat("guard-landing", /\b(landing|land|ending in|ending with|ends in|ends with)\b[\s\S]{0,96}\b(martial arts guard stance|guard stance|ready stance|guard)\b|\b(martial arts guard stance|guard stance|ready stance)\b/i);

  return beats
    .sort((left, right) => left.index - right.index)
    .map((beat) => beat.key)
    .filter((beat, index, items) => items.indexOf(beat) === index);
}

const SMALL_COUNT_WORD_VALUES: Record<string, number> = {
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
};

const resolveSmallCountValue = (value: string) => {
  const normalizedValue = normalizePrompt(value);
  const direct = SMALL_COUNT_WORD_VALUES[normalizedValue];
  if (typeof direct === "number" && Number.isFinite(direct)) {
    return direct;
  }

  const numericValue = Number.parseInt(normalizedValue, 10);
  if (!Number.isFinite(numericValue) || numericValue < 1 || numericValue > 4) {
    return null;
  }

  return numericValue;
};

const pushSequenceBeatCandidate = (
  beats: GenerateFramesSequenceBeatCandidate[],
  candidate: GenerateFramesSequenceBeatCandidate,
) => {
  if (!beats.some((beat) => beat.key === candidate.key)) {
    beats.push(candidate);
  }
};

const collectExplicitSequenceBeatCandidates = ({
  normalizedPrompt,
  expectedCompletionProfile,
  motionType,
  actionKeywords,
}: {
  normalizedPrompt: string;
  expectedCompletionProfile: GenerateFramesCompletionProfile;
  motionType: DrawingAiGenerateFramesStateMotionType;
  actionKeywords: readonly string[];
}) => {
  const beats: GenerateFramesSequenceBeatCandidate[] = [];
  const addBeat = ({
    key,
    label,
    pattern,
    completionRole,
  }: {
    key: string;
    label: string;
    pattern: RegExp;
    completionRole: DrawingAiExecutionBeat["completionRole"];
  }) => {
    const match = normalizedPrompt.match(pattern);
    if (match?.index == null || match.index < 0) {
      return;
    }

    pushSequenceBeatCandidate(beats, {
      key,
      label,
      index: match.index,
      completionRole,
      explicitness: "explicit",
      mandatory: true,
    });
  };

  addBeat({
    key: "setup",
    label: "Setup",
    pattern: /\b(start|setup|begin|begins?|ready|loaded|load(?:ed)?|prepare|pre[- ]impact|anticipation|wind[- ]?up)\b/i,
    completionRole: "setup",
  });
  addBeat({
    key: "right-hand-projectile",
    label: "Right-hand projectile",
    pattern:
      /\bright hand\b[\s\S]{0,64}\b(?:fireball|projectile|energy ball|orb|blast)\b|\b(?:fireball|projectile|energy ball|orb|blast)\b[\s\S]{0,64}\bright hand\b/i,
    completionRole: "action",
  });
  addBeat({
    key: "left-hand-projectile",
    label: "Left-hand projectile",
    pattern:
      /\bleft hand\b[\s\S]{0,64}\b(?:fireball|projectile|energy ball|orb|blast)\b|\b(?:fireball|projectile|energy ball|orb|blast)\b[\s\S]{0,64}\bleft hand\b/i,
    completionRole: "action",
  });
  addBeat({
    key: "jump",
    label: "Jump",
    pattern: /\b(jump|leap|vault|launch)\b/i,
    completionRole: "action",
  });
  addBeat({
    key: "spin",
    label: "Spin",
    pattern: /\b(spin(?:ning)?|tornado spin)\b/i,
    completionRole: "transition",
  });
  addBeat({
    key: "airborne-projectile",
    label: "Airborne projectile",
    pattern:
      /\b(?:airborne|midair|mid-air|in the air)\b[\s\S]{0,64}\b(?:fireball|projectile|energy ball|orb|blast)\b|\b(?:fireball|projectile|energy ball|orb|blast)\b[\s\S]{0,64}\b(?:airborne|midair|mid-air|in the air)\b/i,
    completionRole: "action",
  });
  addBeat({
    key: "contact",
    label: "Contact",
    pattern: /\b(contact|impact|hit|strike|clash)\b/i,
    completionRole: "contact",
  });
  addBeat({
    key: "landing",
    label: "Landing",
    pattern: /\b(landing|land)\b/i,
    completionRole: "settle",
  });
  addBeat({
    key: "recovery",
    label: "Recovery",
    pattern: /\b(recover|recovery|follow[- ]?through|settle|reset)\b/i,
    completionRole: "recovery",
  });

  if (expectedCompletionProfile === "breathing-loop" || actionKeywords.includes("breathe")) {
    addBeat({
      key: "inhale",
      label: "Inhale",
      pattern: /\b(inhale|breath in|breathing in)\b/i,
      completionRole: "action",
    });
    addBeat({
      key: "exhale",
      label: "Exhale",
      pattern: /\b(exhale|breath out|breathing out)\b/i,
      completionRole: "recovery",
    });
  }

  if (motionType === "walk" || motionType === "run") {
    addBeat({
      key: "contact-step",
      label: "Contact step",
      pattern: /\b(contact beat|plant|planted foot|foot plant)\b/i,
      completionRole: "contact",
    });
    addBeat({
      key: "passing-step",
      label: "Passing step",
      pattern: /\b(passing beat|passing|weight transfer)\b/i,
      completionRole: "transition",
    });
  }

  if (!beats.some((beat) => /projectile/.test(beat.key))) {
    const countedProjectileMatch = normalizedPrompt.match(
      /\b(one|two|three|four|\d+)\s+(fireballs?|projectiles?|energy balls?|orbs?|blasts?)\b/i,
    );
    if (countedProjectileMatch != null) {
      const projectileCount = resolveSmallCountValue(countedProjectileMatch[1] ?? "");
      if (projectileCount == null || projectileCount <= 1) {
        return beats.sort((left, right) => left.index - right.index);
      }

      const baseIndex = countedProjectileMatch.index ?? 0;
      for (let index = 0; index < projectileCount; index += 1) {
        beats.push({
          key: `projectile-${index + 1}`,
          label: `Projectile ${index + 1}`,
          index: baseIndex + index,
          completionRole: "action",
          explicitness: "explicit",
          mandatory: true,
        });
      }
    }
  }

  return beats.sort((left, right) => left.index - right.index);
};

const buildMinimumNecessaryBeatTemplates = ({
  expectedCompletionProfile,
  motionType,
  actionKeywords,
}: {
  expectedCompletionProfile: GenerateFramesCompletionProfile;
  motionType: DrawingAiGenerateFramesStateMotionType;
  actionKeywords: readonly string[];
}) => {
  switch (expectedCompletionProfile) {
    case "strike-recover":
      return [
        { key: "setup", label: "Setup", completionRole: "setup" as const },
        { key: "contact", label: "Strike", completionRole: "contact" as const },
        { key: "recovery", label: "Recovery", completionRole: "recovery" as const },
      ];
    case "kick-recover":
      return [
        { key: "setup", label: "Kick setup", completionRole: "setup" as const },
        { key: "kick", label: "Kick release", completionRole: "contact" as const },
        { key: "recovery", label: "Kick recovery", completionRole: "recovery" as const },
      ];
    case "jump-land":
      return [
        { key: "setup", label: "Jump setup", completionRole: "setup" as const },
        { key: "jump", label: "Jump launch", completionRole: "action" as const },
        { key: "landing", label: "Landing", completionRole: "settle" as const },
      ];
    case "explosion-complete":
      return [
        { key: "buildup", label: "Buildup", completionRole: "setup" as const },
        { key: "blast", label: "Blast peak", completionRole: "action" as const },
        { key: "aftermath", label: "Aftermath", completionRole: "residue" as const },
      ];
    case "lightning-vanish":
      return [
        { key: "strike", label: "Strike", completionRole: "action" as const },
        { key: "flash", label: "Flash", completionRole: "contact" as const },
        { key: "vanish", label: "Vanish", completionRole: "vanish" as const },
      ];
    case "smoke-dissipate":
      return [
        { key: "source", label: "Source", completionRole: "setup" as const },
        { key: "spread", label: "Spread", completionRole: "action" as const },
        { key: "dissipate", label: "Dissipate", completionRole: "vanish" as const },
      ];
    case "fight-resolve":
      return [
        { key: "setup", label: "Faceoff", completionRole: "setup" as const },
        { key: "exchange", label: "Exchange", completionRole: "contact" as const },
        { key: "recovery", label: "Resolve", completionRole: "recovery" as const },
      ];
    case "walk-cycle":
      return [
        { key: "contact-step", label: "Contact step", completionRole: "contact" as const },
        { key: "passing-step", label: "Passing step", completionRole: "transition" as const },
        { key: "next-contact", label: "Next contact", completionRole: "settle" as const },
      ];
    case "run-cycle":
      return [
        { key: "drive-step", label: "Drive step", completionRole: "action" as const },
        { key: "passing-step", label: "Passing step", completionRole: "transition" as const },
        { key: "landing", label: "Landing", completionRole: "settle" as const },
      ];
    case "scene-scroll":
      return [
        { key: "scroll-start", label: "Movement start", completionRole: "setup" as const },
        { key: "scroll-travel", label: "Travel", completionRole: "transition" as const },
        { key: "scroll-settle", label: "End state", completionRole: "settle" as const },
      ];
    case "breathing-loop":
      return [
        { key: "inhale", label: "Inhale", completionRole: "action" as const },
        { key: "exhale", label: "Exhale", completionRole: "recovery" as const },
        { key: "recovery", label: "Breathing recovery", completionRole: "settle" as const },
      ];
    case "generic-action-complete":
      return [
        { key: "setup", label: "Setup", completionRole: "setup" as const },
        { key: "action", label: "Main action", completionRole: "action" as const },
        { key: "recovery", label: "Recovery", completionRole: "recovery" as const },
      ];
    case "none":
    default:
      if (motionType === "punch") {
        return [
          { key: "setup", label: "Punch setup", completionRole: "setup" as const },
          { key: "contact", label: "Punch contact", completionRole: "contact" as const },
          { key: "recovery", label: "Punch recovery", completionRole: "recovery" as const },
        ];
      }
      if (actionKeywords.includes("breathe")) {
        return [
          { key: "inhale", label: "Inhale", completionRole: "action" as const },
          { key: "exhale", label: "Exhale", completionRole: "recovery" as const },
          { key: "recovery", label: "Breathing recovery", completionRole: "settle" as const },
        ];
      }
      return [];
  }
};

const resolveSequenceBeatCeiling = ({
  outputMode,
  requestKind,
  normalizedPrompt,
  requestedFrameCount,
  explicitBeatCount,
}: {
  outputMode: GenerateFramesOutputMode;
  requestKind: DrawingAiFrameRequestKind;
  normalizedPrompt: string;
  requestedFrameCount: number;
  explicitBeatCount: number;
}) => {
  if (outputMode !== "animation" || requestKind === "single-frame") {
    return 0;
  }

  const hasExplicitSequenceStructure =
    STAGED_SEQUENCE_CONNECTOR_PATTERN.test(normalizedPrompt) ||
    /\b(before|after|then|followed by|ending in|ending with|ends in|ends with|right hand|left hand|airborne|midair|mid-air)\b/i.test(
      normalizedPrompt,
    );
  const explicitFloor = Math.max(0, explicitBeatCount);

  if (hasExplicitSequenceStructure || explicitFloor >= 3 || requestedFrameCount >= 8) {
    return Math.max(explicitFloor, Math.min(6, Math.max(4, requestedFrameCount)));
  }

  if (requestKind === "small-animation") {
    return Math.max(explicitFloor, 3);
  }

  return Math.max(explicitFloor, 3);
};

const buildSequenceBeats = ({
  normalizedPrompt,
  outputMode,
  requestKind,
  requestedFrameCount,
  expectedCompletionProfile,
  motionType,
  actionKeywords,
  subjects,
  sceneSetting,
}: {
  normalizedPrompt: string;
  outputMode: GenerateFramesOutputMode;
  requestKind: DrawingAiFrameRequestKind;
  requestedFrameCount: number;
  expectedCompletionProfile: GenerateFramesCompletionProfile;
  motionType: DrawingAiGenerateFramesStateMotionType;
  actionKeywords: readonly string[];
  subjects: readonly DrawingAiGenerateFramesStateSubject[];
  sceneSetting: string | null;
}): DrawingAiExecutionBeat[] => {
  const explicitBeats = collectExplicitSequenceBeatCandidates({
    normalizedPrompt,
    expectedCompletionProfile,
    motionType,
    actionKeywords,
  });
  const ceiling = resolveSequenceBeatCeiling({
    outputMode,
    requestKind,
    normalizedPrompt,
    requestedFrameCount,
    explicitBeatCount: explicitBeats.length,
  });
  if (ceiling <= 0) {
    return [];
  }

  const templates = buildMinimumNecessaryBeatTemplates({
    expectedCompletionProfile,
    motionType,
    actionKeywords,
  });
  const finalCandidates = [...explicitBeats];
  const hasRole = (completionRole: DrawingAiExecutionBeat["completionRole"]) =>
    finalCandidates.some((beat) => beat.completionRole === completionRole);
  const hasKey = (key: string) => finalCandidates.some((beat) => beat.key === key);
  const injectBeat = (candidate: GenerateFramesSequenceBeatCandidate, placement: "before" | "middle" | "after") => {
    if (finalCandidates.length >= ceiling || hasKey(candidate.key) || hasRole(candidate.completionRole)) {
      return;
    }

    const injectedBeat = {
      ...candidate,
      explicitness: "injected" as const,
      mandatory: true,
    };

    if (placement === "before") {
      const firstIndex = finalCandidates[0]?.index ?? 0;
      finalCandidates.unshift({ ...injectedBeat, index: firstIndex - 1 });
      return;
    }

    if (placement === "after") {
      const lastIndex = finalCandidates.at(-1)?.index ?? -1;
      finalCandidates.push({ ...injectedBeat, index: lastIndex + 1 });
      return;
    }

    const insertionIndex = Math.max(1, finalCandidates.length - 1);
    const before = finalCandidates[insertionIndex - 1]?.index ?? -1;
    const after = finalCandidates[insertionIndex]?.index ?? before + 1;
    finalCandidates.splice(insertionIndex, 0, {
      ...injectedBeat,
      index: before + (after - before) / 2,
    });
  };

  if (finalCandidates.length === 0) {
    templates.slice(0, ceiling).forEach((template, index) => {
      finalCandidates.push({
        key: template.key,
        label: template.label,
        index,
        completionRole: template.completionRole,
        explicitness: "injected",
        mandatory: true,
      });
    });
  } else {
    const openingTemplate = templates[0];
    const endingTemplate = templates.at(-1);
    const middleTemplates = templates.slice(1, Math.max(1, templates.length - 1));

    if (openingTemplate != null) {
      injectBeat(
        {
          key: openingTemplate.key,
          label: openingTemplate.label,
          index: -1,
          completionRole: openingTemplate.completionRole,
          explicitness: "injected",
          mandatory: true,
        },
        "before",
      );
    }

    if (finalCandidates.length <= 2) {
      for (const middleTemplate of middleTemplates) {
        injectBeat(
          {
            key: middleTemplate.key,
            label: middleTemplate.label,
            index: 0,
            completionRole: middleTemplate.completionRole,
            explicitness: "injected",
            mandatory: true,
          },
          "middle",
        );
      }
    }

    if (endingTemplate != null) {
      injectBeat(
        {
          key: endingTemplate.key,
          label: endingTemplate.label,
          index: 0,
          completionRole: endingTemplate.completionRole,
          explicitness: "injected",
          mandatory: true,
        },
        "after",
      );
    }
  }

  const subjectIds = unique(subjects.filter((subject) => subject.type !== "background").map((subject) => subject.id)).slice(0, 8);

  return finalCandidates
    .sort((left, right) => left.index - right.index)
    .slice(0, Math.max(explicitBeats.length, ceiling))
    .map((beat, order) => ({
      id: beat.key,
      order,
      label: beat.label,
      subjectIds,
      sceneBinding: sceneSetting,
      explicitness: beat.explicitness,
      mandatory: beat.mandatory,
      completionRole: beat.completionRole,
    }));
};

const resolveHumanExpectationRisk = ({
  interactionMode,
  expectedVisualClass,
  subjectPurityMode,
  expectedCompletionProfile,
  shapeConfidence,
  orderedBeats,
  primaryFamily,
}: {
  interactionMode: GenerateFramesRuntimeInteractionMode;
  expectedVisualClass: GenerateFramesExpectedVisualClass;
  subjectPurityMode: GenerateFramesSubjectPurityMode;
  expectedCompletionProfile: GenerateFramesCompletionProfile;
  shapeConfidence: GenerateFramesShapeConfidence;
  orderedBeats: readonly string[];
  primaryFamily: GenerateFramesIntentFamily;
}): GenerateFramesHumanExpectationRisk => {
  if (interactionMode !== "create") {
    if (orderedBeats.length >= 3 || shapeConfidence === "needs-reference") {
      return "medium";
    }
    return "low";
  }

  if (
    shapeConfidence === "needs-reference" ||
    subjectPurityMode === "strict-effect-only" ||
    ["explosion-complete", "lightning-vanish", "smoke-dissipate", "fight-resolve"].includes(expectedCompletionProfile) ||
    orderedBeats.length >= 3
  ) {
    return "high";
  }

  if (
    expectedVisualClass === "event-animation" ||
    expectedVisualClass === "action-animation" ||
    primaryFamily === "mixed"
  ) {
    return "medium";
  }

  return "low";
};

const getRecentFamilyVariationSignatures = ({
  recentVariationSignatures,
  qualityFamily,
}: {
  recentVariationSignatures: readonly string[];
  qualityFamily: DrawingAiRenderingQualityFamily;
}) =>
  recentVariationSignatures.filter((signature) => signature.startsWith(`family=${qualityFamily}|`));

const resolveVariationCycleIndex = ({
  shotScope,
  recentVariationSignatures,
  qualityFamily,
}: {
  shotScope: DrawingAiGenerateFramesShotScope;
  recentVariationSignatures: readonly string[];
  qualityFamily: DrawingAiRenderingQualityFamily;
}) => {
  if (shotScope === "tweak-current-shot" || shotScope === "continue-current-shot") {
    return 0;
  }

  return getRecentFamilyVariationSignatures({
    recentVariationSignatures,
    qualityFamily,
  }).length;
};

const buildGenerateFramesVariationSignature = ({
  qualityFamily,
  variationProfile,
  variationCycleIndex,
  shotScope,
}: {
  qualityFamily: DrawingAiRenderingQualityFamily;
  variationProfile: GenerateFramesVariationProfile;
  variationCycleIndex: number;
  shotScope: DrawingAiGenerateFramesShotScope;
}) =>
  [
    `family=${qualityFamily}`,
    `staging=${variationProfile.stagingBias}`,
    `asymmetry=${variationProfile.asymmetryBias}`,
    `timing=${variationProfile.timingBias}`,
    `silhouette=${variationProfile.silhouetteBias}`,
    `cycle=${variationCycleIndex}`,
    `shot=${shotScope}`,
  ].join("|");

const buildUpdatedRecentVariationSignatures = ({
  previousSignatures,
  nextSignature,
}: {
  previousSignatures: readonly string[];
  nextSignature: string;
}) => {
  if (nextSignature.trim().length === 0) {
    return [...previousSignatures].slice(-8);
  }

  const trimmedSignature = nextSignature.trim();
  const dedupedPrevious =
    previousSignatures.at(-1) === trimmedSignature ? [...previousSignatures] : [...previousSignatures, trimmedSignature];

  return dedupedPrevious.slice(-8);
};

const buildGenerateFramesCheapFirstDecision = ({
  executionReadiness,
  searchConfidence,
  expectationCoverage,
  shapeConfidence,
  humanExpectationRisk,
  qualityFamily,
  outputMode,
  projectScope,
  shotScope,
  visibleSubjectCount,
  sceneComplexity,
  requestedFrameCount,
  orderedBeatCount,
  motionType,
}: {
  executionReadiness: GenerateFramesExecutionReadiness;
  searchConfidence: DrawingAiSearchConfidenceProfile;
  expectationCoverage: GenerateFramesExpectationCoverage;
  shapeConfidence: GenerateFramesShapeConfidence;
  humanExpectationRisk: GenerateFramesHumanExpectationRisk;
  qualityFamily: DrawingAiRenderingQualityFamily;
  outputMode: GenerateFramesOutputMode;
  projectScope: DrawingAiGenerateFramesProjectScope;
  shotScope: DrawingAiGenerateFramesShotScope;
  visibleSubjectCount: number;
  sceneComplexity: number;
  requestedFrameCount: number;
  orderedBeatCount: number;
  motionType: DrawingAiGenerateFramesStateMotionType;
}): GenerateFramesCheapFirstDecision => {
  if (executionReadiness === "ask-clarify" || executionReadiness === "controlled-fail") {
    return {
      eligible: false,
      trustedFamily: null,
      reason: "execution-not-safe-local",
    };
  }

  if (expectationCoverage === "needs-reference" || shapeConfidence === "needs-reference") {
    return {
      eligible: false,
      trustedFamily: null,
      reason: "needs-reference-grounding",
    };
  }

  if (searchConfidence.style === "low") {
    return {
      eligible: false,
      trustedFamily: null,
      reason: "style-grounding-still-needed",
    };
  }

  if (humanExpectationRisk === "high") {
    return {
      eligible: false,
      trustedFamily: null,
      reason: "high-human-expectation-risk",
    };
  }

  if (projectScope === "same-project" && shotScope !== "create-first-shot") {
    return {
      eligible: true,
      trustedFamily: qualityFamily,
      reason: "anchored-same-project-local-pass",
    };
  }

  if (outputMode === "still" && requestedFrameCount <= 1 && sceneComplexity <= 1) {
    if (["character", "generic-object", "background"].includes(qualityFamily)) {
      return {
        eligible: true,
        trustedFamily: qualityFamily,
        reason: "simple-still-local-pass",
      };
    }
  }

  if (
    outputMode === "animation" &&
    requestedFrameCount <= 12 &&
    orderedBeatCount < 3 &&
    sceneComplexity <= 1 &&
    (
      qualityFamily === "explosion" ||
      qualityFamily === "lightning" ||
      qualityFamily === "breathing" ||
      qualityFamily === "background-scroll" ||
      ((qualityFamily === "combat" || motionType === "walk" || motionType === "run") && visibleSubjectCount <= 1)
    )
  ) {
    return {
      eligible: true,
      trustedFamily: qualityFamily,
      reason: "trusted-local-family-animation",
    };
  }

  return {
    eligible: false,
    trustedFamily: null,
    reason: "structured-path-still-preferred",
  };
};

const resolveVariationProfile = ({
  normalizedPrompt,
  motionType,
  forceLevel,
  tone,
  modifiers,
  expectedVisualClass,
  qualityFamily,
  variationCycleIndex,
}: {
  normalizedPrompt: string;
  motionType: DrawingAiGenerateFramesStateMotionType;
  forceLevel: DrawingAiGenerateFramesStateForceLevel;
  tone: DrawingAiGenerateFramesStateTone;
  modifiers: readonly string[];
  expectedVisualClass: GenerateFramesExpectedVisualClass;
  qualityFamily: DrawingAiRenderingQualityFamily;
  variationCycleIndex: number;
}): GenerateFramesVariationProfile => {
  let hash = 0;
  const seed = `${normalizedPrompt}|family=${qualityFamily}|cycle=${variationCycleIndex}`;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  const pick = <T,>(values: readonly T[]) => values[hash % values.length]!;
  const stagingBias: GenerateFramesVariationProfile["stagingBias"] =
    expectedVisualClass === "still-scene"
      ? "stable"
      : motionType === "lightning" || forceLevel === "high"
        ? "dynamic"
        : pick(["stable", "offset"]);
  const asymmetryBias: GenerateFramesVariationProfile["asymmetryBias"] =
    motionType === "lightning" || motionType === "explosion" || forceLevel === "high"
      ? "high"
      : tone === "hesitant" || tone === "scared"
        ? "low"
        : pick(["medium", "high"]);
  const timingBias: GenerateFramesVariationProfile["timingBias"] =
    modifiers.includes("sharp") || motionType === "lightning" || forceLevel === "high"
      ? "sharp"
      : modifiers.includes("smooth") || modifiers.includes("calm")
        ? "balanced"
      : motionType === "smoke" || motionType === "background-scroll" || tone === "hesitant" || modifiers.includes("tired")
        ? "linger"
        : "balanced";
  const silhouetteBias: GenerateFramesVariationProfile["silhouetteBias"] =
    modifiers.includes("sharp") || motionType === "lightning"
      ? "angular"
      : motionType === "explosion" || motionType === "smoke"
        ? "organic"
        : pick(["clean", "organic"]);

  return {
    stagingBias,
    asymmetryBias,
    timingBias,
    silhouetteBias,
  };
};

const buildHumanExpectationTranslationGuidance = ({
  normalizedPrompt,
  motionType,
  expectedCompletionProfile,
  outputMode,
  tone,
  forceLevel,
  modifiers,
}: {
  normalizedPrompt: string;
  motionType: DrawingAiGenerateFramesStateMotionType;
  expectedCompletionProfile: GenerateFramesCompletionProfile;
  outputMode: GenerateFramesOutputMode;
  tone: DrawingAiGenerateFramesStateTone;
  forceLevel: DrawingAiGenerateFramesStateForceLevel;
  modifiers: readonly string[];
}) => {
  const structureGuidance: string[] = [];
  const motionGuidance: string[] = [];
  const completionGuidance: string[] = [];
  const axes = new Set<string>();

  const wantsStronger =
    forceLevel === "high" ||
    /\b(stronger|more violent|violent|harder|more powerful|more intense|heavier impact)\b/i.test(normalizedPrompt);
  const wantsHeavier = modifiers.includes("heavier") || /\b(heavier|more weight|weightier)\b/i.test(normalizedPrompt);
  const wantsSmoother = modifiers.includes("smooth") || /\b(smooth(?:er)?|cleaner|better in[- ]betweens?)\b/i.test(normalizedPrompt);
  const wantsFaster = modifiers.includes("faster") || /\b(faster|quicker|snappier)\b/i.test(normalizedPrompt);
  const wantsSharp = modifiers.includes("sharp") || /\b(sharp(?:er)?|crisper)\b/i.test(normalizedPrompt);
  const wantsCalm = modifiers.includes("calm") || /\b(calm|steady|controlled)\b/i.test(normalizedPrompt);
  const wantsTired = modifiers.includes("tired") || /\b(tired|exhausted|fatigued|worn out)\b/i.test(normalizedPrompt);

  if (wantsStronger) {
    axes.add("force");
    axes.add("scale/intensity");
    if (motionType === "explosion" || expectedCompletionProfile === "explosion-complete") {
      pushGuidanceLine(
        motionGuidance,
        "Translate stronger into a larger outward expansion, faster peak spread, and more committed blast timing.",
      );
      pushGuidanceLine(
        completionGuidance,
        "Translate stronger into sharper breakup, hotter debris energy, and a more forceful residue phase after the peak.",
      );
    } else if (["punch", "kick", "fight", "action"].includes(motionType)) {
      pushGuidanceLine(
        motionGuidance,
        "Translate stronger or more violent motion into deeper anticipation, faster strike timing, and harsher contact clarity.",
      );
      pushGuidanceLine(
        completionGuidance,
        "Translate stronger or more violent motion into stronger follow-through before recovery instead of a timid stop.",
      );
    } else {
      pushGuidanceLine(
        motionGuidance,
        "Translate stronger into clearer force, more committed directional travel, and less timid spacing.",
      );
    }
  }

  if (wantsHeavier) {
    axes.add("weight");
    pushGuidanceLine(
      motionGuidance,
      "Translate heavier into slower acceleration, stronger settle, and clearer impact emphasis instead of floaty motion.",
    );
    if (outputMode === "animation") {
      pushGuidanceLine(
        completionGuidance,
        "Let heavy motion land and settle instead of snapping weightlessly through the ending beat.",
      );
    }
  }

  if (wantsSmoother) {
    axes.add("smoothness");
    pushGuidanceLine(
      motionGuidance,
      "Translate smoother into cleaner arcs, fewer abrupt angle changes, and more even timing or spacing.",
    );
  }

  if (wantsFaster) {
    axes.add("speed");
    pushGuidanceLine(
      motionGuidance,
      "Translate faster into snappier timing, reduced hang time, and clearer directional spacing instead of blurred chaos.",
    );
  }

  if (wantsSharp) {
    axes.add("sharpness");
    if (motionType === "lightning" || expectedCompletionProfile === "lightning-vanish") {
      pushGuidanceLine(
        structureGuidance,
        "Translate sharp lightning into a crisper zigzag path, clearer electric branching, and a brighter readable core.",
      );
      pushGuidanceLine(
        completionGuidance,
        "Translate sharp lightning into a snappier strike and a cleaner collapse instead of a mushy linger.",
      );
    } else {
      pushGuidanceLine(
        structureGuidance,
        "Translate sharp into crisper silhouette edges or pose lines where the family supports it.",
      );
      pushGuidanceLine(
        motionGuidance,
        "Translate sharp into snappier timing and more clearly defined peak beats where appropriate.",
      );
    }
  }

  if (wantsCalm) {
    axes.add("calmness");
    pushGuidanceLine(
      motionGuidance,
      "Translate calm into reduced force, steadier timing, and controlled transitions instead of accidental aggression.",
    );
  }

  if (wantsTired || (tone === "weak" && /\b(after|afterward|afterwards|post)\b/i.test(normalizedPrompt))) {
    axes.add("fatigue");
    pushGuidanceLine(
      structureGuidance,
      "Translate tired into lowered posture, less lifted posing, and a body line that reads worn down instead of fully fresh.",
    );
    pushGuidanceLine(
      completionGuidance,
      "Translate tired into slower recovery and a clearer breathing rhythm instead of a neutral idle finish.",
    );
  }

  return {
    axes: [...axes],
    structureGuidance,
    motionGuidance,
    completionGuidance,
  };
};

function summarizeThinkingSubject(subject: DrawingAiGenerateFramesStateSubject) {
  const parts = [
    subject.label?.trim() || null,
    subject.color ? `${subject.color} subject` : null,
    subject.side === "left" || subject.side === "right" ? `${subject.side} subject` : null,
    subject.role !== "primary" && subject.role !== "secondary" && subject.role !== "background" ? subject.role : null,
  ].filter((part, index, items): part is string => typeof part === "string" && part.length > 0 && items.indexOf(part) === index);

  return parts[0] ?? "subject";
}

const splitThinkingPromptClauses = (prompt: string) =>
  unique(
    prompt
      .replace(/[“”]/g, '"')
      .replace(/[’]/g, "'")
      .split(/(?:\s*,\s*|\s*;\s*|\s*\.\s*|(?=\b(?:actually|instead|except|rather than|but)\b))/i)
      .map((clause) => normalizePrompt(clause))
      .filter((clause) => clause.length > 0),
  );

const detectThinkingClauseTags = (normalizedClause: string): GenerateFramesThinkingClauseTag[] => {
  const tags = new Set<GenerateFramesThinkingClauseTag>();

  if (/^(?:actually|instead|except)\b|\bnot\b(?:\s+\w+){0,8}\s+\bbut\b|\brather than\b|\bkeep\b(?:\s+\w+){0,8}\s+\bbut change\b/i.test(normalizedClause)) {
    tags.add("correction");
  }
  if (/^(?:no|not|without|avoid)\b|\bwithout\b/i.test(normalizedClause)) {
    tags.add("negative");
  }
  if (/\b(first|second|third|then|after|before|ending with|ending in|followed by)\b/i.test(normalizedClause)) {
    tags.add("sequence");
  }
  if (
    CONTINUATION_PATTERN.test(normalizedClause) ||
    EXPLICIT_NEW_PROJECT_PATTERN.test(normalizedClause) ||
    NEW_SHOT_SAME_PROJECT_PATTERN.test(normalizedClause) ||
    promptLocksCurrentScene(normalizedClause)
  ) {
    tags.add("scope");
  }
  if (/\b(add|also|plus|with|along with|just add|keep)\b/i.test(normalizedClause)) {
    tags.add("additive");
  }
  if (tags.size === 0) {
    tags.add("base");
  }

  return [...tags];
};

const detectThinkingClauseConflictSlots = ({
  normalizedClause,
  subjects,
  subjectBindings,
}: {
  normalizedClause: string;
  subjects: readonly DrawingAiGenerateFramesStateSubject[];
  subjectBindings: readonly DrawingAiSubjectBinding[];
}): GenerateFramesThinkingConflictSlot[] => {
  const slots = new Set<GenerateFramesThinkingConflictSlot>();
  const visibleSubjects = subjects.filter((subject) => subject.type !== "background");
  const subjectMentioned = visibleSubjects.some((subject) =>
    buildSubjectPromptReferenceCandidates({
      subject,
      subjectBindings,
    }).some((candidate) => buildSubjectReferencePattern(candidate)?.test(normalizedClause)),
  );

  if (subjectMentioned || /\b(him|her|them|that one|this one|that figure|this figure)\b/i.test(normalizedClause)) {
    slots.add("subject identity");
  }
  if (/\b(one|two|three|four|five|both|pair|crowd|group)\b/i.test(normalizedClause)) {
    slots.add("subject count");
  }
  if (COLOR_TOKEN_PATTERN.test(normalizedClause)) {
    slots.add("color");
  }
  COLOR_TOKEN_PATTERN.lastIndex = 0;
  if (/\b(left|right|center|middle)\b/i.test(normalizedClause)) {
    slots.add("side");
  }
  if (/\b(attacker|defender|primary|secondary|target|runner)\b/i.test(normalizedClause)) {
    slots.add("role");
  }
  if (/\b(named|called|label(?:ed)?)\b/i.test(normalizedClause)) {
    slots.add("label");
  }
  if (/\b(punch|kick|run|walk|jump|breathe|explosion|lightning|smoke|fireball|guard stance|ready stance)\b/i.test(normalizedClause)) {
    slots.add("action");
  }
  if (/\b(first|second|third|then|after|before|ending with|ending in|followed by)\b/i.test(normalizedClause)) {
    slots.add("order");
  }
  if (BACKGROUND_PATTERN.test(normalizedClause) || /\b(scene|background|shot|room|hallway|cave|neighborhood)\b/i.test(normalizedClause)) {
    slots.add("scene");
  }
  if (
    CONTINUATION_PATTERN.test(normalizedClause) ||
    EXPLICIT_NEW_PROJECT_PATTERN.test(normalizedClause) ||
    NEW_SHOT_SAME_PROJECT_PATTERN.test(normalizedClause) ||
    promptLocksCurrentScene(normalizedClause)
  ) {
    slots.add("scope");
  }
  if (STYLE_REFERENCE_LOOKUP_PATTERN.test(normalizedClause)) {
    slots.add("style/look");
  }
  if (/^(?:no|not|without|avoid)\b|\bwithout\b/i.test(normalizedClause)) {
    slots.add("negative exclusions");
  }
  if (/\b(explosion|lightning|punch|kick|breath(?:e|ing)|walk|run|background movement|scroll)\b/i.test(normalizedClause)) {
    slots.add("completion style");
  }
  if (STILL_SETUP_PATTERN.test(normalizedClause) || EXPLICIT_ANIMATION_PATTERN.test(normalizedClause) || CONTINUATION_PATTERN.test(normalizedClause)) {
    slots.add("still vs animation");
  }

  return [...slots];
};

function buildThinkingClausePriorityResolution({
  analysis,
  subjectBindings,
  uncertainties,
  correctedSubjectTargeting,
}: {
  analysis: Omit<
    GenerateFramesRuntimeAnalysis,
    "thinkingSystem" | "executionReadiness" | "executionReadinessReason"
  >;
  subjectBindings: readonly DrawingAiSubjectBinding[];
  uncertainties: readonly GenerateFramesThinkingUncertainty[];
  correctedSubjectTargeting: GenerateFramesCorrectedSubjectTargeting;
}): GenerateFramesClausePriorityResolution {
  const clauses = splitThinkingPromptClauses(analysis.prompt).map((clause) => ({
    text: clause,
    tags: detectThinkingClauseTags(clause),
    conflictSlots: detectThinkingClauseConflictSlots({
      normalizedClause: clause,
      subjects: analysis.subjects,
      subjectBindings,
    }),
    correctionCue:
      clause.match(/\b(actually|instead|except|rather than)\b/i)?.[1]?.toLowerCase() ??
      (/\bnot\b(?:\s+\w+){0,8}\s+\bbut\b/i.test(clause) ? "not-but" : null),
  }));

  const preferredSubjectLabels = correctedSubjectTargeting.preferredAliases.slice(0, 2);
  const excludedSubjectLabels = correctedSubjectTargeting.excludedAliases.slice(0, 2);
  const appliedCorrections = unique([
    promptLocksCurrentScene(analysis.normalizedPrompt)
      ? "Later corrective continuity language locks the current scene instead of allowing a reset."
      : null,
    promptForcesNewProjectByCorrection(analysis.normalizedPrompt)
      ? "Later corrective scope language starts a new project instead of continuing the current one."
      : null,
    preferredSubjectLabels.length > 0
      ? `Later corrective targeting keeps ${preferredSubjectLabels.join(" / ")} as the active subject.`
      : null,
    excludedSubjectLabels.length > 0
      ? `Corrective targeting excludes ${excludedSubjectLabels.join(" / ")} from the requested change.`
      : null,
    /\bnot\b(?:\s+\w+){0,8}\s+\bbut\b|\binstead\b|\bactually\b|\brather than\b/i.test(analysis.normalizedPrompt)
      ? "Later corrective clause language overrides conflicting earlier slots only where the prompt explicitly says to."
      : null,
  ].filter((item): item is string => typeof item === "string" && item.length > 0));

  const contradictions = unique([
    ...uncertainties
      .filter((uncertainty) => uncertainty.code === "contradictory-modifiers" || uncertainty.code === "scope-conflict")
      .map((uncertainty) => uncertainty.reason),
    !/\b(actually|instead|rather than|not .* but)\b/i.test(analysis.normalizedPrompt) &&
    STILL_SETUP_PATTERN.test(analysis.normalizedPrompt) &&
    EXPLICIT_ANIMATION_PATTERN.test(analysis.normalizedPrompt)
      ? "The prompt contains both still-frame and animation instructions without a corrective override."
      : null,
  ].filter((item): item is string => typeof item === "string" && item.length > 0));

  const unresolvedReferences = unique([
    ...uncertainties
      .filter((uncertainty) =>
        ["ambiguous-singular-target", "missing-continuation-anchor", "scope-conflict"].includes(uncertainty.code),
      )
      .map((uncertainty) => uncertainty.reason),
    /\b(him|her|them|that one|this one)\b/i.test(analysis.normalizedPrompt) &&
    correctedSubjectTargeting.preferredSubjectIds.length === 0 &&
    analysis.subjects.filter((subject) => subject.type !== "background").length > 1
      ? "A singular or pronoun reference still needs a uniquely resolved current subject."
      : null,
  ].filter((item): item is string => typeof item === "string" && item.length > 0));

  return {
    clauses,
    appliedCorrections,
    contradictions,
    unresolvedReferences,
    preferredSubjectIds: correctedSubjectTargeting.preferredSubjectIds,
    excludedSubjectIds: correctedSubjectTargeting.excludedSubjectIds,
    scopeLocks: unique([
      promptLocksCurrentScene(analysis.normalizedPrompt) ? "keep-current-scene" : null,
      promptForcesNewProjectByCorrection(analysis.normalizedPrompt) ? "start-new-project" : null,
    ].filter((item): item is string => typeof item === "string" && item.length > 0)),
  };
}

function buildThinkingAmbiguityDecision(
  uncertainties: readonly GenerateFramesThinkingUncertainty[],
): GenerateFramesAmbiguityDecision {
  const highRiskUncertainty = uncertainties.find((uncertainty) => uncertainty.risk === "high");
  if (highRiskUncertainty?.question) {
    return {
      outcome: "ask-clarify",
      highestRiskCode: highRiskUncertainty.code,
      reason: highRiskUncertainty.reason,
      question: highRiskUncertainty.question,
      options: highRiskUncertainty.options,
    };
  }

  if (highRiskUncertainty != null) {
    return {
      outcome: "controlled-fail",
      highestRiskCode: highRiskUncertainty.code,
      reason: highRiskUncertainty.reason,
      question: null,
      options: [],
    };
  }

  return {
    outcome: "clear",
    highestRiskCode: null,
    reason: null,
    question: null,
    options: [],
  };
}

function buildThinkingSearchDecision(
  analysis: Omit<
    GenerateFramesRuntimeAnalysis,
    "thinkingSystem" | "executionReadiness" | "executionReadinessReason"
  >,
): GenerateFramesThinkingSearchDecision {
  const requiredDimensions = getRequiredSearchConfidenceDimensions(analysis);
  const lowConfidenceDimensions = requiredDimensions.filter((dimension) => analysis.searchConfidence[dimension] === "low");
  const mediumConfidenceDimensions = requiredDimensions.filter(
    (dimension) => analysis.searchConfidence[dimension] === "medium",
  );
  const namedStyleReference = STYLE_REFERENCE_LOOKUP_PATTERN.test(analysis.normalizedPrompt);
  const searchForbiddenByDefault =
    !namedStyleReference &&
    (
      /\b(explosion|lightning|stick(?:\s|-)?figure|bouncing ball|breathing hard|tree|cave|neighborhood)\b/i.test(
        analysis.normalizedPrompt,
      ) ||
      analysis.shotScope === "tweak-current-shot"
    );

  return {
    requiredDimensions,
    lowConfidenceDimensions,
    mediumConfidenceDimensions,
    searchRequired: namedStyleReference || lowConfidenceDimensions.length > 0,
    searchForbiddenByDefault,
    reason:
      namedStyleReference
        ? "The prompt uses a named style or look reference, so missing style knowledge must be grounded before execution."
        : lowConfidenceDimensions.length > 0
          ? `Required search confidence is low for ${lowConfidenceDimensions.join(", ")}.`
          : null,
  };
}

function detectThinkingUncertainties({
  normalizedPrompt,
  subjects,
  subjectBindings,
  questionGate,
  continuationState,
  correctedSubjectTargeting,
}: {
  normalizedPrompt: string;
  subjects: readonly DrawingAiGenerateFramesStateSubject[];
  subjectBindings: readonly DrawingAiSubjectBinding[];
  questionGate: GenerateFramesQuestionGate;
  continuationState: DrawingAiGenerateFramesState | null;
  correctedSubjectTargeting: GenerateFramesCorrectedSubjectTargeting;
}) {
  const visibleSubjects = subjects.filter((subject) => subject.type !== "background");
  const uncertainties: GenerateFramesThinkingUncertainty[] = [];
  const pushUncertainty = (uncertainty: GenerateFramesThinkingUncertainty) => {
    if (!uncertainties.some((existing) => existing.code === uncertainty.code && existing.reason === uncertainty.reason)) {
      uncertainties.push(uncertainty);
    }
  };

  if (
    questionGate.blocker != null &&
    /no current (?:drawing|frame|sequence) available/i.test(questionGate.blocker) &&
    continuationState == null
  ) {
    pushUncertainty({
      code: "missing-continuation-anchor",
      reason: "The prompt asks to continue or tweak a current frame or sequence, but there is no accepted continuation anchor.",
      risk: "high",
      question: "Continue from which frame or create new sequence?",
      options: ["Current frame", "Current sequence", "Create new sequence"],
    });
  }

  if (questionGate.blocker != null && /entry side/i.test(questionGate.blocker)) {
    pushUncertainty({
      code: "entry-side-ambiguous",
      reason: "The prompt implies a staged entrance but does not specify the entry side.",
      risk: "high",
      question: "Which side should the subject enter from?",
      options: ["Left", "Right", "Top", "Bottom"],
    });
  }

  const promptTargetsAll = promptReferencesAllCurrentSubjects(normalizedPrompt);
  const hasSingularPronounReference =
    /\b(him|her|it|that one|this one|that figure|this figure|that character|this character)\b/i.test(normalizedPrompt);
  const explicitTargetedSubjects =
    correctedSubjectTargeting.preferredSubjectIds.length > 0
      ? visibleSubjects.filter((subject) => correctedSubjectTargeting.preferredSubjectIds.includes(subject.id))
      : visibleSubjects.filter((subject) =>
          buildSubjectPromptReferenceCandidates({
            subject,
            subjectBindings,
          }).some((candidate) => buildSubjectReferencePattern(candidate)?.test(normalizedPrompt)),
        );

  if (
    visibleSubjects.length >= 2 &&
    hasSingularPronounReference &&
    !promptTargetsAll &&
    explicitTargetedSubjects.length !== 1
  ) {
    pushUncertainty({
      code: "ambiguous-singular-target",
      reason: "The prompt refers to one current subject, but more than one subject still matches that singular reference.",
      risk: "high",
      question: "Which current subject do you mean?",
      options: visibleSubjects.slice(0, 4).map((subject) => summarizeThinkingSubject(subject)),
    });
  }

  const hasExplicitCurrentReference =
    CURRENT_WORLD_REFERENCE_PATTERN.test(normalizedPrompt) ||
    CURRENT_SUBJECT_REFERENCE_PATTERN.test(normalizedPrompt) ||
    CONTINUATION_PATTERN.test(normalizedPrompt);
  if (
    EXPLICIT_NEW_PROJECT_PATTERN.test(normalizedPrompt) &&
    hasExplicitCurrentReference &&
    !promptLocksCurrentScene(normalizedPrompt) &&
    !promptForcesNewProjectByCorrection(normalizedPrompt)
  ) {
    pushUncertainty({
      code: "scope-conflict",
      reason: "The prompt contains both same-project continuity cues and explicit new-project cues.",
      risk: "high",
      question: "Should this stay in the current project or start a brand-new project?",
      options: ["Stay in current project", "Start a new project"],
    });
  }

  const hasCorrectiveCue = /\b(actually|instead|rather than|not .* but)\b/i.test(normalizedPrompt);
  const wantsCalm = /\b(calm|controlled|steady)\b/i.test(normalizedPrompt);
  const wantsViolent = /\b(violent|more violent|brutal|aggressive)\b/i.test(normalizedPrompt);
  const wantsSmooth = /\b(smooth(?:er)?|cleaner)\b/i.test(normalizedPrompt);
  const wantsJittery = /\b(jerky|stiff|jittery|rougher)\b/i.test(normalizedPrompt);
  if (!hasCorrectiveCue && ((wantsCalm && wantsViolent) || (wantsSmooth && wantsJittery))) {
    pushUncertainty({
      code: "contradictory-modifiers",
      reason: "The prompt asks for conflicting motion qualities that would produce very different timing or force.",
      risk: "high",
      question: wantsCalm && wantsViolent
        ? "Should the motion read calm and controlled or violent and forceful?"
        : "Should the motion read smoother and cleaner or rougher and stiffer?",
      options:
        wantsCalm && wantsViolent
          ? ["Calm and controlled", "Violent and forceful"]
          : ["Smoother and cleaner", "Rougher and stiffer"],
    });
  }

  return uncertainties;
}

function resolveThinkingVisualFamily(
  primaryFamily: GenerateFramesIntentFamily,
  componentFamilies: readonly GenerateFramesIntentFamily[],
) {
  if (primaryFamily !== "continuation") {
    return primaryFamily === "mixed" ? "mixed" : primaryFamily;
  }
  const nonContinuationFamilies = componentFamilies.filter((family) => family !== "continuation");
  if (nonContinuationFamilies.length === 0) {
    return "character";
  }
  if (nonContinuationFamilies.length >= 2) {
    return "mixed";
  }
  return nonContinuationFamilies[0] === "mixed" ? "mixed" : nonContinuationFamilies[0]!;
}

function buildThinkingPromptParse({
  analysis,
  subjectBindings,
  uncertainties,
  clausePriorityResolution,
}: {
  analysis: Omit<
    GenerateFramesRuntimeAnalysis,
    "thinkingSystem" | "executionReadiness" | "executionReadinessReason"
  >;
  subjectBindings: readonly DrawingAiSubjectBinding[];
  uncertainties: readonly GenerateFramesThinkingUncertainty[];
  clausePriorityResolution: GenerateFramesClausePriorityResolution;
}): GenerateFramesPromptParse {
  const subjects = analysis.subjects
    .filter((subject) => subject.type !== "background")
    .map((subject) => summarizeThinkingSubject(subject));
  const scenes = [
    analysis.sceneSetting,
    ...analysis.sceneDescriptors,
    ...analysis.sceneProps,
    ...analysis.sceneElements,
  ].filter((item, index, items): item is string => typeof item === "string" && item.length > 0 && items.indexOf(item) === index);
  const actions = unique([
    analysis.motionType !== "unknown" ? analysis.motionType : null,
    ...analysis.actionKeywords,
    ...analysis.orderedBeats,
  ].filter((item): item is string => typeof item === "string" && item.length > 0));
  const constraints = unique([
    analysis.stillFrameRequested ? "still-frame" : null,
    analysis.requestedFrameCount > 1 ? `${analysis.requestedFrameCount} frames requested` : null,
    analysis.requestedColor ? `requested color: ${analysis.requestedColor}` : null,
    ...analysis.subjects.flatMap((subject) => [
      subject.color ? `${subject.id} color=${subject.color}` : null,
      subject.side === "left" || subject.side === "right" ? `${subject.id} side=${subject.side}` : null,
      subject.role !== "primary" && subject.role !== "secondary" && subject.role !== "background"
        ? `${subject.id} role=${subject.role}`
        : null,
      subject.label?.trim() ? `${subject.id} label=${subject.label.trim()}` : null,
    ]),
  ].filter((item): item is string => typeof item === "string" && item.length > 0));
  const negatives = unique([
    ...analysis.negatedConcepts.map((concept) => `no ${concept}`),
    /\bno smoke\b/i.test(analysis.normalizedPrompt) ? "no smoke" : null,
    /\bno face|no facial features|without (?:a )?face\b/i.test(analysis.normalizedPrompt) ? "no face" : null,
    /\bno extra (?:characters?|subjects?|people)\b/i.test(analysis.normalizedPrompt) ? "no extra characters" : null,
    /\bwithout changing\b/i.test(analysis.normalizedPrompt) ? "without changing unrelated parts" : null,
  ].filter((item): item is string => typeof item === "string" && item.length > 0));
  const sequenceMarkers = unique(
    (analysis.normalizedPrompt.match(/\b(first|second|third|then|after|before|ending with|ending in|followed by)\b/g) ?? [])
      .map((marker) => marker.trim()),
  );
  const scopeCues = unique([
    analysis.interactionMode,
    analysis.projectScope,
    analysis.shotScope,
    CURRENT_SUBJECT_REFERENCE_PATTERN.test(analysis.normalizedPrompt) ? "references current subject" : null,
    CURRENT_WORLD_REFERENCE_PATTERN.test(analysis.normalizedPrompt) ? "references current world" : null,
  ].filter((item): item is string => typeof item === "string" && item.length > 0));
  const searchTriggers = unique([
    STYLE_REFERENCE_LOOKUP_PATTERN.test(analysis.normalizedPrompt) ? "named style reference" : null,
    SEARCH_WORTHY_MODIFIER_PATTERN.test(analysis.normalizedPrompt) ? "search-worthy modifier" : null,
    UNUSUAL_SCENE_DESCRIPTOR_PATTERN.test(analysis.normalizedPrompt) ? "unusual scene descriptor" : null,
    analysis.searchConfidence.style === "low" ? "low style confidence" : null,
    analysis.searchConfidence.motion === "low" ? "low motion confidence" : null,
    analysis.searchConfidence.scene === "low" ? "low scene confidence" : null,
    analysis.searchConfidence.subject === "low" ? "low subject confidence" : null,
    analysis.searchConfidence.continuity === "low" ? "low continuity confidence" : null,
    subjectBindings.some((binding) => binding.bindingType === "label") ? "accepted subject labels available" : null,
  ].filter((item): item is string => typeof item === "string" && item.length > 0));

  return {
    subjects,
    scenes,
    actions,
    constraints,
    modifiers: analysis.modifiers,
    negatives,
    sequenceMarkers,
    scopeCues,
    searchTriggers,
    corrections: clausePriorityResolution.appliedCorrections,
    contradictions: clausePriorityResolution.contradictions,
    unresolvedReferences: clausePriorityResolution.unresolvedReferences,
    uncertainties: [...uncertainties],
  };
}

function buildThinkingSubjectGraph({
  analysis,
  subjectBindings,
  uncertainties,
  correctedSubjectTargeting,
}: {
  analysis: Omit<
    GenerateFramesRuntimeAnalysis,
    "thinkingSystem" | "executionReadiness" | "executionReadinessReason"
  >;
  subjectBindings: readonly DrawingAiSubjectBinding[];
  uncertainties: readonly GenerateFramesThinkingUncertainty[];
  correctedSubjectTargeting: GenerateFramesCorrectedSubjectTargeting;
}): GenerateFramesSubjectGraph {
  const activeFocusTargetIds = (() => {
    const visibleSubjects = analysis.subjects.filter((subject) => subject.type !== "background");
    if (promptReferencesAllCurrentSubjects(analysis.normalizedPrompt)) {
      return visibleSubjects.map((subject) => subject.id);
    }
    if (correctedSubjectTargeting.preferredSubjectIds.length > 0) {
      return correctedSubjectTargeting.preferredSubjectIds;
    }
    const explicit = visibleSubjects
      .filter((subject) =>
        buildSubjectPromptReferenceCandidates({
          subject,
          subjectBindings,
        }).some((candidate) => buildSubjectReferencePattern(candidate)?.test(analysis.normalizedPrompt)),
      )
      .filter((subject) => !correctedSubjectTargeting.excludedSubjectIds.includes(subject.id))
      .map((subject) => subject.id);
    if (explicit.length > 0) {
      return explicit;
    }
    if (visibleSubjects.length === 1) {
      return [visibleSubjects[0]!.id];
    }
    return [];
  })();

  return {
    subjects: analysis.subjects.map((subject) => ({
      subjectId: subject.id,
      type: subject.type,
      color: subject.color,
      side: subject.side,
      role: subject.role,
      label: subject.label?.trim() ?? null,
      aliases: subjectBindings
        .filter((binding) => binding.subjectId === subject.id)
        .map((binding) => binding.alias)
        .slice(0, 10),
      included: !analysis.excludedFamilies.includes(subject.type === "background" ? "background" : subject.type),
      excluded: analysis.excludedFamilies.includes(subject.type === "background" ? "background" : subject.type),
    })),
    activeFocusTargetIds,
    collectiveGroups: [
      ...(promptReferencesAllCurrentSubjects(analysis.normalizedPrompt) ? ["all-current-subjects"] : []),
      ...(/\b(everyone|all|all of them)\b/i.test(analysis.normalizedPrompt) ? ["everyone"] : []),
    ],
    ambiguityRisk: uncertainties.some((uncertainty) => uncertainty.risk === "high") ? "high" : "low",
  };
}

function buildThinkingExclusionSet(analysis: Omit<
  GenerateFramesRuntimeAnalysis,
  "thinkingSystem" | "executionReadiness" | "executionReadinessReason"
>): GenerateFramesExclusionSet {
  const explicitNegatives = unique([
    ...analysis.negatedConcepts.map((concept) => `no ${concept}`),
    /\bno smoke\b/i.test(analysis.normalizedPrompt) ? "no smoke" : null,
    /\bno face|no facial features|without (?:a )?face\b/i.test(analysis.normalizedPrompt) ? "no face" : null,
    /\bno extra (?:characters?|subjects?|people)\b/i.test(analysis.normalizedPrompt) ? "no extra characters" : null,
    /\bwithout changing\b/i.test(analysis.normalizedPrompt) ? "preserve unrelated content" : null,
  ].filter((item): item is string => typeof item === "string" && item.length > 0));

  const derivedExclusions = unique([
    analysis.projectScope === "same-project" ? "no scene reset" : null,
    analysis.shotScope === "tweak-current-shot" ? "no cast replacement" : null,
    analysis.primaryFamily === "effect" ? "no unrelated characters or props" : null,
    analysis.layerPlan.preserveExistingContent ? "preserve existing visible structure" : null,
    analysis.executionGuidance.addOnPolicy === "core-first" ? "add-ons may not replace the core event" : null,
  ].filter((item): item is string => typeof item === "string" && item.length > 0));

  const allowedImpliedAdditions = unique([
    analysis.motionType === "explosion" ? "residue, debris, smoke if not forbidden" : null,
    analysis.motionType === "lightning" ? "flash, glow, after-trace if not forbidden" : null,
    analysis.primaryFamily === "background" || analysis.visualKind === "scene"
      ? "environment elements needed to read the place"
      : null,
  ].filter((item): item is string => typeof item === "string" && item.length > 0));

  return {
    explicitNegatives,
    derivedExclusions,
    allowedImpliedAdditions,
  };
}

function buildThinkingCompletionContract(
  analysis: Omit<
    GenerateFramesRuntimeAnalysis,
    "thinkingSystem" | "executionReadiness" | "executionReadinessReason"
  >,
): GenerateFramesCompletionContract {
  const partialMomentAllowed =
    analysis.stillFrameRequested ||
    analysis.requestKind === "single-frame" ||
    /\b(setup frame|first frame|opening frame|starting point|still)\b/i.test(analysis.normalizedPrompt);

  const endingRequirements = (() => {
    switch (analysis.expectedCompletionProfile) {
      case "explosion-complete":
        return ["build-up", "expansion", "peak", "breakup", "aftermath"];
      case "lightning-vanish":
        return ["strike", "flash", "collapse", "vanish"];
      case "strike-recover":
        return ["setup", "contact", "recovery"];
      case "kick-recover":
        return ["prep", "extension or contact", "recoil", "recovery"];
      case "breathing-loop":
        return ["inhale", "exhale", "return toward next cycle"];
      case "scene-scroll":
        return ["anchored subject", "moving environment", "resolved end state"];
      case "walk-cycle":
      case "run-cycle":
        return ["readable travel", "weight transfer", "resolved step logic"];
      default:
        if (analysis.shotScope === "tweak-current-shot") {
          return ["only requested changes", "preserved unrelated identity"];
        }
        if (analysis.outputMode === "still") {
          return ["one readable resolved frame"];
        }
        return ["readable setup", "main action", "resolved ending"];
    }
  })();

  return {
    profile: analysis.expectedCompletionProfile,
    mustComplete: !partialMomentAllowed || analysis.outputMode === "animation" || analysis.shotScope === "tweak-current-shot",
    partialMomentAllowed,
    endingRequirements,
  };
}

function buildThinkingSystem({
  analysis,
  subjectBindings,
}: {
  analysis: Omit<
    GenerateFramesRuntimeAnalysis,
    "thinkingSystem" | "executionReadiness" | "executionReadinessReason"
  >;
  subjectBindings: readonly DrawingAiSubjectBinding[];
}): GenerateFramesThinkingSystem {
  const correctedSubjectTargeting = resolveCorrectionAwareSubjectTargeting({
    normalizedPrompt: analysis.normalizedPrompt,
    subjects: analysis.subjects,
    subjectBindings,
  });
  const uncertainties = detectThinkingUncertainties({
    normalizedPrompt: analysis.normalizedPrompt,
    subjects: analysis.subjects,
    subjectBindings,
    questionGate: analysis.questionGate,
    continuationState: analysis.continuationState,
    correctedSubjectTargeting,
  });
  const clausePriorityResolution = buildThinkingClausePriorityResolution({
    analysis,
    subjectBindings,
    uncertainties,
    correctedSubjectTargeting,
  });
  const promptParse = buildThinkingPromptParse({
    analysis,
    subjectBindings,
    uncertainties,
    clausePriorityResolution,
  });
  const expectationTranslation = buildHumanExpectationTranslationGuidance({
    normalizedPrompt: analysis.normalizedPrompt,
    motionType: analysis.motionType,
    expectedCompletionProfile: analysis.expectedCompletionProfile,
    outputMode: analysis.outputMode,
    tone: analysis.tone,
    forceLevel: analysis.forceLevel,
    modifiers: analysis.modifiers,
  });
  const ambiguityDecision = buildThinkingAmbiguityDecision(uncertainties);
  const searchDecision = buildThinkingSearchDecision(analysis);

  return {
    promptParse,
    clausePriorityResolution,
    intentClassification: {
      temporalMode:
        analysis.primaryFamily === "continuation" || analysis.interactionMode === "continue"
          ? "continuation"
          : analysis.outputMode === "still"
            ? "still"
            : "animation",
      visualFamily: resolveThinkingVisualFamily(analysis.primaryFamily, analysis.componentFamilies),
      complexityTier:
        analysis.executionGuidance.complexityLevel === "high"
          ? "complex"
          : analysis.executionGuidance.complexityLevel,
    },
    contextDecision: {
      projectScope: analysis.projectScope,
      shotScope: analysis.shotScope,
      precedenceOrder: [
        "explicit current user instruction",
        "active shot state",
        "accepted subject bindings",
        "accepted project story memory",
        "older saved memory",
      ],
      hasProjectAnchor:
        analysis.projectScope === "same-project" ||
        analysis.continuationState != null ||
        !/current (?:drawing|frame|sequence)/i.test(analysis.questionGate.blocker ?? ""),
      hasShotAnchor:
        analysis.continuationState != null ||
        analysis.shotScope !== "create-first-shot",
    },
    subjectGraph: buildThinkingSubjectGraph({
      analysis,
      subjectBindings,
      uncertainties,
      correctedSubjectTargeting,
    }),
    beatPlan: analysis.sequenceBeats,
    expectationTranslation: {
      axes: expectationTranslation.axes,
      structureAdjustments: expectationTranslation.structureGuidance,
      motionAdjustments: expectationTranslation.motionGuidance,
      completionAdjustments: expectationTranslation.completionGuidance,
    },
    ambiguityDecision,
    searchDecision,
    exclusionSet: buildThinkingExclusionSet(analysis),
    completionContract: buildThinkingCompletionContract(analysis),
    clarifyingQuestion: ambiguityDecision.question,
    clarifyingOptions: ambiguityDecision.options,
  };
}

const isFamiliarLocalStillSetupSceneRequest = ({
  normalizedPrompt,
  interactionMode,
  requestKind,
  outputMode,
  componentFamilies,
  subjects,
  sceneSetting,
  sceneDescriptors,
  sceneProps,
  sceneElements,
  motionType,
  actionKeywords,
  humanExpectationRisk,
}: Pick<
  GenerateFramesRuntimeAnalysis,
  | "normalizedPrompt"
  | "interactionMode"
  | "requestKind"
  | "outputMode"
  | "componentFamilies"
  | "subjects"
  | "sceneSetting"
  | "sceneDescriptors"
  | "sceneProps"
  | "sceneElements"
  | "motionType"
  | "actionKeywords"
  | "humanExpectationRisk"
>) => {
  if (interactionMode !== "create" || requestKind !== "single-frame" || outputMode !== "still") {
    return false;
  }

  if (STYLE_REFERENCE_LOOKUP_PATTERN.test(normalizedPrompt)) {
    return false;
  }

  if (SEARCH_WORTHY_MODIFIER_PATTERN.test(normalizedPrompt) || UNUSUAL_SCENE_DESCRIPTOR_PATTERN.test(normalizedPrompt)) {
    return false;
  }

  if (
    motionType === "background-scroll" ||
    actionKeywords.length > 0 ||
    /\b(animate|animation|moving|scroll|walk|run|jump|punch|kick|fight|explode|lightning|breath(?:e|ing))\b/i.test(
      normalizedPrompt,
    )
  ) {
    return false;
  }

  if (humanExpectationRisk === "high") {
    return false;
  }

  const hasFamiliarFigure =
    subjects.some(
      (subject) =>
        subject.type === "character" &&
        (LOCAL_EXPECTATION_CHARACTER_PATTERN.test(normalizePrompt(subject.label ?? "")) || subject.color != null),
    ) ||
    /\b(stick(?:\s|-)?figure|fighter|character|person|human)\b/i.test(normalizedPrompt);
  const hasFamiliarScene =
    sceneSetting != null ||
    componentFamilies.includes("background") ||
    LOCAL_EXPECTATION_SCENE_PATTERN.test(normalizedPrompt);

  return (
    hasFamiliarFigure &&
    hasFamiliarScene &&
    sceneDescriptors.length <= 1 &&
    sceneProps.length <= 2 &&
    sceneElements.length <= 2
  );
};

function resolveGenerateFramesExecutionReadiness({
  analysis,
  thinkingSystem,
}: {
  analysis: Omit<
    GenerateFramesRuntimeAnalysis,
    "thinkingSystem" | "executionReadiness" | "executionReadinessReason"
  >;
  thinkingSystem: GenerateFramesThinkingSystem;
}): {
  readiness: GenerateFramesExecutionReadiness;
  reason: string | null;
} {
  if (isGenerateFramesHardNoPlanBlockerValue(analysis.noPlanBlocker) && analysis.noPlanReason != null) {
    return {
      readiness: "controlled-fail",
      reason: analysis.noPlanReason,
    };
  }

  if (thinkingSystem.ambiguityDecision.outcome === "ask-clarify" && thinkingSystem.ambiguityDecision.question) {
    return {
      readiness: "ask-clarify",
      reason: thinkingSystem.ambiguityDecision.reason,
    };
  }

  if (thinkingSystem.ambiguityDecision.outcome === "controlled-fail") {
    return {
      readiness: "controlled-fail",
      reason: thinkingSystem.ambiguityDecision.reason,
    };
  }

  if (isFamiliarLocalStillSetupSceneRequest(analysis)) {
    return {
      readiness: "ready-local",
      reason: null,
    };
  }

  const requiredSearchDimensions = getRequiredSearchConfidenceDimensions(analysis);
  const lowRequiredSearchDimensions = requiredSearchDimensions.filter(
    (dimension) => analysis.searchConfidence[dimension] === "low",
  );
  const namedStyleReference = STYLE_REFERENCE_LOOKUP_PATTERN.test(analysis.normalizedPrompt);
  const canTrySearchForLowConfidence =
    analysis.subjects.length > 0 ||
    analysis.sceneSetting != null ||
    analysis.sceneDescriptors.length > 0 ||
    analysis.sceneProps.length > 0 ||
    analysis.sceneElements.length > 0 ||
    analysis.concepts.length > 0 ||
    namedStyleReference;

  if (namedStyleReference || lowRequiredSearchDimensions.length > 0) {
    return {
      readiness: canTrySearchForLowConfidence ? "ready-search" : "controlled-fail",
      reason:
        lowRequiredSearchDimensions.length > 0
          ? buildLowSearchConfidenceReason(analysis)
          : "The request needs targeted external style grounding before it can be executed safely.",
    };
  }

  if (analysis.noPlanBlocker === "low-confidence") {
    return {
      readiness: canTrySearchForLowConfidence ? "ready-search" : "controlled-fail",
      reason:
        analysis.noPlanReason ??
        "The request could not be grounded safely enough to execute without guessing.",
    };
  }

  return {
    readiness: "ready-local",
    reason: null,
  };
}

const resolveSearchConfidenceLevel = (score: number): DrawingAiSearchConfidenceProfile["overall"] => {
  if (score <= 0) {
    return "low";
  }
  if (score === 1) {
    return "medium";
  }
  return "high";
};

const buildGenerateFramesSearchConfidenceProfile = ({
  normalizedPrompt,
  interactionMode,
  projectScope,
  shotScope,
  primaryFamily,
  componentFamilies,
  visualKind,
  outputMode,
  expectedVisualClass,
  expectationCoverage,
  shapeConfidence,
  familyConfidence,
  humanExpectationRisk,
  motionType,
  actionKeywords,
  sceneSetting,
  sceneDescriptors,
  sceneProps,
  sceneElements,
  subjects,
  orderedBeats,
  sequenceBeats,
  hasContinuationAnchor,
}: {
  normalizedPrompt: string;
  interactionMode: GenerateFramesRuntimeInteractionMode;
  projectScope: DrawingAiGenerateFramesProjectScope;
  shotScope: DrawingAiGenerateFramesShotScope;
  primaryFamily: GenerateFramesIntentFamily;
  componentFamilies: readonly GenerateFramesIntentFamily[];
  visualKind: GenerateFramesPromptVisualKind;
  outputMode: GenerateFramesOutputMode;
  expectedVisualClass: GenerateFramesExpectedVisualClass;
  expectationCoverage: GenerateFramesExpectationCoverage;
  shapeConfidence: GenerateFramesShapeConfidence;
  familyConfidence: GenerateFramesFamilyConfidence;
  humanExpectationRisk: GenerateFramesHumanExpectationRisk;
  motionType: DrawingAiGenerateFramesStateMotionType;
  actionKeywords: readonly string[];
  sceneSetting: string | null;
  sceneDescriptors: readonly string[];
  sceneProps: readonly string[];
  sceneElements: readonly string[];
  subjects: readonly DrawingAiGenerateFramesStateSubject[];
  orderedBeats: readonly string[];
  sequenceBeats: readonly DrawingAiExecutionBeat[];
  hasContinuationAnchor: boolean;
}): DrawingAiSearchConfidenceProfile => {
  const visibleSubjects = subjects.filter((subject) => subject.type !== "background");
  const namedStyleReference = STYLE_REFERENCE_LOOKUP_PATTERN.test(normalizedPrompt);
  const searchWorthyModifier = SEARCH_WORTHY_MODIFIER_PATTERN.test(normalizedPrompt);
  const unusualSceneDescriptor = UNUSUAL_SCENE_DESCRIPTOR_PATTERN.test(normalizedPrompt);
  const needsSceneConfidence =
    visualKind === "scene" ||
    primaryFamily === "background" ||
    componentFamilies.includes("background") ||
    motionType === "background-scroll" ||
    sceneSetting != null ||
    sceneDescriptors.length > 0 ||
    sceneProps.length > 0 ||
    sceneElements.length > 0;
  const requiresContinuityConfidence =
    interactionMode !== "create" ||
    projectScope === "same-project" ||
    shotScope !== "create-first-shot";

  let subjectScore = 2;
  if (hasContinuationAnchor && interactionMode !== "create" && visibleSubjects.length > 0) {
    subjectScore = 2;
  } else if (familyConfidence === "low" || expectationCoverage === "needs-reference" || shapeConfidence === "needs-reference") {
    subjectScore = 0;
  } else if (primaryFamily === "mixed" || visibleSubjects.length >= 3 || humanExpectationRisk === "high") {
    subjectScore = 1;
  }

  let motionScore = 2;
  if (outputMode === "animation") {
    if (
      motionType === "unknown" ||
      (expectedVisualClass === "action-animation" && actionKeywords.length === 0) ||
      (humanExpectationRisk === "high" && sequenceBeats.length >= 4)
    ) {
      motionScore = 0;
    } else if (
      motionType === "background-scroll" ||
      orderedBeats.length >= 3 ||
      sequenceBeats.length >= 5 ||
      (expectedVisualClass === "action-animation" && primaryFamily === "mixed")
    ) {
      motionScore = 1;
    }
  }

  let sceneScore = 2;
  if (needsSceneConfidence) {
    if ((sceneSetting == null && sceneDescriptors.length === 0 && sceneProps.length === 0 && sceneElements.length === 0) || unusualSceneDescriptor) {
      sceneScore = 0;
    } else if (motionType === "background-scroll" || sceneDescriptors.length + sceneProps.length + sceneElements.length >= 3) {
      sceneScore = 1;
    }
  }

  let styleScore = 2;
  if (namedStyleReference) {
    styleScore = 0;
  } else if (searchWorthyModifier) {
    styleScore = 1;
  }

  let continuityScore = 2;
  if (requiresContinuityConfidence) {
    if ((shotScope === "tweak-current-shot" || shotScope === "continue-current-shot") && !hasContinuationAnchor) {
      continuityScore = 0;
    } else if (shotScope === "new-shot-same-project" && !hasContinuationAnchor) {
      continuityScore = 1;
    }
  }

  const subject = resolveSearchConfidenceLevel(subjectScore);
  const motion = resolveSearchConfidenceLevel(motionScore);
  const scene = resolveSearchConfidenceLevel(sceneScore);
  const style = resolveSearchConfidenceLevel(styleScore);
  const continuity = resolveSearchConfidenceLevel(continuityScore);

  const requiredLevels: DrawingAiSearchConfidenceProfile["overall"][] = [subject, style];
  if (outputMode === "animation") {
    requiredLevels.push(motion);
  }
  if (needsSceneConfidence) {
    requiredLevels.push(scene);
  }
  if (requiresContinuityConfidence) {
    requiredLevels.push(continuity);
  }

  const overall =
    requiredLevels.includes("low")
      ? "low"
      : requiredLevels.includes("medium")
        ? "medium"
        : "high";

  return {
    subject,
    motion,
    scene,
    style,
    continuity,
    overall,
  };
};

const buildVisualExpectationTags = ({
  primaryFamily,
  promptSubject,
  subjects,
  sceneSetting,
  outputMode,
  motionType,
  actionKeywords,
}: {
  primaryFamily: GenerateFramesIntentFamily;
  promptSubject: string | null;
  subjects: readonly DrawingAiGenerateFramesStateSubject[];
  sceneSetting: string | null;
  outputMode: GenerateFramesOutputMode;
  motionType: DrawingAiGenerateFramesStateMotionType;
  actionKeywords: readonly string[];
}) => {
  const tags = new Set<string>();
  const subjectLabelText = normalizePrompt(
    [promptSubject, ...subjects.map((subject) => subject.label ?? null)].filter(Boolean).join(" "),
  );

  if (/\bstick(?:\s|-)?figure\b/i.test(subjectLabelText)) {
    tags.add("solid-head");
    tags.add("no-face-unless-asked");
  }
  if (primaryFamily === "effect") {
    tags.add("effect-only");
    tags.add("no-extra-subject");
  }
  if (primaryFamily === "object") {
    tags.add("recognizable-object");
    tags.add("no-extra-subject");
  }
  if (primaryFamily === "background" || (sceneSetting != null && outputMode === "still")) {
    tags.add("full-stage-background");
  }
  if (outputMode === "animation") {
    tags.add("complete-action-arc");
  }
  if (motionType === "lightning") {
    tags.add("quick-vanish");
  }
  if (motionType === "explosion") {
    tags.add("breakup-after-peak");
  }
  if (motionType === "background-scroll") {
    tags.add("camera-follow-illusion");
  }
  if (actionKeywords.includes("breathe")) {
    tags.add("loopable-breathing");
  }

  return [...tags];
};

const pushGuidanceLine = (lines: string[], value: string | null) => {
  if (typeof value !== "string") {
    return;
  }

  const normalizedValue = value.trim();
  if (normalizedValue.length === 0 || lines.includes(normalizedValue)) {
    return;
  }

  lines.push(normalizedValue);
};

const buildExecutionStylePrinciples = ({
  normalizedPrompt,
  storyStyleAnchors,
}: {
  normalizedPrompt: string;
  storyStyleAnchors: readonly string[];
}) => {
  const anchorText = normalizePrompt([normalizedPrompt, ...storyStyleAnchors].join(" "));
  const principles: string[] = [];

  if (/\b(combat gods|alan becker)\b/i.test(anchorText)) {
    pushGuidanceLine(principles, "Favor sharp readable silhouettes and clear impact staging.");
    pushGuidanceLine(principles, "Keep timing snappy and directional through attack beats.");
    pushGuidanceLine(principles, "Preserve clean anticipation-to-impact-to-recovery clarity.");
  }

  if (/\b(anime|naruto|dragon ball|one piece|bleach|arcane)\b/i.test(anchorText)) {
    pushGuidanceLine(principles, "Favor dynamic posing with readable force arcs.");
    pushGuidanceLine(principles, "Keep speed and energy high without sacrificing legibility.");
  }

  if (/\b(comic(?:\s+book)?|manga)\b/i.test(anchorText)) {
    pushGuidanceLine(principles, "Favor graphic silhouettes and clear focal emphasis.");
    pushGuidanceLine(principles, "Keep staging bold and easy to parse at a glance.");
  }

  return principles.slice(0, 6);
};

const resolveExecutionComplexityLevel = ({
  outputMode,
  requestKind,
  subjects,
  sceneSetting,
  sceneProps,
  sceneElements,
  motionType,
  sequenceBeats,
  stylePrinciples,
}: {
  outputMode: GenerateFramesOutputMode;
  requestKind: DrawingAiFrameRequestKind;
  subjects: readonly DrawingAiGenerateFramesStateSubject[];
  sceneSetting: string | null;
  sceneProps: readonly string[];
  sceneElements: readonly string[];
  motionType: DrawingAiGenerateFramesStateMotionType;
  sequenceBeats: readonly DrawingAiExecutionBeat[];
  stylePrinciples: readonly string[];
}) => {
  const visibleSubjectCount = subjects.filter((subject) => subject.type !== "background").length;
  const sceneComplexity = (sceneSetting != null ? 1 : 0) + sceneProps.length + sceneElements.length;

  if (
    stylePrinciples.length > 0 ||
    sequenceBeats.length >= 5 ||
    visibleSubjectCount >= 3 ||
    (visibleSubjectCount >= 2 && outputMode === "animation") ||
    motionType === "background-scroll" ||
    sceneComplexity >= 4
  ) {
    return "high";
  }

  if (
    outputMode === "animation" ||
    requestKind === "continuation" ||
    sceneComplexity >= 2 ||
    sequenceBeats.length >= 3 ||
    visibleSubjectCount >= 2
  ) {
    return "medium";
  }

  return "simple";
};

const resolveExecutionMotionEmphasis = ({
  outputMode,
  motionType,
  sequenceBeats,
}: {
  outputMode: GenerateFramesOutputMode;
  motionType: DrawingAiGenerateFramesStateMotionType;
  sequenceBeats: readonly DrawingAiExecutionBeat[];
}) => {
  if (outputMode === "still") {
    return "none";
  }

  if (
    sequenceBeats.length >= 4 ||
    ["explosion", "lightning", "fight", "run", "background-scroll", "punch", "kick"].includes(motionType)
  ) {
    return "strong";
  }

  return "light";
};

const resolveExecutionEffectEmphasis = ({
  primaryFamily,
  componentFamilies,
}: {
  primaryFamily: GenerateFramesIntentFamily;
  componentFamilies: readonly GenerateFramesIntentFamily[];
}) => {
  if (primaryFamily === "effect") {
    return "primary";
  }

  if (componentFamilies.includes("effect")) {
    return "supporting";
  }

  return "none";
};

const resolveExecutionBrevityLimit = ({
  normalizedPrompt,
  outputMode,
  requestKind,
  sequenceBeats,
  stylePrinciples,
}: {
  normalizedPrompt: string;
  outputMode: GenerateFramesOutputMode;
  requestKind: DrawingAiFrameRequestKind;
  sequenceBeats: readonly DrawingAiExecutionBeat[];
  stylePrinciples: readonly string[];
}): DrawingAiExecutionGuidanceProfile["brevityPreservationLimit"] => {
  if (outputMode === "still" || requestKind === "single-frame") {
    return "strict";
  }

  const explicitSequenceRequest =
    STAGED_SEQUENCE_CONNECTOR_PATTERN.test(normalizedPrompt) ||
    /\b(before|after|then|followed by|ending in|ending with|right hand|left hand|combo|multi-step)\b/i.test(
      normalizedPrompt,
    );

  if (stylePrinciples.length > 0 || explicitSequenceRequest || sequenceBeats.length >= 5) {
    return "cinematic";
  }

  if (sequenceBeats.length <= 3 && requestKind === "small-animation") {
    return "strict";
  }

  return "balanced";
};

const buildExecutionGuidanceProfile = ({
  normalizedPrompt,
  projectScope,
  shotScope,
  requestKind,
  primaryFamily,
  componentFamilies,
  outputMode,
  expectedCompletionProfile,
  subjects,
  motionType,
  tone,
  forceLevel,
  modifiers,
  sceneSetting,
  sceneProps,
  sceneElements,
  sequenceBeats,
  variationProfile,
  visualExpectationTags,
  recentEdits,
  currentGoal,
  storyStyleAnchors,
  recentSceneSummaries,
}: {
  normalizedPrompt: string;
  projectScope: DrawingAiGenerateFramesProjectScope;
  shotScope: DrawingAiGenerateFramesShotScope;
  requestKind: DrawingAiFrameRequestKind;
  primaryFamily: GenerateFramesIntentFamily;
  componentFamilies: readonly GenerateFramesIntentFamily[];
  outputMode: GenerateFramesOutputMode;
  expectedCompletionProfile: GenerateFramesCompletionProfile;
  subjects: readonly DrawingAiGenerateFramesStateSubject[];
  motionType: DrawingAiGenerateFramesStateMotionType;
  tone: DrawingAiGenerateFramesStateTone;
  forceLevel: DrawingAiGenerateFramesStateForceLevel;
  modifiers: readonly string[];
  sceneSetting: string | null;
  sceneProps: readonly string[];
  sceneElements: readonly string[];
  sequenceBeats: readonly DrawingAiExecutionBeat[];
  variationProfile: GenerateFramesVariationProfile;
  visualExpectationTags: readonly string[];
  recentEdits: readonly string[];
  currentGoal: string | null;
  storyStyleAnchors: readonly string[];
  recentSceneSummaries: readonly string[];
}): DrawingAiExecutionGuidanceProfile => {
  const visibleSubjects = subjects.filter((subject) => subject.type !== "background");
  const stylePrinciples = buildExecutionStylePrinciples({
    normalizedPrompt,
    storyStyleAnchors,
  });
  const complexityLevel = resolveExecutionComplexityLevel({
    outputMode,
    requestKind,
    subjects,
    sceneSetting,
    sceneProps,
    sceneElements,
    motionType,
    sequenceBeats,
    stylePrinciples,
  });
  const motionEmphasis = resolveExecutionMotionEmphasis({
    outputMode,
    motionType,
    sequenceBeats,
  });
  const effectEmphasis = resolveExecutionEffectEmphasis({
    primaryFamily,
    componentFamilies,
  });
  const brevityPreservationLimit = resolveExecutionBrevityLimit({
    normalizedPrompt,
    outputMode,
    requestKind,
    sequenceBeats,
    stylePrinciples,
  });
  const silhouetteGuidance: string[] = [];
  const structureGuidance: string[] = [];
  const motionGuidance: string[] = [];
  const completionGuidance: string[] = [];
  const sceneGuidance: string[] = [];
  const antiPatternWatchlist: string[] = [];
  const repairPriorities: string[] = [];
  const expectationTranslation = buildHumanExpectationTranslationGuidance({
    normalizedPrompt,
    motionType,
    expectedCompletionProfile,
    outputMode,
    tone,
    forceLevel,
    modifiers,
  });

  pushGuidanceLine(
    silhouetteGuidance,
    "Keep silhouettes readable at a glance and preserve one clear shape per subject.",
  );
  if (visibleSubjects.length >= 2) {
    pushGuidanceLine(
      silhouetteGuidance,
      "Keep multiple subjects separated so left-right identity and spacing stay readable.",
    );
  }
  if (primaryFamily === "effect" || componentFamilies.includes("effect")) {
    pushGuidanceLine(
      silhouetteGuidance,
      "Keep the core effect silhouette directional and readable instead of letting glow, dust, or smoke replace it.",
    );
  }
  if (variationProfile.silhouetteBias === "angular") {
    pushGuidanceLine(silhouetteGuidance, "Favor crisper angular silhouette changes where the family supports it.");
  } else if (variationProfile.silhouetteBias === "organic") {
    pushGuidanceLine(silhouetteGuidance, "Favor uneven organic contour changes while keeping the main shape legible.");
  }

  pushGuidanceLine(structureGuidance, "Preserve stable proportions and subject identity across the whole request.");
  if (projectScope === "same-project") {
    pushGuidanceLine(
      structureGuidance,
      "Preserve current project continuity and change only the parts the user actually asked to change.",
    );
  }
  if (shotScope === "tweak-current-shot") {
    pushGuidanceLine(
      structureGuidance,
      "Keep the current shot layout and current subject list anchored while applying the edit.",
    );
  } else if (shotScope === "continue-current-shot") {
    pushGuidanceLine(
      structureGuidance,
      "Keep the current shot anchored and carry the same subjects into the next beat without a reset.",
    );
  } else if (shotScope === "new-shot-same-project") {
    pushGuidanceLine(
      structureGuidance,
      "Carry the same cast or world identity into the new shot without restarting the project.",
    );
  }
  if (visualExpectationTags.includes("solid-head")) {
    pushGuidanceLine(structureGuidance, "Use simple solid-head stick-figure structure when the request implies plain stick figures.");
  }
  if (visualExpectationTags.includes("no-face-unless-asked")) {
    pushGuidanceLine(structureGuidance, "Do not add facial features unless the user explicitly asks for them.");
  }
  if (visualExpectationTags.includes("recognizable-object")) {
    pushGuidanceLine(structureGuidance, "Keep the object recognizable and avoid accidental creature drift.");
  }
  expectationTranslation.structureGuidance.forEach((line) => pushGuidanceLine(structureGuidance, line));

  if (outputMode === "still") {
    pushGuidanceLine(motionGuidance, "Keep the frame as a clear readable setup without inventing extra motion.");
  } else {
    if (sequenceBeats.length > 0) {
      pushGuidanceLine(
        motionGuidance,
        `Honor the beat order: ${sequenceBeats.map((beat) => beat.label).join(" -> ")}.`,
      );
    }
    switch (motionType) {
      case "explosion":
        pushGuidanceLine(motionGuidance, "Drive the explosion outward with readable expansion, breakup, and residue timing.");
        break;
      case "lightning":
        pushGuidanceLine(motionGuidance, "Keep the lightning fast, directional, and brief instead of lingering like a fire effect.");
        break;
      case "punch":
      case "kick":
        pushGuidanceLine(motionGuidance, "Keep force readable through setup, impact, and recovery instead of pose teleporting.");
        break;
      case "walk":
      case "run":
        pushGuidanceLine(motionGuidance, "Keep travel readable with clean weight transfer and no broken-limb drift.");
        break;
      case "background-scroll":
        pushGuidanceLine(motionGuidance, "Keep the subject anchored while the environment travel reads behind it.");
        break;
      case "smoke":
        pushGuidanceLine(motionGuidance, "Let the smoke spread and thin with continuous motion instead of popping between shapes.");
        break;
      default:
        pushGuidanceLine(motionGuidance, "Keep motion directional, readable, and continuous from beat to beat.");
        break;
    }
    if (variationProfile.timingBias === "sharp") {
      pushGuidanceLine(motionGuidance, "Bias timing toward sharper impact or peak beats.");
    } else if (variationProfile.timingBias === "linger") {
      pushGuidanceLine(motionGuidance, "Leave enough hang time and settle for the motion to read fully.");
    }
  }
  expectationTranslation.motionGuidance.forEach((line) => pushGuidanceLine(motionGuidance, line));

  switch (expectedCompletionProfile) {
    case "explosion-complete":
      pushGuidanceLine(completionGuidance, "Finish with a real breakup and aftermath beat instead of stopping at peak blast.");
      break;
    case "lightning-vanish":
      pushGuidanceLine(completionGuidance, "Finish with a real collapse and vanish beat instead of leaving the strike on screen.");
      break;
    case "strike-recover":
    case "kick-recover":
      pushGuidanceLine(completionGuidance, "Finish with readable follow-through and recovery instead of freezing on contact.");
      break;
    case "jump-land":
      pushGuidanceLine(completionGuidance, "Finish with a readable landing or settle so the jump does not stop midair.");
      break;
    case "breathing-loop":
      pushGuidanceLine(completionGuidance, "Complete a readable inhale-exhale cycle instead of holding one breathing pose.");
      break;
    case "walk-cycle":
    case "run-cycle":
      pushGuidanceLine(completionGuidance, "Complete the step cycle so travel reads as continuous movement instead of isolated poses.");
      break;
    case "scene-scroll":
      pushGuidanceLine(completionGuidance, "Finish with a readable end state where the environment is still the thing moving.");
      break;
    case "fight-resolve":
      pushGuidanceLine(completionGuidance, "Finish with a readable resolution beat instead of stopping in the middle of the exchange.");
      break;
    default:
      if (outputMode === "animation") {
        pushGuidanceLine(completionGuidance, "Finish the requested action cleanly instead of stopping halfway through it.");
      }
      break;
  }
  expectationTranslation.completionGuidance.forEach((line) => pushGuidanceLine(completionGuidance, line));

  if (sceneSetting != null || sceneProps.length > 0 || sceneElements.length > 0 || componentFamilies.includes("background")) {
    pushGuidanceLine(sceneGuidance, "Keep the scene readable as one coherent place with stable spatial relationships.");
  }
  if (visualExpectationTags.includes("full-stage-background")) {
    pushGuidanceLine(sceneGuidance, "Use environment features to make the setting recognizable instead of leaving empty filler space.");
  }
  if (motionType === "background-scroll") {
    pushGuidanceLine(sceneGuidance, "Keep subject and environment movement clearly separated so the background carries the travel.");
  }
  if (shotScope === "continue-current-shot" || shotScope === "tweak-current-shot") {
    pushGuidanceLine(sceneGuidance, "Preserve the current shot geography unless the user explicitly asks for a new shot.");
  } else if (shotScope === "new-shot-same-project") {
    pushGuidanceLine(sceneGuidance, "Start a new shot while preserving the same project continuity and cast/world logic.");
  }
  if (currentGoal != null && currentGoal.trim().length > 0) {
    pushGuidanceLine(sceneGuidance, `Keep the output aligned with the current project goal: ${currentGoal.trim()}.`);
  }
  if (recentSceneSummaries.length > 0) {
    pushGuidanceLine(sceneGuidance, "Keep the new result compatible with the recent accepted project scenes.");
  }

  pushGuidanceLine(antiPatternWatchlist, "Do not introduce random extra subjects or unrelated props.");
  pushGuidanceLine(antiPatternWatchlist, "Do not reset the scene during tweaks or same-shot continuations.");
  if (visualExpectationTags.includes("effect-only")) {
    pushGuidanceLine(antiPatternWatchlist, "Do not add a character or object to an effect-only request.");
  }
  if (visualExpectationTags.includes("no-face-unless-asked")) {
    pushGuidanceLine(antiPatternWatchlist, "Do not add visible facial features unless asked.");
  }
  if (motionType === "background-scroll") {
    pushGuidanceLine(antiPatternWatchlist, "Do not slide the anchored subject with the background.");
  }
  if (brevityPreservationLimit === "strict") {
    pushGuidanceLine(antiPatternWatchlist, "Do not overbuild this prompt into extra beats beyond the minimum readable result.");
  }
  if (primaryFamily === "effect" || componentFamilies.includes("effect")) {
    pushGuidanceLine(antiPatternWatchlist, "Do not let secondary glow, smoke, or debris replace the core event.");
  }
  if (recentEdits.length > 0) {
    pushGuidanceLine(antiPatternWatchlist, "Do not drop the accepted recent edit chain while applying the next change.");
  }

  if (shotScope === "tweak-current-shot") {
    pushGuidanceLine(repairPriorities, "First preserve the current subjects and shot, then make the requested edit read clearly.");
  } else if (shotScope === "continue-current-shot") {
    pushGuidanceLine(repairPriorities, "First preserve continuity, then make the next beat read clearly, then finish the action cleanly.");
  } else if (shotScope === "new-shot-same-project") {
    pushGuidanceLine(repairPriorities, "First preserve project continuity, then stage the new shot clearly, then carry the action family forward.");
  } else {
    pushGuidanceLine(repairPriorities, "First make the main request readable, then improve completion and secondary polish.");
  }
  if (primaryFamily === "effect" || componentFamilies.includes("effect")) {
    pushGuidanceLine(repairPriorities, "Repair the core effect shape and timing before touching supporting add-ons.");
  }
  if (visibleSubjects.length >= 2) {
    pushGuidanceLine(repairPriorities, "Repair subject separation and targeting before adding more motion detail.");
  }
  pushGuidanceLine(repairPriorities, "Repair wrong beat order or missing ending beats before cosmetic polish.");

  return {
    complexityLevel,
    motionEmphasis,
    effectEmphasis,
    silhouetteGuidance,
    structureGuidance,
    motionGuidance,
    completionGuidance,
    sceneGuidance,
    brevityPreservationLimit,
    addOnPolicy: effectEmphasis === "primary" ? "core-first" : "support-only",
    antiPatternWatchlist,
    repairPriorities,
    ...(stylePrinciples.length > 0 ? { stylePrinciples } : {}),
  };
};

const resolveExecutionQualityFloor = ({
  executionGuidance,
  humanExpectationRisk,
  outputMode,
  expectedVisualClass,
  sequenceBeats,
}: {
  executionGuidance: DrawingAiExecutionGuidanceProfile;
  humanExpectationRisk: GenerateFramesHumanExpectationRisk;
  outputMode: GenerateFramesOutputMode;
  expectedVisualClass: GenerateFramesExpectedVisualClass;
  sequenceBeats: readonly DrawingAiExecutionBeat[];
}): DrawingAiExecutionQualityFloor => {
  if (
    executionGuidance.complexityLevel === "high" ||
    (executionGuidance.stylePrinciples?.length ?? 0) > 0 ||
    (humanExpectationRisk === "high" && sequenceBeats.length >= 4) ||
    (
      outputMode === "animation" &&
      (expectedVisualClass === "action-animation" || expectedVisualClass === "event-animation") &&
      executionGuidance.motionEmphasis === "strong" &&
      sequenceBeats.length >= 5
    )
  ) {
    return "high-quality";
  }

  return "simple-good";
};

const resolveRenderingQualityFamily = ({
  normalizedPrompt,
  primaryFamily,
  componentFamilies,
  motionType,
  actionKeywords,
  sceneSetting,
}: {
  normalizedPrompt: string;
  primaryFamily: GenerateFramesIntentFamily;
  componentFamilies: readonly GenerateFramesIntentFamily[];
  motionType: DrawingAiGenerateFramesStateMotionType;
  actionKeywords: readonly string[];
  sceneSetting: string | null;
}): DrawingAiRenderingQualityFamily => {
  if (motionType === "explosion" || /\b(explosion|explode|blast|detonation)\b/i.test(normalizedPrompt)) {
    return "explosion";
  }
  if (motionType === "lightning" || /\b(lightning|bolt|electric strike)\b/i.test(normalizedPrompt)) {
    return "lightning";
  }
  if (
    /\b(fireball|projectile|energy ball|orb blast|shot from|launch(?:es|ing)? from|thrown attack)\b/i.test(normalizedPrompt) ||
    actionKeywords.some((keyword) => /projectile|fireball|orb|launch/.test(keyword))
  ) {
    return "projectile";
  }
  if (motionType === "punch" || motionType === "kick" || motionType === "fight") {
    return "combat";
  }
  if (
    actionKeywords.some((keyword) => /breathe|breathing/.test(keyword)) ||
    /\b(breath(?:e|ing)|exhausted|tired|pant(?:ing)?|fatigue|fatigued)\b/i.test(normalizedPrompt)
  ) {
    return "breathing";
  }
  if (motionType === "background-scroll") {
    return "background-scroll";
  }
  if (primaryFamily === "background" || componentFamilies.includes("background") || sceneSetting != null) {
    return "background";
  }
  if (primaryFamily === "character" || componentFamilies.includes("character")) {
    return "character";
  }
  if (primaryFamily === "object" || componentFamilies.includes("object")) {
    return "generic-object";
  }
  if (primaryFamily === "effect" || componentFamilies.includes("effect")) {
    return "generic-effect";
  }
  return componentFamilies.length >= 2 || primaryFamily === "mixed" ? "generic-mixed" : "character";
};

const resolveRenderingQualityFloorTier = ({
  qualityFloor,
  qualityFamily,
  projectScope,
  shotScope,
}: {
  qualityFloor: DrawingAiExecutionQualityFloor;
  qualityFamily: DrawingAiRenderingQualityFamily;
  projectScope: DrawingAiGenerateFramesProjectScope;
  shotScope: DrawingAiGenerateFramesShotScope;
}): DrawingAiRenderingQualityFloorTier => {
  if (projectScope === "same-project" && shotScope !== "create-first-shot") {
    return "story-strong";
  }
  if (qualityFloor === "high-quality") {
    if (qualityFamily === "explosion" || qualityFamily === "lightning" || qualityFamily === "projectile") {
      return "effect-strong";
    }
    if (qualityFamily === "combat" || qualityFamily === "character" || qualityFamily === "breathing") {
      return "action-strong";
    }
    return "story-strong";
  }
  if (qualityFamily === "explosion" || qualityFamily === "lightning" || qualityFamily === "projectile") {
    return "effect-strong";
  }
  if (qualityFamily === "combat" || qualityFamily === "breathing") {
    return "action-strong";
  }
  return "simple-good";
};

const buildPrincipleActivationProfile = ({
  qualityFamily,
  outputMode,
  stillFrameRequested,
}: {
  qualityFamily: DrawingAiRenderingQualityFamily;
  outputMode: GenerateFramesOutputMode;
  stillFrameRequested: boolean;
}): DrawingAiPrincipleActivationProfile => {
  const activations: DrawingAiPrincipleActivationProfile["activations"] = [];
  const pushActivation = (
    principle: DrawingAiPrincipleActivationProfile["activations"][number]["principle"],
    activationLevel: DrawingAiPrincipleActivationProfile["activations"][number]["activationLevel"],
    requiredUse: string,
    misuseToForbid: string,
  ) => {
    activations.push({
      principle,
      activationLevel,
      requiredUse,
      misuseToForbid,
    });
  };

  pushActivation(
    "staging",
    "primary",
    "Keep the main pose, action, or effect readable at a glance before supporting detail.",
    "Do not bury the main read under clutter, tangent overlap, or decorative noise.",
  );
  pushActivation(
    "solid-drawing",
    "primary",
    "Keep structure, proportions, and directional form controlled even in stylized output.",
    "Do not let the structure wobble into broken construction, blob logic, or accidental deformation.",
  );
  pushActivation(
    "appeal",
    "primary",
    "Keep the result intentional, satisfying, and clean instead of merely technically correct.",
    "Do not accept stiff, ugly, confusing, or emotionally dead output.",
  );

  if (outputMode === "animation" && !stillFrameRequested) {
    pushActivation(
      "timing",
      "primary",
      "Match timing to force, weight, mood, and the requested family behavior.",
      "Do not let every action move with generic same-speed spacing.",
    );
    pushActivation(
      "follow-through-and-overlap",
      "supporting",
      "Let strong motion resolve with residue, recoil, drag, settle, or vanish when the family calls for it.",
      "Do not stop motion dead when the action should naturally resolve.",
    );
    pushActivation(
      "slow-in-and-slow-out",
      "supporting",
      "Use acceleration and deceleration so movement reads as intentional instead of robotic.",
      "Do not make motion look teleporty unless the prompt explicitly asks for that behavior.",
    );
  }

  if (qualityFamily === "combat" || qualityFamily === "projectile") {
    pushActivation(
      "anticipation",
      "primary",
      "Use a readable preparation beat before a strong strike, throw, or launch.",
      "Do not snap directly into contact or release when force readability depends on a load-up.",
    );
    pushActivation(
      "arcs",
      "supporting",
      "Keep striking limbs, launches, and body travel on readable paths.",
      "Do not let action devolve into straight-line stiffness or random flailing.",
    );
  }

  if (qualityFamily === "explosion" || qualityFamily === "lightning") {
    pushActivation(
      "straight-ahead-vs-pose-to-pose",
      "supporting",
      "Use structured key event phases while preserving energetic breakup or branching.",
      "Do not let loose energy erase the core event silhouette or timing.",
    );
    pushActivation(
      "exaggeration",
      "supporting",
      "Push the peak shape and timing enough for the effect to read powerfully.",
      "Do not exaggerate into unreadable noise or family drift.",
    );
  }

  if (qualityFamily === "explosion" || qualityFamily === "background-scroll" || qualityFamily === "breathing") {
    pushActivation(
      "secondary-action",
      "supporting",
      qualityFamily === "background-scroll"
        ? "Let environment motion support the anchored subject without replacing the travel read."
        : "Use support motion only after the main action or rhythm is clearly readable.",
      "Do not let support smoke, background drift, or breathing bob replace the core read.",
    );
  }

  if (qualityFamily === "character" || qualityFamily === "combat" || qualityFamily === "breathing") {
    pushActivation(
      "squash-and-stretch",
      "supporting",
      "Use controlled compression or extension to sell force, landing, effort, or fatigue without losing identity.",
      "Do not use deformation so loosely that the figure loses structure or body logic.",
    );
  }

  return { activations };
};

const buildFamilyQualityContract = ({
  qualityFamily,
}: {
  qualityFamily: DrawingAiRenderingQualityFamily;
}): DrawingAiFamilyQualityContract => {
  switch (qualityFamily) {
    case "explosion":
      return {
        family: qualityFamily,
        mustHaves: ["outward blast", "irregular forceful shape", "breakup", "aftermath or disintegration"],
        forbiddenPatterns: ["weak puff", "random circles", "static blob", "decorative smoke replacing the blast"],
        rejectConditions: ["no readable outward expansion", "no breakup", "no ending", "effect reads smaller than a real blast event"],
        variationAxes: ["directional bias", "asymmetry", "breakup density", "residue type", "timing profile"],
      };
    case "lightning":
      return {
        family: qualityFamily,
        mustHaves: ["sharp strike path", "fast appearance", "collapse", "vanish"],
        forbiddenPatterns: ["soft glow blob", "lingering bolt", "unclear strike path"],
        rejectConditions: ["no sharp strike identity", "bolt lingers without collapsing", "afterglow replaces the strike"],
        variationAxes: ["strike angle", "branch count", "path sharpness", "after-trace intensity"],
      };
    case "projectile":
      return {
        family: qualityFamily,
        mustHaves: ["readable launch", "clear projectile identity", "path direction", "impact or exit behavior"],
        forbiddenPatterns: ["floating orb nonsense", "unclear origin", "no travel path"],
        rejectConditions: ["no launch read", "no path read", "no impact or exit behavior"],
        variationAxes: ["tail behavior", "arc", "speed", "impact finish", "density"],
      };
    case "combat":
      return {
        family: qualityFamily,
        mustHaves: ["anticipation", "strike path", "contact readability", "follow-through", "recovery"],
        forbiddenPatterns: ["generic flailing", "arm-only hit", "no anticipation", "no recovery"],
        rejectConditions: ["contact does not read", "action freezes on impact", "reaction read is missing when two subjects exist"],
        variationAxes: ["strike angle", "anticipation depth", "impact timing", "finish pose", "exaggeration level"],
      };
    case "breathing":
      return {
        family: qualityFamily,
        mustHaves: ["inhale-exhale rhythm", "fatigue read", "believable recovery pattern"],
        forbiddenPatterns: ["idle bobbing nonsense", "random floating", "generic idle pose"],
        rejectConditions: ["no breath cycle read", "fatigue wording ignored"],
        variationAxes: ["chest emphasis", "shoulder drop", "posture slouch", "pace"],
      };
    case "background":
      return {
        family: qualityFamily,
        mustHaves: ["place readability", "coherent environment identity", "controlled landmark selection"],
        forbiddenPatterns: ["decorative nonsense", "generic filler", "background that does not read as the requested place"],
        rejectConditions: ["place does not read", "unrelated props dominate", "environment loses scene identity"],
        variationAxes: ["composition", "depth cues", "landmark selection", "atmosphere density"],
      };
    case "background-scroll":
      return {
        family: qualityFamily,
        mustHaves: ["anchored subject", "moving environment", "coherent travel read", "preserved scene identity"],
        forbiddenPatterns: ["treadmill nonsense", "subject sliding with background", "layer drift"],
        rejectConditions: ["subject is not anchored", "environment is not moving coherently", "place stops reading"],
        variationAxes: ["parallax intensity", "landmark density", "scroll speed", "camera-follow feel"],
      };
    case "character":
      return {
        family: qualityFamily,
        mustHaves: ["readable silhouette", "stable limb logic", "clear facing", "clean pose readability"],
        forbiddenPatterns: ["broken joints", "random body distortion", "mushy silhouette overlap"],
        rejectConditions: ["figure structure is unreadable", "limb logic breaks", "stance does not read clearly"],
        variationAxes: ["stance", "spacing", "timing bias", "posture emphasis", "exaggeration"],
      };
    case "generic-effect":
      return {
        family: qualityFamily,
        mustHaves: ["recognizable effect identity", "clean timing progression", "resolved ending"],
        forbiddenPatterns: ["blob effect", "unclear event silhouette", "decorative noise replacing the event"],
        rejectConditions: ["core event never reads", "effect ends halfway"],
        variationAxes: ["shape bias", "timing profile", "residue treatment"],
      };
    case "generic-object":
      return {
        family: qualityFamily,
        mustHaves: ["recognizable object identity", "controlled shape", "clean silhouette"],
        forbiddenPatterns: ["accidental creature drift", "messy construction"],
        rejectConditions: ["object stops reading as itself"],
        variationAxes: ["pose", "scale emphasis", "surface simplification"],
      };
    case "generic-mixed":
    default:
      return {
        family: qualityFamily,
        mustHaves: ["clear primary read", "coherent family mix", "preserved subject separation"],
        forbiddenPatterns: ["chaotic family mixing", "unrelated clutter", "fake variety"],
        rejectConditions: ["the mixed scene loses its primary focus"],
        variationAxes: ["staging", "depth balance", "support-detail density"],
      };
  }
};

const buildVariationEnvelope = ({
  qualityFamily,
  subjects,
  sceneSetting,
  variationProfile,
  shotScope,
}: {
  qualityFamily: DrawingAiRenderingQualityFamily;
  subjects: readonly DrawingAiGenerateFramesStateSubject[];
  sceneSetting: string | null;
  variationProfile: GenerateFramesVariationProfile;
  shotScope: DrawingAiGenerateFramesShotScope;
}): DrawingAiVariationEnvelope => {
  const lockedIdentityTraits = unique([
    ...subjects.flatMap((subject) => [
      subject.color ? `${subject.id}:color=${subject.color}` : null,
      subject.side === "left" || subject.side === "right" ? `${subject.id}:side=${subject.side}` : null,
      subject.label?.trim() ? `${subject.id}:label=${subject.label.trim()}` : null,
      `${subject.id}:type=${subject.type}`,
    ]),
    sceneSetting ? `scene=${sceneSetting}` : null,
    shotScope !== "create-first-shot" ? "preserve-current-shot-continuity" : null,
    `family=${qualityFamily}`,
  ].filter((item): item is string => typeof item === "string" && item.length > 0));

  const allowedVariationAxes = unique([
    `staging=${variationProfile.stagingBias}`,
    `asymmetry=${variationProfile.asymmetryBias}`,
    `timing=${variationProfile.timingBias}`,
    `silhouette=${variationProfile.silhouetteBias}`,
    ...(qualityFamily === "explosion"
      ? ["directional bias", "breakup density", "residue type"]
      : qualityFamily === "lightning"
        ? ["branch count", "path sharpness", "after-trace intensity"]
        : qualityFamily === "combat"
          ? ["strike angle", "finish pose", "anticipation depth"]
          : qualityFamily === "background"
            ? ["composition", "depth cues", "landmark selection"]
            : qualityFamily === "background-scroll"
              ? ["parallax intensity", "landmark density", "camera-follow feel"]
              : ["pose emphasis", "detail density"]),
  ]);

  const forbiddenSubstitutions = unique([
    "one canned output repeated forever",
    "random junk replacing the core read",
    "unrelated props or characters",
    qualityFamily === "explosion" ? "weak puff substitute" : null,
    qualityFamily === "lightning" ? "soft glow blob substitute" : null,
    qualityFamily === "combat" ? "generic flailing substitute" : null,
    qualityFamily === "background-scroll" ? "treadmill slide substitute" : null,
  ].filter((item): item is string => typeof item === "string" && item.length > 0));

  return {
    lockedIdentityTraits,
    allowedVariationAxes,
    forbiddenSubstitutions,
  };
};

const buildRenderingQualityProfile = ({
  qualityFamily,
  qualityFloorTier,
  outputMode,
  expectedCompletionProfile,
  executionGuidance,
  shotScope,
}: {
  qualityFamily: DrawingAiRenderingQualityFamily;
  qualityFloorTier: DrawingAiRenderingQualityFloorTier;
  outputMode: GenerateFramesOutputMode;
  expectedCompletionProfile: GenerateFramesCompletionProfile;
  executionGuidance: DrawingAiExecutionGuidanceProfile;
  shotScope: DrawingAiGenerateFramesShotScope;
}): DrawingAiRenderingQualityProfile => {
  const forcePriorities = unique([
    qualityFamily === "combat" ? "visible body force before contact" : null,
    qualityFamily === "explosion" ? "outward blast pressure" : null,
    qualityFamily === "lightning" ? "snappy strike force" : null,
    qualityFamily === "projectile" ? "clear launch energy" : null,
    qualityFamily === "background-scroll" ? "travel read through environment motion" : null,
    executionGuidance.motionEmphasis === "strong" ? "motion must read as intentional" : null,
  ].filter((item): item is string => typeof item === "string" && item.length > 0));

  const timingPriorities = unique([
    outputMode === "animation" ? "clear start-middle-end timing" : null,
    qualityFamily === "breathing" ? "inhale-exhale cadence" : null,
    qualityFamily === "lightning" ? "fast appearance and fast vanish" : null,
    qualityFamily === "explosion" ? "peak before breakup" : null,
    qualityFamily === "combat" ? "anticipation-contact-recovery timing" : null,
  ].filter((item): item is string => typeof item === "string" && item.length > 0));

  const readabilityPriorities = unique([
    "primary action must read before secondary detail",
    qualityFamily === "background" || qualityFamily === "background-scroll"
      ? "requested place must read clearly"
      : "silhouette must read clearly",
    shotScope !== "create-first-shot" ? "continuity must stay readable" : null,
  ].filter((item): item is string => typeof item === "string" && item.length > 0));

  const drawingClarityPriorities = unique([
    "controlled structure",
    qualityFamily === "character" || qualityFamily === "combat" ? "stable limb logic" : null,
    qualityFamily === "explosion" || qualityFamily === "lightning" ? "recognizable effect silhouette" : null,
    qualityFamily === "background" ? "scene landmarks must read as the requested place" : null,
  ].filter((item): item is string => typeof item === "string" && item.length > 0));

  const completionRequirements = unique([
    expectedCompletionProfile === "explosion-complete" ? "real aftermath or disintegration" : null,
    expectedCompletionProfile === "lightning-vanish" ? "real collapse and vanish" : null,
    expectedCompletionProfile === "strike-recover" || expectedCompletionProfile === "kick-recover"
      ? "follow-through and recovery"
      : null,
    expectedCompletionProfile === "breathing-loop" ? "inhale-exhale-return cycle" : null,
    expectedCompletionProfile === "scene-scroll" ? "anchored subject plus resolved environment travel" : null,
    outputMode === "still" ? "one readable resolved frame" : "no half-finished action",
  ].filter((item): item is string => typeof item === "string" && item.length > 0));

  const consistencyLocks = unique([
    "family identity",
    "subject identity",
    shotScope !== "create-first-shot" ? "scene continuity" : null,
    qualityFamily === "background-scroll" ? "anchored subject screen position" : null,
  ].filter((item): item is string => typeof item === "string" && item.length > 0));

  return {
    family: qualityFamily,
    qualityFloorTier,
    simplicityTarget:
      executionGuidance.brevityPreservationLimit === "strict"
        ? "minimal"
        : executionGuidance.brevityPreservationLimit === "cinematic"
          ? "pushed"
          : "balanced",
    forcePriorities,
    timingPriorities,
    readabilityPriorities,
    drawingClarityPriorities,
    completionRequirements,
    consistencyLocks,
    antiTemplateVariationRange: ["family-true variation only", "no canned repeat output", "no fake variety"],
    antiBadOutputWatchlist: [
      "weak puff explosion",
      "blob lightning",
      "broken limbs",
      "unreadable silhouette",
      "jittery motion",
      "unfinished action",
      "random scene drift",
      "wrong subject modified",
      "overbuilt simple prompt",
    ],
    repairPriorities: [...executionGuidance.repairPriorities],
  };
};

const buildRenderAcceptanceContract = ({
  outputMode,
  qualityFamily,
  familyQualityContract,
  renderingQualityProfile,
  principleActivationProfile,
  executionGuidance,
  expectedCompletionProfile,
  shotScope,
}: {
  outputMode: GenerateFramesOutputMode;
  qualityFamily: DrawingAiRenderingQualityFamily;
  familyQualityContract: DrawingAiFamilyQualityContract;
  renderingQualityProfile: DrawingAiRenderingQualityProfile;
  principleActivationProfile: DrawingAiPrincipleActivationProfile;
  executionGuidance: DrawingAiExecutionGuidanceProfile;
  expectedCompletionProfile: GenerateFramesCompletionProfile;
  shotScope: DrawingAiGenerateFramesShotScope;
}): DrawingAiRenderAcceptanceContract => ({
  requiredMustHaves: unique([
    ...familyQualityContract.mustHaves,
    ...renderingQualityProfile.readabilityPriorities,
    ...principleActivationProfile.activations
      .filter((activation) => activation.activationLevel === "primary")
      .map((activation) => activation.requiredUse),
  ]),
  forbiddenBadPatterns: unique([
    ...familyQualityContract.forbiddenPatterns,
    ...renderingQualityProfile.antiBadOutputWatchlist,
    ...principleActivationProfile.activations
      .filter((activation) => activation.activationLevel !== "off")
      .map((activation) => activation.misuseToForbid),
  ]),
  minimumReadableCompletion: unique([
    ...renderingQualityProfile.completionRequirements,
    expectedCompletionProfile === "none" && outputMode === "still" ? "no invented extra motion" : null,
  ].filter((item): item is string => typeof item === "string" && item.length > 0)),
  familyRejectConditions: unique([
    ...familyQualityContract.rejectConditions,
    qualityFamily === "background-scroll" ? "subject slides instead of environment travel" : null,
    qualityFamily === "explosion" ? "core blast never reads before smoke or debris" : null,
    qualityFamily === "lightning" ? "strike lingers instead of collapsing" : null,
  ].filter((item): item is string => typeof item === "string" && item.length > 0)),
  brevityProtections: unique([
    executionGuidance.brevityPreservationLimit === "strict"
      ? "simple prompts must stay concise while still clearing the family quality floor"
      : null,
    outputMode === "still" ? "still prompts must remain still" : null,
  ].filter((item): item is string => typeof item === "string" && item.length > 0)),
  continuityProtections: unique([
    shotScope === "tweak-current-shot" ? "preserve current shot and subject list" : null,
    shotScope === "continue-current-shot" ? "carry current shot and subject continuity into the next beat" : null,
    shotScope === "new-shot-same-project" ? "preserve same project cast and world identity" : null,
    ...renderingQualityProfile.consistencyLocks,
  ].filter((item): item is string => typeof item === "string" && item.length > 0)),
});

const buildGenerateFramesQualityFailureReport = ({
  category,
  reason,
  violatedRules,
  repairPriority,
}: DrawingAiQualityFailureReport): DrawingAiQualityFailureReport => ({
  category,
  reason,
  violatedRules,
  repairPriority,
});

const EFFECT_MOTION_TYPES = new Set<DrawingAiGenerateFramesStateMotionType>([
  "explosion",
  "lightning",
  "shockwave",
  "smoke",
  "impact",
  "eruption",
]);

const resolveGenerateFramesLayerPlan = ({
  normalizedPrompt,
  shotScope,
  editIntents,
  primaryFamily,
  componentFamilies,
  motionType,
  sceneSetting,
  sceneProps,
  sceneElements,
  previousState,
}: {
  normalizedPrompt: string;
  shotScope: DrawingAiGenerateFramesShotScope;
  editIntents: readonly GenerateFramesEditIntent[];
  primaryFamily: GenerateFramesIntentFamily;
  componentFamilies: readonly GenerateFramesIntentFamily[];
  motionType: DrawingAiGenerateFramesStateMotionType;
  sceneSetting: string | null;
  sceneProps: readonly string[];
  sceneElements: readonly string[];
  previousState: DrawingAiGenerateFramesState | null;
}): DrawingAiLayerPlan => {
  const previousHasBackground =
    previousState?.subjects.some((subject) => subject.type === "background") === true ||
    previousState?.sceneSetting != null ||
    (previousState?.sceneProps.length ?? 0) > 0 ||
    (previousState?.sceneElements?.length ?? 0) > 0;
  const previousHasEffect =
    previousState?.subjects.some((subject) => subject.type === "effect") === true ||
    EFFECT_MOTION_TYPES.has(previousState?.motionType ?? "unknown");
  const sceneDirectedRequest =
    editIntents.includes("scene") ||
    primaryFamily === "background" ||
    (
      componentFamilies.includes("background") &&
      (
        sceneSetting != null ||
        sceneProps.length > 0 ||
        sceneElements.length > 0 ||
        !componentFamilies.includes("character")
      )
    );
  const effectDirectedRequest =
    primaryFamily === "effect" ||
    EFFECT_MOTION_TYPES.has(motionType) ||
    (
      componentFamilies.includes("effect") &&
      (
        previousState != null ||
        componentFamilies.includes("character") ||
        componentFamilies.includes("background") ||
        /\b(add|overlay|behind|around|around them|behind them)\b/i.test(normalizedPrompt)
      )
    );

  if (effectDirectedRequest) {
    const shouldOverlay =
      previousState != null ||
      componentFamilies.includes("character") ||
      componentFamilies.includes("background") ||
      shotScope === "tweak-current-shot" ||
      shotScope === "continue-current-shot" ||
      shotScope === "new-shot-same-project";
    return {
      mode:
        shouldOverlay
          ? previousHasEffect
            ? "target-existing-effect"
            : "create-effect-overlay"
          : "preserve-active",
      preserveExistingContent: true,
      reason: shouldOverlay
        ? "Keep the core subjects and scene intact while routing the effect through an effect-safe overlay path."
        : "Keep the effect on the active path because this request is a standalone effect event.",
    };
  }

  if (sceneDirectedRequest) {
    return {
      mode: previousHasBackground ? "target-existing-background" : "create-background",
      preserveExistingContent: true,
      reason:
        shotScope === "new-shot-same-project"
          ? "Start or update the background layer for the new same-project shot without disturbing carried-forward subjects."
          : "Apply environment changes on the background path and preserve existing subject structure.",
    };
  }

  return {
    mode: "preserve-active",
    preserveExistingContent: true,
    reason:
      shotScope === "tweak-current-shot"
        ? "Keep the edit on the current subject/action path and preserve the existing composition."
        : "Preserve the active subject/action path unless the prompt explicitly asks for a background or effect layer change.",
  };
};

const resolveGenerateFramesCameraDirection = ({
  normalizedPrompt,
  buildDirection,
}: {
  normalizedPrompt: string;
  buildDirection: string | null;
}) => {
  if (/\b(left to right|toward the right|to the right|moves right|moving right)\b/i.test(normalizedPrompt)) {
    return "left-to-right";
  }
  if (/\b(right to left|toward the left|to the left|moves left|moving left)\b/i.test(normalizedPrompt)) {
    return "right-to-left";
  }
  if (/\b(toward the camera|towards the camera|forward)\b/i.test(normalizedPrompt)) {
    return "forward";
  }
  if (/\b(away from the camera|backward|backwards)\b/i.test(normalizedPrompt)) {
    return "backward";
  }

  return buildDirection;
};

const resolveGenerateFramesCameraPlan = ({
  normalizedPrompt,
  shotScope,
  motionType,
  subjects,
  buildDirection,
  previousState,
}: {
  normalizedPrompt: string;
  shotScope: DrawingAiGenerateFramesShotScope;
  motionType: DrawingAiGenerateFramesStateMotionType;
  subjects: readonly DrawingAiGenerateFramesStateSubject[];
  buildDirection: string | null;
  previousState: DrawingAiGenerateFramesState | null;
}): DrawingAiCameraPlan => {
  const focusSubjectId =
    subjects.find((subject) => subject.type === "character" || subject.type === "object")?.id ??
    previousState?.cameraPlan?.focusSubjectId ??
    null;
  const direction = resolveGenerateFramesCameraDirection({
    normalizedPrompt,
    buildDirection,
  });

  if (motionType === "background-scroll") {
    return {
      mode: "anchored-subject-scroll",
      focusSubjectId,
      direction,
    };
  }

  if (
    shotScope === "new-shot-same-project" &&
    /\b(offset|travel|passing|transition|move past|move through|cross(?:ing)? into)\b/i.test(normalizedPrompt)
  ) {
    return {
      mode: "scene-offset-progression",
      focusSubjectId,
      direction,
    };
  }

  return {
    mode: "static",
    focusSubjectId,
    direction: null,
  };
};

export const analyzeGenerateFramesRequest = ({
  userMessage,
  conversationHistory = [],
  workspaceContext = null,
  generateFramesState = null,
  projectAiMemory = null,
}: {
  userMessage: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  workspaceContext?: DrawingAiWorkspaceContext | null;
  generateFramesState?: DrawingAiGenerateFramesState | null;
  projectAiMemory?: DrawingAiProjectMemory | null;
}): GenerateFramesRuntimeAnalysis => {
  const prompt = userMessage.trim();
  const normalizedPrompt = normalizePrompt(prompt);
  const stillFrameRequested = detectStillFrameRequested(normalizedPrompt);
  const normalizedHistory = normalizePrompt(conversationHistory.slice(-6).map((message) => message.content).join(" "));
  const normalizedUserHistory = normalizePrompt(
    conversationHistory
      .slice(-6)
      .filter((message) => message.role === "user")
      .map((message) => message.content)
      .join(" "),
  );
  const negatedConcepts = detectNegatedConcepts(normalizedPrompt);
  const positivePrompt = stripNegatedConceptPhrases(normalizedPrompt);
  const previousMemory = projectAiMemory ?? null;
  const previousState = generateFramesState ?? previousMemory?.generateFramesState ?? null;
  const goalContext = normalizePrompt(
    [previousMemory?.currentGoal ?? null, previousMemory?.contextSummary ?? null].filter(Boolean).join(" "),
  );
  const directRequestKind = inferDrawingAiFrameRequestKind(prompt);
  const directRequestedFrameCount = resolveRequestedFrameCount(prompt);
  const historyRequestedFrameCount = normalizedUserHistory.length > 0 ? resolveRequestedFrameCount(normalizedUserHistory) : 1;
  const inheritedWorkspaceFrameCount =
    workspaceContext?.currentFrameHasBitmap && workspaceContext.authoredFrameCount > 1
      ? workspaceContext.authoredFrameCount
      : 1;
  const inheritedRequestedFrameCount = Math.max(
    historyRequestedFrameCount,
    inheritedWorkspaceFrameCount,
    previousState?.frameCount ?? 1,
    previousMemory?.generateFramesState?.frameCount ?? 1,
  );
  const explicitRequestedColor = detectRequestedColor(normalizedPrompt);
  const promptEntityLabels = detectCharacterEntityLabels(positivePrompt);
  const promptSceneSetting = detectSceneSetting(normalizedPrompt);
  const seedActionKeywords = detectActionKeywords(positivePrompt);
  const promptSubject = extractPromptSubjectLabel(positivePrompt);
  const rawPromptSceneProps = detectSceneProps(normalizedPrompt);
  const promptSceneProps = shouldTreatScenePropsAsStandaloneSubject({
    normalizedPrompt,
    promptSubject,
    sceneSetting: promptSceneSetting,
    sceneProps: rawPromptSceneProps,
  })
    ? []
    : rawPromptSceneProps;
  const deferredOnlyIntent =
    DEFERRED_GENERATION_PATTERN.test(normalizedPrompt) && !IMMEDIATE_GENERATION_OVERRIDE_PATTERN.test(normalizedPrompt);
  const seedVisualKind = classifyPromptVisualKind({
    normalizedPrompt: positivePrompt,
    promptSubject,
    sceneSetting: promptSceneSetting,
    componentFamilies: unique([
      ...detectBaseFamilies(positivePrompt),
      ...inferFamiliesFromPromptSubject({
        promptSubject,
        visualKind: "thing",
        promptSceneSetting,
        promptSceneProps,
      }),
    ]) as GenerateFramesIntentFamily[],
  });
  const promptHasExplicitNewConcept =
    detectConcepts(positivePrompt).length > 0 ||
    detectBaseFamilies(positivePrompt).length > 0 ||
    promptEntityLabels.length > 0 ||
    promptSubject != null ||
    promptSceneSetting != null ||
    promptSceneProps.length > 0 ||
    seedActionKeywords.length > 0;
  const editIntents = detectEditIntents(normalizedPrompt);
  const interactionMode = resolveRuntimeInteractionMode({
    normalizedPrompt,
    previousState,
    previousMemory,
    workspaceContext,
    editIntents,
    promptHasExplicitNewConcept,
    deferredOnlyIntent,
  });
  const projectScope = resolveGenerateFramesProjectScope({
    normalizedPrompt,
    previousState,
    previousMemory,
    workspaceContext,
  });
  const shotScope = resolveGenerateFramesShotScope({
    normalizedPrompt,
    previousState,
    previousMemory,
    workspaceContext,
    interactionMode,
    projectScope,
    promptHasExplicitNewConcept,
  });
  const hasContinuationAnchor =
    previousState != null ||
    previousMemory?.generateFramesState != null ||
    previousMemory?.interactionMode === "continue" ||
    previousMemory?.interactionMode === "tweak" ||
    Boolean(workspaceContext?.currentFrameHasBitmap);
  const editFollowUpRequested =
    hasContinuationAnchor && (FOLLOW_UP_EDIT_PATTERN.test(normalizedPrompt) || editIntents.length > 0);
  const stateDrivenContinuation =
    previousState != null &&
    !RESET_IDENTITY_PATTERN.test(normalizedPrompt) &&
    (
      interactionMode === "continue" ||
      interactionMode === "tweak" ||
      (previousState.motionType === "scene" &&
        stillFrameRequested &&
        /\b(scene|setup|still|first frame|opening frame|starting point|do not animate|don't animate|no animation)\b/i.test(
          normalizedPrompt,
        ))
    );
  const continuationRequested =
    interactionMode !== "discuss" &&
    (
      directRequestKind === "continuation" ||
      shotScope === "continue-current-shot" ||
      shotScope === "tweak-current-shot" ||
      stateDrivenContinuation ||
      (Boolean(workspaceContext?.currentFrameHasBitmap) && /\bcurrent (?:drawing|frame|sequence)\b/.test(normalizedPrompt))
    );
  const inheritedState =
    shotScope === "continue-current-shot" || shotScope === "tweak-current-shot" || continuationRequested
      ? previousState
      : null;
  const sameWorldCreateRequested =
    shotScope === "new-shot-same-project" &&
    previousState != null &&
    !continuationRequested &&
    !promptReferencesCurrentSubject(normalizedPrompt) &&
    promptReferencesCurrentWorld(normalizedPrompt);
  const contextualState = inheritedState ?? (sameWorldCreateRequested ? previousState : null);
  const explicitExistingSubjectReference =
    promptReferencesCurrentSubject(normalizedPrompt) ||
    promptReferencesAllCurrentSubjects(normalizedPrompt) ||
    /\bthe (?:character|figure|fighter|subject|runner|attacker|defender)\b/i.test(normalizedPrompt) ||
    /\b(?:same|current|existing) (?:character|figure|fighter|subject|runner|attacker|defender)\b/i.test(normalizedPrompt);
  const subjectAnchorState =
    inheritedState ??
    (shotScope === "new-shot-same-project" && previousState != null && explicitExistingSubjectReference ? previousState : null);
  const subjectAnchorBindings = resolveStateSubjectBindings(subjectAnchorState);
  const requestedColor =
    explicitRequestedColor ??
    subjectAnchorState?.subjects.find((subject) => subject.role === "primary")?.color ??
    null;
  const continuationHistoryConcepts = continuationRequested
    ? inferContinuationConceptsFromHistory({
        normalizedPrompt: positivePrompt,
        normalizedHistory: `${normalizedHistory} ${goalContext}`.trim(),
      })
    : [];
  const requestKind =
    continuationRequested && directRequestKind === "single-frame" && inheritedRequestedFrameCount > 1
      ? "continuation"
      : directRequestKind;
  const requestedFrameCount =
    continuationRequested && directRequestedFrameCount === 1 && inheritedRequestedFrameCount > 1
      ? inheritedRequestedFrameCount
      : directRequestedFrameCount;
  const actionKeywords = resolveActionKeywords({
    normalizedPrompt,
    previousActionKeywords: inheritedState?.actionKeywords ?? [],
    continuationRequested,
  });
  const contextForInference = continuationRequested ? `${positivePrompt} ${normalizedHistory} ${goalContext}`.trim() : positivePrompt;
  const historyConcepts = continuationRequested ? detectConcepts(`${normalizedHistory} ${goalContext}`.trim()) : [];
  const stateConcepts = detectStateConcepts(inheritedState);
  const concepts = unique([...stateConcepts, ...detectConcepts(contextForInference), ...historyConcepts, ...continuationHistoryConcepts]);
  const baseFamilies = unique([
    ...detectBaseFamilies(positivePrompt),
    ...inferFamiliesFromPromptSubject({
      promptSubject,
      visualKind: seedVisualKind,
      promptSceneSetting,
      promptSceneProps,
    }),
  ]) as GenerateFramesIntentFamily[];
  const inheritedFamilies = continuationRequested
    ? [...detectBaseFamilies(normalizedHistory), ...detectBaseFamilies(goalContext), ...detectStateFamilies(inheritedState)]
    : [];
  const excludedFamilies = unique(negatedConcepts.flatMap((concept) => mapConceptToFamilies(concept)));
  const familyConfidence: GenerateFramesFamilyConfidence =
    continuationRequested ||
    editFollowUpRequested ||
    baseFamilies.length > 0 ||
    concepts.length > 0 ||
    actionKeywords.length > 0 ||
    promptSubject != null ||
    inheritedState != null
      ? "high"
      : "low";
  const semanticFamilies = unique([
    ...(promptEntityLabels.length > 0 || actionKeywords.some((keyword) => ["punch", "kick", "guard", "walk", "run", "jump", "fall", "swing", "throw", "hold", "hover", "crawl", "stare", "roar"].includes(keyword))
      ? (["character"] as const)
      : []),
    ...(promptSceneSetting != null || promptSceneProps.length > 0 || stillFrameRequested ? (["background"] as const) : []),
    ...(actionKeywords.some((keyword) => ["explode", "lightning", "smoke", "impact", "erupt"].includes(keyword)) ? (["effect"] as const) : []),
    ...(actionKeywords.some((keyword) => ["bounce", "roll", "morph"].includes(keyword)) ? (["object"] as const) : []),
    ...inferFamiliesFromPromptSubject({
      promptSubject,
      visualKind: seedVisualKind,
      promptSceneSetting,
      promptSceneProps,
    }),
  ]) as GenerateFramesIntentFamily[];
  const componentFamilies = unique(
    continuationRequested
      ? [...detectBaseFamilies(contextForInference), ...inheritedFamilies, ...semanticFamilies]
      : baseFamilies.length > 0
        ? [...baseFamilies, ...semanticFamilies]
        : [...detectStateFamilies(inheritedState), ...semanticFamilies],
  ) as GenerateFramesIntentFamily[];
  const blockedByNegation = negatedConcepts.length > 0 && concepts.length === 0 && !continuationRequested;

  let primaryFamily: GenerateFramesIntentFamily;
  if (continuationRequested) {
    primaryFamily = "continuation";
  } else if (shouldTreatAsMixed(positivePrompt, componentFamilies) || componentFamilies.length >= 2) {
    primaryFamily = "mixed";
  } else if (componentFamilies.includes("background") && !componentFamilies.includes("character") && !componentFamilies.includes("object")) {
    primaryFamily = "background";
  } else if (componentFamilies.includes("effect") && !componentFamilies.includes("character") && !componentFamilies.includes("object")) {
    primaryFamily = "effect";
  } else if (componentFamilies.includes("object") && !componentFamilies.includes("character")) {
    primaryFamily = "object";
  } else if (componentFamilies.includes("character")) {
    primaryFamily = "character";
  } else if (excludedFamilies.length === 1) {
    primaryFamily = excludedFamilies[0]!;
  } else if (workspaceContext?.currentFrameHasBitmap && interactionMode !== "create") {
    primaryFamily = "continuation";
  } else if (/\b(room|hallway|background|environment|scene|landscape|plains?|field|grassland|meadow|mountain(?: range)?s?|hills?|city|cityscape|skyline|buildings?)\b/.test(positivePrompt)) {
    primaryFamily = "background";
  } else if (/\b(ball|circle|square|block|object|rod|staff)\b/.test(positivePrompt)) {
    primaryFamily = "object";
  } else if (/\b(explosion|lightning|smoke|fire|rain|crack|fracture)\b/.test(positivePrompt)) {
    primaryFamily = "effect";
  } else {
    primaryFamily = "character";
  }

  const normalizedComponentFamilies =
    primaryFamily === "mixed"
      ? componentFamilies
      : primaryFamily === "continuation"
        ? unique(componentFamilies)
        : unique([primaryFamily, ...componentFamilies.filter((family) => family !== primaryFamily)]);
  const visualKind = classifyPromptVisualKind({
    normalizedPrompt: positivePrompt,
    promptSubject,
    sceneSetting: promptSceneSetting,
    componentFamilies: normalizedComponentFamilies,
  });
  const outputMode = resolvePromptOutputMode({
    normalizedPrompt,
    stillFrameRequested,
    visualKind,
    actionKeywords,
  });
  const stillSceneForLaterAnimation =
    outputMode === "still" &&
    visualKind === "scene" &&
    FUTURE_ANIMATION_REFERENCE_PATTERN.test(normalizedPrompt) &&
    requestKind !== "continuation";
  const normalizedRequestKind = stillSceneForLaterAnimation ? "single-frame" : requestKind;
  const normalizedRequestedFrameCount = stillSceneForLaterAnimation ? 1 : requestedFrameCount;

  const questionGate = buildQuestionGate({
    normalizedPrompt,
    primaryFamily,
    concepts,
    hasStoredContinuationState: inheritedState != null,
    workspaceContext,
  });
  const noPlanBlocker: GenerateFramesNoPlanBlocker =
    deferredOnlyIntent
      ? "deferred-only"
      : blockedByNegation
        ? "negation"
        : familyConfidence === "low" && !workspaceContext?.currentFrameHasBitmap
          ? "low-confidence"
          : null;
  const noPlanReason =
    noPlanBlocker === "deferred-only"
      ? "The prompt describes a future or later idea, not an immediate engine-command request."
      : noPlanBlocker === "negation"
        ? "The prompt explicitly forbids defining the detected subject."
        : noPlanBlocker === "low-confidence"
          ? "The request did not identify a safe frame family or subject strongly enough to define without guessing."
          : null;

  const tone = detectPromptTone(normalizedPrompt, contextualState?.tone ?? "neutral");
  const forceLevel = detectForceLevel({
    normalizedPrompt,
    tone,
    previousForceLevel: contextualState?.forceLevel ?? "medium",
  });
  const detectedSceneSetting = detectSceneSetting(normalizedPrompt);
  const sceneSetting =
    detectedSceneSetting == null || (detectedSceneSetting === "generic" && contextualState?.sceneSetting && contextualState.sceneSetting !== "generic")
      ? contextualState?.sceneSetting ?? detectedSceneSetting
      : detectedSceneSetting;
  const sceneDescriptors = resolveSceneDescriptors({
    normalizedPrompt,
    actionKeywords,
    previousSceneDescriptors: contextualState?.sceneDescriptors ?? [],
  });
  const sceneProps = resolveSceneProps({
    normalizedPrompt,
    previousSceneProps: contextualState?.sceneProps ?? [],
  });
  const sceneElements = resolveSceneElements({
    normalizedPrompt,
    promptSubject,
    visualKind,
    sceneSetting,
    sceneProps,
    previousSceneElements: contextualState?.sceneElements ?? [],
  });
  const subjects = inferSubjectsFromStateAndPrompt({
    previousState: subjectAnchorState,
    previousBindings: subjectAnchorBindings,
    primaryFamily,
    componentFamilies: normalizedComponentFamilies,
    normalizedPrompt,
    promptSubjectLabel: promptSubject,
    actionKeywords,
    requestedColor,
    sceneSetting,
    sceneDescriptors,
    sceneElements,
  });
  const focusTargets = resolveFocusTargets({
    normalizedPrompt,
    interactionMode,
    previousState: inheritedState,
    subjects,
    sceneSetting,
    sceneProps,
    sceneElements,
    actionKeywords,
    promptSubject,
  });
  const motionType =
    outputMode === "still" &&
    (
      visualKind === "scene" ||
      normalizedComponentFamilies.includes("background") ||
      sceneSetting != null
    ) &&
    actionKeywords.length === 0 &&
    !concepts.some((concept) =>
      ["explosion", "lightning", "shockwave", "smoke", "bouncing-ball", "rolling-ball", "morphing-ball", "punch", "kick", "walking", "running", "fighting-stance"].includes(concept),
    )
      ? "scene"
      :
    normalizedRequestKind === "single-frame" &&
    normalizedComponentFamilies.includes("background") &&
    (normalizedComponentFamilies.includes("character") || normalizedComponentFamilies.includes("object") || stillFrameRequested) &&
    !concepts.some((concept) => ["explosion", "lightning", "shockwave", "smoke", "bouncing-ball", "rolling-ball", "morphing-ball", "punch", "kick", "walking", "running", "fighting-stance"].includes(concept))
      ? "scene"
      : detectMotionTypeFromConcepts(concepts, actionKeywords, normalizedPrompt, contextualState?.motionType ?? "unknown");
  const expectedVisualClass = resolveExpectedVisualClass({
    interactionMode,
    primaryFamily,
    visualKind,
    outputMode,
    motionType,
  });
  const allowedSubjectFamilies = resolveAllowedSubjectFamilies({
    interactionMode,
    primaryFamily,
    componentFamilies: normalizedComponentFamilies,
    subjects,
    sceneSetting,
  });
  const subjectPurityMode = resolveSubjectPurityMode({
    interactionMode,
    primaryFamily,
    componentFamilies: normalizedComponentFamilies,
    subjects,
  });
  const expectedCompletionProfile = resolveExpectedCompletionProfile({
    outputMode,
    motionType,
    actionKeywords,
  });
  const expectationCoverage = resolveExpectationCoverage({
    primaryFamily,
    componentFamilies: normalizedComponentFamilies,
    promptSubject,
    subjects,
    sceneSetting,
    motionType,
    actionKeywords,
    visualKind,
  });
  const shapeConfidence = resolveShapeConfidence({
    expectationCoverage,
    primaryFamily,
    promptSubject,
    subjects,
    actionKeywords,
    visualKind,
  });
  const orderedBeats =
    outputMode === "animation"
      ? collectHumanExpectedOrderedBeats(normalizedPrompt)
      : [];
  const sequenceBeats = buildSequenceBeats({
    normalizedPrompt,
    outputMode,
    requestKind: normalizedRequestKind,
    requestedFrameCount: normalizedRequestedFrameCount,
    expectedCompletionProfile,
    motionType,
    actionKeywords,
    subjects,
    sceneSetting,
  });
  const humanExpectationRisk = resolveHumanExpectationRisk({
    interactionMode,
    expectedVisualClass,
    subjectPurityMode,
    expectedCompletionProfile,
    shapeConfidence,
    orderedBeats,
    primaryFamily,
  });
  const modifiers = detectStateModifiers({
    normalizedPrompt,
    previousModifiers: contextualState?.modifiers ?? [],
  });
  const recentVariationSignatures =
    projectScope === "same-project"
      ? previousState?.recentVariationSignatures ?? []
      : inheritedState?.recentVariationSignatures ?? [];
  const renderingQualityFamily = resolveRenderingQualityFamily({
    normalizedPrompt,
    primaryFamily,
    componentFamilies: normalizedComponentFamilies,
    motionType,
    actionKeywords,
    sceneSetting,
  });
  const variationCycleIndex = resolveVariationCycleIndex({
    shotScope,
    recentVariationSignatures,
    qualityFamily: renderingQualityFamily,
  });
  const variationProfile = resolveVariationProfile({
    normalizedPrompt,
    motionType,
    forceLevel,
    tone,
    modifiers,
    expectedVisualClass,
    qualityFamily: renderingQualityFamily,
    variationCycleIndex,
  });
  const variationSignature = buildGenerateFramesVariationSignature({
    qualityFamily: renderingQualityFamily,
    variationProfile,
    variationCycleIndex,
    shotScope,
  });
  const visualExpectationTags = buildVisualExpectationTags({
    primaryFamily,
    promptSubject,
    subjects,
    sceneSetting,
    outputMode,
    motionType,
    actionKeywords,
  });
  const searchConfidence = buildGenerateFramesSearchConfidenceProfile({
    normalizedPrompt,
    interactionMode,
    projectScope,
    shotScope,
    primaryFamily,
    componentFamilies: normalizedComponentFamilies,
    visualKind,
    outputMode,
    expectedVisualClass,
    expectationCoverage,
    shapeConfidence,
    familyConfidence,
    humanExpectationRisk,
    motionType,
    actionKeywords,
    sceneSetting,
    sceneDescriptors,
    sceneProps,
    sceneElements,
    subjects,
    orderedBeats,
    sequenceBeats,
    hasContinuationAnchor: inheritedState != null,
  });
  const buildDirection = resolveBuildDirection({
    previousBuildDirection: contextualState?.buildDirection ?? null,
    goalContext: previousMemory?.currentGoal ?? previousMemory?.contextSummary ?? null,
    actionKeywords,
    tone,
    modifiers,
    sceneSetting,
    sceneDescriptors,
    sceneProps,
    sceneElements,
  });
  const layerPlan = resolveGenerateFramesLayerPlan({
    normalizedPrompt,
    shotScope,
    editIntents,
    primaryFamily,
    componentFamilies: normalizedComponentFamilies,
    motionType,
    sceneSetting,
    sceneProps,
    sceneElements,
    previousState: contextualState,
  });
  const cameraPlan = resolveGenerateFramesCameraPlan({
    normalizedPrompt,
    shotScope,
    motionType,
    subjects,
    buildDirection,
    previousState: contextualState,
  });
  const recentEdits = buildRecentEdits({
    normalizedPrompt: prompt,
    previousRecentEdits: inheritedState?.recentEdits ?? [],
    continuationRequested,
  });
  const executionGuidance = buildExecutionGuidanceProfile({
    normalizedPrompt,
    projectScope,
    shotScope,
    requestKind: normalizedRequestKind,
    primaryFamily,
    componentFamilies: normalizedComponentFamilies,
    outputMode,
    expectedCompletionProfile,
    subjects,
    motionType,
    tone,
    forceLevel,
    modifiers,
    sceneSetting,
    sceneProps,
    sceneElements,
    sequenceBeats,
    variationProfile,
    visualExpectationTags,
    recentEdits,
    currentGoal: previousMemory?.storyState?.currentStoryGoal ?? previousMemory?.currentGoal ?? previousMemory?.contextSummary ?? null,
    storyStyleAnchors: previousMemory?.storyState?.styleAnchors ?? [],
    recentSceneSummaries: previousMemory?.storyState?.recentSceneSummaries ?? [],
  });
  const qualityFloor = resolveExecutionQualityFloor({
    executionGuidance,
    humanExpectationRisk,
    outputMode,
    expectedVisualClass,
    sequenceBeats,
  });
  const renderingQualityFloorTier = resolveRenderingQualityFloorTier({
    qualityFloor,
    qualityFamily: renderingQualityFamily,
    projectScope,
    shotScope,
  });
  const familyQualityContract = buildFamilyQualityContract({
    qualityFamily: renderingQualityFamily,
  });
  const principleActivationProfile = buildPrincipleActivationProfile({
    qualityFamily: renderingQualityFamily,
    outputMode,
    stillFrameRequested,
  });
  const variationEnvelope = buildVariationEnvelope({
    qualityFamily: renderingQualityFamily,
    subjects,
    sceneSetting,
    variationProfile,
    shotScope,
  });
  const renderingQualityProfile = buildRenderingQualityProfile({
    qualityFamily: renderingQualityFamily,
    qualityFloorTier: renderingQualityFloorTier,
    outputMode,
    expectedCompletionProfile,
    executionGuidance,
    shotScope,
  });
  const renderAcceptanceContract = buildRenderAcceptanceContract({
    outputMode,
    qualityFamily: renderingQualityFamily,
    familyQualityContract,
    renderingQualityProfile,
    principleActivationProfile,
    executionGuidance,
    expectedCompletionProfile,
    shotScope,
  });
  const visibleSubjectCount = subjects.filter((subject) => subject.type === "character" || subject.type === "object").length;
  const sceneComplexity =
    (sceneSetting != null ? 1 : 0) + sceneDescriptors.length + sceneProps.length + sceneElements.length;
  const cheapFirstDecision = buildGenerateFramesCheapFirstDecision({
    executionReadiness: "ready-local",
    searchConfidence,
    expectationCoverage,
    shapeConfidence,
    humanExpectationRisk,
    qualityFamily: renderingQualityFamily,
    outputMode,
    projectScope,
    shotScope,
    visibleSubjectCount,
    sceneComplexity,
    requestedFrameCount: normalizedRequestedFrameCount,
    orderedBeatCount: orderedBeats.length,
    motionType,
  });
  const resolvedSubjectBindings = buildStableSubjectBindings({
    subjects,
    previousBindings: subjectAnchorBindings,
  });
  const fps =
    /\b(smooth(?:er)?|cleaner|polish|more in[- ]betweens?)\b/i.test(normalizedPrompt) ||
    motionType === "lightning" ||
    motionType === "run" ||
    modifiers.includes("smooth")
      ? 24
      : contextualState?.fps ?? workspaceContext?.timelineFps ?? 12;
  const continuationState: DrawingAiGenerateFramesState | null = inheritedState
    ? {
        ...inheritedState,
        projectScope,
        shotScope,
        subjects,
        subjectBindings: resolvedSubjectBindings,
        tone,
        forceLevel,
        motionType,
        frameCount: clampRequestedFrameCount(Math.max(inheritedState.frameCount, normalizedRequestedFrameCount)),
        fps,
        modifiers,
        sceneSetting,
        sceneDescriptors,
        sceneProps,
        sceneElements,
        focusTargets,
        actionKeywords,
        buildDirection,
        sequenceBeats,
        layerPlan,
        cameraPlan,
        executionGuidance,
        searchConfidence,
        qualityFloor,
        recentVariationSignatures,
        recentEdits,
      }
    : null;

  const baseRuntimeAnalysis = {
    prompt,
    normalizedPrompt,
    historyContext: normalizedHistory,
    goalContext,
    requestKind: normalizedRequestKind,
    requestedFrameCount: normalizedRequestedFrameCount,
    promptSubject,
    visualKind,
    outputMode,
    expectedVisualClass,
    allowedSubjectFamilies,
    subjectPurityMode,
    expectedCompletionProfile,
    expectationCoverage,
    shapeConfidence,
    humanExpectationRisk,
    orderedBeats,
    sequenceBeats,
    executionGuidance,
    searchConfidence,
    qualityFloor,
    renderingQualityProfile,
    familyQualityContract,
    principleActivationProfile,
    variationEnvelope,
    renderAcceptanceContract,
    layerPlan,
    cameraPlan,
    variationProfile,
    variationCycleIndex,
    variationSignature,
    recentVariationSignatures,
    cheapFirstDecision,
    visualExpectationTags,
    primaryFamily,
    componentFamilies: normalizedComponentFamilies,
    concepts,
    negatedConcepts,
    excludedFamilies,
    requestedColor,
    familyConfidence,
    noPlanBlocker,
    noPlanReason,
    interactionMode,
    projectScope,
    shotScope,
    editIntents,
    actionKeywords,
    buildDirection,
    expectationLines: buildExpectationLines({
      primaryFamily,
      componentFamilies: normalizedComponentFamilies,
      concepts,
      negatedConcepts,
      requestedColor,
      subjects,
      outputMode,
      motionType,
      actionKeywords,
      subjectPurityMode,
      expectedCompletionProfile,
      visualExpectationTags,
    }),
    familyLockLines: buildFamilyLockLines({
      primaryFamily,
      componentFamilies: normalizedComponentFamilies,
    }),
    questionGate,
    continuationState,
    subjects,
    tone,
    forceLevel,
    motionType,
    fps,
    modifiers,
    stillFrameRequested,
    sceneSetting,
    sceneDescriptors,
    sceneProps,
    sceneElements,
    focusTargets,
    recentEdits,
  };
  const thinkingSystem = buildThinkingSystem({
    analysis: baseRuntimeAnalysis,
    subjectBindings: resolvedSubjectBindings,
  });
  const executionReadiness = resolveGenerateFramesExecutionReadiness({
    analysis: baseRuntimeAnalysis,
    thinkingSystem,
  });
  const finalCheapFirstDecision = buildGenerateFramesCheapFirstDecision({
    executionReadiness: executionReadiness.readiness,
    searchConfidence,
    expectationCoverage,
    shapeConfidence,
    humanExpectationRisk,
    qualityFamily: renderingQualityFamily,
    outputMode,
    projectScope,
    shotScope,
    visibleSubjectCount,
    sceneComplexity,
    requestedFrameCount: normalizedRequestedFrameCount,
    orderedBeatCount: orderedBeats.length,
    motionType,
  });

  return {
    ...baseRuntimeAnalysis,
    thinkingSystem,
    cheapFirstDecision: finalCheapFirstDecision,
    executionReadiness: executionReadiness.readiness,
    executionReadinessReason: executionReadiness.reason,
  };
};

export const strengthenGenerateFramesContinuationAnalysis = ({
  baseAnalysis,
  additionalHistoryText = "",
  workspaceContext = null,
}: {
  baseAnalysis: GenerateFramesRuntimeAnalysis;
  additionalHistoryText?: string;
  workspaceContext?: DrawingAiWorkspaceContext | null;
}): GenerateFramesRuntimeAnalysis => {
  const normalizedAdditionalHistory = normalizePrompt(additionalHistoryText);
  const hasExplicitContinuationAnchor =
    baseAnalysis.primaryFamily === "continuation" ||
    baseAnalysis.interactionMode === "continue" ||
    baseAnalysis.interactionMode === "tweak" ||
    baseAnalysis.continuationState != null;
  const hasContinuationAnchor =
    hasExplicitContinuationAnchor ||
    (Boolean(workspaceContext?.currentFrameHasBitmap) && baseAnalysis.interactionMode !== "create");

  if (!hasContinuationAnchor) {
    return baseAnalysis;
  }

  const inheritedConcepts = unique([
    ...baseAnalysis.concepts,
    ...detectConcepts(`${normalizedAdditionalHistory} ${baseAnalysis.goalContext}`.trim()),
  ]);
  const inheritedFamilies = unique([
    ...baseAnalysis.componentFamilies,
    ...detectBaseFamilies(normalizedAdditionalHistory),
  ]);
  const inheritedFrameFloor =
    baseAnalysis.motionType === "scene" || baseAnalysis.stillFrameRequested
      ? 1
      : Math.max(
          baseAnalysis.requestedFrameCount,
          baseAnalysis.continuationState?.frameCount ?? 1,
          workspaceContext?.authoredFrameCount ?? 1,
        );
  const primaryFamily: GenerateFramesIntentFamily = "continuation";
  const requestKind =
    baseAnalysis.requestKind === "single-frame" && inheritedFrameFloor > 1
      ? "continuation"
      : baseAnalysis.requestKind;
  const expectedVisualClass = resolveExpectedVisualClass({
    interactionMode: baseAnalysis.interactionMode,
    primaryFamily,
    visualKind: baseAnalysis.visualKind,
    outputMode: baseAnalysis.outputMode,
    motionType: baseAnalysis.motionType,
  });
  const allowedSubjectFamilies = resolveAllowedSubjectFamilies({
    interactionMode: baseAnalysis.interactionMode,
    primaryFamily,
    componentFamilies: inheritedFamilies,
    subjects: baseAnalysis.subjects,
    sceneSetting: baseAnalysis.sceneSetting,
  });
  const subjectPurityMode = resolveSubjectPurityMode({
    interactionMode: baseAnalysis.interactionMode,
    primaryFamily,
    componentFamilies: inheritedFamilies,
    subjects: baseAnalysis.subjects,
  });
  const shapeConfidence = resolveShapeConfidence({
    expectationCoverage: baseAnalysis.expectationCoverage,
    primaryFamily,
    promptSubject: baseAnalysis.promptSubject,
    subjects: baseAnalysis.subjects,
    actionKeywords: baseAnalysis.actionKeywords,
    visualKind: baseAnalysis.visualKind,
  });
  const orderedBeats =
    baseAnalysis.outputMode === "animation"
      ? collectHumanExpectedOrderedBeats(baseAnalysis.normalizedPrompt)
      : [];
  const sequenceBeats = buildSequenceBeats({
    normalizedPrompt: baseAnalysis.normalizedPrompt,
    outputMode: baseAnalysis.outputMode,
    requestKind,
    requestedFrameCount: clampRequestedFrameCount(inheritedFrameFloor),
    expectedCompletionProfile: baseAnalysis.expectedCompletionProfile,
    motionType: baseAnalysis.motionType,
    actionKeywords: baseAnalysis.actionKeywords,
    subjects: baseAnalysis.subjects,
    sceneSetting: baseAnalysis.sceneSetting,
  });
  const humanExpectationRisk = resolveHumanExpectationRisk({
    interactionMode: baseAnalysis.interactionMode,
    expectedVisualClass,
    subjectPurityMode,
    expectedCompletionProfile: baseAnalysis.expectedCompletionProfile,
    shapeConfidence,
    orderedBeats,
    primaryFamily,
  });
  const expectationLines = buildExpectationLines({
    primaryFamily,
    componentFamilies: inheritedFamilies,
    concepts: inheritedConcepts,
    negatedConcepts: baseAnalysis.negatedConcepts,
    requestedColor: baseAnalysis.requestedColor,
    subjects: baseAnalysis.subjects,
    outputMode: baseAnalysis.outputMode,
    motionType: baseAnalysis.motionType,
    actionKeywords: baseAnalysis.actionKeywords,
    subjectPurityMode,
    expectedCompletionProfile: baseAnalysis.expectedCompletionProfile,
    visualExpectationTags: baseAnalysis.visualExpectationTags,
  });
  const familyLockLines = buildFamilyLockLines({
    primaryFamily,
    componentFamilies: inheritedFamilies,
  });
  const executionGuidance = buildExecutionGuidanceProfile({
    normalizedPrompt: baseAnalysis.normalizedPrompt,
    projectScope: baseAnalysis.projectScope,
    shotScope: baseAnalysis.shotScope,
    requestKind,
    primaryFamily,
    componentFamilies: inheritedFamilies,
    outputMode: baseAnalysis.outputMode,
    expectedCompletionProfile: baseAnalysis.expectedCompletionProfile,
    subjects: baseAnalysis.subjects,
    motionType: baseAnalysis.motionType,
    tone: baseAnalysis.tone,
    forceLevel: baseAnalysis.forceLevel,
    modifiers: baseAnalysis.modifiers,
    sceneSetting: baseAnalysis.sceneSetting,
    sceneProps: baseAnalysis.sceneProps,
    sceneElements: baseAnalysis.sceneElements,
    sequenceBeats,
    variationProfile: baseAnalysis.variationProfile,
    visualExpectationTags: baseAnalysis.visualExpectationTags,
    recentEdits: baseAnalysis.recentEdits,
    currentGoal: baseAnalysis.goalContext || null,
    storyStyleAnchors: baseAnalysis.executionGuidance.stylePrinciples ?? [],
    recentSceneSummaries: [],
  });
  const layerPlan = resolveGenerateFramesLayerPlan({
    normalizedPrompt: baseAnalysis.normalizedPrompt,
    shotScope: baseAnalysis.shotScope,
    editIntents: baseAnalysis.editIntents,
    primaryFamily,
    componentFamilies: inheritedFamilies,
    motionType: baseAnalysis.motionType,
    sceneSetting: baseAnalysis.sceneSetting,
    sceneProps: baseAnalysis.sceneProps,
    sceneElements: baseAnalysis.sceneElements,
    previousState: baseAnalysis.continuationState,
  });
  const cameraPlan = resolveGenerateFramesCameraPlan({
    normalizedPrompt: baseAnalysis.normalizedPrompt,
    shotScope: baseAnalysis.shotScope,
    motionType: baseAnalysis.motionType,
    subjects: baseAnalysis.subjects,
    buildDirection: baseAnalysis.buildDirection,
    previousState: baseAnalysis.continuationState,
  });
  const searchConfidence = buildGenerateFramesSearchConfidenceProfile({
    normalizedPrompt: baseAnalysis.normalizedPrompt,
    interactionMode: baseAnalysis.interactionMode,
    projectScope: baseAnalysis.projectScope,
    shotScope: baseAnalysis.shotScope,
    primaryFamily,
    componentFamilies: inheritedFamilies,
    visualKind: baseAnalysis.visualKind,
    outputMode: baseAnalysis.outputMode,
    expectedVisualClass,
    expectationCoverage: baseAnalysis.expectationCoverage,
    shapeConfidence,
    familyConfidence: baseAnalysis.familyConfidence,
    humanExpectationRisk,
    motionType: baseAnalysis.motionType,
    actionKeywords: baseAnalysis.actionKeywords,
    sceneSetting: baseAnalysis.sceneSetting,
    sceneDescriptors: baseAnalysis.sceneDescriptors,
    sceneProps: baseAnalysis.sceneProps,
    sceneElements: baseAnalysis.sceneElements,
    subjects: baseAnalysis.subjects,
    orderedBeats,
    sequenceBeats,
    hasContinuationAnchor: baseAnalysis.continuationState != null,
  });
  const qualityFloor = resolveExecutionQualityFloor({
    executionGuidance,
    humanExpectationRisk,
    outputMode: baseAnalysis.outputMode,
    expectedVisualClass,
    sequenceBeats,
  });
  const renderingQualityFamily = resolveRenderingQualityFamily({
    normalizedPrompt: baseAnalysis.normalizedPrompt,
    primaryFamily,
    componentFamilies: inheritedFamilies,
    motionType: baseAnalysis.motionType,
    actionKeywords: baseAnalysis.actionKeywords,
    sceneSetting: baseAnalysis.sceneSetting,
  });
  const renderingQualityFloorTier = resolveRenderingQualityFloorTier({
    qualityFloor,
    qualityFamily: renderingQualityFamily,
    projectScope: baseAnalysis.projectScope,
    shotScope: baseAnalysis.shotScope,
  });
  const familyQualityContract = buildFamilyQualityContract({
    qualityFamily: renderingQualityFamily,
  });
  const principleActivationProfile = buildPrincipleActivationProfile({
    qualityFamily: renderingQualityFamily,
    outputMode: baseAnalysis.outputMode,
    stillFrameRequested: baseAnalysis.stillFrameRequested,
  });
  const variationEnvelope = buildVariationEnvelope({
    qualityFamily: renderingQualityFamily,
    subjects: baseAnalysis.subjects,
    sceneSetting: baseAnalysis.sceneSetting,
    variationProfile: baseAnalysis.variationProfile,
    shotScope: baseAnalysis.shotScope,
  });
  const renderingQualityProfile = buildRenderingQualityProfile({
    qualityFamily: renderingQualityFamily,
    qualityFloorTier: renderingQualityFloorTier,
    outputMode: baseAnalysis.outputMode,
    expectedCompletionProfile: baseAnalysis.expectedCompletionProfile,
    executionGuidance,
    shotScope: baseAnalysis.shotScope,
  });
  const renderAcceptanceContract = buildRenderAcceptanceContract({
    outputMode: baseAnalysis.outputMode,
    qualityFamily: renderingQualityFamily,
    familyQualityContract,
    renderingQualityProfile,
    principleActivationProfile,
    executionGuidance,
    expectedCompletionProfile: baseAnalysis.expectedCompletionProfile,
    shotScope: baseAnalysis.shotScope,
  });

  const strengthenedAnalysis = {
    ...baseAnalysis,
    primaryFamily,
    requestKind,
    requestedFrameCount: clampRequestedFrameCount(inheritedFrameFloor),
    concepts: inheritedConcepts,
    componentFamilies: inheritedFamilies,
    expectedVisualClass,
    allowedSubjectFamilies,
    subjectPurityMode,
    shapeConfidence,
    orderedBeats,
    sequenceBeats,
    executionGuidance,
    searchConfidence,
    qualityFloor,
    renderingQualityProfile,
    familyQualityContract,
    principleActivationProfile,
    variationEnvelope,
    renderAcceptanceContract,
    layerPlan,
    cameraPlan,
    humanExpectationRisk,
    expectationLines,
    familyLockLines,
  };
  const subjectBindings = buildStableSubjectBindings({
    subjects: strengthenedAnalysis.subjects,
    previousBindings: strengthenedAnalysis.continuationState?.subjectBindings ?? [],
  });
  const thinkingSystem = buildThinkingSystem({
    analysis: strengthenedAnalysis,
    subjectBindings,
  });
  const executionReadiness = resolveGenerateFramesExecutionReadiness({
    analysis: strengthenedAnalysis,
    thinkingSystem,
  });
  const visibleSubjectCount =
    strengthenedAnalysis.subjects.filter((subject) => subject.type === "character" || subject.type === "object").length;
  const sceneComplexity =
    (strengthenedAnalysis.sceneSetting != null ? 1 : 0) +
    strengthenedAnalysis.sceneDescriptors.length +
    strengthenedAnalysis.sceneProps.length +
    strengthenedAnalysis.sceneElements.length;
  const finalCheapFirstDecision = buildGenerateFramesCheapFirstDecision({
    executionReadiness: executionReadiness.readiness,
    searchConfidence,
    expectationCoverage: strengthenedAnalysis.expectationCoverage,
    shapeConfidence: strengthenedAnalysis.shapeConfidence,
    humanExpectationRisk: strengthenedAnalysis.humanExpectationRisk,
    qualityFamily: strengthenedAnalysis.renderingQualityProfile.family,
    outputMode: strengthenedAnalysis.outputMode,
    projectScope: strengthenedAnalysis.projectScope,
    shotScope: strengthenedAnalysis.shotScope,
    visibleSubjectCount,
    sceneComplexity,
    requestedFrameCount: strengthenedAnalysis.requestedFrameCount,
    orderedBeatCount: strengthenedAnalysis.orderedBeats.length,
    motionType: strengthenedAnalysis.motionType,
  });

  return {
    ...strengthenedAnalysis,
    thinkingSystem,
    cheapFirstDecision: finalCheapFirstDecision,
    executionReadiness: executionReadiness.readiness,
    executionReadinessReason: executionReadiness.reason,
  };
};

export const formatGenerateFramesRuntimeAnalysisForPrompt = (analysis: GenerateFramesRuntimeAnalysis) =>
  [
    "Generate Frames Runtime Analysis:",
    `- Primary family: ${analysis.primaryFamily}`,
    `- Family confidence: ${analysis.familyConfidence}`,
    `- Interaction mode: ${analysis.interactionMode}`,
    `- Project scope: ${analysis.projectScope}`,
    `- Shot scope: ${analysis.shotScope}`,
    `- Component families: ${analysis.componentFamilies.join(" | ") || "(none)"}`,
    `- Request kind: ${analysis.requestKind}`,
    `- Requested frame count: ${analysis.requestedFrameCount}`,
    `- Prompt subject: ${analysis.promptSubject ?? "(unspecified)"}`,
    `- Visual kind: ${analysis.visualKind}`,
    `- Output mode: ${analysis.outputMode}`,
    `- Expected visual class: ${analysis.expectedVisualClass}`,
    `- Allowed subject families: ${analysis.allowedSubjectFamilies.join(" | ") || "(none)"}`,
    `- Subject purity mode: ${analysis.subjectPurityMode}`,
    `- Expected completion profile: ${analysis.expectedCompletionProfile}`,
    `- Expectation coverage: ${analysis.expectationCoverage}`,
    `- Shape confidence: ${analysis.shapeConfidence}`,
    `- Human expectation risk: ${analysis.humanExpectationRisk}`,
    `- Ordered beats: ${analysis.orderedBeats.join(" | ") || "(none)"}`,
    `- Sequence beats: ${analysis.sequenceBeats.map((beat) => `${beat.label}:${beat.explicitness}`).join(" | ") || "(none)"}`,
    `- Variation profile: staging=${analysis.variationProfile.stagingBias}, asymmetry=${analysis.variationProfile.asymmetryBias}, timing=${analysis.variationProfile.timingBias}, silhouette=${analysis.variationProfile.silhouetteBias}`,
    `- Visual expectation tags: ${analysis.visualExpectationTags.join(" | ") || "(none)"}`,
    `- Execution guidance: complexity=${analysis.executionGuidance.complexityLevel}, motion=${analysis.executionGuidance.motionEmphasis}, effect=${analysis.executionGuidance.effectEmphasis}, brevity=${analysis.executionGuidance.brevityPreservationLimit}, add-ons=${analysis.executionGuidance.addOnPolicy}`,
    `- Guidance silhouette/structure: ${[...analysis.executionGuidance.silhouetteGuidance, ...analysis.executionGuidance.structureGuidance].slice(0, 4).join(" | ") || "(none)"}`,
    `- Guidance motion/completion: ${[...analysis.executionGuidance.motionGuidance, ...analysis.executionGuidance.completionGuidance].slice(0, 4).join(" | ") || "(none)"}`,
    `- Guidance anti-patterns: ${analysis.executionGuidance.antiPatternWatchlist.slice(0, 4).join(" | ") || "(none)"}`,
    `- Guidance repair priorities: ${analysis.executionGuidance.repairPriorities.slice(0, 3).join(" | ") || "(none)"}`,
    `- Guidance style principles: ${analysis.executionGuidance.stylePrinciples?.join(" | ") || "(none)"}`,
    `- Search confidence: subject=${analysis.searchConfidence.subject}, motion=${analysis.searchConfidence.motion}, scene=${analysis.searchConfidence.scene}, style=${analysis.searchConfidence.style}, continuity=${analysis.searchConfidence.continuity}, overall=${analysis.searchConfidence.overall}`,
    `- Rendering quality profile: family=${analysis.renderingQualityProfile.family}, floor=${analysis.renderingQualityProfile.qualityFloorTier}, simplicity=${analysis.renderingQualityProfile.simplicityTarget}`,
    `- Rendering quality priorities: ${[...analysis.renderingQualityProfile.forcePriorities, ...analysis.renderingQualityProfile.timingPriorities, ...analysis.renderingQualityProfile.readabilityPriorities].slice(0, 5).join(" | ") || "(none)"}`,
    `- Rendering family contract: must=${analysis.familyQualityContract.mustHaves.slice(0, 4).join(" | ") || "(none)"} / forbid=${analysis.familyQualityContract.forbiddenPatterns.slice(0, 4).join(" | ") || "(none)"}`,
    `- Rendering principles: ${analysis.principleActivationProfile.activations
      .filter((activation) => activation.activationLevel !== "off")
      .slice(0, 5)
      .map((activation) => `${activation.principle}:${activation.activationLevel}`)
      .join(" | ") || "(none)"}`,
    `- Rendering variation envelope: lock=${analysis.variationEnvelope.lockedIdentityTraits.slice(0, 4).join(" | ") || "(none)"} / vary=${analysis.variationEnvelope.allowedVariationAxes.slice(0, 4).join(" | ") || "(none)"}`,
    `- Rendering acceptance contract: must=${analysis.renderAcceptanceContract.requiredMustHaves.slice(0, 4).join(" | ") || "(none)"} / reject=${analysis.renderAcceptanceContract.familyRejectConditions.slice(0, 4).join(" | ") || "(none)"}`,
    `- Layer plan: ${analysis.layerPlan.mode}, preserve=${analysis.layerPlan.preserveExistingContent ? "yes" : "no"}, reason=${analysis.layerPlan.reason ?? "(none)"}`,
    `- Camera plan: ${analysis.cameraPlan.mode}, focus=${analysis.cameraPlan.focusSubjectId ?? "(none)"}, direction=${analysis.cameraPlan.direction ?? "(none)"}`,
    `- Thinking readiness: ${analysis.executionReadiness}${analysis.executionReadinessReason ? ` (${analysis.executionReadinessReason})` : ""}`,
    `- Thinking parse actions/modifiers: ${analysis.thinkingSystem.promptParse.actions.join(" | ") || "(none)"} / ${analysis.thinkingSystem.promptParse.modifiers.join(" | ") || "(none)"}`,
    `- Thinking parse negatives/scope: ${analysis.thinkingSystem.promptParse.negatives.join(" | ") || "(none)"} / ${analysis.thinkingSystem.promptParse.scopeCues.join(" | ") || "(none)"}`,
    `- Thinking clause priority: corrections=${analysis.thinkingSystem.clausePriorityResolution.appliedCorrections.slice(0, 2).join(" | ") || "(none)"} / contradictions=${analysis.thinkingSystem.clausePriorityResolution.contradictions.join(" | ") || "(none)"}`,
    `- Thinking uncertainties: ${analysis.thinkingSystem.promptParse.uncertainties.map((uncertainty) => `${uncertainty.code}:${uncertainty.risk}`).join(" | ") || "(none)"}`,
    `- Thinking intent classification: temporal=${analysis.thinkingSystem.intentClassification.temporalMode}, visual=${analysis.thinkingSystem.intentClassification.visualFamily}, complexity=${analysis.thinkingSystem.intentClassification.complexityTier}`,
    `- Thinking ambiguity/search: ${analysis.thinkingSystem.ambiguityDecision.outcome} / required-search=${analysis.thinkingSystem.searchDecision.searchRequired ? "yes" : "no"} / low=${analysis.thinkingSystem.searchDecision.lowConfidenceDimensions.join(" | ") || "(none)"}`,
    `- Thinking subject focus: ${analysis.thinkingSystem.subjectGraph.activeFocusTargetIds.join(" | ") || "(none)"}`,
    `- Thinking exclusions: ${[...analysis.thinkingSystem.exclusionSet.explicitNegatives, ...analysis.thinkingSystem.exclusionSet.derivedExclusions].slice(0, 5).join(" | ") || "(none)"}`,
    `- Thinking completion contract: ${analysis.thinkingSystem.completionContract.endingRequirements.join(" | ") || "(none)"}`,
    `- Concepts: ${analysis.concepts.join(" | ") || "(none)"}`,
    `- Explicit exclusions: ${analysis.negatedConcepts.join(" | ") || "(none)"}`,
    `- Requested color: ${analysis.requestedColor ?? "(unspecified)"}`,
    `- Motion type: ${analysis.motionType}`,
    `- Action keywords: ${analysis.actionKeywords.join(" | ") || "(none)"}`,
    `- Edit intents: ${analysis.editIntents.join(" | ") || "(none)"}`,
    `- Tone: ${analysis.tone}`,
    `- Force level: ${analysis.forceLevel}`,
    `- Suggested FPS: ${analysis.fps}`,
    `- Goal context: ${analysis.goalContext || "(none)"}`,
    `- Build direction: ${analysis.buildDirection ?? "(none)"}`,
    `- Still/setup frame requested: ${analysis.stillFrameRequested ? "yes" : "no"}`,
    `- Scene setting: ${analysis.sceneSetting ?? "(unspecified)"}`,
    `- Scene descriptors: ${analysis.sceneDescriptors.join(" | ") || "(none)"}`,
    `- Scene props: ${analysis.sceneProps.join(" | ") || "(none)"}`,
    `- Scene elements: ${analysis.sceneElements.join(" | ") || "(none)"}`,
    `- Focus targets: ${analysis.focusTargets.join(" | ") || "(none)"}`,
    `- Subjects: ${
      analysis.subjects.length > 0
        ? analysis.subjects
            .map(
              (subject) =>
                `${subject.role}:${subject.type}:${subject.side}${subject.color ? `:${subject.color}` : ""}${subject.label ? `:${subject.label}` : ""}${
                  subject.details && subject.details.length > 0 ? `:${subject.details.join("&")}` : ""
                }`,
            )
            .join(" | ")
        : "(none)"
    }`,
    `- Modifiers: ${analysis.modifiers.join(" | ") || "(none)"}`,
    `- Recent edits: ${analysis.recentEdits.join(" | ") || "(none)"}`,
    `- No-plan rule: ${analysis.noPlanReason ?? "(none)"}`,
    `- Question gate: ${
      analysis.questionGate.blocker
        ? `question allowed only for this blocker -> ${analysis.questionGate.blocker}`
        : "default to result; do not ask unless a new true blocker appears"
    }`,
    `- Disallowed question topics: ${analysis.questionGate.disallowedTopics.join(" | ") || "(none)"}`,
    ...analysis.familyLockLines.map((line) => `- ${line}`),
    ...analysis.expectationLines.map((line) => `- ${line}`),
  ].join("\n");

const tokenizeMeaningfulPrompt = (normalizedPrompt: string) =>
  unique(
    normalizedPrompt
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2 && !GENERATE_FRAMES_SEARCH_STOPWORDS.has(token)),
  );

const buildLocalCoverageTokenSet = (analysis: GenerateFramesRuntimeAnalysis) => {
  const tokens = new Set<string>();
  const addValue = (value: string | null | undefined) => {
    if (!value) {
      return;
    }

    for (const token of normalizePrompt(value).split(/\s+/)) {
      if (token.length > 2) {
        tokens.add(token);
      }
    }
  };

  addValue(analysis.sceneSetting);
  analysis.sceneDescriptors.forEach(addValue);
  analysis.sceneProps.forEach(addValue);
  analysis.sceneElements.forEach(addValue);
  analysis.focusTargets.forEach(addValue);
  analysis.modifiers.forEach(addValue);
  analysis.subjects.forEach((subject) => {
    addValue(subject.label ?? null);
    (subject.details ?? []).forEach(addValue);
    addValue(subject.color);
    addValue(subject.role);
    addValue(subject.side);
  });
  analysis.concepts.forEach((concept) => addValue(concept.replace(/-/g, " ")));
  analysis.actionKeywords.forEach(addValue);
  addValue(analysis.motionType);
  addValue(analysis.primaryFamily);
  addValue(analysis.goalContext);
  addValue(analysis.buildDirection);
  return tokens;
};

const isIntrinsicLocalToken = (token: string) => LOCAL_INTRINSIC_TOKEN_PATTERN.test(token);

const extractNovelCoverageTokens = (analysis: GenerateFramesRuntimeAnalysis) => {
  const meaningfulTokens = tokenizeMeaningfulPrompt(analysis.normalizedPrompt);
  const coveredTokens = buildLocalCoverageTokenSet(analysis);

  return meaningfulTokens.filter((token) => !coveredTokens.has(token) && !isIntrinsicLocalToken(token));
};

const filterContinuationNovelTokens = (novelTokens: readonly string[]) =>
  novelTokens.filter(
    (token) =>
      !isIntrinsicLocalToken(token) &&
      !["fighter", "fighters", "character", "characters"].includes(token),
  );

const hasOnlyGenericAnimatorSubjects = (analysis: GenerateFramesRuntimeAnalysis) =>
  analysis.subjects
    .filter((subject) => subject.type !== "background")
    .every((subject) => {
      const normalizedLabel = normalizePrompt(subject.label ?? "");
      return (
        normalizedLabel.length === 0 ||
        isGenericSubjectLabel(normalizedLabel) ||
        LOCAL_EXPECTATION_CHARACTER_PATTERN.test(normalizedLabel) ||
        LOCAL_EXPECTATION_OBJECT_PATTERN.test(normalizedLabel)
      );
    });

const canTrustLocalAnimatorKnowledge = ({
  analysis,
  novelTokens,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  novelTokens: readonly string[];
}) => {
  const hasNamedStyleReference = STYLE_REFERENCE_LOOKUP_PATTERN.test(analysis.normalizedPrompt);
  if (hasNamedStyleReference) {
    return false;
  }

  const hasTrustedDeterministicDrafts = (() => {
    const deterministicDrafts = buildGenerateFramesDeterministicDrafts({ analysis });
    if (deterministicDrafts == null || deterministicDrafts.length === 0) {
      return false;
    }

    return validateGenerateFramesDrafts({
      analysis,
      frames: deterministicDrafts,
    }).ok;
  })();

  const genericSubjectsOnly = hasOnlyGenericAnimatorSubjects(analysis);
  const noUnknownScenePressure = !UNUSUAL_SCENE_DESCRIPTOR_PATTERN.test(analysis.normalizedPrompt);
  const basicLocalEffectRequest =
    analysis.outputMode === "animation" &&
    ["explosion", "lightning", "shockwave", "smoke", "impact", "eruption"].includes(analysis.motionType) &&
    LOCAL_ANIMATOR_EFFECT_PATTERN.test(analysis.normalizedPrompt) &&
    novelTokens.length <= 2;
  const basicLocalActionRequest =
    analysis.outputMode === "animation" &&
    (
      ["punch", "kick", "fight", "walk", "run", "jump", "bounce", "roll"].includes(analysis.motionType) ||
      analysis.actionKeywords.some((keyword) => ["breathe", "walk", "run", "jump", "bounce", "roll"].includes(keyword))
    ) &&
    LOCAL_ANIMATOR_ACTION_PATTERN.test(analysis.normalizedPrompt) &&
    genericSubjectsOnly &&
    noUnknownScenePressure &&
    novelTokens.length <= 2;
  const basicLocalStillSceneRequest =
    analysis.outputMode === "still" &&
    (
      analysis.motionType === "scene" ||
      analysis.visualKind === "scene" ||
      analysis.primaryFamily === "background"
    ) &&
    analysis.sceneSetting != null &&
    LOCAL_ANIMATOR_SCENE_PATTERN.test(analysis.normalizedPrompt) &&
    noUnknownScenePressure &&
    novelTokens.length <= 2;
  const groundedLocalStillSubjectRequest =
    analysis.outputMode === "still" &&
    analysis.shapeConfidence === "grounded-local" &&
    analysis.expectationCoverage === "grounded-local" &&
    genericSubjectsOnly &&
    novelTokens.length <= 1;
  const groundedLocalPairedCharacterStillRequest =
    analysis.outputMode === "still" &&
    analysis.interactionMode === "create" &&
    analysis.primaryFamily === "character" &&
    analysis.subjects.filter((subject) => subject.type === "character").length >= 2 &&
    analysis.actionKeywords.length === 0 &&
    analysis.sceneSetting == null &&
    analysis.sceneDescriptors.length === 0 &&
    analysis.sceneProps.length === 0 &&
    analysis.sceneElements.length === 0 &&
    analysis.shapeConfidence === "grounded-local" &&
    analysis.expectationCoverage === "grounded-local" &&
    analysis.humanExpectationRisk !== "high" &&
    novelTokens.length <= 2;
  const groundedLocalCommonEffectRequest =
    analysis.outputMode === "animation" &&
    analysis.interactionMode === "create" &&
    analysis.primaryFamily === "effect" &&
    ["explosion", "lightning", "shockwave", "smoke", "impact", "eruption"].includes(analysis.motionType) &&
    analysis.shapeConfidence === "grounded-local" &&
    analysis.expectationCoverage === "grounded-local" &&
    analysis.humanExpectationRisk !== "high" &&
    !UNUSUAL_SCENE_DESCRIPTOR_PATTERN.test(analysis.normalizedPrompt) &&
    novelTokens.length <= 2;

  if (
    !hasTrustedDeterministicDrafts &&
    !groundedLocalPairedCharacterStillRequest &&
    !groundedLocalCommonEffectRequest
  ) {
    return false;
  }

  return (
    basicLocalEffectRequest ||
    basicLocalActionRequest ||
    basicLocalStillSceneRequest ||
    groundedLocalStillSubjectRequest ||
    groundedLocalPairedCharacterStillRequest ||
    groundedLocalCommonEffectRequest
  );
};

const normalizeGenerateFramesSearchEvidence = (
  searchResults: ReadonlyArray<{ title?: string | null; snippet?: string | null; url?: string | null }>,
) =>
  normalizePrompt(
    searchResults
      .map((result) => `${result.title ?? ""} ${result.snippet ?? ""} ${result.url ?? ""}`.trim())
      .filter((value) => value.length > 0)
      .join(" "),
  );

const resolveGenerateFramesSearchKnowledgeGaps = ({
  analysis,
  searchEvidenceText = "",
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  searchEvidenceText?: string;
}) => {
  const evidence = normalizePrompt(searchEvidenceText);
  const hasEvidence = (pattern: RegExp) => evidence.length > 0 && pattern.test(evidence);
  const gaps: GenerateFramesSearchKnowledgeGap[] = [];
  const createRequest = analysis.interactionMode === "create";
  const backgroundSceneOnly =
    analysis.outputMode === "still" &&
    (analysis.visualKind === "scene" || analysis.primaryFamily === "background") &&
    analysis.subjects.every((subject) => subject.type === "background");
  const needsSceneStaging =
    analysis.visualKind === "scene" ||
    analysis.primaryFamily === "background" ||
    analysis.sceneSetting != null ||
    analysis.sceneDescriptors.length > 0 ||
    analysis.sceneProps.length > 0 ||
    analysis.sceneElements.length > 0 ||
    analysis.componentFamilies.includes("background");

  if (
    createRequest &&
    !backgroundSceneOnly &&
    (
      analysis.promptSubject != null ||
      analysis.subjects.length > 0 ||
      analysis.visualKind !== "scene" ||
      analysis.primaryFamily !== "background"
    ) &&
    !hasEvidence(SEARCH_EVIDENCE_SHAPE_PATTERN)
  ) {
    gaps.push("subject-shape");
  }

  if (
    createRequest &&
    analysis.requestedColor == null &&
    (
      analysis.visualKind === "event" ||
      analysis.primaryFamily === "effect" ||
      analysis.primaryFamily === "object" ||
      analysis.componentFamilies.includes("effect")
    ) &&
    !hasEvidence(SEARCH_EVIDENCE_COLOR_PATTERN)
  ) {
    gaps.push("subject-color");
  }

  if (
    createRequest &&
    (analysis.visualKind === "event" || analysis.primaryFamily === "effect" || analysis.componentFamilies.includes("effect")) &&
    !hasEvidence(SEARCH_EVIDENCE_EFFECT_PATTERN)
  ) {
    gaps.push("subject-effects");
  }

  if (createRequest && analysis.outputMode === "animation" && !hasEvidence(SEARCH_EVIDENCE_MOTION_PATTERN)) {
    gaps.push("motion-phases");
  }

  if (createRequest && needsSceneStaging && !hasEvidence(SEARCH_EVIDENCE_SCENE_PATTERN)) {
    gaps.push("scene-staging");
  }

  if (
    createRequest &&
    (
      analysis.outputMode === "still" ||
      analysis.visualKind === "event" ||
      needsSceneStaging ||
      analysis.subjects.length > 0
    ) &&
    !hasEvidence(SEARCH_EVIDENCE_DRAWING_PATTERN)
  ) {
    gaps.push("drawing-readability");
  }

  return gaps;
};

const resolveMotionPhaseSearchTerms = (analysis: GenerateFramesRuntimeAnalysis) => {
  if (
    analysis.actionKeywords.some((keyword) =>
      ["fight", "punch", "kick", "lunge", "swing", "throw"].includes(keyword),
    )
  ) {
    return "anticipation clash contact follow-through recovery";
  }

  if (analysis.actionKeywords.some((keyword) => ["run", "walk", "jump", "fall", "crawl"].includes(keyword))) {
    return "takeoff contact passing landing recovery";
  }

  if (analysis.actionKeywords.some((keyword) => ["explode", "lightning", "smoke", "impact", "erupt"].includes(keyword))) {
    return "buildup onset peak fallout fade aftermath";
  }

  if (analysis.visualKind === "event") {
    return "buildup onset peak breakup aftermath";
  }

  return "start middle end motion phases";
};

const buildGenerateFramesSearchQueries = (
  analysis: GenerateFramesRuntimeAnalysis,
  missingKnowledge: readonly GenerateFramesSearchKnowledgeGap[] = resolveGenerateFramesSearchKnowledgeGaps({ analysis }),
) => {
  const normalizedSubject = normalizeSearchComponent(
    analysis.promptSubject ??
      analysis.subjects.find((subject) => subject.type !== "background")?.label ??
      analysis.sceneSetting,
  );
  const normalizedAction = normalizeSearchComponent(
    analysis.actionKeywords.length > 0
      ? analysis.actionKeywords.join(" ")
      : analysis.motionType !== "unknown" && analysis.motionType !== "scene"
        ? analysis.motionType
        : analysis.visualKind === "event"
          ? "progression"
          : "",
  );
  const normalizedScene = normalizeSearchComponent(
    [analysis.sceneDescriptors.join(" "), analysis.sceneSetting, analysis.sceneProps.join(" "), analysis.sceneElements.join(" ")]
      .filter(Boolean)
      .join(" "),
  );
  const normalizedTone = normalizeSearchComponent(
    [analysis.tone !== "neutral" ? analysis.tone : "", ...analysis.modifiers].filter(Boolean).join(" "),
  );
  const searchAnchor = normalizedSubject || normalizedAction || normalizeSearchComponent(analysis.primaryFamily);
  const querySet = new Set<string>();
  const addQuery = (...parts: Array<string | null | undefined>) => {
    const query = dedupeSearchQueryTokens(
      parts
        .map((part) => normalizeSearchComponent(part))
        .filter((part) => part.length > 0)
        .join(" ")
        .trim(),
    );
    if (query.length > 0) {
      querySet.add(query);
    }
  };

  addQuery(searchAnchor, normalizedScene, analysis.outputMode === "animation" ? "2d animation reference" : "visual reference");

  if (STYLE_REFERENCE_LOOKUP_PATTERN.test(analysis.normalizedPrompt)) {
    addQuery(searchAnchor, normalizedAction, normalizedScene, "style reference timing staging silhouette");
  }

  if (missingKnowledge.includes("subject-shape")) {
    addQuery(searchAnchor, normalizedScene, "shape silhouette structure proportions");
  }

  if (missingKnowledge.includes("subject-color")) {
    addQuery(searchAnchor, normalizedScene, "color palette visual traits");
  }

  if (missingKnowledge.includes("subject-effects")) {
    addQuery(searchAnchor, normalizedAction, "effects glow smoke debris flash reference");
  }

  if (missingKnowledge.includes("motion-phases")) {
    addQuery(searchAnchor, normalizedAction, "start middle end motion phases");
    addQuery(searchAnchor, normalizedAction, normalizedTone, resolveMotionPhaseSearchTerms(analysis));
    if (analysis.orderedBeats.length > 0) {
      addQuery(searchAnchor, normalizedAction, analysis.orderedBeats.join(" "), "ordered beat reference");
    }
    if (analysis.motionType === "background-scroll") {
      addQuery(searchAnchor, normalizedScene, "side scrolling background camera follow parallax reference");
      addQuery(searchAnchor, normalizedScene, "character anchored screen position environment scrolling reference");
    }
  }

  if (missingKnowledge.includes("scene-staging")) {
    addQuery(searchAnchor, normalizedScene, normalizedTone, "readable silhouette setup composition");
    if (analysis.motionType === "background-scroll") {
      addQuery(searchAnchor, normalizedScene, "neighborhood houses sidewalk fences scrolling background composition");
      addQuery(searchAnchor, normalizedScene, "camera follow illusion background offset wide environment");
    }
  }

  if (missingKnowledge.includes("drawing-readability")) {
    addQuery(searchAnchor, normalizedScene, normalizedAction, "readable drawing silhouette key features proportions");
  }

  return [...querySet].slice(0, 5);
};

export const assessGenerateFramesSearchCoverage = ({
  analysis,
  searchResults,
  localDrafts = [],
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  searchResults: ReadonlyArray<{ title?: string | null; snippet?: string | null; url?: string | null }>;
  localDrafts?: readonly DrawingAiGeneratedFrameDraft[];
}) => {
  const externalEvidence = normalizeGenerateFramesSearchEvidence(searchResults);
  const localEvidence =
    localDrafts.length > 0
      ? normalizePrompt(localDrafts.map((frame) => `${frame.pose} ${frame.description}`).join(" "))
      : "";
  const evidence = normalizePrompt([externalEvidence, localEvidence].filter(Boolean).join(" "));
  const missingKnowledge = resolveGenerateFramesSearchKnowledgeGaps({
    analysis,
    searchEvidenceText: evidence,
  });

  return {
    enough: missingKnowledge.length === 0,
    missingKnowledge,
    refinedQueries: buildGenerateFramesSearchQueries(analysis, missingKnowledge),
    evidence,
  };
};

const getRequiredSearchConfidenceDimensions = (
  analysis: Pick<
    GenerateFramesRuntimeAnalysis,
    | "outputMode"
    | "visualKind"
    | "primaryFamily"
    | "componentFamilies"
    | "motionType"
    | "sceneSetting"
    | "sceneDescriptors"
    | "sceneProps"
    | "sceneElements"
    | "interactionMode"
    | "projectScope"
    | "shotScope"
    | "searchConfidence"
  >,
) => {
  const requiredDimensions: GenerateFramesSearchConfidenceDimension[] = ["subject", "style"];
  if (analysis.outputMode === "animation") {
    requiredDimensions.push("motion");
  }
  if (
    analysis.visualKind === "scene" ||
    analysis.primaryFamily === "background" ||
    analysis.componentFamilies.includes("background") ||
    analysis.motionType === "background-scroll" ||
    analysis.sceneSetting != null ||
    analysis.sceneDescriptors.length > 0 ||
    analysis.sceneProps.length > 0 ||
    analysis.sceneElements.length > 0
  ) {
    requiredDimensions.push("scene");
  }
  if (
    analysis.interactionMode !== "create" ||
    analysis.projectScope === "same-project" ||
    analysis.shotScope !== "create-first-shot"
  ) {
    requiredDimensions.push("continuity");
  }
  return unique(requiredDimensions);
};

const buildLowSearchConfidenceReason = (
  analysis: Pick<
    GenerateFramesRuntimeAnalysis,
    | "outputMode"
    | "visualKind"
    | "primaryFamily"
    | "componentFamilies"
    | "motionType"
    | "sceneSetting"
    | "sceneDescriptors"
    | "sceneProps"
    | "sceneElements"
    | "interactionMode"
    | "projectScope"
    | "shotScope"
    | "searchConfidence"
  >,
) => {
  const lowDimensions = getRequiredSearchConfidenceDimensions(analysis).filter(
    (dimension) => analysis.searchConfidence[dimension] === "low",
  );
  if (lowDimensions.includes("style")) {
    return "The request includes a style or look reference that is not grounded strongly enough locally.";
  }
  if (lowDimensions.includes("continuity")) {
    return "The request depends on same-project continuity that is not anchored strongly enough to trust a no-search guess.";
  }
  if (lowDimensions.includes("scene")) {
    return "The scene or staging details are not grounded strongly enough locally to trust without a targeted reference pass.";
  }
  if (lowDimensions.includes("motion")) {
    return "The motion expectations are not grounded strongly enough locally to trust without a targeted reference pass.";
  }
  return "The subject or visual grounding is not confident enough locally to trust without a targeted reference pass.";
};

export const buildGenerateFramesSearchDecision = ({
  userMessage,
  analysis,
  requestedSearch = false,
}: {
  userMessage: string;
  analysis: GenerateFramesRuntimeAnalysis;
  requestedSearch?: boolean;
}): DrawingAiSearchDecision => {
  const trimmedMessage = userMessage.trim();
  if (!trimmedMessage) {
    return {
      shouldSearch: false,
      reason: null,
      query: null,
      queries: null,
    };
  }

  if (analysis.interactionMode === "discuss") {
    return {
      shouldSearch: false,
      reason: null,
      query: null,
      queries: null,
    };
  }

  if (analysis.executionReadiness === "ask-clarify" || analysis.executionReadiness === "controlled-fail") {
    return {
      shouldSearch: false,
      reason: null,
      query: null,
      queries: null,
    };
  }

  if (EXTERNAL_REFERENCE_PATTERN.test(trimmedMessage)) {
    const queries = buildGenerateFramesSearchQueries(analysis);
    return {
      shouldSearch: true,
      reason: "The user explicitly asked for outside references or inspiration.",
      query: queries[0] ?? trimmedMessage,
      queries: queries.length > 0 ? queries : [trimmedMessage],
    };
  }

  const meaningfulTokens = tokenizeMeaningfulPrompt(analysis.normalizedPrompt);
  const novelTokens = extractNovelCoverageTokens(analysis);
  const namedStyleReference = STYLE_REFERENCE_LOOKUP_PATTERN.test(analysis.normalizedPrompt);
  const requiredSearchConfidenceDimensions = getRequiredSearchConfidenceDimensions(analysis);
  const lowCriticalSearchConfidence = requiredSearchConfidenceDimensions.some(
    (dimension) => analysis.searchConfidence[dimension] === "low",
  );
  const allRequiredSearchConfidenceHigh =
    requiredSearchConfidenceDimensions.length > 0 &&
    requiredSearchConfidenceDimensions.every((dimension) => analysis.searchConfidence[dimension] === "high");
  const obviousRawLocalEffectPrompt =
    !requestedSearch &&
    !namedStyleReference &&
    !SEARCH_WORTHY_MODIFIER_PATTERN.test(analysis.normalizedPrompt) &&
    !UNUSUAL_SCENE_DESCRIPTOR_PATTERN.test(analysis.normalizedPrompt) &&
    /\b(explosion|blast|lightning|bolt|shockwave|smoke)\b/i.test(analysis.normalizedPrompt) &&
    !/\b(stick(?:\s|-)?figure|character|fighter|person|human|robot|tree|fan|box|cave|neighborhood|forest|city|background|scene)\b/i.test(
      analysis.normalizedPrompt,
    );
  const obviousLocalCommonEffectRequest =
    !requestedSearch &&
    analysis.interactionMode === "create" &&
    analysis.outputMode === "animation" &&
    analysis.subjects.length <= 1 &&
    (analysis.subjects.length === 0 || analysis.subjects.every((subject) => subject.type === "effect")) &&
    (
      ["explosion", "lightning", "shockwave", "smoke", "impact", "eruption"].includes(analysis.motionType) ||
      analysis.concepts.some((concept) =>
        ["explosion", "lightning", "shockwave", "smoke", "impact", "eruption"].includes(concept),
      )
    ) &&
    !namedStyleReference &&
    !SEARCH_WORTHY_MODIFIER_PATTERN.test(analysis.normalizedPrompt) &&
    !UNUSUAL_SCENE_DESCRIPTOR_PATTERN.test(analysis.normalizedPrompt) &&
    analysis.sceneSetting == null &&
    analysis.sceneDescriptors.length <= 1 &&
    analysis.sceneProps.length <= 1 &&
    analysis.sceneElements.length <= 1 &&
    novelTokens.length <= 2;
  const obviousLocalLightningRequest =
    !requestedSearch &&
    !namedStyleReference &&
    /\b(lightning|bolt|lightning strike)\b/i.test(analysis.normalizedPrompt) &&
    !SEARCH_WORTHY_MODIFIER_PATTERN.test(analysis.normalizedPrompt) &&
    !UNUSUAL_SCENE_DESCRIPTOR_PATTERN.test(analysis.normalizedPrompt) &&
    analysis.sceneSetting == null &&
    analysis.sceneDescriptors.length <= 1 &&
    analysis.sceneProps.length <= 1 &&
    analysis.sceneElements.length <= 1 &&
    analysis.subjects.every((subject) => subject.type !== "character" && subject.type !== "background") &&
    novelTokens.length <= 2;

  if (obviousRawLocalEffectPrompt || obviousLocalCommonEffectRequest || obviousLocalLightningRequest) {
    return {
      shouldSearch: false,
      reason: null,
      query: null,
      queries: null,
    };
  }

  const continuationAnchored =
    analysis.projectScope === "same-project" ||
    analysis.continuationState != null ||
    analysis.interactionMode !== "create";
  const continuationNovelTokens = continuationAnchored ? filterContinuationNovelTokens(novelTokens) : [];
  const continuationNeedsLookup =
    continuationAnchored &&
    (SEARCH_WORTHY_MODIFIER_PATTERN.test(analysis.normalizedPrompt) ||
      (CONTINUATION_TRANSFORM_PATTERN.test(analysis.normalizedPrompt) && continuationNovelTokens.length > 0) ||
      continuationNovelTokens.length >= 3);
  const coverageScore =
    (continuationAnchored ? 2 : 0) +
    (analysis.motionType !== "unknown" ? 1 : 0) +
    (analysis.subjects.length > 0 ? 1 : 0) +
    (
      analysis.sceneSetting != null ||
      analysis.sceneDescriptors.length > 0 ||
      analysis.sceneProps.length > 0 ||
      analysis.sceneElements.length > 0
        ? 1
        : 0
    ) +
    (novelTokens.length === 0 ? 1 : 0);
  const anchoredEditLooksLocal =
    continuationAnchored &&
    analysis.editIntents.length > 0 &&
    continuationNovelTokens.length <= (CONTINUATION_TRANSFORM_PATTERN.test(analysis.normalizedPrompt) ? 0 : 2);
  const continuationCarryForwardLooksLocal =
    continuationAnchored &&
    analysis.editIntents.length === 0 &&
    continuationNovelTokens.length === 0;
  const anchoredCameraFollowLocal =
    continuationAnchored &&
    analysis.motionType === "background-scroll" &&
    analysis.outputMode === "animation" &&
    analysis.sceneSetting != null &&
    analysis.subjects.some((subject) => subject.type === "character" || subject.type === "object") &&
    analysis.sceneDescriptors.length <= 1 &&
    analysis.sceneProps.length <= 2 &&
    analysis.sceneElements.length <= 1 &&
    continuationNovelTokens.length <= 1 &&
    !namedStyleReference &&
    !SEARCH_WORTHY_MODIFIER_PATTERN.test(analysis.normalizedPrompt) &&
    !UNUSUAL_SCENE_DESCRIPTOR_PATTERN.test(analysis.normalizedPrompt);
  const fullyCoveredLocalSetup =
    !continuationAnchored &&
    analysis.outputMode === "still" &&
    analysis.motionType === "scene" &&
    analysis.sceneSetting != null &&
    analysis.subjects.some((subject) => subject.type === "character" || subject.type === "object") &&
    novelTokens.length <= 1 &&
    analysis.sceneDescriptors.length <= 1 &&
    analysis.sceneProps.length <= 1 &&
    analysis.sceneElements.length <= 1 &&
    analysis.subjects.every(
      (subject) =>
        subject.type === "background" ||
        isGenericSubjectLabel(subject.label) ||
        subject.color != null ||
        (subject.details?.length ?? 0) > 0,
    );
  const fullyCoveredStandaloneObjectSetup =
    !continuationAnchored &&
    analysis.outputMode === "still" &&
    analysis.primaryFamily === "object" &&
    analysis.subjects.length === 1 &&
    analysis.actionKeywords.length === 0 &&
    analysis.sceneSetting == null &&
    analysis.sceneDescriptors.length === 0 &&
    analysis.sceneElements.length === 0 &&
    analysis.requestedFrameCount <= 1 &&
    novelTokens.length <= 1;
  const fullyCoveredStandaloneCharacterSetup =
    !continuationAnchored &&
    analysis.outputMode === "still" &&
    analysis.primaryFamily === "character" &&
    analysis.subjects.length === 1 &&
    analysis.actionKeywords.length === 0 &&
    analysis.sceneSetting == null &&
    analysis.sceneDescriptors.length === 0 &&
    analysis.sceneElements.length === 0 &&
    analysis.requestedFrameCount <= 1 &&
    analysis.shapeConfidence === "grounded-local" &&
    analysis.humanExpectationRisk === "low" &&
    novelTokens.length <= 1;
  const simpleGroundedCharacterAnimationSetup =
    !continuationAnchored &&
    analysis.interactionMode === "create" &&
    analysis.outputMode === "animation" &&
    analysis.primaryFamily === "character" &&
    analysis.subjects.length === 1 &&
    !analysis.componentFamilies.includes("effect") &&
    analysis.sceneSetting == null &&
    analysis.sceneDescriptors.length === 0 &&
    analysis.sceneProps.length === 0 &&
    analysis.sceneElements.length === 0 &&
    analysis.shapeConfidence === "grounded-local" &&
    analysis.expectationCoverage === "grounded-local" &&
    analysis.motionType !== "background-scroll" &&
    analysis.tone === "neutral" &&
    analysis.orderedBeats.length === 0 &&
    analysis.requestedFrameCount <= 10 &&
    analysis.actionKeywords.length === 1 &&
    ["wave", "walk", "run", "breathe"].includes(analysis.actionKeywords[0] ?? "") &&
    novelTokens.length <= 1;
  const localAnimatorKnowledgeIsEnough =
    !continuationAnchored &&
    !namedStyleReference &&
    canTrustLocalAnimatorKnowledge({
      analysis,
      novelTokens,
    });
  const groundedCameraFollowLocal =
    !continuationAnchored &&
    analysis.motionType === "background-scroll" &&
    analysis.outputMode === "animation" &&
    analysis.sceneSetting != null &&
    analysis.shapeConfidence === "grounded-local" &&
    analysis.expectationCoverage === "grounded-local" &&
    analysis.humanExpectationRisk !== "high" &&
    analysis.subjects.some((subject) => subject.type === "character" || subject.type === "object") &&
    analysis.sceneDescriptors.length <= 1 &&
    analysis.sceneProps.length <= 2 &&
    analysis.sceneElements.length <= 1 &&
    novelTokens.length <= 1 &&
    !SEARCH_WORTHY_MODIFIER_PATTERN.test(analysis.normalizedPrompt);
  const familiarLocalEffectNoSearch =
    !continuationAnchored &&
    analysis.interactionMode === "create" &&
    analysis.primaryFamily === "effect" &&
    analysis.outputMode === "animation" &&
    ["explosion", "lightning", "shockwave", "smoke", "impact", "eruption"].includes(analysis.motionType) &&
    analysis.sceneSetting == null &&
    analysis.sceneDescriptors.length === 0 &&
    analysis.sceneProps.length === 0 &&
    analysis.sceneElements.length === 0 &&
    analysis.shapeConfidence !== "needs-reference" &&
    analysis.expectationCoverage !== "needs-reference" &&
    analysis.humanExpectationRisk !== "high" &&
    !namedStyleReference;
  const familiarLocalPairedCharacterNoSearch =
    !continuationAnchored &&
    analysis.interactionMode === "create" &&
    analysis.outputMode === "still" &&
    analysis.primaryFamily === "character" &&
    analysis.subjects.filter((subject) => subject.type === "character").length >= 2 &&
    analysis.actionKeywords.length === 0 &&
    analysis.sceneSetting == null &&
    analysis.sceneDescriptors.length === 0 &&
    analysis.sceneProps.length === 0 &&
    analysis.sceneElements.length === 0 &&
    analysis.shapeConfidence !== "needs-reference" &&
    analysis.expectationCoverage !== "needs-reference" &&
    !namedStyleReference;
  const broaderEnrichmentNeeded =
    !continuationAnchored &&
    analysis.normalizedPrompt.split(/\s+/).filter(Boolean).length >= 10 &&
    BROADER_ENRICHMENT_PATTERN.test(analysis.normalizedPrompt) &&
    (analysis.primaryFamily === "mixed" || analysis.primaryFamily === "character" || analysis.motionType === "scene") &&
    (
      analysis.sceneDescriptors.length >= 2 ||
      analysis.sceneProps.length >= 2 ||
      analysis.sceneElements.length >= 2 ||
      analysis.subjects.filter((subject) => !isGenericSubjectLabel(subject.label)).length >= 2 ||
      analysis.actionKeywords.length >= 2 ||
      novelTokens.length >= 2 ||
      coverageScore < 4
    );
  const broaderScenarioNeedsLookup =
    !continuationAnchored &&
    BROADER_SCENARIO_PATTERN.test(analysis.normalizedPrompt) &&
    (analysis.primaryFamily === "mixed" || analysis.primaryFamily === "character" || analysis.primaryFamily === "background");
  const createModeSearchByDefault =
    analysis.interactionMode === "create" &&
    !continuationAnchored &&
    !fullyCoveredStandaloneObjectSetup &&
    !fullyCoveredStandaloneCharacterSetup &&
    !simpleGroundedCharacterAnimationSetup &&
    !/^no\b|^avoid\b|^don't\b|^do not\b/i.test(trimmedMessage) &&
    (
      analysis.promptSubject != null ||
      analysis.sceneSetting != null ||
      analysis.subjects.length > 0 ||
      analysis.visualKind !== "thing" ||
      analysis.outputMode === "animation"
    );
  const unusualEntityActionCombination =
    !continuationAnchored &&
    analysis.actionKeywords.length > 0 &&
    analysis.subjects.some((subject) => !isGenericSubjectLabel(subject.label)) &&
    novelTokens.length >= 1;
  const underInformedButSearchable =
    analysis.noPlanBlocker === "low-confidence" &&
    !continuationAnchored &&
    meaningfulTokens.length >= 4 &&
    (analysis.sceneDescriptors.length > 0 ||
      analysis.sceneProps.length > 0 ||
      analysis.sceneElements.length > 0 ||
      analysis.primaryFamily === "mixed" ||
      analysis.primaryFamily === "background" ||
      analysis.subjects.length > 0 ||
      novelTokens.length > 0);
  const recognizabilityPressure =
    /\b(recognizable|correct|accurate|readable|believable|real(?:istic)?|look right|proper(?: effect)? layering)\b/i.test(
      analysis.normalizedPrompt,
    );
  const cameraMotionNeedsReference =
    !continuationAnchored &&
    analysis.motionType === "background-scroll" &&
    analysis.outputMode === "animation" &&
    !groundedCameraFollowLocal;
  const visualConfidenceThin =
    !continuationAnchored &&
    (analysis.shapeConfidence === "needs-reference" || analysis.humanExpectationRisk === "high");
  const humanExpectationNeedsReference =
    !continuationAnchored &&
    (analysis.expectationCoverage === "needs-reference" || analysis.shapeConfidence === "needs-reference") &&
    (
      analysis.promptSubject != null ||
      analysis.subjects.length > 0 ||
      analysis.visualKind !== "thing" ||
      analysis.outputMode === "animation"
    );
  if (isFamiliarLocalStillSetupSceneRequest(analysis) && !requestedSearch) {
    return {
      shouldSearch: false,
      reason: null,
      query: null,
      queries: null,
    };
  }
  const readinessForcesSearch = analysis.executionReadiness === "ready-search";
  const requiresReferenceLookup =
    analysis.familyConfidence === "low" ||
    humanExpectationNeedsReference ||
    visualConfidenceThin ||
    recognizabilityPressure ||
    cameraMotionNeedsReference ||
    SEARCH_WORTHY_MODIFIER_PATTERN.test(analysis.normalizedPrompt) ||
    broaderEnrichmentNeeded ||
    broaderScenarioNeedsLookup ||
    (createModeSearchByDefault && !localAnimatorKnowledgeIsEnough) ||
    unusualEntityActionCombination ||
    underInformedButSearchable ||
    coverageScore < 3 ||
    (analysis.motionType === "scene" &&
      !continuationAnchored &&
      (UNUSUAL_SCENE_DESCRIPTOR_PATTERN.test(analysis.normalizedPrompt) || novelTokens.length >= 2));

  if (readinessForcesSearch) {
    const queries = buildGenerateFramesSearchQueries(analysis);
    return {
      shouldSearch: true,
      reason:
        analysis.executionReadinessReason ??
        buildLowSearchConfidenceReason(analysis),
      query: queries[0] ?? trimmedMessage,
      queries: queries.length > 0 ? queries : [trimmedMessage],
    };
  }

  if (namedStyleReference) {
    const queries = [trimmedMessage, ...buildGenerateFramesSearchQueries(analysis)].filter(
      (query, index, items) => query.length > 0 && items.indexOf(query) === index,
    );
    return {
      shouldSearch: true,
      reason: "The prompt references a named style or look, so the system should fill only the missing style knowledge before drafting.",
      query: queries[0] ?? trimmedMessage,
      queries,
    };
  }

  if (continuationAnchored && anchoredEditLooksLocal && !continuationNeedsLookup && !requestedSearch) {
    return {
      shouldSearch: false,
      reason: null,
      query: null,
      queries: null,
    };
  }

  if (continuationCarryForwardLooksLocal && !continuationNeedsLookup && !requestedSearch) {
    return {
      shouldSearch: false,
      reason: null,
      query: null,
      queries: null,
    };
  }

  if (anchoredCameraFollowLocal && !continuationNeedsLookup && !requestedSearch) {
    return {
      shouldSearch: false,
      reason: null,
      query: null,
      queries: null,
    };
  }

  if (lowCriticalSearchConfidence) {
    const queries = buildGenerateFramesSearchQueries(analysis);
    return {
      shouldSearch: true,
      reason: buildLowSearchConfidenceReason(analysis),
      query: queries[0] ?? trimmedMessage,
      queries: queries.length > 0 ? queries : [trimmedMessage],
    };
  }

  if (allRequiredSearchConfidenceHigh && !requestedSearch) {
    return {
      shouldSearch: false,
      reason: null,
      query: null,
      queries: null,
    };
  }

  if (localAnimatorKnowledgeIsEnough) {
    return {
      shouldSearch: false,
      reason: null,
      query: null,
      queries: null,
    };
  }

  if (fullyCoveredLocalSetup && !requestedSearch) {
    return {
      shouldSearch: false,
      reason: null,
      query: null,
      queries: null,
    };
  }

  if (fullyCoveredStandaloneObjectSetup && !requestedSearch) {
    return {
      shouldSearch: false,
      reason: null,
      query: null,
      queries: null,
    };
  }

  if (fullyCoveredStandaloneCharacterSetup && !requestedSearch) {
    return {
      shouldSearch: false,
      reason: null,
      query: null,
      queries: null,
    };
  }

  if (simpleGroundedCharacterAnimationSetup && !requestedSearch) {
    return {
      shouldSearch: false,
      reason: null,
      query: null,
      queries: null,
    };
  }

  if (groundedCameraFollowLocal && !requestedSearch) {
    return {
      shouldSearch: false,
      reason: null,
      query: null,
      queries: null,
    };
  }

  if ((familiarLocalEffectNoSearch || familiarLocalPairedCharacterNoSearch) && !requestedSearch) {
    return {
      shouldSearch: false,
      reason: null,
      query: null,
      queries: null,
    };
  }

  if (
    (coverageScore >= 4 &&
      novelTokens.length <= 1 &&
      !broaderEnrichmentNeeded &&
      !broaderScenarioNeedsLookup &&
      !unusualEntityActionCombination &&
      !underInformedButSearchable &&
      !SEARCH_WORTHY_MODIFIER_PATTERN.test(analysis.normalizedPrompt) &&
      !requestedSearch) ||
    (!requiresReferenceLookup && !broaderEnrichmentNeeded && !broaderScenarioNeedsLookup && !requestedSearch) ||
    (!requiresReferenceLookup && !broaderEnrichmentNeeded && !broaderScenarioNeedsLookup && requestedSearch)
  ) {
    return {
      shouldSearch: false,
      reason: null,
      query: null,
      queries: null,
    };
  }

  const queries = buildGenerateFramesSearchQueries(analysis);
  return {
    shouldSearch: true,
    reason: underInformedButSearchable
      ? "The request is specific enough to be worth one enrichment pass, but the local runtime is not confident enough to answer without guessing."
      : visualConfidenceThin || recognizabilityPressure
        ? "The request needs stronger visual grounding so the result matches human expectations instead of guessing at shape, motion, or appearance."
      : cameraMotionNeedsReference
        ? "The request needs camera-follow and moving-background grounding so the environment motion reads like travel instead of a static or treadmill scene."
      : createModeSearchByDefault
        ? "This is a new visual generation request, so the system should ground subject shape, color, structure, and motion expectations before drafting instead of guessing from a familiar keyword."
      : broaderEnrichmentNeeded
        ? "The request is a broader composed scene or character setup that needs one enrichment pass before generation."
        : broaderScenarioNeedsLookup
          ? "The request describes a broader world-scale scenario that is safer to ground with one enrichment pass before generation."
        : unusualEntityActionCombination
          ? "The request combines unusual subjects and actions that are only partially grounded locally, so one enrichment pass is safer than guessing."
      : humanExpectationNeedsReference
        ? "The request needs one grounding pass on subject shape, appearance, or motion expectations before the system should trust a locally inferred result."
        : "The request includes scene, subject, or modifier details that are not covered strongly enough by the local Generate Frames runtime alone.",
    query: queries[0] ?? trimmedMessage,
    queries: queries.length > 0 ? queries : [trimmedMessage],
  };
};

const aggregateDraftText = (frames: readonly DrawingAiGeneratedFrameDraft[]) =>
  normalizePrompt(frames.map((frame) => `${frame.pose} ${frame.description}`).join(" "));

const hasAnyCue = (text: string, pattern: RegExp) => pattern.test(text);

const stripNegatedDriftPhrases = (text: string) =>
  text
    .replace(
      /\b(no|without)\s+(?:any\s+)?(?:unsolicited\s+)?(?:stick(?:\s|-)?figure|character|person|human|face|eyes?|mouth|arms?|legs?|hands?|feet|limbs?|creature|humanoid)(?:\s+drift)?\b/g,
      "",
    )
    .replace(/\b(no|without)\s+surprise\s+character\b/g, "");

const validateStrictSubjectPurity = ({
  analysis,
  aggregate,
  driftCheckText,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  aggregate: string;
  driftCheckText: string;
}) => {
  const hasCharacterDrift = HUMANOID_DRIFT_PATTERN.test(driftCheckText);
  const hasObjectDrift = OBJECT_VISUAL_PATTERN.test(driftCheckText);
  const hasEffectDrift = EFFECT_VISUAL_PATTERN.test(driftCheckText);

  if (analysis.subjectPurityMode === "strict-effect-only") {
    if (hasCharacterDrift) {
      return "Effect-only output introduced an unrelated character or humanoid subject.";
    }
    if (hasObjectDrift) {
      return "Effect-only output introduced an unrelated object subject.";
    }
  }

  if (analysis.subjectPurityMode === "strict-scene-only") {
    if (hasCharacterDrift) {
      return "Scene-only output introduced an unsolicited foreground character.";
    }
    if (hasEffectDrift) {
      return "Scene-only output introduced an unsolicited event or effect.";
    }
  }

  if (analysis.subjectPurityMode === "strict-single-subject") {
    const primaryVisibleSubject =
      analysis.subjects.find((subject) => subject.type === "character" || subject.type === "object") ?? null;
    if (primaryVisibleSubject?.type === "character" && EXTRA_ACTOR_PATTERN.test(driftCheckText)) {
      return "Single-subject character output introduced an extra actor the user did not request.";
    }
    if (primaryVisibleSubject?.type === "object" && hasCharacterDrift) {
      return "Single-object output introduced an unrelated character or humanoid subject.";
    }
    if (
      primaryVisibleSubject?.type === "character" &&
      !analysis.componentFamilies.includes("effect") &&
      !analysis.componentFamilies.includes("background") &&
      hasEffectDrift &&
      analysis.outputMode === "still"
    ) {
      return "Single-subject character output introduced an unrelated effect.";
    }
  }

  if (analysis.visualExpectationTags.includes("no-face-unless-asked") && FACIAL_FEATURE_DRIFT_PATTERN.test(aggregate)) {
    return "Stick figure output introduced facial features that were not requested.";
  }

  return null;
};

const validateFallbackSpecificity = ({
  analysis,
  frames,
  aggregate,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  frames: readonly DrawingAiGeneratedFrameDraft[];
  aggregate: string;
}) => {
  const primaryVisibleSubject =
    analysis.subjects.find((subject) => subject.type !== "background") ??
    analysis.subjects[0] ??
    null;
  const subjectLabel = normalizePrompt(primaryVisibleSubject?.label ?? analysis.promptSubject ?? "");
  const identityKeywords = extractSubjectIdentityKeywords(subjectLabel);

  if (
    analysis.interactionMode === "create" &&
    analysis.subjectPurityMode !== "mixed-allowed" &&
    identityKeywords.length > 0 &&
    !new RegExp(`\\b(?:${identityKeywords.map(escapeRegex).join("|")})\\b`, "i").test(aggregate)
  ) {
    return "The output fell back to generic subject wording instead of keeping the requested visual identity.";
  }

  const nonInterpolationPoseRoots = frames
    .map((frame) => normalizePrompt(frame.pose))
    .filter((pose) => pose.length > 0 && !pose.includes(" to "));
  if (
    analysis.outputMode === "animation" &&
    nonInterpolationPoseRoots.length >= 4 &&
    new Set(nonInterpolationPoseRoots).size <= 2
  ) {
    return "The animation collapsed into repeated fallback beats instead of a distinct readable progression.";
  }

  if (
    analysis.interactionMode === "create" &&
    analysis.subjectPurityMode !== "mixed-allowed" &&
    GENERIC_FALLBACK_LABEL_PATTERN.test(aggregate) &&
    (identityKeywords.length === 0 ||
      !new RegExp(`\\b(?:${identityKeywords.map(escapeRegex).join("|")})\\b`, "i").test(aggregate)) &&
    !analysis.subjects.some((subject) => isGenericSubjectLabel(subject.label))
  ) {
    return "The output stayed too generic and did not resolve to the requested subject cleanly enough.";
  }

  return null;
};

const validateExpectedVisualClass = ({
  analysis,
  aggregate,
  frames,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  aggregate: string;
  frames: readonly DrawingAiGeneratedFrameDraft[];
}) => {
  if (analysis.expectedVisualClass === "still-object") {
    if (frames.length > 1) {
      return "Still-object output should resolve as one readable held frame instead of an animation sequence.";
    }
    if (
      /\b(scene|background|environment|composition|foreground|midground|depth planes?|action lane)\b/.test(aggregate) &&
      !/\b(background|backdrop|environment|scene|setting|landscape)\b/.test(analysis.normalizedPrompt)
    ) {
      return "Still-object output drifted into scene composition language instead of staying focused on the requested single object.";
    }
    if (/\b(run|walk|jump|punch|kick|explode|explosion|lightning|strike|smoke|shockwave)\b/.test(aggregate)) {
      return "Still-object output drifted into action or event behavior instead of a readable held object frame.";
    }
  }

  if (analysis.expectedVisualClass === "still-scene") {
    if (!/\b(background|scene|environment|composition|depth|foreground|midground|background)\b/.test(aggregate)) {
      return "Still-scene output needs a readable environment-led composition instead of a floating subject placeholder.";
    }
    if (/\b(punch|kick|jump|strike|explosion|lightning|smoke)\b/.test(aggregate) && analysis.allowedSubjectFamilies.length === 1) {
      return "Still-scene output drifted into action or event behavior the user did not request.";
    }
  }

  if (analysis.expectedVisualClass === "event-animation" && !/\b(explosion|blast|fireball|lightning|bolt|shockwave|smoke|dust|debris|flash|eruption|impact)\b/.test(aggregate)) {
    return "Event-animation output lost the named event or effect family and became too object-like or generic.";
  }

  if (analysis.expectedVisualClass === "action-animation" && analysis.motionType !== "scene") {
    if (!/\b(anticipation|wind[- ]?up|launch|contact|impact|follow[- ]?through|recover|recovery|settle|landing|guard|stance|step|pass(?:ing)?)\b/.test(aggregate)) {
      return "Action animation output needs readable movement beats instead of generic motion wording.";
    }
  }

  return null;
};

const validateRecognizableAppearance = ({
  analysis,
  aggregate,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  aggregate: string;
}) => {
  const subjectLabelText = normalizePrompt(
    [analysis.promptSubject, ...analysis.subjects.map((subject) => subject.label ?? null)].filter(Boolean).join(" "),
  );

  if (/\btree\b/.test(subjectLabelText) && !/\b(trunk|canopy|branches?|leaves?|foliage)\b/.test(aggregate)) {
    return "Tree output needs a readable trunk-and-canopy structure instead of an unreadable blob.";
  }
  if (/\bfan|propeller\b/.test(subjectLabelText) && !/\b(hub|blades?|stand|cage|housing)\b/.test(aggregate)) {
    return "Fan output needs a readable hub, blades, and stand or housing instead of a vague circle.";
  }
  if (/\bbox|crate|block|square|rectangle\b/.test(subjectLabelText) && !/\b(edges?|planes?|corners?|faces?|box[- ]like)\b/.test(aggregate)) {
    return "Box-like output needs readable planes and edges instead of a flat generic shape.";
  }
  if (/\brobot|android|mech\b/.test(subjectLabelText) && !/\b(mechanical|joint|panel|torso|limbs?|blocky)\b/.test(aggregate)) {
    return "Robot output needs readable mechanical structure instead of a generic person substitute.";
  }
  if (/\bstick(?:\s|-)?figure\b/.test(subjectLabelText) && !/\b(solid head|head|torso|arms?|legs?|limbs?|stick proportions?)\b/.test(aggregate)) {
    return "Stick figure output needs a readable solid-head stick figure structure instead of a vague symbol.";
  }
  if ((analysis.motionType === "lightning" || /\blightning|bolt\b/.test(subjectLabelText)) && !/\b(zigzag|branch|taper|electric core|bright core|sharp)\b/.test(aggregate)) {
    return "Lightning output needs a sharp branching electric shape instead of generic marks.";
  }
  if ((analysis.motionType === "explosion" || /\bexplosion|blast|fireball\b/.test(subjectLabelText)) && !/\b(core|shell|blast|smoke|debris|breakup|outward)\b/.test(aggregate)) {
    return "Explosion output needs a readable blast family with a core, outer shell, and aftermath instead of a weak pop.";
  }

  return null;
};

const validateHumanExpectationQuality = ({
  analysis,
  aggregate,
  frames,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  aggregate: string;
  frames: readonly DrawingAiGeneratedFrameDraft[];
}) => {
  const byFrame = frames.map((frame) => normalizePrompt(`${frame.pose} ${frame.description}`));
  const endingText = byFrame.slice(Math.max(0, byFrame.length - 2)).join(" ");
  const finalFrameText = byFrame.at(-1) ?? "";
  const peakWindowText = byFrame
    .slice(Math.max(1, Math.floor(byFrame.length * 0.25)), Math.max(3, Math.ceil(byFrame.length * 0.7)))
    .join(" ");
  const requestedActorCount = analysis.subjects.filter((subject) => subject.type === "character" || subject.type === "object").length;
  const needsOpponentReaction =
    requestedActorCount >= 2 &&
    (
      analysis.motionType === "fight" ||
      analysis.concepts.includes("punch") ||
      analysis.concepts.includes("kick") ||
      /\b(fight|fighting|punch|kick|strike|attack)\b/.test(analysis.normalizedPrompt)
    );

  if (analysis.motionType === "punch" && !/\b(torso|shoulder|hip|balance|guard|readable striking limb)\b/.test(aggregate)) {
    return "Punch output still feels too weak or arm-only; it needs readable whole-body mechanics and balance.";
  }
  if (analysis.motionType === "kick" && !/\b(hip|support|balance|chamber|leg path|retraction)\b/.test(aggregate)) {
    return "Kick output still feels too stiff or broken; it needs readable support, hip turn, and leg recovery.";
  }
  if (analysis.actionKeywords.includes("breathe") && !/\b(shoulders?|ribcage|chest|torso|inhale|exhale|rhythm)\b/.test(aggregate)) {
    return "Breathing output needs visible inhale-exhale rhythm instead of a generic idle pose.";
  }
  if (analysis.actionKeywords.includes("jump") && !/\b(crouch|launch|peak|airborne|landing|land|settle|recover)\b/.test(aggregate)) {
    return "Jump command chain needs crouch, launch, peak, land, and settle coverage instead of a disconnected motion summary.";
  }
  if (analysis.motionType === "explosion") {
    if (WEAK_EXPLOSION_PATTERN.test(aggregate)) {
      return "Explosion output still reads like a tiny pop or firecracker instead of a forceful blast event.";
    }
    if (!/\b(expand|expansion|outward|spread|surge|rupture|blast|peak spread|wider|larger|violent)\b/.test(peakWindowText)) {
      return "Explosion output still feels too small or static; it needs a stronger outward scale progression before the breakup.";
    }
    if (!/\b(breakup|break apart|fragment|debris|shards|fallout|outer shell tears|torn fire)\b/.test(aggregate)) {
      return "Explosion output still feels too intact; it needs readable breakup and fragment fallout after the peak.";
    }
    if (
      /\b(peak|blast|burst|release|expanding|growing|surging)\b/.test(finalFrameText) &&
      !/\b(smoke|aftermath|fade|thin out|dissipat|disintegrat|dust|settle|residue|embers)\b/.test(finalFrameText)
    ) {
      return "Explosion output still ends too early; the last frame must resolve into residue or disintegration, not another active blast.";
    }
  }
  if (analysis.expectedVisualClass === "event-animation" && !/\b(readable|clear|separate|distinct)\b/.test(aggregate)) {
    return "Event output still feels too generic; it needs clearer readable shape and timing language.";
  }
  if (analysis.humanExpectationRisk === "high" && /\b(vague|generic|thing|event|subject)\b/.test(aggregate)) {
    return "High-risk output stayed generic instead of resolving to the requested readable result.";
  }
  if (
    needsOpponentReaction &&
    !/\b(defender|target|opponent|recoil|recoils?|stagger|staggers?|stumble|stumbles?|flinch|flinches?|react|reacts?|snap(?:s|ping)? back)\b/.test(
      aggregate,
    )
  ) {
    return "Multi-actor action output needs a readable attacker-target reaction instead of both figures moving generically.";
  }
  if (
    analysis.orderedBeats.length >= 3 &&
    /\b(guard|landing)\b/.test(analysis.orderedBeats.join(" ")) &&
    !/\b(guard|landing|recover|settle)\b/.test(endingText)
  ) {
    return "Ordered action output still ends weakly instead of resolving into a readable finish.";
  }

  return null;
};

const buildGenerateFramesValidationFailure = (
  category: GenerateFramesValidationFailureCategory,
  reason: string,
): GenerateFramesValidationFailure => ({
  category,
  reason,
});

const buildValidationPhrasePattern = (value: string) => {
  return buildSubjectReferencePattern(value, "i");
};

const resolveValidationSubjectDescriptor = (subject: DrawingAiGenerateFramesStateSubject) => {
  const label = normalizeSubjectEntityLabel(subject.label ?? "");
  if (label.length > 0 && !isGenericSubjectLabel(label)) {
    return label;
  }
  if (subject.color && (subject.side === "left" || subject.side === "right")) {
    return `${subject.color} ${subject.side} subject`;
  }
  if (subject.color) {
    return `${subject.color} subject`;
  }
  if (subject.side === "left" || subject.side === "right") {
    return `${subject.side}-side subject`;
  }
  if (subject.role !== "primary" && subject.role !== "secondary" && subject.role !== "background") {
    return subject.role;
  }
  return "subject";
};

const resolveReferencedContinuationSubjects = (analysis: GenerateFramesRuntimeAnalysis) => {
  const continuationBindings = resolveStateSubjectBindings(analysis.continuationState);
  return analysis.subjects.filter((subject) => {
    if (subject.type === "background") {
      return false;
    }

    const candidates = buildSubjectPromptReferenceCandidates({
      subject,
      subjectBindings: continuationBindings,
    });
    return candidates.some((candidate) => buildValidationPhrasePattern(candidate)?.test(analysis.normalizedPrompt));
  });
};

const resolveSubjectAggregatePatterns = ({
  subject,
  subjectBindings,
}: {
  subject: DrawingAiGenerateFramesStateSubject;
  subjectBindings: readonly DrawingAiSubjectBinding[];
}) => {
  const patterns: RegExp[] = [];
  const pushPattern = (pattern: RegExp | null) => {
    if (pattern == null) {
      return;
    }
    if (patterns.some((existing) => existing.source === pattern.source && existing.flags === pattern.flags)) {
      return;
    }
    patterns.push(pattern);
  };

  if (subject.color) {
    pushPattern(new RegExp(`\\b${escapeRegex(subject.color)}\\b`, "i"));
  }

  if (subject.side === "left" || subject.side === "right") {
    pushPattern(new RegExp(`\\b${subject.side}\\b`, "i"));
  }

  pushPattern(resolveRoleValidationPattern(subject.role));

  const normalizedLabel = normalizeSubjectEntityLabel(subject.label ?? "");
  if (normalizedLabel.length > 0 && !isGenericSubjectLabel(normalizedLabel)) {
    const labelKeywords = extractSubjectIdentityKeywords(normalizedLabel);
    if (labelKeywords.length > 0) {
      pushPattern(new RegExp(`\\b(?:${labelKeywords.map(escapeRegex).join("|")})\\b`, "i"));
    }
  }

  for (const binding of subjectBindings) {
    if (binding.subjectId !== subject.id) {
      continue;
    }
    pushPattern(buildValidationPhrasePattern(binding.alias));
  }

  return patterns;
};

const resolveSimplePromptOverbuildPattern = (analysis: GenerateFramesRuntimeAnalysis) => {
  if (analysis.outputMode === "still") {
    return /\b(then|after that|next beat|sequence|combo|counterattack|camera (?:pan|tilt|zoom|orbit)|montage|slow motion|slow-motion)\b/i;
  }

  if (
    analysis.executionGuidance.brevityPreservationLimit === "strict" &&
    analysis.sequenceBeats.length <= 3 &&
    !/\b(combo|sequence|then|after that|followed by|before finishing)\b/i.test(analysis.normalizedPrompt)
  ) {
    return /\b(camera (?:pan|tilt|zoom|orbit)|montage|slow motion|slow-motion|counterattack|dramatic faceoff|cinematic)\b/i;
  }

  return null;
};

const resolveMinimumQualityFloorFrameCount = (analysis: GenerateFramesRuntimeAnalysis) => {
  switch (analysis.expectedCompletionProfile) {
    case "explosion-complete":
    case "lightning-vanish":
    case "fight-resolve":
    case "scene-scroll":
      return 4;
    case "strike-recover":
    case "kick-recover":
    case "jump-land":
    case "walk-cycle":
    case "run-cycle":
    case "breathing-loop":
    case "generic-action-complete":
      return 3;
    case "smoke-dissipate":
      return 3;
    case "none":
    default:
      return analysis.outputMode === "animation" ? 2 : 1;
  }
};

const resolveRoleValidationPattern = (role: DrawingAiGenerateFramesStateSubject["role"]) => {
  switch (role) {
    case "attacker":
      return /\b(attacker|striker|lead attacker)\b/i;
    case "defender":
      return /\b(defender|opponent|target)\b/i;
    case "runner":
      return /\b(runner|walking figure|running figure|walker)\b/i;
    case "target":
      return /\b(target|defender|opponent)\b/i;
    default:
      return null;
  }
};

const resolveSequenceBeatValidationPattern = (beat: DrawingAiExecutionBeat) => {
  const beatKey = normalizePrompt(`${beat.id} ${beat.label}`);

  if (/right hand projectile|right-hand-projectile/.test(beatKey)) {
    return /\bright\b[\s\S]{0,24}\b(fireball|projectile|energy ball|orb|blast)\b|\b(fireball|projectile|energy ball|orb|blast)\b[\s\S]{0,24}\bright\b/i;
  }
  if (/left hand projectile|left-hand-projectile/.test(beatKey)) {
    return /\bleft\b[\s\S]{0,24}\b(fireball|projectile|energy ball|orb|blast)\b|\b(fireball|projectile|energy ball|orb|blast)\b[\s\S]{0,24}\bleft\b/i;
  }
  if (/airborne projectile|airborne-projectile/.test(beatKey)) {
    return /\b(airborne|midair|mid-air|in the air|jump|launch)\b[\s\S]{0,24}\b(fireball|projectile|energy ball|orb|blast)\b|\b(fireball|projectile|energy ball|orb|blast)\b[\s\S]{0,24}\b(airborne|midair|mid-air|in the air|jump|launch)\b/i;
  }
  if (/projectile/.test(beatKey)) {
    return /\b(projectile|fireball|energy ball|orb|blast)\b/i;
  }
  if (/spin/.test(beatKey)) {
    return /\b(spin|turn|tornado)\b/i;
  }
  if (/jump/.test(beatKey)) {
    return /\b(jump|launch|airborne|leap|vault)\b/i;
  }
  if (/landing|land/.test(beatKey)) {
    return /\b(landing|land|settle)\b/i;
  }
  if (/flash/.test(beatKey)) {
    return /\b(flash|bright flash|contact flash)\b/i;
  }
  if (/aftermath|resolve|recovery|recover|dissipate|vanish|end state|settle/.test(beatKey)) {
    return /\b(aftermath|recovery|recover|settle|fade|residue|guard|landing|dissipat|disintegrat|smoke|dust|pause|vanish|collapse|end state|resolved)\b/i;
  }
  if (/buildup|setup|faceoff|source|movement start|inhale/.test(beatKey) || beat.completionRole === "setup") {
    return /\b(setup|build|buildup|prepare|anticipation|wind[- ]?up|source|inhale|ready|faceoff|movement start|compress|charge)\b/i;
  }
  if (/travel|passing/.test(beatKey) || beat.completionRole === "transition") {
    return /\b(travel|moving|scroll|passing|transition|weight transfer|offset)\b/i;
  }
  if (/contact|strike/.test(beatKey) || beat.completionRole === "contact") {
    return /\b(contact|impact|hit|strike|kick|punch|clash|flash)\b/i;
  }
  if (beat.completionRole === "action") {
    return /\b(action|blast|jump|launch|expand|strike|move|travel|projectile|inhale|spread)\b/i;
  }

  return null;
};

const resolvePrimaryEffectCorePattern = (analysis: GenerateFramesRuntimeAnalysis) => {
  if (analysis.motionType === "explosion" || analysis.concepts.includes("explosion")) {
    return /\b(explosion|blast|fireball|burst|core|shell)\b/i;
  }
  if (analysis.motionType === "lightning" || analysis.concepts.includes("lightning")) {
    return /\b(lightning|bolt|electric|zigzag|branch|strike)\b/i;
  }
  if (analysis.motionType === "shockwave" || analysis.concepts.includes("shockwave")) {
    return /\b(shockwave|blast ring|ring|outward)\b/i;
  }
  if (analysis.motionType === "smoke") {
    return /\b(smoke|plume|cloud|wisps?)\b/i;
  }

  return EFFECT_VISUAL_PATTERN;
};

const validateExplicitSequenceBeatOrder = ({
  analysis,
  byFrame,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  byFrame: readonly string[];
}): GenerateFramesValidationFailure | null => {
  const explicitBeats = analysis.sequenceBeats.filter((beat) => beat.explicitness === "explicit");
  if (explicitBeats.length < 2) {
    return null;
  }

  let lastMatchedFrameIndex = -1;
  let matchedExplicitBeats = 0;
  for (const beat of explicitBeats) {
    const pattern = resolveSequenceBeatValidationPattern(beat);
    if (pattern == null) {
      continue;
    }

    const matchedFrameIndex = byFrame.findIndex((frameText, frameIndex) => frameIndex > lastMatchedFrameIndex && pattern.test(frameText));
    if (matchedFrameIndex === -1) {
      return buildGenerateFramesValidationFailure(
        "completion",
        `The output lost or reordered the explicit ${beat.label.toLowerCase()} beat.`,
      );
    }

    matchedExplicitBeats += 1;
    lastMatchedFrameIndex = matchedFrameIndex;
  }

  return matchedExplicitBeats >= 2 ? null : null;
};

const validateCriticalTargetingAndContinuity = ({
  analysis,
  aggregate,
  driftCheckText,
  byFrame,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  aggregate: string;
  driftCheckText: string;
  byFrame: readonly string[];
}): GenerateFramesValidationFailure | null => {
  if (
    (analysis.shotScope === "tweak-current-shot" || analysis.shotScope === "continue-current-shot") &&
    SCENE_RESET_PATTERN.test(aggregate)
  ) {
    return buildGenerateFramesValidationFailure(
      "continuity",
      "Same-project output reset the scene or subject instead of preserving the current shot.",
    );
  }

  if (
    analysis.projectScope === "same-project" &&
    (analysis.shotScope === "tweak-current-shot" ||
      analysis.shotScope === "continue-current-shot" ||
      (analysis.shotScope === "new-shot-same-project" && CURRENT_SUBJECT_REFERENCE_PATTERN.test(analysis.normalizedPrompt))) &&
    RESET_IDENTITY_PATTERN.test(aggregate)
  ) {
    return buildGenerateFramesValidationFailure(
      "continuity",
      "Same-project output replaced the current subject or cast instead of staying anchored to the existing project.",
    );
  }

  const explicitSequenceFailure = validateExplicitSequenceBeatOrder({
    analysis,
    byFrame,
  });
  if (explicitSequenceFailure != null) {
    return explicitSequenceFailure;
  }

  const visibleSubjects = analysis.subjects.filter((subject) => subject.type !== "background");
  const singleSubjectExpected =
    visibleSubjects.length <= 1 &&
    !/\b(two|2|both|pair|versus|vs\.?|against|another|second|opponent|target|defender|attacker)\b/i.test(
      analysis.normalizedPrompt,
    );
  if (singleSubjectExpected && EXTRA_SUBJECT_INSERTION_PATTERN.test(driftCheckText)) {
    return buildGenerateFramesValidationFailure(
      "critical-targeting",
      "The output introduced extra subjects the prompt did not request.",
    );
  }

  const distinctRequestedColors = unique(
    visibleSubjects
      .map((subject) => normalizePrompt(subject.color ?? ""))
      .filter((color): color is string => color.length > 0),
  );
  const promptMentionsAnyRequestedColor = distinctRequestedColors.some((color) =>
    new RegExp(`\\b${escapeRegex(color)}\\b`, "i").test(analysis.normalizedPrompt),
  );
  if (visibleSubjects.length >= 2 && distinctRequestedColors.length >= 2 && promptMentionsAnyRequestedColor) {
    for (const color of distinctRequestedColors) {
      if (!new RegExp(`\\b${escapeRegex(color)}\\b`, "i").test(aggregate)) {
        return buildGenerateFramesValidationFailure(
          "critical-targeting",
          `The output lost the requested ${color} subject targeting.`,
        );
      }
    }
  }

  for (const subject of visibleSubjects) {
    const rolePattern = resolveRoleValidationPattern(subject.role);
    if (rolePattern == null || !new RegExp(`\\b${escapeRegex(subject.role)}\\b`, "i").test(analysis.normalizedPrompt)) {
      continue;
    }
    if (!rolePattern.test(aggregate)) {
      return buildGenerateFramesValidationFailure(
        "critical-targeting",
        `The output lost the requested ${subject.role} subject targeting.`,
      );
    }
  }

  const continuationTargetingRequired =
    analysis.projectScope === "same-project" ||
    analysis.continuationState != null ||
    analysis.interactionMode !== "create" ||
    analysis.shotScope !== "create-first-shot";
  if (continuationTargetingRequired) {
    const subjectBindings = resolveStateSubjectBindings(analysis.continuationState);
    for (const subject of resolveReferencedContinuationSubjects(analysis)) {
      const patterns = resolveSubjectAggregatePatterns({
        subject,
        subjectBindings,
      });
      if (patterns.length === 0) {
        continue;
      }
      if (!patterns.some((pattern) => pattern.test(aggregate))) {
        return buildGenerateFramesValidationFailure(
          "critical-targeting",
          `The output lost the currently targeted ${resolveValidationSubjectDescriptor(subject)}.`,
        );
      }
    }
  }

  const explicitMultiSubjectReadRequired =
    visibleSubjects.length >= 2 &&
    /\b(two|2|both|pair|versus|vs\.?|against|each other|face each other|facing each other)\b/i.test(
      analysis.normalizedPrompt,
    ) &&
    distinctRequestedColors.length < 2 &&
    !visibleSubjects.some((subject) => subject.side === "left" || subject.side === "right") &&
    !visibleSubjects.some((subject) => {
      const label = normalizeSubjectEntityLabel(subject.label ?? "");
      return label.length > 0 && !isGenericSubjectLabel(label);
    });

  if (
    explicitMultiSubjectReadRequired &&
    !/\b(two|2|both|pair|figures?|characters?|fighters?|opponent|defender|attacker|each other)\b/i.test(aggregate)
  ) {
    return buildGenerateFramesValidationFailure(
      "critical-targeting",
      "The output no longer reads as the requested multi-subject setup.",
    );
  }

  return null;
};

const validateAntiWeirdness = ({
  analysis,
  aggregate,
  driftCheckText,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  aggregate: string;
  driftCheckText: string;
}): GenerateFramesValidationFailure | null => {
  if (
    analysis.executionGuidance.antiPatternWatchlist.some((line) => /facial features/i.test(line)) &&
    FACIAL_FEATURE_DRIFT_PATTERN.test(driftCheckText)
  ) {
    return buildGenerateFramesValidationFailure(
      "anti-weirdness",
      "The output introduced visible facial features even though the request did not ask for them.",
    );
  }

  if (
    analysis.primaryFamily === "effect" &&
    !analysis.componentFamilies.includes("object") &&
    !analysis.componentFamilies.includes("background") &&
    UNRELATED_PROP_INSERTION_PATTERN.test(driftCheckText)
  ) {
    return buildGenerateFramesValidationFailure(
      "anti-weirdness",
      "Effect output introduced unrelated props instead of staying on the requested event.",
    );
  }

  if (
    (analysis.primaryFamily === "effect" || analysis.componentFamilies.includes("effect")) &&
    analysis.executionGuidance.addOnPolicy === "core-first"
  ) {
    const addOnPattern = /\b(glow|afterglow|dust|debris|blur|ghost trail|wisps?)\b/i;
    const corePattern = resolvePrimaryEffectCorePattern(analysis);
    if (addOnPattern.test(aggregate) && !corePattern.test(aggregate)) {
      return buildGenerateFramesValidationFailure(
        "anti-weirdness",
        "Effect output let secondary add-ons replace the core event.",
      );
    }
  }

  if (
    (analysis.layerPlan.mode === "target-existing-background" || analysis.layerPlan.mode === "create-background") &&
    analysis.primaryFamily === "background" &&
    !analysis.componentFamilies.includes("effect") &&
    EFFECT_VISUAL_PATTERN.test(driftCheckText)
  ) {
    return buildGenerateFramesValidationFailure(
      "anti-weirdness",
      "Background output introduced unrelated effects instead of preserving the requested scene update.",
    );
  }

  return null;
};

const validateFrameConsistencyAndVisualCoherence = ({
  analysis,
  aggregate,
  byFrame,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  aggregate: string;
  byFrame: readonly string[];
}): GenerateFramesValidationFailure | null => {
  const expectedColorAssignments = new Map<"left" | "right", string>();
  for (const subject of analysis.subjects) {
    if ((subject.side === "left" || subject.side === "right") && subject.color) {
      expectedColorAssignments.set(subject.side, subject.color);
    }
  }

  if (expectedColorAssignments.size > 0) {
    const assignmentTexts = [aggregate, ...byFrame];
    for (const text of assignmentTexts) {
      const assignments = detectExplicitCharacterColorSideAssignments(text);
      for (const [side, color] of assignments) {
        const expectedColor = expectedColorAssignments.get(side);
        if (expectedColor != null && expectedColor !== color) {
          return buildGenerateFramesValidationFailure(
            "continuity",
            `The output reassigned the ${side}-side subject from ${expectedColor} to ${color}, breaking frame consistency.`,
          );
        }
      }
    }
  }

  if (
    analysis.cameraPlan.mode === "anchored-subject-scroll" &&
    (!/\b(centered|anchored|fixed in frame|same screen position|locked in the same screen position|holds? position)\b/i.test(
      aggregate,
    ) ||
      !/\b(background|environment|scene|backdrop|neighborhood|houses|sidewalk).*\b(move|moving|scroll|scrolling|slide|sliding|shift|shifting|offset|parallax|travel)\b/i.test(
        aggregate,
      ))
  ) {
    return buildGenerateFramesValidationFailure(
      "continuity",
      "Background-scroll output lost the anchored-subject and moving-environment coherence the shot requires.",
    );
  }

  return null;
};

const validateBrevitySafety = ({
  analysis,
  aggregate,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  aggregate: string;
}): GenerateFramesValidationFailure | null => {
  const overbuildPattern = resolveSimplePromptOverbuildPattern(analysis);
  if (overbuildPattern != null && overbuildPattern.test(aggregate)) {
    return buildGenerateFramesValidationFailure(
      "quality-floor",
      analysis.outputMode === "still"
        ? "The output overbuilt a simple still request into a staged sequence the prompt did not ask for."
        : "The output overbuilt a simple request into a more cinematic or staged sequence than the prompt justified.",
    );
  }

  return null;
};

const validateMinimumQualityFloor = ({
  analysis,
  aggregate,
  driftCheckText,
  frames,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  aggregate: string;
  driftCheckText: string;
  frames: readonly DrawingAiGeneratedFrameDraft[];
}): GenerateFramesValidationFailure | null => {
  if (
    analysis.motionType === "explosion" &&
    (WEAK_EXPLOSION_PATTERN.test(aggregate) ||
      /\b(tiny puff|small puff|blob|blobby|amorphous|generic glow blob|weak burst|soft burst)\b/i.test(driftCheckText))
  ) {
    return buildGenerateFramesValidationFailure(
      "quality-floor",
      "Explosion output fell below the quality floor because it still reads like a weak puff or blob instead of a full explosion event.",
    );
  }

  if (
    analysis.motionType === "lightning" &&
    /\b(blob|blobby|soft blob|vague scribble|unclear shape|lingering bolt|active bolt lingering)\b/i.test(driftCheckText)
  ) {
    return buildGenerateFramesValidationFailure(
      "quality-floor",
      "Lightning output fell below the quality floor because it reads like a blob or lingering mark instead of a sharp vanishing strike.",
    );
  }

  if (UNREADABLE_STRUCTURE_OUTPUT_PATTERN.test(driftCheckText)) {
    return buildGenerateFramesValidationFailure(
      "geometry",
      "The output fell below the minimum quality floor because the frame structure became messy, distorted, or unreadable.",
    );
  }

  const minimumFrameCount = resolveMinimumQualityFloorFrameCount(analysis);
  if (frames.length < minimumFrameCount) {
    return buildGenerateFramesValidationFailure(
      "completion",
      `The output fell below the minimum quality floor because it did not include enough beats for a readable ${analysis.outputMode === "animation" ? "animation" : "result"}.`,
    );
  }

  if (BLOB_LIKE_OUTPUT_PATTERN.test(driftCheckText)) {
    return buildGenerateFramesValidationFailure(
      "geometry",
      "The output fell below the minimum quality floor because the shapes became blob-like or unreadable.",
    );
  }

  if (analysis.outputMode === "animation" && BROKEN_MOTION_OUTPUT_PATTERN.test(driftCheckText)) {
    return buildGenerateFramesValidationFailure(
      "motion",
      "The output fell below the minimum quality floor because the motion read as stiff, jittery, or broken.",
    );
  }

  if (analysis.qualityFloor === "high-quality" && GENERIC_PLACEHOLDER_OUTPUT_PATTERN.test(aggregate)) {
    return buildGenerateFramesValidationFailure(
      "quality-floor",
      "The output stayed too generic or placeholder-like to clear the requested quality floor.",
    );
  }

  return null;
};

const buildValidationFailureFromQualityReport = (report: DrawingAiQualityFailureReport): GenerateFramesValidationFailure =>
  buildGenerateFramesValidationFailure(
    report.category === "geometry" ||
      report.category === "continuity" ||
      report.category === "completion" ||
      report.category === "motion" ||
      report.category === "anti-weirdness" ||
      report.category === "quality-floor"
      ? report.category
      : "quality-floor",
    report.reason,
  );

const validateRenderingQualityContracts = ({
  analysis,
  aggregate,
  byFrame,
  driftCheckText,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  aggregate: string;
  byFrame: readonly string[];
  driftCheckText: string;
}): GenerateFramesValidationFailure | null => {
  const family = analysis.renderingQualityProfile.family;
  const lastFrame = byFrame.at(-1) ?? "";

  const report = (() => {
    if (/\b(same canned output|fake variety|identical canned)\b/i.test(driftCheckText)) {
      return buildGenerateFramesQualityFailureReport({
        category: "quality-floor",
        reason: "The output fell back to canned repetition or fake variety instead of controlled family variation.",
        violatedRules: ["no canned repeat output", "no fake variety"],
        repairPriority: "repair family-true variation after restoring the main read",
      });
    }

    switch (family) {
      case "character":
        if (UNREADABLE_STRUCTURE_OUTPUT_PATTERN.test(driftCheckText)) {
          return buildGenerateFramesQualityFailureReport({
            category: "geometry",
            reason: "Character output lost solid structure, readable silhouette, or stable limb logic.",
            violatedRules: analysis.familyQualityContract.rejectConditions,
            repairPriority: "repair silhouette and limb structure before pose polish",
          });
        }
        return null;
      case "combat":
        if (/\b(flail|flailing|random swing|random hit|generic motion)\b/i.test(driftCheckText)) {
          return buildGenerateFramesQualityFailureReport({
            category: "motion",
            reason: "Combat output devolved into generic flailing instead of a readable strike path with contact and recovery.",
            violatedRules: analysis.familyQualityContract.rejectConditions,
            repairPriority: "repair anticipation, contact, and recovery before extra detail",
          });
        }
        if (
          !/\b(anticipation|wind[- ]?up|load|chamber)\b/i.test(aggregate) ||
          !/\b(contact|impact|hit|strike)\b/i.test(aggregate) ||
          !/\b(recovery|follow[- ]?through|reset|guard|settle)\b/i.test(lastFrame)
        ) {
          return buildGenerateFramesQualityFailureReport({
            category: "completion",
            reason: "Combat output is missing the readable anticipation, contact, or recovery needed for a satisfying action.",
            violatedRules: analysis.renderAcceptanceContract.minimumReadableCompletion,
            repairPriority: "repair the action beats before secondary motion",
          });
        }
        return null;
      case "explosion":
        if (
          !/\b(outward|expand|expansion|blast|rupture|burst|surge)\b/i.test(aggregate) ||
          !/\b(breakup|break apart|fragment|debris|fallout|smoke|aftermath|disintegrat|fade)\b/i.test(aggregate)
        ) {
          return buildGenerateFramesQualityFailureReport({
            category: "quality-floor",
            reason: "Explosion output is missing the core blast progression, breakup, or aftermath that makes the event read powerfully.",
            violatedRules: analysis.familyQualityContract.mustHaves,
            repairPriority: "repair the core blast, then breakup, then aftermath",
          });
        }
        return null;
      case "lightning":
        if (
          !/\b(lightning|bolt|electric|zigzag|branch|strike)\b/i.test(aggregate) ||
          !/\b(flash|snap|collapse|vanish|fade)\b/i.test(aggregate)
        ) {
          return buildGenerateFramesQualityFailureReport({
            category: "quality-floor",
            reason: "Lightning output is missing the sharp strike, collapse, or vanish needed for a clean lightning read.",
            violatedRules: analysis.familyQualityContract.mustHaves,
            repairPriority: "repair the strike read first, then collapse and vanish",
          });
        }
        return null;
      case "projectile":
        if (
          !/\b(launch|release|throw|fires?|shoot|cast)\b/i.test(aggregate) ||
          !/\b(path|travel|arc|streak|trail|toward)\b/i.test(aggregate) ||
          !/\b(impact|hit|exit|passes through|bursts?)\b/i.test(aggregate)
        ) {
          return buildGenerateFramesQualityFailureReport({
            category: "completion",
            reason: "Projectile output needs a readable launch, path, and impact-or-exit instead of a floating orb description.",
            violatedRules: analysis.familyQualityContract.mustHaves,
            repairPriority: "repair launch and travel before impact polish",
          });
        }
        return null;
      case "breathing":
        if (
          !/\b(inhale|inhale-expand|breath in|draws? breath|chest lifts?)\b/i.test(aggregate) ||
          !/\b(exhale|breath out|release breath|shoulders drop|torso settles?)\b/i.test(aggregate)
        ) {
          return buildGenerateFramesQualityFailureReport({
            category: "motion",
            reason: "Breathing output needs a readable inhale-exhale rhythm instead of idle bobbing.",
            violatedRules: analysis.familyQualityContract.mustHaves,
            repairPriority: "repair the breathing rhythm before pose polish",
          });
        }
        return null;
      case "background":
        if (
          analysis.sceneSetting != null &&
          !new RegExp(`\\b${escapeRegex(analysis.sceneSetting)}\\b`, "i").test(aggregate) &&
          !analysis.sceneDescriptors.some((descriptor) => new RegExp(`\\b${escapeRegex(descriptor)}\\b`, "i").test(aggregate))
        ) {
          return buildGenerateFramesQualityFailureReport({
            category: "quality-floor",
            reason: "Background output no longer reads clearly as the requested place.",
            violatedRules: analysis.familyQualityContract.rejectConditions,
            repairPriority: "repair place readability before support details",
          });
        }
        return null;
      case "background-scroll":
        if (
          !/\b(centered|anchored|fixed in frame|same screen position|holds? position)\b/i.test(aggregate) ||
          !/\b(background|environment|scene|backdrop).*\b(move|moving|scroll|scrolling|slide|sliding|shift|parallax)\b/i.test(
            aggregate,
          )
        ) {
          return buildGenerateFramesQualityFailureReport({
            category: "continuity",
            reason: "Background-scroll output lost the anchored-subject plus moving-environment illusion.",
            violatedRules: analysis.familyQualityContract.mustHaves,
            repairPriority: "repair the anchored subject and coherent environment motion before polish",
          });
        }
        return null;
      default:
        return null;
    }
  })();

  return report ? buildValidationFailureFromQualityReport(report) : null;
};

const validateExecutionEnforcement = (
  analysis: GenerateFramesRuntimeAnalysis,
  frames: readonly DrawingAiGeneratedFrameDraft[],
): GenerateFramesValidationFailure | null => {
  const aggregate = aggregateDraftText(frames);
  const driftCheckText = stripNegatedDriftPhrases(aggregate);
  const byFrame = frames.map((frame) => normalizePrompt(`${frame.pose} ${frame.description}`));

  const criticalFailure = validateCriticalTargetingAndContinuity({
    analysis,
    aggregate,
    driftCheckText,
    byFrame,
  });
  if (criticalFailure != null) {
    return criticalFailure;
  }

  const antiWeirdnessFailure = validateAntiWeirdness({
    analysis,
    aggregate,
    driftCheckText,
  });
  if (antiWeirdnessFailure != null) {
    return antiWeirdnessFailure;
  }

  const frameConsistencyFailure = validateFrameConsistencyAndVisualCoherence({
    analysis,
    aggregate,
    byFrame,
  });
  if (frameConsistencyFailure != null) {
    return frameConsistencyFailure;
  }

  const brevityFailure = validateBrevitySafety({
    analysis,
    aggregate,
  });
  if (brevityFailure != null) {
    return brevityFailure;
  }

  const renderingQualityFailure = validateRenderingQualityContracts({
    analysis,
    aggregate,
    byFrame,
    driftCheckText,
  });
  if (renderingQualityFailure != null) {
    return renderingQualityFailure;
  }

  const qualityFloorFailure = validateMinimumQualityFloor({
    analysis,
    aggregate,
    driftCheckText,
    frames,
  });
  if (qualityFloorFailure != null) {
    return qualityFloorFailure;
  }

  return null;
};

const validateConceptSignals = (analysis: GenerateFramesRuntimeAnalysis, frames: readonly DrawingAiGeneratedFrameDraft[]) => {
  const aggregate = aggregateDraftText(frames);
  const driftCheckText = stripNegatedDriftPhrases(aggregate);
  const byFrame = frames.map((frame) => normalizePrompt(`${frame.pose} ${frame.description}`));

  if (isGenerateFramesHardNoPlanBlocker(analysis) && analysis.noPlanReason != null) {
    return analysis.noPlanReason;
  }

  if (analysis.excludedFamilies.includes("character") && HUMANOID_DRIFT_PATTERN.test(driftCheckText)) {
    return "The prompt explicitly excluded character-style output.";
  }

  if (analysis.excludedFamilies.includes("background") && /\b(room|hallway|background|environment|scene)\b/.test(aggregate)) {
    return "The prompt explicitly excluded background output.";
  }

  if (analysis.excludedFamilies.includes("effect") && /\b(explosion|blast|fire|smoke|glow|lightning|bolt|debris|dust|crack|fracture)\b/.test(aggregate)) {
    return "The prompt explicitly excluded effect output.";
  }

  if (analysis.excludedFamilies.includes("object") && /\b(ball|circle|square|block|rod|staff|object)\b/.test(aggregate)) {
    return "The prompt explicitly excluded object output.";
  }

  if (analysis.primaryFamily === "effect" && HUMANOID_DRIFT_PATTERN.test(driftCheckText)) {
    return "Effect request drifted into an unsolicited humanoid or character.";
  }

  if (analysis.primaryFamily === "object" && OBJECT_ANTHROPOMORPHISM_PATTERN.test(driftCheckText)) {
    return "Object request drifted into anthropomorphic or humanoid output.";
  }

  if (analysis.primaryFamily === "background" && BACKGROUND_DRIFT_PATTERN.test(driftCheckText)) {
    return "Background request drifted into a primary character or action subject.";
  }

  if (analysis.primaryFamily === "continuation" && RESET_IDENTITY_PATTERN.test(aggregate)) {
    return "Continuation output reset the subject instead of preserving the current sequence.";
  }

  const strictSubjectPurityReason = validateStrictSubjectPurity({
    analysis,
    aggregate,
    driftCheckText,
  });
  if (strictSubjectPurityReason != null) {
    return strictSubjectPurityReason;
  }

  const fallbackSpecificityReason = validateFallbackSpecificity({
    analysis,
    frames,
    aggregate,
  });
  if (fallbackSpecificityReason != null) {
    return fallbackSpecificityReason;
  }

  const expectedVisualClassReason = validateExpectedVisualClass({
    analysis,
    aggregate,
    frames,
  });
  if (expectedVisualClassReason != null) {
    return expectedVisualClassReason;
  }

  const recognizableAppearanceReason = validateRecognizableAppearance({
    analysis,
    aggregate,
  });
  if (recognizableAppearanceReason != null) {
    return recognizableAppearanceReason;
  }

  if (
    analysis.outputMode === "animation" &&
    analysis.visualKind === "event" &&
    (analysis.primaryFamily === "effect" || analysis.componentFamilies.includes("effect"))
  ) {
    if (frames.length < 4) {
      return "Event animation output needs enough beats to establish buildup, peak action, and a readable ending.";
    }

    const openingText = byFrame.slice(0, Math.min(2, byFrame.length)).join(" ");
    const endingText = byFrame.slice(Math.max(0, byFrame.length - 2)).join(" ");
    const finalFrameText = byFrame.at(-1) ?? "";
    if (!/\b(build|buildup|start|starting|setup|gather|charge|pre[- ]|ignite|flash|spark|source|opening)\b/.test(openingText)) {
      return "Event animation output lost the opening setup beat the user expects before the main action.";
    }
    if (
      !/\b(afterglow|aftermath|fade|fading|fade out|thin|thins|thinning|settle|settles|settling|dissipat|disintegrat|linger|lingers|lingering|residue|embers|smoke|dust|ash|final|haze|cooling|wisps?)\b/.test(endingText) ||
      /\b(peak|burst|breakout|release|contact|spray|expands?\s+fast|grows?\b|charging|forming|chamber(?:s|ed|ing)?|counterattack|prepare(?:s|d|ing)?|wind[- ]?up|load(?:ed|ing)?|climb(?:s|ing)?|rise(?:s|n|ing)?|spread(?:s|ing)?|billow(?:s|ing)?)\b/.test(finalFrameText)
    ) {
      return "Event animation output needs a readable ending or aftermath beat instead of stopping at peak intensity.";
    }
  }

  if (analysis.motionType === "smoke") {
    const endingText = byFrame.slice(Math.max(0, byFrame.length - 2)).join(" ");
    const finalFrameText = byFrame.at(-1) ?? "";
    if (
      !/\b(fade|thin|thinning|dissipat|linger|lingering|haze|settle|settling|wisps?|aftermath)\b/.test(endingText) ||
      /\b(burst|release|spread(?:s|ing)?|expand(?:s|ing)?|grow(?:s|ing)?|billow(?:s|ing)?|climb(?:s|ing)?|rise(?:s|ing)?)\b/.test(finalFrameText)
    ) {
      return "Smoke output needs a real dissipating ending instead of stopping while the cloud is still actively growing.";
    }
  }

  if (analysis.motionType === "lightning") {
    const endingText = byFrame.slice(Math.max(0, byFrame.length - 2)).join(" ");
    const finalFrameText = byFrame.at(-1) ?? "";
    if (!/\b(lightning|bolt|branch|zigzag|electric|taper(?:ed|ing)?)\b/.test(aggregate)) {
      return "Lightning output needs a readable bolt structure with branching or zigzag electric shape instead of vague scribbles.";
    }
    if (
      !/\b(fade|vanish|collapse|afterglow|disappear|ghost|empty background|no bolt)\b/.test(endingText) ||
      (
        /\b(main path|residual arcs?|active bolt|branch(?:es)? still|hot core|bright core)\b/.test(finalFrameText) &&
        !/\b(vanish|fade|collapse|afterglow|disappear|ghost|empty background|no bolt)\b/.test(finalFrameText)
      )
    ) {
      return "Lightning output needs a fast disappearing ending instead of lingering as an active bolt.";
    }
  }

  if (
    analysis.outputMode === "still" &&
    analysis.subjects.length > 0 &&
    analysis.subjects.some((subject) => normalizePrompt(subject.label ?? "").includes("stick figure")) &&
    !/\b(head|torso|arms?|legs?|limbs?|silhouette|proportions?)\b/.test(aggregate)
  ) {
    return "Stick figure output needs readable body structure instead of a vague symbol or malformed shape.";
  }

  if (
    analysis.outputMode === "still" &&
    analysis.motionType === "scene" &&
    !/\b(depth|foreground|midground|background|composition|staging)\b/.test(aggregate)
  ) {
    return "Scene output needs clear composition and depth instead of a flat placeholder backdrop.";
  }

  const isGenericCombatRequest = isMultiSubjectCombatRequest(analysis);
  if (isGenericCombatRequest) {
    if (frames.length < 4) {
      return "Combat animation output needs enough beats to read as setup, exchange, and resolution.";
    }

    const openingText = byFrame.slice(0, Math.min(2, byFrame.length)).join(" ");
    const endingText = byFrame.slice(Math.max(0, byFrame.length - 2)).join(" ");
    const finalFrameText = byFrame.at(-1) ?? "";
    if (!/\b(setup|guard|stance|faceoff|square off|prepare|anticipation|load)\b/.test(openingText)) {
      return "Combat animation output lost the readable opening setup beat.";
    }
    if (!/\b(hit|contact|impact|strike|kick|punch|counter|clash)\b/.test(aggregate)) {
      return "Combat animation output lost the readable exchange beat.";
    }
    if (
      !/\b(follow[- ]?through|recovery|recover|reset|settle|resolved|guard|ready stance|ready stances|aftermath|pause|finish|ending|separate|rebound)\b/.test(endingText) ||
      /\b(chamber(?:s|ed|ing)?|counterattack|prepare(?:s|d|ing)?|wind[- ]?up|starts?\s+to|about to|next strike|another strike|incoming)\b/.test(finalFrameText) ||
      (/\b(strike|kick|punch|clash|impact|hit)\b/.test(finalFrameText) &&
        !/\b(recovery|recover|reset|settle|resolved|guard|ready stance|ready stances|aftermath|pause|separate|rebound)\b/.test(finalFrameText))
    ) {
      return "Combat animation output needs a readable ending beat instead of stopping in mid-exchange.";
    }
  }

  const requiredSides = new Set(analysis.subjects.map((subject) => subject.side).filter((side) => side !== "center"));
  if (requiredSides.has("left") && !/\bleft\b/.test(aggregate)) {
    return "The output lost the left-side subject or staging the user asked for.";
  }
  if (requiredSides.has("right") && !/\bright\b/.test(aggregate)) {
    return "The output lost the right-side subject or staging the user asked for.";
  }

  const requiredIdentityLabels = analysis.subjects
    .filter((subject) => subject.type !== "background")
    .map((subject) => subject.label?.trim().toLowerCase() ?? "")
    .filter((label) => label.length > 0 && !isGenericSubjectLabel(label));
  for (const label of requiredIdentityLabels) {
    const keywords = extractSubjectIdentityKeywords(label);
    if (keywords.length === 0) {
      continue;
    }
    const keywordPattern = new RegExp(`\\b(?:${keywords.map(escapeRegex).join("|")})\\b`, "i");
    if (!keywordPattern.test(aggregate)) {
      return `The output lost the requested ${label} subject identity.`;
    }
  }

  if (analysis.primaryFamily === "mixed") {
    const needsEffect = analysis.componentFamilies.includes("effect");
    const needsCharacter = analysis.componentFamilies.includes("character");
    const needsBackground = analysis.componentFamilies.includes("background");
    const characterSubjects = analysis.subjects.filter((subject) => subject.type === "character");

    if (analysis.requestKind === "single-frame" && (analysis.stillFrameRequested || analysis.motionType === "scene")) {
      if (needsBackground && !/\b(background|scene|environment|room|forest|canyon|rooftop|city|plain|mountain|wall|floor|tree|building|bed|ground)\b/.test(aggregate)) {
        return "Still setup scene lost the environment side of the request.";
      }
      if (needsCharacter && !/\b(stick(?:\s|-)?figure|character|foreground|left figure|right figure|two readable figures)\b/.test(aggregate)) {
        return "Still setup scene lost the subject staging the user asked for.";
      }
      if (characterSubjects.length >= 2) {
        const requiredColors = characterSubjects.map((subject) => subject.color).filter((color): color is string => color != null);
        for (const color of requiredColors) {
          if (!new RegExp(`\\b${color}\\b`, "i").test(aggregate)) {
            return `Still setup scene lost the requested ${color} subject color.`;
          }
        }
      }
      const requiredLabels = characterSubjects
        .map((subject) => subject.label?.trim().toLowerCase() ?? "")
        .filter((label) => label.length > 0 && !/\b(stick figure|character)\b/.test(label));
      for (const label of requiredLabels) {
        const keywords = label.split(/\s+/).filter((token) => token.length >= 4);
        if (keywords.length === 0) {
          continue;
        }
        const labelPattern = new RegExp(`\\b(?:${keywords.join("|")})\\b`, "i");
        if (!labelPattern.test(aggregate)) {
          return `Still setup scene lost the requested ${label} subject identity.`;
        }
      }
      if (analysis.sceneSetting === "forest" && !/\b(forest|tree|trees|foliage)\b/.test(aggregate)) {
        return "Still setup scene lost the forest setting.";
      }
      if (analysis.sceneSetting === "canyon" && !/\b(canyon|rock|cliff|boulder)\b/.test(aggregate)) {
        return "Still setup scene lost the canyon setting.";
      }
      if (analysis.sceneSetting === "cave" && !/\b(cave|rock|shadow|stalactite|underground)\b/.test(aggregate)) {
        return "Still setup scene lost the cave setting.";
      }
      if (analysis.sceneSetting === "rooftop" && !/\b(rooftop|roof|ledge|skyline|building)\b/.test(aggregate)) {
        return "Still setup scene lost the rooftop setting.";
      }
      if (analysis.sceneSetting === "city" && !/\b(city|building|buildings|street|skyline|urban)\b/.test(aggregate)) {
        return "Still setup scene lost the city setting.";
      }
      if (analysis.sceneSetting === "bedroom" && !/\b(bedroom|bed|wall|floor|interior)\b/.test(aggregate)) {
        return "Still setup scene lost the bedroom setting.";
      }
      return null;
    }

    if (frames.length < 4) {
      return "Mixed family animation needs enough beats to preserve both sides of the request.";
    }

    if (needsEffect && !/\b(explosion|blast|fire|smoke|glow|lightning|bolt|debris|dust|crack|fracture)\b/.test(aggregate)) {
      return "Mixed request lost the effect side of the prompt.";
    }
    if (needsCharacter && !/\b(stick(?:\s|-)?figure|character|running|run|pose|punch|kick|guard|stance)\b/.test(aggregate)) {
      return "Mixed request lost the character side of the prompt.";
    }
    const endingText = byFrame.slice(Math.max(0, byFrame.length - 2)).join(" ");
    if (needsEffect && needsCharacter && !/\b(smoke|aftermath|escape|clears|behind|settles)\b/.test(endingText)) {
      return "Mixed request needs a readable ending where both the character and effect resolve instead of stopping halfway.";
    }
  }

  if (analysis.concepts.includes("explosion") && !/\b(explosion|blast|fire|glow|burst|smoke|debris|orange|yellow|red)\b/.test(aggregate)) {
    return "Explosion output lost the expected explosion identity.";
  }

  const requiresPrimaryExplosionCompletion =
    analysis.concepts.includes("explosion") &&
    !analysis.componentFamilies.includes("character") &&
    (analysis.primaryFamily === "effect" || analysis.primaryFamily === "continuation");
  if (requiresPrimaryExplosionCompletion) {
    if (frames.length < 5) {
      return "Explosion output needs enough beats to read as build, blast, breakup, and fade.";
    }
    const openingText = byFrame.slice(0, Math.min(2, byFrame.length)).join(" ");
    const peakWindow = byFrame
      .slice(Math.max(1, Math.floor(byFrame.length * 0.25)), Math.max(3, Math.ceil(byFrame.length * 0.7)))
      .join(" ");
    const endingText = byFrame.slice(Math.max(0, byFrame.length - 2)).join(" ");
    const finalFrameText = byFrame.at(-1) ?? "";
    if (!/\b(build|compress|pressure|ignite|flash|blast|release)\b/.test(openingText)) {
      return "Explosion output lost the opening pressure and ignition beats.";
    }
    if (WEAK_EXPLOSION_PATTERN.test(aggregate)) {
      return "Explosion output still reads like a weak pop instead of a full explosion event.";
    }
    if (!/\b(expand|expansion|outward|spread|surge|peak|blast|wider|larger|violent)\b/.test(peakWindow)) {
      return "Explosion output needs a stronger expanding peak instead of a small soft burst.";
    }
    if (!/\b(breakup|break apart|fragment|debris|shards|fallout|outer shell|torn fire)\b/.test(aggregate)) {
      return "Explosion output needs visible breakup and fallout instead of one compact puff.";
    }
    if (!/\b(smoke|aftermath|fade|thin out|dissipat|disintegrat|dust|settle)\b/.test(endingText)) {
      return "Explosion output needs a real smoky fade or disintegration ending instead of stopping at peak blast.";
    }
    if (
      /\b(peak|blast|burst|release|expanding|growing|surging)\b/.test(finalFrameText) &&
      !/\b(smoke|aftermath|fade|thin out|dissipat|disintegrat|dust|settle|residue|embers)\b/.test(finalFrameText)
    ) {
      return "Explosion output still ends as an active blast instead of a finished residue frame.";
    }
  }

  if (analysis.concepts.includes("lightning") && !/\b(lightning|bolt|electric|glow|bright|strike)\b/.test(aggregate)) {
    return "Lightning output lost the expected lightning identity.";
  }

  if (analysis.concepts.includes("shockwave") && !/\b(shockwave|dust wave|blast ring|ring|outward)\b/.test(aggregate)) {
    return "Shockwave output lost the expected expanding shockwave read.";
  }

  if (analysis.concepts.includes("concrete-cracks") && !/\b(crack|fracture|concrete|surface|dust|chips?)\b/.test(aggregate)) {
    return "Concrete cracks output lost the expected fracture read.";
  }

  if ((analysis.concepts.includes("bouncing-ball") || analysis.concepts.includes("rolling-ball")) && !/\b(ball|round|squash|bounce|rebound|roll|rolling)\b/.test(aggregate)) {
    return "Ball output lost the expected ball identity.";
  }

  if (analysis.concepts.includes("bouncing-ball") && frames.length < 5) {
    return "Bouncing ball output needs enough beats to read as fall, impact, rebound, and settle.";
  }

  if (analysis.concepts.includes("bouncing-ball") && analysis.requestedColor && !new RegExp(`\\b${analysis.requestedColor}\\b`, "i").test(aggregate)) {
    return "Bouncing ball output lost the requested color.";
  }

  if (analysis.concepts.includes("bouncing-ball")) {
    const endingText = byFrame.slice(Math.max(0, byFrame.length - 2)).join(" ");
    if (!/\b(settle|rest|comes to rest|finishes|lower return|gentle settle|controlled settle)\b/.test(endingText)) {
      return "Bouncing ball output needs a readable ending state instead of cutting off mid-bounce.";
    }
  }

  if (analysis.concepts.includes("rolling-ball") && frames.length < 2) {
    return "Rolling ball output needs enough beats to read as directional travel.";
  }

  if (analysis.concepts.includes("morphing-ball") && !/\b(ball|morph|transform|change)\b/.test(aggregate)) {
    return "Morphing ball output lost the expected transformation read.";
  }

  if (analysis.concepts.includes("morphing-ball") && frames.length < 3) {
    return "Morphing ball output needs enough beats to establish the base form, transition, and transformed result.";
  }

  if (analysis.concepts.includes("bouncing-ball") && OBJECT_ANTHROPOMORPHISM_PATTERN.test(aggregate)) {
    return "Bouncing ball output drifted into character behavior.";
  }

  if (analysis.concepts.includes("punch") && frames.length >= 3) {
    const anticipationIndex = byFrame.findIndex((frameText) => /\b(anticipation|wind[- ]?up|load)\b/.test(frameText));
    if (anticipationIndex === -1) {
      return "Punch output lost the anticipation beat.";
    }
    const contactIndex = byFrame.findIndex(
      (frameText, index) => index > anticipationIndex && /\b(contact|impact|strike|hit)\b/.test(frameText),
    );
    if (contactIndex === -1) {
      return "Punch output lost the contact beat.";
    }
    const followThroughIndex = byFrame.findIndex(
      (frameText, index) => index > contactIndex && /\b(follow[- ]?through|recoil)\b/.test(frameText),
    );
    const recoveryIndex = byFrame.findIndex(
      (frameText, index) =>
        index > (followThroughIndex === -1 ? contactIndex : followThroughIndex) &&
        /\b(recovery|recover|guard|settle|reset)\b/.test(frameText),
    );
    if (frames.length >= 4 && followThroughIndex === -1) {
      return "Punch output lost the follow-through beat.";
    }
    if (frames.length >= 4 && recoveryIndex === -1) {
      return "Punch output lost the recovery beat.";
    }
    if (frames.length === 3 && followThroughIndex === -1 && recoveryIndex === -1) {
      return "Punch output needs follow-through or recovery after contact.";
    }
  }

  if (analysis.concepts.includes("punch") && frames.length < 3) {
    return "Punch output needs anticipation, contact, and follow-through beats.";
  }

  if (isOrderedStagedActionRequest(analysis)) {
    if (frames.length < 4) {
      return "Ordered staged action needs enough beats to read setup, sequence, and finish.";
    }
    const endingText = byFrame.slice(Math.max(0, byFrame.length - 2)).join(" ");
    if (/\bright hand\b/.test(analysis.normalizedPrompt) && !/\bright\b/.test(aggregate)) {
      return "Ordered staged action lost the right-side or right-hand attack beat.";
    }
    if (/\bleft hand\b/.test(analysis.normalizedPrompt) && !/\bleft\b/.test(aggregate)) {
      return "Ordered staged action lost the left-side or left-hand attack beat.";
    }
    if (/\b(fireball|projectile|energy ball|orb|blast)\b/.test(analysis.normalizedPrompt) && !/\b(fireball|projectile|blast|orb)\b/.test(aggregate)) {
      return "Ordered staged action lost the projectile or fireball read.";
    }
    if (/\b(jump|leap|vault)\b/.test(analysis.normalizedPrompt) && !/\b(jump|launch|airborne|leap|vault)\b/.test(aggregate)) {
      return "Ordered staged action lost the jump or launch beat.";
    }
    if (/\bspin(?:ning)?\b/.test(analysis.normalizedPrompt) && !/\b(spin|turn|tornado)\b/.test(aggregate)) {
      return "Ordered staged action lost the spin beat.";
    }
    if (
      /\b(martial arts guard stance|guard stance|ready stance|landing|land)\b/.test(analysis.normalizedPrompt) &&
      !/\b(landing|land|guard|stance|recover|recovery|settle)\b/.test(endingText)
    ) {
      return "Ordered staged action needs a readable landing or guard finish instead of stopping mid-combo.";
    }
  }

  if (analysis.concepts.includes("punch")) {
    if (analysis.forceLevel === "high" && !/\b(brutal|powerful|harder|heavier|forceful|explosive|committed)\b/.test(aggregate)) {
      return "Punch output lost the stronger force or brutal tone the user requested.";
    }
    if (
      analysis.forceLevel === "low" &&
      !/\b(weak|hesitant|scared|cautious|smaller|reduced|timid|guarded)\b/.test(aggregate)
    ) {
      return "Punch output lost the weaker or scared tone the user requested.";
    }
  }

  if (analysis.concepts.includes("fighting-stance") && !/\b(guard|stance|ready|balanced|footing)\b/.test(aggregate)) {
    return "Fighting stance output lost the expected guard-like readiness.";
  }

  if (analysis.concepts.includes("walking") && frames.length >= 3) {
    if (!/\b(contact|step|plant)\b/.test(byFrame[0] ?? "")) {
      return "Walking output lost the opening contact beat.";
    }
    if (!/\b(pass(?:ing)?|transition)\b/.test(byFrame[1] ?? "")) {
      return "Walking output lost the passing beat.";
    }
    if (!/\b(contact|step|plant)\b/.test(byFrame[2] ?? "")) {
      return "Walking output lost the second contact beat.";
    }
  }

  if (analysis.concepts.includes("walking") && frames.length < 3) {
    return "Walking output needs enough beats to read as a real walk cycle or walk adjustment.";
  }

  if (analysis.concepts.includes("dark-room") && !/\b(room|wall|floor|door|hallway|shadow|dark|dim)\b/.test(aggregate)) {
    return "Dark room output lost the expected environment staging.";
  }

  if (analysis.concepts.includes("mountain-landscape") && !/\b(plains?|field|ground|mountain|range|hills?|sky)\b/.test(aggregate)) {
    return "Landscape output lost the expected plains and mountain depth read.";
  }

  if (analysis.concepts.includes("night-city") && !/\b(city|cityscape|skyline|buildings?|window|night|lights?)\b/.test(aggregate)) {
    return "Night city output lost the expected skyline and night read.";
  }

  if (analysis.sceneSetting === "neighborhood" && !/\b(neighborhood|house|houses|sidewalk|residential|fence|street)\b/.test(aggregate)) {
    return "Neighborhood output needs readable houses, sidewalk, or residential staging instead of a generic backdrop.";
  }

  if (analysis.motionType === "background-scroll") {
    if (frames.length < 3) {
      return "Background-scroll animation needs enough beats to show movement start, travel, and ending state.";
    }
    if (
      !/\b(centered|anchored|locked in the same screen position|screen(?: |-)?space|screen position|fixed in frame|holds? position|same screen position)\b/.test(
        aggregate,
      )
    ) {
      return "Background-scroll output lost the centered subject requirement.";
    }
    const endingText = byFrame.slice(Math.max(0, byFrame.length - 2)).join(" ");
    if (
      !/\b(background|environment|scene|backdrop|neighborhood|houses|sidewalk).*\b(move|moving|scroll|scrolling|slide|sliding|shift|shifting|offset|parallax|travel)\b/.test(
        endingText,
      )
    ) {
      return "Background-scroll output needs a readable ending beat where the background is still the thing moving.";
    }
  }

  if (analysis.concepts.includes("zombie-apocalypse") && !/\b(zombie|undead|horde|surviv|apocalypse|outbreak)\b/.test(aggregate)) {
    return "Zombie apocalypse output lost the expected undead threat read.";
  }

  if (analysis.concepts.includes("alien-apocalypse") && !/\b(alien|invasion|ship|creature|apocalypse|onslaught)\b/.test(aggregate)) {
    return "Alien apocalypse output lost the expected invasion read.";
  }

  const humanExpectationQualityReason = validateHumanExpectationQuality({
    analysis,
    aggregate,
    frames,
  });
  if (humanExpectationQualityReason != null) {
    return humanExpectationQualityReason;
  }

  return null;
};

type EngineCommandActionType = string;
type EngineCommandIntensity = "none" | "light" | "medium" | "heavy";
type EngineCommandTiming = "static" | "fast" | "normal" | "slow";
type EngineCommandSpacing = "none" | "tight" | "medium" | "wide";
type EngineCommandPoseStage = "setup" | "anticipation" | "action" | "impact" | "follow-through" | "recovery" | "transition";

const ENGINE_COMMAND_ACTION_PREFIX_PATTERN = /^[a-z-]+:\s*/i;
const ENGINE_COMMAND_DESCRIPTION_PATTERN =
  /^action=([^;]+);\s*durationFrames=(\d+);\s*intensity=(none|light|medium|heavy);\s*timing=(static|fast|normal|slow);\s*spacing=(none|tight|medium|wide);\s*command=(.+?);?$/i;
const ENGINE_COMMAND_POSE_STAGES = new Set<EngineCommandPoseStage>([
  "setup",
  "anticipation",
  "action",
  "impact",
  "follow-through",
  "recovery",
  "transition",
]);
const ENGINE_COMMAND_SOFT_WORD_PATTERN = /\b(readable|clean|nice|smooth|strong|good|feel|feels|feeling|look|looks|looking|read|reads|reading)\b/gi;

const stripEngineSoftLanguage = (value: string) =>
  value
    .replace(ENGINE_COMMAND_SOFT_WORD_PATTERN, " ")
    .replace(/\s+/g, " ")
    .replace(/\s([,.;:])/g, "$1")
    .trim();

const normalizeEngineCommandSourceText = (value: string) =>
  stripEngineSoftLanguage(
    value
      .replace(/\bsurface mark\b/gi, "paint stripe")
      .replace(/\bsurface marks\b/gi, "paint stripes"),
  ).replace(/[.;,:]+$/g, "");

const parseExistingEngineCommandDescription = (value: string) => {
  const match = normalizeEngineCommandSourceText(value).match(ENGINE_COMMAND_DESCRIPTION_PATTERN);
  if (!match) {
    return null;
  }

  return {
    actionType: match[1].trim().toLowerCase(),
    durationFrames: Math.max(1, Number.parseInt(match[2] ?? "1", 10) || 1),
    intensity: match[3].trim().toLowerCase() as EngineCommandIntensity,
    timing: match[4].trim().toLowerCase() as EngineCommandTiming,
    spacing: match[5].trim().toLowerCase() as EngineCommandSpacing,
    command: match[6].trim().replace(/[.;]+$/g, ""),
  };
};

const formatEngineCommandDescription = ({
  actionType,
  durationFrames,
  intensity,
  timing,
  spacing,
  command,
}: {
  actionType: EngineCommandActionType;
  durationFrames: number;
  intensity: EngineCommandIntensity;
  timing: EngineCommandTiming;
  spacing: EngineCommandSpacing;
  command: string;
}) =>
  `action=${actionType}; durationFrames=${durationFrames}; intensity=${intensity}; timing=${timing}; spacing=${spacing}; command=${command.replace(/[.;]+$/g, "").trim()};`;

const buildGenericEngineActionType = (analysis: GenerateFramesRuntimeAnalysis) => {
  const primaryAction = normalizePrompt(buildPrimaryActionLabel(analysis)).replace(/\s+/g, "-");
  return primaryAction.length > 0 ? primaryAction : "move";
};

const inferEngineCommandActionType = ({
  analysis,
  pose,
  description,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  pose: string;
  description: string;
}): EngineCommandActionType => {
  const aggregate = normalizePrompt(`${pose} ${description}`);

  if (analysis.outputMode === "still" && analysis.requestedFrameCount <= 1) {
    return "pose";
  }

  if (analysis.expectedCompletionProfile === "breathing-loop" || /\b(breath|breathing|inhale|exhale|pant)\b/.test(aggregate)) {
    return "breathe";
  }
  if (/\b(fireball|projectile|orb|shot)\b/.test(aggregate)) {
    return "projectile";
  }
  if (analysis.motionType === "background-scroll") {
    return "scroll";
  }
  if (analysis.motionType === "explosion" || analysis.concepts.includes("explosion")) {
    return "explosion";
  }
  if (analysis.motionType === "lightning" || analysis.concepts.includes("lightning")) {
    return "lightning";
  }
  if (analysis.motionType === "shockwave" || analysis.concepts.includes("shockwave")) {
    return "shockwave";
  }
  if (analysis.motionType === "smoke") {
    return "smoke";
  }
  if (analysis.motionType === "eruption") {
    return "eruption";
  }
  if (analysis.motionType === "impact") {
    return "impact";
  }
  if (analysis.motionType === "bounce" || analysis.concepts.includes("bouncing-ball")) {
    return "bounce";
  }
  if (analysis.motionType === "roll" || analysis.concepts.includes("rolling-ball")) {
    return "roll";
  }
  if (analysis.motionType === "morph" || analysis.concepts.includes("morphing-ball")) {
    return "morph";
  }
  if (analysis.motionType === "punch" || analysis.concepts.includes("punch")) {
    return "punch";
  }
  if (analysis.motionType === "kick" || analysis.concepts.includes("kick")) {
    return "kick";
  }
  if (analysis.motionType === "fight") {
    return "fight";
  }
  if (analysis.motionType === "walk") {
    return "walk";
  }
  if (analysis.motionType === "run") {
    return "run";
  }
  if (analysis.motionType === "stance") {
    return "stance";
  }
  if (/\b(jump|launch|takeoff|airtime|airborne|upward|peak)\b/.test(aggregate)) {
    return "jump";
  }
  if (/\b(run|walk|move|travel|scroll|entry|dodge|turn|spin|advance|drift|emerge|recolor|change)\b/.test(aggregate)) {
    return "move";
  }
  return buildGenericEngineActionType(analysis);
};

const inferEngineCommandPoseStage = ({
  analysis,
  aggregate,
  index,
  totalFrames,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  aggregate: string;
  index: number;
  totalFrames: number;
}): EngineCommandPoseStage => {
  if (analysis.outputMode === "still" && analysis.requestedFrameCount <= 1) {
    return "setup";
  }
  if (/\b(setup|opening|start|starting|first frame|guard|stance|faceoff|source ready|intact|high start|base form|preserve)\b/.test(aggregate)) {
    return "setup";
  }
  if (/\b(anticipation|wind[- ]?up|windup|load|loaded|crouch|chamber|charge|build|pressure|pre-impact|approach|lean)\b/.test(aggregate)) {
    return "anticipation";
  }
  if (/\b(impact|contact|hit|strike|clash|blast|ignition|smash|land|landing|squash|flash|peak|burst)\b/.test(aggregate)) {
    return "impact";
  }
  if (/\b(follow[- ]through|recoil|breakup|fragment|spread|rebound|carry through|overshoot|after-strike|fallout)\b/.test(aggregate)) {
    return "follow-through";
  }
  if (/\b(recover|recovery|resolve|resolved|settle|settling|fade|fading|vanish|vanishing|aftermath|residue|reset|ending|final|finish|haze)\b/.test(aggregate)) {
    return "recovery";
  }
  if (/\b(transition|in-between|inbetween|passing|carry|middle|mid|drop|fall|descend|rise|travel|entry|spin|turn|scroll)\b/.test(aggregate)) {
    return "transition";
  }
  if (index === 0) {
    return totalFrames <= 1 ? "setup" : "anticipation";
  }
  if (index >= totalFrames - 1) {
    return "recovery";
  }
  return "action";
};

const inferEngineCommandTiming = ({
  analysis,
  aggregate,
  poseStage,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  aggregate: string;
  poseStage: EngineCommandPoseStage;
}): EngineCommandTiming => {
  if (analysis.outputMode === "still" && analysis.requestedFrameCount <= 1) {
    return "static";
  }
  if (/\b(fast|quick|snap|sharp|sudden|immediate|explosive|violent)\b/.test(aggregate)) {
    return "fast";
  }
  if (/\b(slow|linger|hold|gentle|soft|subtle|settle|fade)\b/.test(aggregate)) {
    return "slow";
  }
  if (poseStage === "impact" && (analysis.motionType === "punch" || analysis.motionType === "kick" || analysis.motionType === "lightning")) {
    return "fast";
  }
  if (analysis.expectedCompletionProfile === "breathing-loop" && poseStage !== "impact") {
    return "slow";
  }
  if (analysis.variationProfile.timingBias === "sharp") {
    return "fast";
  }
  if (analysis.variationProfile.timingBias === "linger") {
    return "slow";
  }
  return "normal";
};

const inferEngineCommandIntensity = ({
  analysis,
  aggregate,
  poseStage,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  aggregate: string;
  poseStage: EngineCommandPoseStage;
}): EngineCommandIntensity => {
  if (analysis.outputMode === "still" && analysis.requestedFrameCount <= 1) {
    return "none";
  }
  if (/\b(heavy|hard|strong|violent|brutal|forceful|explosive|powerful|hot|bigger)\b/.test(aggregate)) {
    return "heavy";
  }
  if (/\b(light|soft|weak|small|subtle|gentle|calm|restrained)\b/.test(aggregate)) {
    return "light";
  }
  if (poseStage === "impact" && (analysis.motionType === "explosion" || analysis.motionType === "impact")) {
    return "heavy";
  }
  if (analysis.forceLevel === "high") {
    return "heavy";
  }
  if (analysis.forceLevel === "low") {
    return "light";
  }
  return "medium";
};

const inferEngineCommandSpacing = ({
  analysis,
  aggregate,
  actionType,
  poseStage,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  aggregate: string;
  actionType: EngineCommandActionType;
  poseStage: EngineCommandPoseStage;
}): EngineCommandSpacing => {
  if (analysis.outputMode === "still" && analysis.requestedFrameCount <= 1) {
    return "none";
  }
  if (/\b(wide|spread|expand|outward|arc|far|higher|long|larger|offset|scroll)\b/.test(aggregate)) {
    return "wide";
  }
  if (/\b(tight|compact|compressed|close|guard|hold|settle|centered|controlled)\b/.test(aggregate)) {
    return "tight";
  }
  if (analysis.motionType === "background-scroll" || actionType === "explosion" || actionType === "jump" || actionType === "projectile") {
    return "wide";
  }
  if (actionType === "walk" || actionType === "run" || actionType === "fight" || actionType === "move" || poseStage === "transition") {
    return "medium";
  }
  if (actionType === "punch" || actionType === "kick" || actionType === "impact" || actionType === "stance") {
    return "tight";
  }
  return "medium";
};

const inferEngineCommandDurationFrames = ({
  analysis,
  actionType,
  timing,
  poseStage,
  totalFrames,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  actionType: EngineCommandActionType;
  timing: EngineCommandTiming;
  poseStage: EngineCommandPoseStage;
  totalFrames: number;
}) => {
  if (analysis.requestedFrameCount <= 1 || analysis.outputMode === "still" || timing === "static") {
    return 1;
  }

  const baseDuration =
    poseStage === "setup"
      ? 2
      : poseStage === "anticipation"
        ? 3
        : poseStage === "impact"
          ? 2
          : poseStage === "follow-through"
            ? 3
            : poseStage === "recovery"
              ? 3
              : poseStage === "transition"
                ? 3
                : 4;
  const actionAdjustment =
    actionType === "breathe"
      ? 2
      : actionType === "scroll" || actionType === "explosion" || actionType === "jump" || actionType === "projectile"
        ? 1
        : 0;
  const extendedDuration = totalFrames >= 8 && poseStage !== "impact" ? baseDuration + actionAdjustment + 1 : baseDuration + actionAdjustment;

  if (timing === "fast") {
    return Math.max(1, extendedDuration - 1);
  }
  if (timing === "slow") {
    return extendedDuration + 2;
  }
  return extendedDuration;
};

const normalizeEngineCommandPoseLabel = ({
  analysis,
  pose,
  index,
  totalFrames,
  description,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  pose: string;
  index: number;
  totalFrames: number;
  description: string;
}) => {
  const cleanedPose = normalizeEngineCommandSourceText(pose).replace(ENGINE_COMMAND_ACTION_PREFIX_PATTERN, "");
  const normalizedPose = cleanedPose.toLowerCase();
  if (ENGINE_COMMAND_POSE_STAGES.has(normalizedPose as EngineCommandPoseStage)) {
    return normalizedPose;
  }

  return inferEngineCommandPoseStage({
    analysis,
    aggregate: normalizePrompt(`${cleanedPose} ${description}`),
    index,
    totalFrames,
  });
};

const buildPoseHoldCommand = (analysis: GenerateFramesRuntimeAnalysis) => {
  if (analysis.visualKind === "scene" || analysis.motionType === "scene") {
    return "set composition and hold without transition";
  }
  if (analysis.motionType === "stance") {
    return "set stance and hold without transition";
  }
  return "set pose and hold without transition";
};

const buildPunchCommand = (analysis: GenerateFramesRuntimeAnalysis, poseStage: EngineCommandPoseStage) => {
  const target = getTargetCharacterSubject(analysis);
  const targetLine =
    target?.side === "left"
      ? "left target line"
      : target?.side === "right"
        ? "right target line"
        : "target line";

  switch (poseStage) {
    case "setup":
    case "anticipation":
      return `shift weight to rear leg, rotate torso away from ${targetLine}, chamber striking arm, and hold release line`;
    case "action":
    case "transition":
      return `drive striking arm through ${targetLine}, rotate hips through extension, and advance shoulder on strike path`;
    case "impact":
      return `drive arm to full extension on ${targetLine}, apply contact stop on impact frame, and start recoil`;
    case "follow-through":
      return "carry shoulder rotation past contact, release stored torque, and begin arm retraction";
    case "recovery":
      return "retract striking arm, re-center hips, and restore guard";
  }
};

const buildKickCommand = (analysis: GenerateFramesRuntimeAnalysis, poseStage: EngineCommandPoseStage) => {
  const target = getTargetCharacterSubject(analysis);
  const targetLine =
    target?.side === "left"
      ? "left target line"
      : target?.side === "right"
        ? "right target line"
        : "target line";

  switch (poseStage) {
    case "setup":
    case "anticipation":
      return `compress support leg, chamber kicking leg toward ${targetLine}, and lock torso for release`;
    case "action":
    case "transition":
      return `drive kicking leg through ${targetLine}, rotate hips through release, and extend full-body line`;
    case "impact":
      return `apply contact stop on ${targetLine}, clamp extension on impact frame, and start leg retraction`;
    case "follow-through":
      return "continue hip rotation past contact, retract kicking leg, and catch balance";
    case "recovery":
      return "re-center stance, plant support line, and restore guard";
  }
};

const buildJumpCommand = (poseStage: EngineCommandPoseStage) => {
  switch (poseStage) {
    case "setup":
    case "anticipation":
      return "compress hips and knees, load arms for lift, and hold launch line";
    case "action":
    case "transition":
      return "extend legs downward, drive body upward on arc path, and separate limbs for travel";
    case "impact":
      return "plant feet on landing frame, compress knees and hips, and absorb downward force";
    case "follow-through":
      return "continue body drop past landing frame, redirect force upward, and stabilize balance";
    case "recovery":
      return "settle from landing compression, re-center torso, and hold the next stable stance";
  }
};

const buildExplosionCommand = (poseStage: EngineCommandPoseStage) => {
  switch (poseStage) {
    case "setup":
    case "anticipation":
      return "compress blast core at source, concentrate pressure, and hold pre-release frame";
    case "action":
    case "transition":
      return "ignite core, expand fire shell outward from source, and maintain source lock";
    case "impact":
      return "hit peak blast radius, apply expansion stop on peak frame, and open pressure edge";
    case "follow-through":
      return "tear fire shell into debris and smoke breakup while preserving source anchor";
    case "recovery":
      return "thin smoke, drop residue, and stop active fire growth";
  }
};

const buildLightningCommand = (poseStage: EngineCommandPoseStage) => {
  switch (poseStage) {
    case "setup":
    case "anticipation":
      return "charge strike origin, clamp source point, and hold discharge frame";
    case "action":
    case "transition":
      return "drive bolt from source to target on one direct path and preserve branch hierarchy";
    case "impact":
      return "flash target contact, clamp bolt at peak intensity for one frame, and prevent beam hold";
    case "follow-through":
      return "collapse main bolt into thinner after-strike branches and reduce active width";
    case "recovery":
      return "remove active bolt, leave brief residue only, and end discharge";
  }
};

const buildShockwaveCommand = (poseStage: EngineCommandPoseStage) => {
  switch (poseStage) {
    case "setup":
    case "anticipation":
      return "load pressure ring at source and hold ground contact point";
    case "action":
    case "transition":
      return "push ring outward along ground plane and maintain circular edge continuity";
    case "impact":
      return "hit maximum ring force on contact frame and clamp leading edge";
    case "follow-through":
      return "shed dust and debris behind leading edge while ring width continues expanding";
    case "recovery":
      return "thin outer ring, drop trailing debris, and stop ground spread";
  }
};

const buildSmokeCommand = (poseStage: EngineCommandPoseStage) => {
  switch (poseStage) {
    case "setup":
    case "anticipation":
      return "establish smoke source and hold output point before release";
    case "action":
    case "transition":
      return "release dense smoke from source, expand cloud mass, and preserve edge layering";
    case "impact":
      return "hit maximum cloud density on peak frame and stop source burst";
    case "follow-through":
      return "spread cloud outward and upward while loosening outer edge";
    case "recovery":
      return "thin outer wisps, reduce source output, and end with haze only";
  }
};

const buildImpactCommand = (poseStage: EngineCommandPoseStage) => {
  switch (poseStage) {
    case "setup":
    case "anticipation":
      return "align impact source with contact point and hold collision line";
    case "action":
    case "transition":
      return "drive source into contact point and preserve impact direction";
    case "impact":
      return "apply contact stop on collision frame, open debris burst, and lock source point";
    case "follow-through":
      return "spread debris from contact point and carry fallout on impact direction";
    case "recovery":
      return "drop fragments, reduce active debris, and end impact motion";
  }
};

const buildBounceCommand = (poseStage: EngineCommandPoseStage) => {
  switch (poseStage) {
    case "setup":
    case "anticipation":
      return "set ball at arc start, preserve round form, and hold release position";
    case "action":
    case "transition":
      return "drive ball along arc path with continuous spacing and locked center path";
    case "impact":
      return "apply brief squash on floor contact frame and stop vertical descent";
    case "follow-through":
      return "restore round form, rebound on the same arc, and reduce lift after peak";
    case "recovery":
      return "reduce rebound height and settle into end state without shape drift";
  }
};

const buildRollCommand = (poseStage: EngineCommandPoseStage) => {
  switch (poseStage) {
    case "setup":
    case "anticipation":
      return "align ball on ground path, lock round form, and hold starting contact";
    case "action":
    case "transition":
      return "rotate ball forward along ground path and preserve constant size";
    case "impact":
      return "apply contact stop against path limit and preserve round contour";
    case "follow-through":
      return "continue rotation past midpoint and maintain ground contact";
    case "recovery":
      return "reduce rotation, stop travel on path, and hold final contact";
  }
};

const buildMorphCommand = (poseStage: EngineCommandPoseStage) => {
  switch (poseStage) {
    case "setup":
    case "anticipation":
      return "hold base form, lock origin shape, and prepare deformation path";
    case "action":
    case "transition":
      return "deform form toward target shape, preserve contour continuity, and keep source identity";
    case "impact":
      return "lock target shape on conversion frame and stop major deformation";
    case "follow-through":
      return "stabilize new contours and remove residual stretch";
    case "recovery":
      return "hold transformed shape and prevent drift back toward source form";
  }
};

const buildProjectileCommand = (analysis: GenerateFramesRuntimeAnalysis, poseStage: EngineCommandPoseStage) => {
  const source =
    /\bright hand\b/i.test(analysis.prompt)
      ? "right hand"
      : /\bleft hand\b/i.test(analysis.prompt)
        ? "left hand"
        : "release source";

  switch (poseStage) {
    case "setup":
    case "anticipation":
      return `charge ${source}, align release path, and hold discharge frame`;
    case "action":
    case "transition":
      return `release projectile from ${source}, drive it along travel path, and preserve source lock`;
    case "impact":
      return "apply contact burst or exit frame, clamp projectile on peak frame, and start breakup";
    case "follow-through":
      return "carry trail and debris behind projectile path while preserving direction";
    case "recovery":
      return `stop ${source} emission, thin trail, and end projectile event`;
  }
};

const buildBreathingCommand = (poseStage: EngineCommandPoseStage) => {
  switch (poseStage) {
    case "setup":
    case "anticipation":
      return "set torso baseline, hold ribcage neutral, and prepare inhale";
    case "action":
    case "transition":
      return "lift ribcage and shoulders for inhale, expand torso volume, and preserve balance";
    case "impact":
      return "hold peak inhale for one frame and stop upward expansion";
    case "follow-through":
      return "drop shoulders into exhale and release torso compression";
    case "recovery":
      return "return to next breath baseline and preserve cycle continuity";
  }
};

const buildWalkCommand = (poseStage: EngineCommandPoseStage) => {
  switch (poseStage) {
    case "setup":
    case "anticipation":
      return "plant lead foot, align hips over support leg, and set opposite arm swing";
    case "action":
      return "drive body mass forward, extend trailing leg, and preserve stride direction";
    case "transition":
      return "pass hips over support foot, switch support leg, and preserve cycle spacing";
    case "impact":
      return "plant next contact foot, clamp slide on contact frame, and absorb step weight";
    case "follow-through":
      return "carry torso past contact and extend into the next stride";
    case "recovery":
      return "settle into next cycle entry and preserve step cadence";
  }
};

const buildRunCommand = (poseStage: EngineCommandPoseStage) => {
  switch (poseStage) {
    case "setup":
    case "anticipation":
      return "compress push-off leg, pitch torso forward, and set sprint release line";
    case "action":
      return "drive body forward, extend stride, and separate airborne legs on travel path";
    case "transition":
      return "pass center through flight phase, switch lead leg, and preserve forward drive";
    case "impact":
      return "plant next run contact, clamp foot slide, and absorb forward load";
    case "follow-through":
      return "carry momentum past contact and open next stride";
    case "recovery":
      return "reset push-off pattern and preserve run cadence";
  }
};

const buildFightCommand = (poseStage: EngineCommandPoseStage) => {
  switch (poseStage) {
    case "setup":
    case "anticipation":
      return "set subject spacing, establish guard, and hold attack entry";
    case "action":
      return "advance subjects into strike path, preserve side assignments, and keep contact lane open";
    case "transition":
      return "carry subjects through exchange path and preserve left-right ownership";
    case "impact":
      return "apply contact stop between subjects, clamp hit spacing, and start recoil";
    case "follow-through":
      return "separate subjects through recoil and preserve screen geography";
    case "recovery":
      return "restore guard spacing and end exchange without restart";
  }
};

const buildScrollCommand = (poseStage: EngineCommandPoseStage) => {
  switch (poseStage) {
    case "setup":
    case "anticipation":
      return "offset background relative to anchored subject and hold subject position";
    case "action":
    case "transition":
      return "move environment opposite travel direction while locking subject screen position";
    case "impact":
      return "hit farthest background offset on peak frame and keep subject locked";
    case "follow-through":
      return "continue background offset with consistent layer spacing and anchored subject";
    case "recovery":
      return "stop background travel at final offset and hold subject position";
  }
};

const buildStanceCommand = (poseStage: EngineCommandPoseStage) => {
  if (poseStage === "setup") {
    return "set stance and hold without transition";
  }
  if (poseStage === "recovery") {
    return "restore stance and hold without transition";
  }
  return "set stance alignment and preserve guard spacing";
};

const buildGenericCommand = (poseStage: EngineCommandPoseStage) => {
  switch (poseStage) {
    case "setup":
      return "set pose and hold without transition";
    case "anticipation":
      return "load pose for release and hold anticipation frame";
    case "action":
      return "execute main motion on primary path and preserve subject continuity";
    case "impact":
      return "apply contact stop on peak frame and lock action direction";
    case "follow-through":
      return "carry remaining force past peak and preserve motion path";
    case "recovery":
      return "settle to end pose and stop motion";
    case "transition":
      return "carry motion between beats and preserve path continuity";
  }
};

const normalizeEngineCommandInstruction = ({
  analysis,
  description,
  poseStage,
  actionType,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  description: string;
  poseStage: EngineCommandPoseStage;
  actionType: EngineCommandActionType;
}) => {
  const parsedDescription = parseExistingEngineCommandDescription(description);
  if (parsedDescription != null) {
    return parsedDescription.command;
  }

  const normalizedDescription = normalizeEngineCommandSourceText(description);
  if (actionType === "pose") {
    return buildPoseHoldCommand(analysis);
  }

  switch (actionType) {
    case "punch":
      return buildPunchCommand(analysis, poseStage);
    case "kick":
      return buildKickCommand(analysis, poseStage);
    case "jump":
      return buildJumpCommand(poseStage);
    case "explosion":
      return buildExplosionCommand(poseStage);
    case "lightning":
      return buildLightningCommand(poseStage);
    case "shockwave":
      return buildShockwaveCommand(poseStage);
    case "smoke":
      return buildSmokeCommand(poseStage);
    case "impact":
      return buildImpactCommand(poseStage);
    case "bounce":
      return buildBounceCommand(poseStage);
    case "roll":
      return buildRollCommand(poseStage);
    case "morph":
      return buildMorphCommand(poseStage);
    case "projectile":
      return buildProjectileCommand(analysis, poseStage);
    case "breathe":
      return buildBreathingCommand(poseStage);
    case "walk":
      return buildWalkCommand(poseStage);
    case "run":
      return buildRunCommand(poseStage);
    case "fight":
      return buildFightCommand(poseStage);
    case "scroll":
      return buildScrollCommand(poseStage);
    case "stance":
      return buildStanceCommand(poseStage);
    default:
      if (normalizedDescription.length > 0 && /\b(add|remove|set|shift|drive|hold|apply|preserve|restore|stop|move|lock|expand|compress|release|retract)\b/.test(normalizedDescription)) {
        return normalizedDescription;
      }
      return buildGenericCommand(poseStage);
  }
};

const normalizeGenerateFramesDraftToEngineCommand = ({
  analysis,
  frame,
  index,
  totalFrames,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  frame: DrawingAiGeneratedFrameDraft;
  index: number;
  totalFrames: number;
}): DrawingAiGeneratedFrameDraft => {
  const sourcePose = normalizeEngineCommandSourceText(frame.pose);
  const sourceDescription = normalizeEngineCommandSourceText(frame.description);
  const parsedCommand = parseExistingEngineCommandDescription(sourceDescription);
  if (parsedCommand != null) {
    return {
      pose: normalizeEngineCommandPoseLabel({
        analysis,
        pose: sourcePose,
        index,
        totalFrames,
        description: sourceDescription,
      }),
      description: formatEngineCommandDescription(parsedCommand),
    };
  }
  const aggregate = normalizePrompt(`${sourcePose} ${sourceDescription}`);
  const actionType = inferEngineCommandActionType({
    analysis,
    pose: sourcePose,
    description: sourceDescription,
  });
  const poseStage = inferEngineCommandPoseStage({
    analysis,
    aggregate,
    index,
    totalFrames,
  });
  const timing = inferEngineCommandTiming({
    analysis,
    aggregate,
    poseStage,
  });
  const intensity = inferEngineCommandIntensity({
    analysis,
    aggregate,
    poseStage,
  });
  const spacing = inferEngineCommandSpacing({
    analysis,
    aggregate,
    actionType,
    poseStage,
  });
  const durationFrames = inferEngineCommandDurationFrames({
    analysis,
    actionType,
    timing,
    poseStage,
    totalFrames,
  });
  const command = normalizeEngineCommandInstruction({
    analysis,
    description: sourceDescription,
    poseStage,
    actionType,
  });

  return {
    pose: normalizeEngineCommandPoseLabel({
      analysis,
      pose: sourcePose,
      index,
      totalFrames,
      description: sourceDescription,
    }),
    description: formatEngineCommandDescription({
      actionType,
      durationFrames,
      intensity,
      timing,
      spacing,
      command,
    }),
  };
};

export const validateGenerateFramesDrafts = ({
  analysis,
  frames,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  frames: readonly DrawingAiGeneratedFrameDraft[];
}): ValidateGenerateFramesDraftsResult => {
  const repairedFrames = clampFrameDraftsToRequest(
    frames
      .map((frame, index, items) =>
        normalizeGenerateFramesDraftToEngineCommand({
          analysis,
          frame,
          index,
          totalFrames: items.length,
        }),
      )
      .filter((frame) => frame.pose.length > 0 || frame.description.length > 0),
    analysis.requestedFrameCount,
    "Generate Frames runtime validation",
  );

  if (repairedFrames.length === 0) {
    return {
      ok: false,
      repairedFrames,
      reason: "No usable frame drafts were returned.",
    };
  }

  const enforcementFailure = validateExecutionEnforcement(analysis, repairedFrames);
  if (enforcementFailure != null) {
    return {
      ok: false,
      repairedFrames,
      reason: enforcementFailure.reason,
    };
  }

  const reason = validateConceptSignals(analysis, repairedFrames);
  return {
    ok: reason == null,
    repairedFrames,
    reason,
  };
};

const isMultiSubjectCombatRequest = (analysis: GenerateFramesRuntimeAnalysis) => {
  const hasExplicitTwoCombatants =
    /\b(?:two|2)\s+(?:stick(?:\s|-)?figures?|fighters?|characters?|people|combatants?)\b/.test(analysis.normalizedPrompt) ||
    /\b(left|right)\b/.test(analysis.normalizedPrompt) ||
    /\b(versus|vs\.?|against)\b/.test(analysis.normalizedPrompt);
  const hasCharacterCombatContext =
    analysis.subjects.filter((subject) => subject.type === "character").length >= 2 ||
    hasExplicitTwoCombatants;
  return (
    analysis.outputMode === "animation" &&
    /\b(fight(?:ing)?|duel(?:ing)?|battle|spar(?:ring)?|versus|vs\.?|against)\b/.test(analysis.normalizedPrompt) &&
    hasCharacterCombatContext
  );
};

export const isGenerateFramesQuestionAllowed = ({
  analysis,
  question,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  question: string;
}) => {
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) {
    return { allowed: false, reason: "Question was empty." };
  }

  if (analysis.questionGate.blocker == null) {
    return { allowed: false, reason: "This request should default intelligently instead of asking a question." };
  }

  for (const topic of analysis.questionGate.disallowedTopics) {
    const pattern = QUESTION_TOPIC_PATTERNS[topic];
    if (pattern && pattern.test(trimmedQuestion)) {
      return { allowed: false, reason: "The question asked about an obvious default that should already be inferred." };
    }
  }

  if (analysis.questionGate.blocker != null && !trimmedQuestion.toLowerCase().includes("side")) {
    if (
      /current (?:drawing|frame|sequence)/i.test(analysis.questionGate.blocker) &&
      !/\b(current drawing|current frame|current sequence|already drawn|existing drawing|nothing to continue|continue from which frame|create new sequence)\b/i.test(trimmedQuestion)
    ) {
      return { allowed: false, reason: "The question did not target the real blocker." };
    }

    if (
      analysis.questionGate.blocker.includes("entry side") &&
      !/\b(side|left|right|top|bottom)\b/i.test(trimmedQuestion)
    ) {
      return { allowed: false, reason: "The question did not target the real blocker." };
    }
  }

  return { allowed: true, reason: null };
};

const buildInterpolationLabel = (analysis: GenerateFramesRuntimeAnalysis) => {
  switch (analysis.motionType) {
    case "explosion":
      return "same explosion event";
    case "lightning":
      return "same lightning strike";
    case "smoke":
      return "same smoke release";
    case "impact":
      return "same impact event";
    case "eruption":
      return "same eruption event";
    case "bounce":
    case "roll":
    case "morph":
      return "same ball motion";
    case "punch":
      return "same punch motion";
    case "kick":
      return "same kick motion";
    case "fight":
      return "same fight motion";
    case "walk":
      return "same walk motion";
    case "run":
      return "same run motion";
    case "background-scroll":
      return "same background scroll";
    default:
      return "same animation";
  }
};

const describeInterpolationBeat = (insertIndex: number, insertsForGap: number) => {
  if (insertsForGap <= 1) {
    return {
      poseSuffix: "transition",
      descriptionLead: "A smoother in-between",
    };
  }

  if (insertIndex === 0) {
    return {
      poseSuffix: "early transition",
      descriptionLead: "An early in-between",
    };
  }

  if (insertIndex === insertsForGap - 1) {
    return {
      poseSuffix: "late transition",
      descriptionLead: "A late in-between",
    };
  }

  return {
    poseSuffix: `mid transition ${insertIndex + 1}`,
    descriptionLead: `A mid in-between ${insertIndex + 1}`,
  };
};

const detectTransitionIntent = (poseLabel: string) => {
  const normalizedPose = poseLabel.toLowerCase();
  if (/\b(contact|impact|clash|strike|release|peak|blast|ignition|hit)\b/.test(normalizedPose)) {
    return "impact";
  }
  if (/\b(recovery|fade|aftermath|afterglow|settle|dim|final|residue|lingering|thin)\b/.test(normalizedPose)) {
    return "resolve";
  }
  if (/\b(chamber|advance|takeoff|load|windup|pre|source ready|spread|build|charge)\b/.test(normalizedPose)) {
    return "build";
  }
  return "carry";
};

const buildInterpolationDescription = ({
  analysis,
  current,
  next,
  interpolationBeat,
  label,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  current: DrawingAiGeneratedFrameDraft;
  next: DrawingAiGeneratedFrameDraft;
  interpolationBeat: ReturnType<typeof describeInterpolationBeat>;
  label: string;
}) => {
  const fromPose = current.pose.toLowerCase();
  const toPose = next.pose.toLowerCase();
  const hasCharacterSubjects = analysis.subjects.some((subject) => subject.type === "character");
  const hasEffectSubjects = analysis.subjects.some((subject) => subject.type === "effect");
  const transitionIntent = detectTransitionIntent(next.pose);

  if (analysis.motionType === "scene" || (analysis.outputMode === "still" && analysis.sceneSetting != null)) {
    if (transitionIntent === "build") {
      return `${interpolationBeat.descriptionLead} eases the scene from ${fromPose} into ${toPose}, keeping the same layout, depth read, and focal placement while the setup gathers clarity.`;
    }
    if (transitionIntent === "resolve") {
      return `${interpolationBeat.descriptionLead} settles the scene from ${fromPose} into ${toPose}, preserving the same layout, depth read, and subject placement without jolting the composition.`;
    }
    return `${interpolationBeat.descriptionLead} keeps the scene moving gently from ${fromPose} into ${toPose}, preserving the same layout, depth read, and subject placement without jolting the composition.`;
  }

  if (hasEffectSubjects || analysis.visualKind === "event") {
    if (transitionIntent === "impact") {
      return `${interpolationBeat.descriptionLead} tightens the ${label} from ${fromPose} into ${toPose}, so the energy lands as one continuous event instead of popping to a new shape.`;
    }
    if (transitionIntent === "resolve") {
      return `${interpolationBeat.descriptionLead} carries the ${label} out of ${fromPose} toward ${toPose}, letting the breakup and fade stay continuous instead of dropping off abruptly.`;
    }
    if (transitionIntent === "build") {
      return `${interpolationBeat.descriptionLead} builds the ${label} forward from ${fromPose} into ${toPose}, keeping the same energy flow, readable material structure, and source continuity.`;
    }
    return `${interpolationBeat.descriptionLead} carries the ${label} forward from ${fromPose} into ${toPose}, keeping the same energy flow, readable breakup, and material continuity instead of popping to a new shape.`;
  }

  if (hasCharacterSubjects) {
    if (transitionIntent === "impact") {
      return `${interpolationBeat.descriptionLead} drives ${fromPose} into ${toPose} with continuous body mechanics, preserved staging, and no pose reset before the main beat lands.`;
    }
    if (transitionIntent === "resolve") {
      return `${interpolationBeat.descriptionLead} eases ${fromPose} into ${toPose} with continuous body mechanics, preserved staging, and no broken-weight drift as the action resolves.`;
    }
    if (transitionIntent === "build") {
      return `${interpolationBeat.descriptionLead} threads ${fromPose} into ${toPose} with continuous body mechanics, preserved staging, and clearer anticipation through the body line.`;
    }
    return `${interpolationBeat.descriptionLead} bridges ${fromPose} into ${toPose} with continuous body mechanics, preserved staging, and no pose reset or broken-weight drift.`;
  }

  return `${interpolationBeat.descriptionLead} carries the ${label} continuously from ${fromPose} toward ${toPose} without teleporting, snapping, or resetting the subject.`;
};

const expandDraftsToRequestedCount = (
  analysis: GenerateFramesRuntimeAnalysis,
  drafts: readonly DrawingAiGeneratedFrameDraft[],
) => {
  const targetCount = clampRequestedFrameCount(Math.max(analysis.requestedFrameCount, drafts.length));
  if (drafts.length <= 1 || targetCount <= drafts.length) {
    return [...drafts];
  }

  const label = buildInterpolationLabel(analysis);
  const gaps = drafts.length - 1;
  let remainingInsertions = targetCount - drafts.length;
  const expanded: DrawingAiGeneratedFrameDraft[] = [];

  for (let index = 0; index < drafts.length; index += 1) {
    const current = drafts[index]!;
    expanded.push(current);
    if (index === drafts.length - 1) {
      continue;
    }

    const gapsRemaining = gaps - index;
    const insertsForGap = Math.ceil(remainingInsertions / Math.max(1, gapsRemaining));
    const next = drafts[index + 1]!;
    for (let insertIndex = 0; insertIndex < insertsForGap; insertIndex += 1) {
      const interpolationBeat = describeInterpolationBeat(insertIndex, insertsForGap);
      expanded.push({
        pose: `${current.pose} to ${next.pose} ${interpolationBeat.poseSuffix}`,
        description: buildInterpolationDescription({
          analysis,
          current,
          next,
          interpolationBeat,
          label,
        }),
      });
    }
    remainingInsertions -= insertsForGap;
  }

  return expanded.slice(0, targetCount);
};

const fitDraftCount = (analysis: GenerateFramesRuntimeAnalysis, drafts: DrawingAiGeneratedFrameDraft[]) =>
  clampFrameDraftsToRequest(
    expandDraftsToRequestedCount(analysis, drafts).map((draft, index, items) =>
      normalizeGenerateFramesDraftToEngineCommand({
        analysis,
        frame: draft,
        index,
        totalFrames: items.length,
      }),
    ),
    analysis.requestedFrameCount,
    "Generate Frames deterministic fallback",
  );

const hasPromptPattern = (analysis: GenerateFramesRuntimeAnalysis, pattern: RegExp) => pattern.test(analysis.prompt);

const buildExplosionStyleDescriptors = (analysis: GenerateFramesRuntimeAnalysis) => {
  const descriptors: string[] = [];
  if (/\bspiky|jagged|starburst\b/i.test(analysis.prompt)) {
    descriptors.push("spiky jagged flame points");
  }
  if (/\b(shockwave|dust ring|blast ring)\b/i.test(analysis.prompt)) {
    descriptors.push("a readable ground shockwave ring");
  }
  if (/\b(add dust|more dust|dusty)\b/i.test(analysis.prompt)) {
    descriptors.push("dusty ground fallout");
  }
  if (/\b(glow|afterglow|bright outer glow)\b/i.test(analysis.prompt)) {
    descriptors.push("strong outer glow support");
  }
  if (/\bpoisonous|toxic|acid(?:ic)?\b/i.test(analysis.prompt)) {
    descriptors.push("sickly toxic energy");
  }
  if (analysis.requestedColor) {
    descriptors.push(`${analysis.requestedColor} dominant color treatment`);
  }
  if (analysis.forceLevel === "high" || analysis.tone === "brutal" || analysis.tone === "powerful") {
    descriptors.push("high-force violent energy");
  } else if (analysis.forceLevel === "low") {
    descriptors.push("smaller restrained force");
  }
  return descriptors;
};

const buildExplosionPalettePhrase = (analysis: GenerateFramesRuntimeAnalysis) => {
  if (/\bpoisonous|toxic|acid(?:ic)?\b/i.test(analysis.prompt)) {
    return "a toxic green core with acid-lime glow and murky poisonous vapor instead of normal orange fire colors";
  }
  if (analysis.requestedColor) {
    return `a ${analysis.requestedColor} dominant blast palette with a hotter bright center`;
  }
  if (analysis.forceLevel === "low") {
    return "a smaller bright core with controlled fire color and softer outer smoke";
  }
  return "a white-yellow core wrapped in orange and red fire";
};

const buildExplosionShapePhrase = (analysis: GenerateFramesRuntimeAnalysis) =>
  /\bspiky|jagged|starburst\b/i.test(analysis.prompt)
    ? "sharp jagged spikes and irregular starburst breakup"
    : analysis.variationProfile.silhouetteBias === "angular"
      ? "angular blast crowns with torn pressure edges"
      : "rounded blast lobes with turbulent fire breakup";

const buildExplosionSupportPhrase = (analysis: GenerateFramesRuntimeAnalysis) => {
  const supportAccents: string[] = [];
  if (/\b(shockwave|dust ring|blast ring)\b/i.test(analysis.prompt)) {
    supportAccents.push("a distinct ground-hugging shockwave ring tied to the same blast");
  }
  if (/\b(add dust|more dust|dusty)\b/i.test(analysis.prompt)) {
    supportAccents.push("dust kicked outward under the main fire instead of replacing it");
  }
  if (/\b(glow|afterglow|bright outer glow)\b/i.test(analysis.prompt)) {
    supportAccents.push("a strong outer glow that supports the blast shape");
  }

  return supportAccents.length > 0 ? supportAccents.join(", ") : "";
};

const buildExplosionAftermathPhrase = (analysis: GenerateFramesRuntimeAnalysis) => {
  if (/\bpoisonous|toxic|acid(?:ic)?\b/i.test(analysis.prompt)) {
    return "toxic green smoke and corrosive-looking vapor linger through the aftermath so the new poisonous treatment stays dominant";
  }
  if (/\bspiky|jagged|starburst\b/i.test(analysis.prompt)) {
    return "the jagged starburst silhouette stays visible through the breakup so the explosion still reads clearly as spiky";
  }
  if (analysis.forceLevel === "low") {
    return "the smaller softer blast breaks down into smoke and dust instead of hanging forever at full force";
  }
  return "darker smoke, dust, and debris spread from the center while glowing fragments linger";
};

const buildExplosionPressurePhrase = (analysis: GenerateFramesRuntimeAnalysis) => {
  if (analysis.forceLevel === "low") {
    return pickDeterministicVariant(analysis, [
      "compresses into a smaller bright core with visible pressure, unstable energy, and a tight pre-blast glow",
      "packs into a restrained bright core with visible pressure and a tight unstable halo before release",
      "draws inward into a compact bright core with held pressure and a tense pre-blast shimmer",
    ], 5);
  }

  return pickDeterministicVariant(analysis, [
    "compresses into a bright dense core with visible pressure, unstable energy, and a tight pre-blast glow",
    "pulls inward into a dense bright fire core with crushed pressure and a visibly unstable outer shell",
    "tightens into a hot compressed core with obvious pressure buildup and a strained pre-blast halo",
  ], 5);
};

const buildExplosionFinalResiduePhrase = (analysis: GenerateFramesRuntimeAnalysis) => {
  if (/\bpoisonous|toxic|acid(?:ic)?\b/i.test(analysis.prompt)) {
    return pickDeterministicVariant(analysis, [
      "Only corrosive-looking residue vapor and a few dying toxic embers remain so the poisonous explosion clearly finishes instead of hanging at full strength.",
      "Only thin toxic vapor and a few dying green sparks remain so the poisonous blast clearly resolves instead of freezing in place.",
      "Only fading corrosive smoke and a few dying toxic embers remain so the poisonous explosion clearly ends instead of lingering as a live blast.",
    ], 37);
  }

  return pickDeterministicVariant(analysis, [
    "Only thin residue smoke, dust, and a few dying embers remain so the explosion clearly finishes instead of lingering as another peak frame.",
    "Only broken fallout smoke, drifting dust, and a few dying embers remain so the blast clearly resolves instead of hanging at peak energy.",
    "Only thinning residue smoke, dusty fallout, and a few fading ember trails remain so the explosion ends cleanly instead of freezing as a live fireball.",
  ], 37);
};

const getPrimaryCharacterSubject = (analysis: GenerateFramesRuntimeAnalysis) =>
  analysis.subjects.find((subject) => subject.role === "attacker" || subject.role === "primary" || subject.role === "runner") ??
  analysis.subjects.find((subject) => subject.type === "character") ??
  null;

const getTargetCharacterSubject = (analysis: GenerateFramesRuntimeAnalysis) =>
  analysis.subjects.find((subject) => subject.role === "defender" || subject.role === "target") ?? null;

const buildPunchTonePhrases = (analysis: GenerateFramesRuntimeAnalysis) => {
  if (analysis.forceLevel === "high" || analysis.tone === "brutal" || analysis.tone === "powerful") {
    return {
      windup: "a deeper committed wind-up with stronger torsion and a harsher line of action",
      contact: "a brutally committed contact beat with stronger extension, harder impact, and fast decisive motion",
      followThrough: "a heavy follow-through and recoil so the punch feels powerful and serious instead of timid",
    };
  }

  if (analysis.forceLevel === "low" || analysis.tone === "weak" || analysis.tone === "scared" || analysis.tone === "hesitant") {
    return {
      windup: "a smaller hesitant wind-up with reduced commitment and visibly cautious body language",
      contact: "a weaker tentative contact beat with shorter extension and softer intent",
      followThrough: "a reduced follow-through and guarded recovery so the punch reads as weak or scared instead of forceful",
    };
  }

  if (analysis.tone === "serious") {
    return {
      windup: "a grounded controlled wind-up with clean torsion and no wasted motion",
      contact: "a serious committed contact beat with clear extension and controlled force",
      followThrough: "a disciplined follow-through and balanced recovery so the punch feels serious and intentional",
    };
  }

  return {
    windup: "grounded weight, clear guard, and readable force preparation in the striking direction",
    contact: "a committed impact beat with a strong line of action, clear extension, and readable hit direction",
    followThrough: "a controlled follow-through with recoil and recovery so the punch feels forceful instead of posed",
  };
};

const buildWalkTonePhrases = (analysis: GenerateFramesRuntimeAnalysis) => {
  if (/\b(sad|downcast|depressed|gloomy|miserable)\b/i.test(analysis.prompt)) {
    return {
      contact: "a sad downcast contact beat with shorter stride, dropped chest, softer arm swing, and heavier emotional drag through the planted foot",
      passing: "a subdued passing beat with low energy, a slightly hanging head line, and a weary transfer of weight instead of a lively march",
    };
  }

  if (/\b(mad|angry|furious|grumpy|irritated)\b/i.test(analysis.prompt)) {
    return {
      contact: "an angry stomping contact beat with harder foot plant, tighter shoulders, and more force-driven stride commitment",
      passing: "a tense passing beat with sharper body drive, stronger arm carry, and compressed impatience through center",
    };
  }

  if (/\b(joyful|happy|cheerful|playful|bouncy)\b/i.test(analysis.prompt)) {
    return {
      contact: "a joyful buoyant contact beat with lifted chest, springier footing, and open lively arm swing",
      passing: "a light buoyant passing beat with easy rise, playful carry, and upbeat weight transfer",
    };
  }

  if (analysis.forceLevel === "low" || analysis.tone === "weak" || analysis.tone === "scared" || analysis.tone === "hesitant") {
    return {
      contact: "a smaller cautious contact beat with shorter stride, lighter foot placement, and a more hesitant body line",
      passing: "a careful passing beat with reduced stride commitment and a guarded weight transfer",
    };
  }

  if (analysis.forceLevel === "high" || analysis.tone === "powerful") {
    return {
      contact: "a longer confident contact beat with stronger forward travel, clearer planted force, and committed posture",
      passing: "a driven passing beat with assertive weight transfer and stronger stride carry",
    };
  }

  return {
    contact: "a readable walk contact beat with planted footing, balanced torso, and clear stride direction",
    passing: "a smooth passing beat with stable balance and readable weight transfer",
  };
};

const buildExplosionDrafts = (analysis: GenerateFramesRuntimeAnalysis) => {
  const styleDescriptors = buildExplosionStyleDescriptors(analysis);
  const styleLead = styleDescriptors.length > 0 ? `${styleDescriptors.join(", ")}, ` : "";
  const palettePhrase = buildExplosionPalettePhrase(analysis);
  const shapePhrase = buildExplosionShapePhrase(analysis);
  const aftermathPhrase = buildExplosionAftermathPhrase(analysis);
  const pressurePhrase = buildExplosionPressurePhrase(analysis);
  const residuePhrase = buildExplosionFinalResiduePhrase(analysis);
  const supportPhrase = buildExplosionSupportPhrase(analysis);
  const blastAccent =
    analysis.variationProfile.silhouetteBias === "angular"
      ? "ragged spike breaks and uneven blast crowns"
      : pickDeterministicVariant(analysis, [
          "rolling fire lobes and uneven outer breakup",
          "layered blast petals and torn outer edges",
          "offset outer shells and debris-torn fire pockets",
        ], 11);
  const residueAccent =
    analysis.variationProfile.timingBias === "linger"
      ? "heavier smoke columns and drifting dusty fallout"
      : pickDeterministicVariant(analysis, [
          "thinning smoke sheets and fragment fallout",
          "dusty fallout with scattered embers",
          "cooling residue smoke with broken ember trails",
        ], 29);

  return fitDraftCount(analysis, [
    {
      pose: "Explosion pressure build",
      description: `${styleLead}${palettePhrase} ${pressurePhrase}.`,
    },
    {
      pose: "Explosion ignition flash",
      description: `A hot ignition flash tears open from the compressed core with ${palettePhrase}, a sudden white-hot center, and the first aggressive outward rupture.`,
    },
    {
      pose: "Explosion early rupture",
      description: `The fire shell starts tearing outward from the core with fast directional force and a clearer expanding silhouette before the full blast peaks.`,
    },
    {
      pose: "Explosion blast release",
      description: `The explosion hits as a forceful outward blast with ${palettePhrase}, strong expansion, ${shapePhrase}, and ${blastAccent}${supportPhrase ? `, plus ${supportPhrase}` : ""} so the silhouette feels violent instead of soft.`,
    },
    {
      pose: "Explosion peak energy",
      description: `The blast reaches peak spread with ${shapePhrase}, hotter center pockets, and layered fire breakup so the core still reads bright inside the larger burst.`,
    },
    {
      pose: "Explosion breakup shards",
      description: `The outer blast starts breaking apart into fragments, torn fire lobes, and debris breakup so the shape no longer feels like one static mass.`,
    },
    {
      pose: "Explosion smoke expansion",
      description: `Smoke, dust, and debris expand outward behind the fire shell while the main blast still reads clearly as the same explosion event${supportPhrase ? `, with ${supportPhrase} staying secondary to the core blast` : ""}.`,
    },
    {
      pose: "Explosion smoky aftermath",
      description: `${aftermathPhrase}, with the fire breaking apart under ${residueAccent} instead of staying at peak blast forever.`,
    },
    {
      pose: "Explosion disintegration fade",
      description: `The remaining smoke, dust, and glowing fragments disintegrate and thin out into a readable fade so the explosion ends cleanly instead of freezing in place.`,
    },
    {
      pose: "Explosion final residue",
      description: residuePhrase,
    },
  ]);
};

const buildLightningShapePhrase = (analysis: GenerateFramesRuntimeAnalysis) => {
  if (/\b(forked|branch(?:ed|ing)|multi[- ]branch)\b/i.test(analysis.prompt)) {
    return "a forked jagged main path with aggressive branch splits";
  }
  if (/\b(needle|razor|thin)\b/i.test(analysis.prompt)) {
    return "a razor-thin zigzag path with needle-sharp branch tips";
  }
  if (analysis.variationProfile.silhouetteBias === "angular") {
    return "a sharp zigzag main bolt with hard branch angles";
  }
  return "a bright zigzag strike with crisp branch breaks";
};

const buildLightningChargePhrase = (analysis: GenerateFramesRuntimeAnalysis) => {
  if (/\b(charge|charging|charged|preflash|build(?:ing)? up|snap)\b/i.test(analysis.prompt)) {
    return "A tight pre-flash charge gathers for an instant along the strike path, keeping the setup brief instead of turning into a slow beam.";
  }
  if (analysis.variationProfile.timingBias === "sharp") {
    return pickDeterministicVariant(analysis, [
      "A razor-thin electric guide line snaps into place for an instant, with barely any delay before the strike.",
      "A needle-thin charge trace flashes into place for a split second, with almost no delay before the strike lands.",
      "A hairline electric guide snaps on for an instant, keeping the setup brutally short before the main strike.",
    ], 13);
  }
  return pickDeterministicVariant(analysis, [
    "A thin white-blue charge line snaps into place for an instant, with just enough pre-flash to set up the strike without lingering.",
    "A narrow white-blue charge path flickers on briefly, giving the strike a readable setup without turning into a beam.",
    "A slim electric guide line flashes in for a moment, setting up the strike without hanging around on screen.",
  ], 13);
};

const buildLightningSupportPhrase = (analysis: GenerateFramesRuntimeAnalysis) => {
  const supportAccents: string[] = [];
  if (/\b(glow|afterglow|bright|brightness)\b/i.test(analysis.prompt)) {
    supportAccents.push("a strong electric glow hugging the bolt");
  }
  if (/\b(ghost trail|afterimage|after-image)\b/i.test(analysis.prompt)) {
    supportAccents.push("a razor-thin ghost trail that lasts only a blink after impact");
  }
  if (/\b(blur|motion blur)\b/i.test(analysis.prompt)) {
    supportAccents.push("a slight strike blur that supports the speed without smearing the bolt into fog");
  }

  return supportAccents.length > 0 ? supportAccents.join(", ") : "";
};

const buildLightningFlashPhrase = (analysis: GenerateFramesRuntimeAnalysis) => {
  if (analysis.forceLevel === "high" || analysis.tone === "powerful" || analysis.tone === "brutal") {
    return "a white-hot impact core, harsh branch contrast, and a violent electric flash";
  }
  return "a white-hot center, crisp branch edges, and strong electric contrast across the main bolt";
};

const buildLightningEndingPhrase = (analysis: GenerateFramesRuntimeAnalysis) => {
  if (/\b(ghost trail|afterimage|after-image)\b/i.test(analysis.prompt)) {
    return "only a hairline ghost trail survives for a blink before disappearing completely";
  }
  if (/\b(glow|afterglow)\b/i.test(analysis.prompt)) {
    return "only a tiny afterglow trace remains for an instant before the strike fully disappears";
  }
  if (analysis.variationProfile.timingBias === "sharp") {
    return pickDeterministicVariant(analysis, [
      "the bolt dies almost immediately after the flash",
      "the strike collapses to nothing almost as soon as the flash peaks",
      "the remaining arc disappears almost instantly after the main flash",
    ], 19);
  }
  return pickDeterministicVariant(analysis, [
    "only a razor-thin ghost remains for an instant",
    "the after-strike trace is barely visible before it disappears",
    "the remaining arc collapses into a tiny fading ghost",
  ], 19);
};

const buildLightningDrafts = (analysis: GenerateFramesRuntimeAnalysis) => {
  const lightningTimingAnalysis =
    analysis.requestKind === "small-animation" && analysis.requestedFrameCount > 8
      ? { ...analysis, requestedFrameCount: 8 }
      : analysis;
  const shapePhrase = buildLightningShapePhrase(lightningTimingAnalysis);
  const supportPhrase = buildLightningSupportPhrase(lightningTimingAnalysis);
  const flashPhrase = buildLightningFlashPhrase(lightningTimingAnalysis);
  const vanishAccent = buildLightningEndingPhrase(lightningTimingAnalysis);

  return fitDraftCount(lightningTimingAnalysis, [
    {
      pose: "Lightning charge line",
      description: `${buildLightningChargePhrase(lightningTimingAnalysis)} ${supportPhrase ? `Keep ${supportPhrase} secondary to the strike path.` : ""}`.trim(),
    },
    {
      pose: "Lightning snap strike",
      description: `The bolt hits suddenly with ${shapePhrase}, a bright tapered core, and a harsh electric silhouette${supportPhrase ? `, with ${supportPhrase}` : ""} so it reads as a fast strike instead of a slow effect.`,
    },
    {
      pose: "Lightning peak flash",
      description: `The strike reaches its brightest flash with ${flashPhrase}, keeping the bolt sharp and readable instead of turning into a glowing blur blob.`,
    },
    {
      pose: "Lightning collapse",
      description: `The main bolt collapses into a much thinner after-strike arc${supportPhrase ? ` while ${supportPhrase} fade with it` : ""}, so the energy clearly starts dying off immediately after the flash.`,
    },
    {
      pose: "Lightning vanish",
      description: `${vanishAccent}, so the lightning disappears completely instead of hanging around like an explosion.`,
    },
  ]);
};

const buildBackgroundScrollScenePhrase = (analysis: GenerateFramesRuntimeAnalysis) => {
  switch (analysis.sceneSetting) {
    case "neighborhood":
      return "A readable neighborhood with houses, sidewalks, fences, and street-side depth moves behind the character";
    case "city":
      return "A layered city backdrop with buildings, street edges, and depth bands moves behind the character";
    case "forest":
      return "A layered forest with trunks, foliage, and receding depth moves behind the character";
    case "canyon":
      return "A canyon backdrop with rock walls and open ground depth moves behind the character";
    case "cave":
      return "A cave backdrop with rocky openings, shadow pockets, and depth planes moves behind the character";
    case "plains":
      return "A readable open landscape with ground spread and distance layers moves behind the character";
    default:
      return "A readable environment with separated foreground, middle-ground, and distance layers moves behind the character";
  }
};

const buildBackgroundScrollTonePhrase = (analysis: GenerateFramesRuntimeAnalysis) => {
  if (/\b(sad|downcast|gloomy|moody|melancholy)\b/i.test(analysis.prompt)) {
    return "The travel should feel low-energy and moody rather than like a treadmill loop.";
  }
  if (analysis.tone === "powerful" || analysis.forceLevel === "high") {
    return "The travel should feel driven and forceful, with the environment sweeping past decisively.";
  }
  if (analysis.tone === "hesitant" || analysis.tone === "scared") {
    return "The travel should feel cautious, with the world shifting around the anchored subject without losing readability.";
  }
  return "The travel should feel like real forward movement through space instead of a static-background walk cycle.";
};

const buildShockwaveDrafts = (analysis: GenerateFramesRuntimeAnalysis) =>
  fitDraftCount(analysis, [
    {
      pose: "Shockwave ignition",
      description: "A tight blast ring starts near the source with dust beginning to kick outward along the ground.",
    },
    {
      pose: "Shockwave first expansion",
      description: "The shockwave opens into a wider ring with clear outward force, dusty breakup, and a readable ground-hugging blast edge.",
    },
    {
      pose: "Shockwave peak ring",
      description: "The ring reaches a clearer wider peak with a pressure edge that feels fast and force-driven instead of soft smoke.",
    },
    {
      pose: "Shockwave dusty spread",
      description: "Dust and debris continue spreading outward behind the main ring so the shockwave keeps a layered pressure read.",
    },
    {
      pose: "Shockwave fade",
      description: "The outer ring thins and loses force while dust trails and debris continue outward in a readable aftermath.",
    },
    {
      pose: "Shockwave final settle",
      description: "The ring finally fades into a low dusty settle so the event ends cleanly instead of freezing as one repeated band.",
    },
  ]);

const buildConcreteCrackDrafts = (analysis: GenerateFramesRuntimeAnalysis) =>
  fitDraftCount(analysis, [
    {
      pose: "Concrete fracture spread",
      description: "Surface-bound cracks radiate through the concrete from a clear stress point with chipped edges and a little dust, keeping the result environment-only.",
    },
  ]);

const buildBouncingBallDrafts = (analysis: GenerateFramesRuntimeAnalysis) => {
  const colorPrefix = analysis.requestedColor ? `${analysis.requestedColor} ` : "";
  return fitDraftCount(analysis, [
    {
      pose: "Ball high start",
      description: `The same ${colorPrefix}ball starts high on a clear bounce path in a clean round form with a stable silhouette and no shape drift.`,
    },
    {
      pose: "Ball descending arc",
      description: `The ${colorPrefix}ball drops smoothly along the same arc with continuous spacing, still staying clearly round and object-only.`,
    },
    {
      pose: "Ball lower descending arc",
      description: `The ${colorPrefix}ball continues descending on the same path with another readable in-between so the motion keeps progressing instead of jumping to impact.`,
    },
    {
      pose: "Ball pre-impact compression",
      description: `The ${colorPrefix}ball reaches the last descending beat just before impact so the motion clearly leads into the hit instead of teleporting.`,
    },
    {
      pose: "Ball contact squash",
      description: `The ${colorPrefix}ball hits the ground with only a slight readable squash, keeping the object clearly a ball.`,
    },
    {
      pose: "Ball rebound arc",
      description: `The ${colorPrefix}ball rebounds upward on the same path with round form restored and a clear continuous arc away from the impact.`,
    },
    {
      pose: "Ball rebound crest",
      description: `The ${colorPrefix}ball reaches the top of the smaller rebound with continuous spacing so the bounce reads as one connected motion arc.`,
    },
    {
      pose: "Ball lower return",
      description: `The ${colorPrefix}ball drops back into a smaller return beat so the motion resolves instead of cutting off immediately after the rebound.`,
    },
    {
      pose: "Ball settle",
      description: `The ${colorPrefix}ball returns to a lower controlled settle so the bounce has a readable ending instead of cutting off halfway through.`,
    },
  ]);
};

const buildRollingBallDrafts = (analysis: GenerateFramesRuntimeAnalysis) => {
  const colorPrefix = analysis.requestedColor ? `${analysis.requestedColor} ` : "";
  return fitDraftCount(analysis, [
    {
      pose: "Ball entry roll",
      description: `The ${colorPrefix}ball enters the shot already rolling with a stable circular identity and grounded travel.`,
    },
    {
      pose: "Ball mid-roll",
      description: `The same ${colorPrefix}ball rolls cleanly through the middle of the shot with consistent size and direction.`,
    },
    {
      pose: "Ball exit roll",
      description: `The ${colorPrefix}ball continues its roll out of the shot without morphing or drifting away from clean object motion.`,
    },
  ]);
};

const buildMorphingBallDrafts = (analysis: GenerateFramesRuntimeAnalysis) => {
  const colorPrefix = analysis.requestedColor ? `${analysis.requestedColor} ` : "";
  return fitDraftCount(analysis, [
    {
      pose: "Ball base form",
      description: `A clear ${colorPrefix}ball starts in a stable round form so the object identity is unmistakable before any transformation begins.`,
    },
    {
      pose: "Ball morph transition",
      description: `The ${colorPrefix}ball deliberately stretches and reshapes through a readable in-between, showing controlled morphing instead of random drift or accidental anatomy.`,
    },
    {
      pose: "Ball transformed form",
      description: `The transformation lands in a clear new shape while still feeling like it evolved from the original ${colorPrefix}ball rather than turning into unrelated nonsense.`,
    },
  ]);
};

const buildPunchDrafts = (analysis: GenerateFramesRuntimeAnalysis) => {
  const actor = getPrimaryCharacterSubject(analysis);
  const target = getTargetCharacterSubject(analysis);
  const actorPhrase =
    actor != null
      ? `The ${formatSceneSubjectLabel(actor)}`
      : "The figure";
  const targetPhrase =
    target != null
      ? `toward the ${formatSceneSubjectLabel(target)}`
      : "through the target line";
  const tonePhrases = buildPunchTonePhrases(analysis);

  return fitDraftCount(analysis, [
    {
      pose: actor?.side === "left" ? "Left punch anticipation" : actor?.side === "right" ? "Right punch anticipation" : "Punch anticipation",
      description: `${actorPhrase} loads for the punch with ${tonePhrases.windup}, a readable head-torso line, and clear arm and leg placement while staying on the ${actor?.side ?? "center"} side before driving ${targetPhrase}.`,
    },
    {
      pose: "Punch contact",
      description: `${actorPhrase} lands ${tonePhrases.contact} ${targetPhrase}, keeping the striking limb, torso rotation, and target line easy to read.`,
    },
    {
      pose: "Punch follow-through",
      description: `${actorPhrase} carries into ${tonePhrases.followThrough} ${targetPhrase}.`,
    },
    {
      pose: "Punch recovery",
      description: `${actorPhrase} settles from the strike into a balanced recovery beat so the action reads as a finished punch instead of a frozen pose.`,
    },
  ]);
};

const buildKickDrafts = (analysis: GenerateFramesRuntimeAnalysis) => {
  const actor = getPrimaryCharacterSubject(analysis);
  const target = getTargetCharacterSubject(analysis);
  const actorPhrase =
    actor != null
      ? `The ${formatSceneSubjectLabel(actor)}`
      : "The figure";
  const targetPhrase =
    target != null
      ? `toward the ${formatSceneSubjectLabel(target)}`
      : "through a clear kicking line";
  const isAirborneKick = /\b(jump|jumping|leap|leaping|airborne|flying|aerial)\b/i.test(analysis.prompt);
  const isRoundKick = /\b(round(?:house)?|spinning|spin)\b/i.test(analysis.prompt);

  return fitDraftCount(analysis, [
    {
      pose: isAirborneKick ? "Jump kick takeoff" : "Kick chamber",
      description: `${actorPhrase} loads the kick with a readable head-torso line, a clear chambered leg, balanced support placement, and believable body mechanics before driving ${targetPhrase}.`,
    },
    {
      pose: isAirborneKick ? "Airborne kick chamber" : isRoundKick ? "Round kick swing" : "Kick extension",
      description: `${actorPhrase} carries into ${isAirborneKick ? "an airborne" : "the main"} kick release with ${isRoundKick ? "a sweeping round-kick arc, turning hips, and a readable leg path" : "clear hip turn, a strong kicking line, and readable full-body extension"} so the action stays one clean figure instead of splitting into a second subject.`,
    },
    {
      pose: isRoundKick ? "Round kick contact" : "Kick contact",
      description: `${actorPhrase} lands the main kick beat ${targetPhrase} with readable torso rotation, a decisive striking leg, and a clear contact or near-contact moment so the kick reads as the peak of the action.`,
    },
    {
      pose: isAirborneKick ? "Kick landing recovery" : "Kick recovery",
      description: `${actorPhrase} follows through into a readable recovery with leg retraction, balance catch, and a resolved finish so the kick completes its arc instead of freezing mid-swing.`,
    },
  ]);
};

const buildJumpDrafts = (analysis: GenerateFramesRuntimeAnalysis) => {
  const actor = getPrimaryCharacterSubject(analysis);
  const actorPhrase =
    actor?.side === "left"
      ? "The left figure"
      : actor?.side === "right"
        ? "The right figure"
        : "The figure";
  const landingTone =
    analysis.tone === "hesitant" || analysis.tone === "scared"
      ? "a careful guarded landing"
      : "a controlled landing";

  return fitDraftCount(analysis, [
    {
      pose: "Jump crouch",
      description: `${actorPhrase} compresses into a clear crouched setup with bent knees, lowered hips, and balanced arm placement so the jump starts from a readable loaded pose instead of appearing from nowhere.`,
    },
    {
      pose: "Jump launch",
      description: `${actorPhrase} drives upward out of the crouch with stretched legs, lifting torso, and a clear launch line so the jump has a strong takeoff beat instead of skipping straight to midair.`,
    },
    {
      pose: "Jump peak",
      description: `${actorPhrase} reaches the peak of the jump with a readable airborne silhouette, tucked or extended legs that still stay clean, and a clear feeling of suspended height at the top of the arc.`,
    },
    {
      pose: "Jump landing",
      description: `${actorPhrase} drops into ${landingTone} with the feet finding the ground, the body absorbing impact, and the silhouette staying readable through contact.`,
    },
    {
      pose: "Jump recovery",
      description: `${actorPhrase} settles back into a balanced finish after the landing so the jump completes its full arc instead of stopping at impact.`,
    },
  ]);
};

const buildBreathingDrafts = (analysis: GenerateFramesRuntimeAnalysis) => {
  const primarySubject =
    analysis.subjects.find((subject) => subject.type === "character") ??
    analysis.subjects.find((subject) => subject.type !== "background") ??
    null;
  const label = primarySubject?.label?.trim() || analysis.promptSubject || "person";
  const intensityPhrase = /\b(hard|heavy|pant(?:ing)?|exhausted|winded)\b/i.test(analysis.prompt)
    ? "clear heavier inhale and exhale effort"
    : "a readable inhale and exhale rhythm";

  return fitDraftCount(analysis, [
    {
      pose: "Breathing inhale setup",
      description: `The ${label} starts in a readable upright breathing setup with shoulders and ribcage ready to lift, so the motion begins from a clear calm-to-strained baseline instead of a frozen pose.`,
    },
    {
      pose: "Breathing inhale peak",
      description: `The ${label} pulls into ${intensityPhrase}, with the chest lifted, shoulders slightly raised, and the whole silhouette reading as a real inhale instead of generic bobbing.`,
    },
    {
      pose: "Breathing exhale drop",
      description: `The ${label} releases into a visible exhale with the shoulders dropping, torso settling, and the rhythm staying readable as one continuous breathing cycle.`,
    },
    {
      pose: "Breathing recovery rhythm",
      description: `The ${label} returns toward the next breathing setup with a controlled recovery so the motion completes a full inhale-exhale cycle instead of stopping halfway through one breath.`,
    },
  ]);
};

const buildSpinningFanDrafts = (analysis: GenerateFramesRuntimeAnalysis) =>
  fitDraftCount(analysis, [
    {
      pose: "Fan setup",
      description: "A readable fan starts still with a clear hub, blades, and stand or housing silhouette before the spin begins, so the object identity is obvious at a glance.",
    },
    {
      pose: "Fan spool-up",
      description: "The fan begins accelerating with blades still individually readable, a slight sense of rotational blur, and no drift away from the same centered fan structure.",
    },
    {
      pose: "Fan fast spin",
      description: "The fan reaches a faster spin with a strong circular blade sweep, a bright readable hub, and a clean spinning silhouette instead of random scribbles.",
    },
    {
      pose: "Fan loop close",
      description: "The fan stays centered and readable as the spin loops back toward the starting blade orientation, so the motion feels continuous rather than cutting off on a random mid-spin frame.",
    },
  ]);

const buildWalkingDrafts = (analysis: GenerateFramesRuntimeAnalysis) => {
  const tonePhrases = buildWalkTonePhrases(analysis);
  const carryIdentityPhrase =
    /\b(sad|downcast|depressed|gloomy|miserable)\b/i.test(analysis.prompt)
      ? "the same downcast identity"
      : /\b(mad|angry|furious|grumpy|irritated)\b/i.test(analysis.prompt)
        ? "the same angry stomp identity"
        : /\b(joyful|happy|cheerful|playful|bouncy)\b/i.test(analysis.prompt)
          ? "the same buoyant joyful identity"
          : analysis.tone === "hesitant" || analysis.tone === "scared"
            ? "the same cautious identity"
            : "a real stable rhythm";
  const oppositePassingPhrase =
    /\b(sad|downcast|depressed|gloomy|miserable)\b/i.test(analysis.prompt)
      ? "a low-energy weary carry"
      : /\b(mad|angry|furious|grumpy|irritated)\b/i.test(analysis.prompt)
        ? "tense impatient carry"
        : /\b(joyful|happy|cheerful|playful|bouncy)\b/i.test(analysis.prompt)
          ? "playful buoyant carry"
          : analysis.tone === "hesitant" || analysis.tone === "scared"
            ? "careful guarded carry"
            : "smooth carry";
  return fitDraftCount(analysis, [
    {
      pose: "Walk right contact",
      description: `${tonePhrases.contact} with one foot planted forward, the other trailing, a readable head-torso line, and clean opposing arms.`,
    },
    {
      pose: "Walk passing beat",
      description: `${tonePhrases.passing} through center with no broken-joint drift and clear weight passing over the planted leg.`,
    },
    {
      pose: "Walk left contact",
      description: `The opposite foot plants into the next contact beat so the walk keeps ${carryIdentityPhrase} instead of random stepping.`,
    },
    {
      pose: "Walk left passing beat",
      description: `The cycle continues through the opposite passing beat with ${oppositePassingPhrase}, clear weight transfer, and readable continuous walk timing.`,
    },
  ]);
};

const buildFightingStanceDrafts = (analysis: GenerateFramesRuntimeAnalysis) => {
  const characterSubjects = analysis.subjects.filter((subject) => subject.type === "character");

  if (characterSubjects.length >= 2) {
    const leftSubject = characterSubjects.find((subject) => subject.side === "left") ?? characterSubjects[0]!;
    const rightSubject = characterSubjects.find((subject) => subject.side === "right") ?? characterSubjects[1] ?? characterSubjects[0]!;
    return fitDraftCount(analysis, [
      {
        pose: "Guard stance faceoff",
        description: `Keep the ${formatSceneSubjectLabel(leftSubject)} on the left and the ${formatSceneSubjectLabel(rightSubject)} on the right, facing each other in readable guard stances with solid heads, clean limb lines, balanced footing, and no scene reset or subject collapse.`,
      },
    ]);
  }

  return fitDraftCount(analysis, [
    {
      pose: "Fighting stance",
      description: "A readable guard-like stance with a clear head-torso line, balanced footing, ready hands, clear weight placement, solid head readability, and no awkward crouch garbage.",
    },
  ]);
};

const buildRunningDrafts = (analysis: GenerateFramesRuntimeAnalysis) =>
  fitDraftCount(analysis, [
    {
      pose: "Run push-off",
      description: "The character drives into the run with a clear push-off, readable direction, a strong head-torso line, and clean limb opposition.",
    },
    {
      pose: "Run passing beat",
      description: "The run stays readable in the middle beat with clean stride mechanics, clear airborne leg separation, and no broken limb drift.",
    },
    {
      pose: "Run stride extension",
      description: "The run extends forward with clear direction, strong readable motion, and a clean landing line instead of tangled posing.",
    },
  ]);

const buildDarkRoomDrafts = (analysis: GenerateFramesRuntimeAnalysis) =>
  fitDraftCount(analysis, [
    {
      pose: "Dark room environment",
      description: "A dark room with readable wall and floor planes, deep shadow pockets, a small controlled light source or glow spill, and environment-first staging with no added subject.",
    },
  ]);

const buildMountainLandscapeDrafts = (analysis: GenerateFramesRuntimeAnalysis) =>
  fitDraftCount(analysis, [
    {
      pose: "Open plains with mountain ranges",
      description: "A wide landscape with open grass plains in the foreground, softer middle-ground land breaks, and mountain ranges layered clearly behind so the scene reads with strong depth instead of a flat backdrop.",
    },
  ]);

const buildNightCityDrafts = (analysis: GenerateFramesRuntimeAnalysis) =>
  fitDraftCount(analysis, [
    {
      pose: "Night city background",
      description: "A nighttime city background with foreground building shapes, mid-ground rooftops, a layered skyline behind them, lit windows, and a dark sky so the environment feels intentional and built in depth.",
    },
  ]);

const buildSceneSettingPhrase = (analysis: GenerateFramesRuntimeAnalysis) => {
  const descriptorPrefix =
    analysis.sceneDescriptors.length > 0 ? `${analysis.sceneDescriptors.join(", ")} ` : "";
  const wantsMountainBackdrop = /\b(mountain(?: range)?s?|hills?)\b/i.test(analysis.prompt);

  switch (analysis.sceneSetting) {
    case "forest":
      return `a ${descriptorPrefix}forest setting with layered tree depth and open readable ground`.replace(/\s+/g, " ").trim();
    case "canyon":
      return `a ${descriptorPrefix}canyon setting with rocky walls, open ground, and clear depth planes`.replace(/\s+/g, " ").trim();
    case "cave":
      return `a ${descriptorPrefix}cave setting with rocky depth, shadow pockets, and clear open ground for staging`.replace(/\s+/g, " ").trim();
    case "underground":
      return `an ${descriptorPrefix}underground space with layered tunnels, dim depth, and readable open staging`.replace(/\s+/g, " ").trim();
    case "arena":
      return `an ${descriptorPrefix}arena with a clear fighting floor, surrounding structure, and readable staging lines`.replace(/\s+/g, " ").trim();
    case "rooftop":
      return `a ${descriptorPrefix}rooftop scene with a readable roof edge, open sky, and background structures`.replace(/\s+/g, " ").trim();
    case "bedroom":
      return `a ${descriptorPrefix}bedroom interior with readable wall, floor, and bed staging`.replace(/\s+/g, " ").trim();
    case "city":
      return `a ${descriptorPrefix}city setup with readable buildings and layered urban depth`.replace(/\s+/g, " ").trim();
    case "neighborhood":
      return `a ${descriptorPrefix}neighborhood scene with readable houses, sidewalks, fences, and residential depth`.replace(/\s+/g, " ").trim();
    case "alley":
      return `a ${descriptorPrefix}alley with tight depth, wall framing, and a clear action lane through the middle`.replace(/\s+/g, " ").trim();
    case "plains":
      return `an ${descriptorPrefix}open plain with readable ground spread${wantsMountainBackdrop ? " and mountain range depth behind it" : " and clear depth"}`
        .replace(/\s+/g, " ")
        .trim();
    case "mountains":
      return `a ${descriptorPrefix}wide outdoor setup with mountain depth and readable ground planes`.replace(/\s+/g, " ").trim();
    case "room":
      return `an ${descriptorPrefix}interior setup with readable wall and floor planes`.replace(/\s+/g, " ").trim();
    case "temple":
      return `an ${descriptorPrefix}temple space with ceremonial structure, stone depth, and clear staging floor`.replace(/\s+/g, " ").trim();
    default:
      return `a ${descriptorPrefix}readable setup scene with clear background depth`.replace(/\s+/g, " ").trim();
  }
};

const buildScenePropPhrase = (analysis: GenerateFramesRuntimeAnalysis) => {
  if (analysis.sceneProps.length === 0) {
    return "";
  }

  if (analysis.sceneProps.length === 1) {
    return `${analysis.sceneProps[0]} anchors the space as a readable environmental detail.`;
  }

  return `${analysis.sceneProps.slice(0, -1).join(", ")}, and ${analysis.sceneProps.at(-1)} anchor the space as readable environmental details.`;
};

const buildSceneElementPhrase = (analysis: GenerateFramesRuntimeAnalysis) => {
  if (analysis.sceneElements.length === 0) {
    return "";
  }

  if (analysis.sceneElements.length === 1) {
    return `Make the ${analysis.sceneElements[0]} read clearly as part of the environment, not as a separate character or event.`;
  }

  return `Make the ${analysis.sceneElements.slice(0, -1).join(", ")} and ${analysis.sceneElements.at(-1)} read clearly as environment features, not separate characters or detached event beats.`;
};

const buildSceneReadabilityPhrase = (analysis: GenerateFramesRuntimeAnalysis) => {
  const hasForegroundSubjects = analysis.subjects.some((subject) => subject.type === "character" || subject.type === "object");
  if (hasForegroundSubjects) {
    return "Readable depth planes keep the foreground subjects separated from the environment, with a clean action lane through the composition.";
  }

  if ((analysis.sceneProps.length ?? 0) > 0 || (analysis.sceneElements.length ?? 0) > 0) {
    return "Clear foreground, middle-ground, and distance separation keep the major features from flattening into one backdrop strip.";
  }

  return "Clear depth planes and deliberate staging keep the environment from feeling empty or generic.";
};

const buildSceneContinuationFocusPhrase = (analysis: GenerateFramesRuntimeAnalysis) => {
  if (analysis.interactionMode === "create" || analysis.focusTargets.length === 0) {
    return "";
  }

  const focusText = formatFocusTargets(analysis.focusTargets);
  if (!focusText) {
    return "";
  }

  return `The same scene stays intact while the update puts more attention on ${focusText}.`;
};

const buildSubjectDrawingQualityPhrase = ({
  subject,
  analysis,
}: {
  subject: DrawingAiGenerateFramesStateSubject | null;
  analysis: GenerateFramesRuntimeAnalysis;
}) => {
  const normalizedLabel = normalizePrompt(subject?.label ?? analysis.promptSubject ?? "");

  if (subject?.type === "object") {
    if (/\btree|plant\b/.test(normalizedLabel)) {
      return "a readable trunk or stem, a clear canopy or leaf mass, and a planted base silhouette";
    }
    if (/\bfan|propeller\b/.test(normalizedLabel)) {
      return "a clear central hub, readable blades, and a recognizable stand, cage, or housing silhouette";
    }
    if (/\bbox|crate|block|square|rectangle\b/.test(normalizedLabel)) {
      return "clean straight edges, readable front and side planes, and stable box-like proportions";
    }
    return "a stable outer contour, clean proportions, and no accidental humanoid anatomy";
  }

  if (subject?.type === "effect" || analysis.visualKind === "event") {
    if (analysis.motionType === "lightning" || /\blightning|bolt|electric/.test(normalizedLabel)) {
      return "a tapered zigzag strike path, readable branch structure, and a bright electric core";
    }
    if (analysis.motionType === "explosion" || /\bexplosion|blast|fireball|detonation/.test(normalizedLabel)) {
      return "a readable blast core, expanding outer shell, and clearly separated smoke and debris layers";
    }
    if (analysis.motionType === "smoke" || /\bsmoke|cloud|mist|fog|gas|vapor|vapour/.test(normalizedLabel)) {
      return "a dense central release, layered cloud mass, and softer outer wisps";
    }
    if (analysis.motionType === "impact" || /\bimpact|bullet|projectile|crash|collision|ground hit/.test(normalizedLabel)) {
      return "a clear contact point, directional debris spray, and readable fallout";
    }
    if (analysis.motionType === "eruption" || /\bvolcano|eruption|lava|magma/.test(normalizedLabel)) {
      return "a readable source opening, separated lava and ash shapes, and a strong vertical plume";
    }
    return "a clear source, readable silhouette, and separated material layers";
  }

  if (/\bstick(?:\s|-)?figure|fighter|person|character|human/.test(normalizedLabel)) {
    return "a solid readable head, clear torso direction, readable arm and leg placement, and balanced full-body stick proportions";
  }

  if (/\brobot|android|mech/.test(normalizedLabel)) {
    return "a readable torso mass, clear limb joints, and a clean mechanical silhouette";
  }

  if (/\bdinosaur|dragon|creature|monster|beast|wolf|alien|zombie|ogre|demon/.test(normalizedLabel)) {
    return "a readable head, body mass, spine line, clear leg placement, and any major tail or back silhouette";
  }

  return "a readable silhouette, balanced proportions, and clear major body parts";
};

const buildRecentEditPhrase = (analysis: GenerateFramesRuntimeAnalysis) => {
  const priorEdits = analysis.recentEdits.filter(
    (edit) => normalizePrompt(edit) !== normalizePrompt(analysis.prompt),
  );
  if (priorEdits.length === 0) {
    return "";
  }

  const recentEdits = priorEdits.slice(-2);
  if (recentEdits.length === 1) {
    return `Preserve the last meaningful edit chain, especially "${recentEdits[0]}".`;
  }

  return `Preserve the recent edit chain, especially "${recentEdits[0]}" and "${recentEdits[1]}".`;
};

const pickDeterministicVariant = (
  analysis: Pick<
    GenerateFramesRuntimeAnalysis,
    "normalizedPrompt" | "variationProfile" | "renderingQualityProfile" | "variationCycleIndex" | "shotScope"
  >,
  options: readonly string[],
  salt = 0,
) => {
  if (options.length === 0) {
    return "";
  }
  let hash = salt;
  const seed = [
    analysis.normalizedPrompt,
    `family=${analysis.renderingQualityProfile.family}`,
    `staging=${analysis.variationProfile.stagingBias}`,
    `asymmetry=${analysis.variationProfile.asymmetryBias}`,
    `timing=${analysis.variationProfile.timingBias}`,
    `silhouette=${analysis.variationProfile.silhouetteBias}`,
    `cycle=${analysis.variationCycleIndex}`,
    `shot=${analysis.shotScope}`,
  ].join("|");
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
  }
  return options[hash % options.length]!;
};

const buildActionKeywordPhrase = (analysis: GenerateFramesRuntimeAnalysis) => {
  if (analysis.actionKeywords.length === 0) {
    return "";
  }

  const primaryAction = buildPrimaryActionLabel(analysis);
  const motionLead =
    analysis.motionType === "fight"
      ? "The exchange"
      : analysis.visualKind === "event" || analysis.subjects.some((subject) => subject.type === "effect")
        ? "The event"
        : "The motion";

  if (analysis.actionKeywords.length === 1) {
    return analysis.interactionMode === "create"
      ? `${motionLead} should stay clearly readable as ${/^(a|an)\b/i.test(primaryAction) ? primaryAction : `a ${primaryAction}`} instead of drifting into a different beat.`
      : `Keep the scene aimed around the same ${analysis.actionKeywords[0]} idea instead of swapping to a different action family.`;
  }

  return analysis.interactionMode === "create"
    ? `The action should stay centered on ${analysis.actionKeywords.slice(0, 2).join(" and ")} instead of drifting into a different beat.`
    : `Keep the build direction centered on ${analysis.actionKeywords.slice(0, 2).join(" and ")} instead of resetting to a new action idea.`;
};

const buildPrimaryActionLabel = (analysis: GenerateFramesRuntimeAnalysis) => {
  const primaryKeyword = analysis.actionKeywords[0] ?? null;
  if (!primaryKeyword) {
    return analysis.motionType === "action" ? "move" : analysis.motionType;
  }

  switch (primaryKeyword) {
    case "guard":
      return "brace";
    case "fight":
      return "fight";
    case "stare":
      return "stare down";
    default:
      return primaryKeyword;
  }
};

const buildRequestedEditPhrase = (analysis: GenerateFramesRuntimeAnalysis) => {
  if (analysis.interactionMode === "create" || analysis.interactionMode === "discuss") {
    return "";
  }

  const phrases: string[] = [];
  const focusPhrase =
    analysis.focusTargets.length > 0 ? `Keep the edit centered on ${formatFocusTargets(analysis.focusTargets)}.` : "";

  if (analysis.editIntents.includes("color") && analysis.requestedColor) {
    phrases.push(`apply the requested color change to ${analysis.requestedColor}`);
  }
  if (analysis.editIntents.includes("side")) {
    phrases.push("preserve and apply the requested side or staging change");
  }
  if (analysis.editIntents.includes("prop")) {
    phrases.push("carry the requested prop or equipment change");
  }
  if (analysis.editIntents.includes("tone") && analysis.tone !== "neutral") {
    phrases.push(`carry the ${analysis.tone} tone change`);
  }
  if (analysis.editIntents.includes("timing")) {
    phrases.push("apply the timing and smoothness adjustment");
  }
  if (analysis.editIntents.includes("scale")) {
    phrases.push("apply the requested scale or force change");
  }
  if (analysis.editIntents.includes("scene")) {
    phrases.push("keep the same scene while applying the requested environment change");
  }
  if (analysis.editIntents.includes("transform")) {
    phrases.push("make the requested transformation read as the same subject evolving, not a hard reset");
  }
  if (analysis.editIntents.includes("subject")) {
    phrases.push("change only the requested subject identity details");
  }
  if (analysis.editIntents.includes("motion")) {
    phrases.push("carry the same motion into the next readable edited beat");
  }

  if (phrases.length === 0) {
    const basePhrase = analysis.buildDirection
      ? `Preserve the current build direction of ${analysis.buildDirection}.`
      : "Preserve the current build direction and only apply the requested change.";
    return `${basePhrase} ${focusPhrase}`.trim();
  }

  if (phrases.length === 1) {
    const [singlePhrase] = phrases;
    const capitalizedPhrase = `${singlePhrase.charAt(0).toUpperCase()}${singlePhrase.slice(1)}.`;
    return `${capitalizedPhrase} ${focusPhrase}`.trim();
  }

  return `${phrases.join(", ")}, while preserving everything else the user did not ask to replace. ${focusPhrase}`.trim();
};

const formatSceneSubjectLabel = (subject: DrawingAiGenerateFramesStateSubject | undefined) => {
  if (!subject) {
    return "character";
  }

  const normalizedSubjectLabel = normalizeSubjectEntityLabel(subject.label?.trim() || "");
  const detailSuffix =
    (subject.details ?? []).length > 0 &&
    !(normalizedSubjectLabel.includes(`with ${(subject.details ?? [])[0]}`) ?? false)
      ? ` with ${(subject.details ?? []).join(" and ")}`
      : "";
  const baseLabel = `${normalizedSubjectLabel || (subject.type === "character" ? "character" : subject.type)}${detailSuffix}`.trim();
  const colorPrefix =
    subject.color && !new RegExp(`^${subject.color}\\b`, "i").test(baseLabel) ? `${subject.color} ` : "";
  return `${colorPrefix}${baseLabel}`.trim();
};

const buildSceneSubjectPhrase = (analysis: GenerateFramesRuntimeAnalysis) => {
  const characterSubjects = analysis.subjects.filter((subject) => subject.type === "character");
  if (characterSubjects.length === 0) {
    return `${buildSceneElementPhrase(analysis)} ${buildActionKeywordPhrase(analysis)} The image reads as a finished setup instead of an incomplete placeholder.`
      .replace(/\s+/g, " ")
      .trim();
  }

  if (characterSubjects.length >= 2) {
    const [leftSubject, rightSubject] = characterSubjects;
    const leftDescriptor = formatSceneSubjectLabel(leftSubject);
    const rightDescriptor = formatSceneSubjectLabel(rightSubject);
    return `Stage two readable figures in the foreground, with the ${leftDescriptor} on the left and the ${rightDescriptor} on the right, so both subjects are clearly separated and easy to read. ${buildActionKeywordPhrase(analysis)}`
      .replace(/\s+/g, " ")
      .trim();
  }

  const [subject] = characterSubjects;
  return `Stage a ${formatSceneSubjectLabel(subject)} clearly in the foreground so the opening composition has an obvious focal subject. ${buildActionKeywordPhrase(analysis)}`
    .replace(/\s+/g, " ")
    .trim();
};

const buildGenericActionSubjectPhrase = (analysis: GenerateFramesRuntimeAnalysis) => {
  const visibleSubjects = analysis.subjects.filter((subject) => subject.type !== "background");
  if (visibleSubjects.length === 0) {
    return "the same subjects";
  }

  const formatActionSubjectLabel = (subject: DrawingAiGenerateFramesStateSubject) => {
    const baseLabel = formatSceneSubjectLabel(subject);
    return subject.side && subject.side !== "center" ? `${subject.side} ${baseLabel}` : baseLabel;
  };

  if (visibleSubjects.length === 1) {
    return formatActionSubjectLabel(visibleSubjects[0]!);
  }

  if (visibleSubjects.length === 2) {
    return `${formatActionSubjectLabel(visibleSubjects[0]!)} and ${formatActionSubjectLabel(visibleSubjects[1]!)}`;
  }

  return visibleSubjects.map((subject) => formatActionSubjectLabel(subject)).join(", ");
};

const buildGenericActionStagingPhrase = (analysis: GenerateFramesRuntimeAnalysis) => {
  const visibleSubjects = analysis.subjects.filter((subject) => subject.type !== "background");
  if (visibleSubjects.length === 0) {
    return "The current scene geography stays readable around the action.";
  }

  if (visibleSubjects.length === 1) {
    const subject = visibleSubjects[0]!;
    const placementPhrase =
      subject.side && subject.side !== "center"
        ? `The ${formatSceneSubjectLabel(subject)} stays staged on the ${subject.side} as the same readable character anchor`
        : `The ${formatSceneSubjectLabel(subject)} stays clearly staged as the same readable character anchor`;
    return `${placementPhrase}, so the action starts from the same subject identity instead of drifting to a new setup.`;
  }

  const leftSubject = visibleSubjects.find((subject) => subject.side === "left") ?? visibleSubjects[0]!;
  const rightSubject = visibleSubjects.find((subject) => subject.side === "right") ?? visibleSubjects[1] ?? visibleSubjects[0]!;

  if (leftSubject === rightSubject) {
    return `${buildGenericActionSubjectPhrase(analysis)} stay clearly separated as the same readable character silhouettes instead of collapsing together.`;
  }

  return `The ${formatSceneSubjectLabel(leftSubject)} stays on the left and the ${formatSceneSubjectLabel(rightSubject)} stays on the right as two readable silhouettes, so the same subject identity and screen geography survive through the action.`;
};

const isOrderedStagedActionRequest = (analysis: GenerateFramesRuntimeAnalysis) =>
  analysis.outputMode === "animation" &&
  (
    STAGED_SEQUENCE_CONNECTOR_PATTERN.test(analysis.normalizedPrompt) ||
    /\b(combo|multi-step|right hand|left hand|airborne|midair|mid-air|martial arts guard stance|guard stance)\b/i.test(
      analysis.normalizedPrompt,
    )
  ) &&
  (
    analysis.requestedFrameCount >= 6 ||
    analysis.actionKeywords.length >= 2 ||
    analysis.motionType === "action" ||
    analysis.componentFamilies.includes("effect")
  );

type OrderedSequenceBeatKey =
  | "setup"
  | "right-hand-projectile"
  | "left-hand-projectile"
  | "jump"
  | "spin"
  | "airborne-projectile"
  | "guard-landing";

const ORDERED_SEQUENCE_BEAT_KEYS = new Set<OrderedSequenceBeatKey>([
  "setup",
  "right-hand-projectile",
  "left-hand-projectile",
  "jump",
  "spin",
  "airborne-projectile",
  "guard-landing",
]);

const isOrderedSequenceBeatKey = (value: string): value is OrderedSequenceBeatKey =>
  ORDERED_SEQUENCE_BEAT_KEYS.has(value as OrderedSequenceBeatKey);

const findPatternIndex = (value: string, pattern: RegExp) => {
  const match = value.match(pattern);
  return match?.index ?? -1;
};

const collectOrderedSequenceBeats = (analysis: GenerateFramesRuntimeAnalysis) => {
  const prompt = analysis.normalizedPrompt;
  const projectilePattern = "(?:fireball|projectile|energy ball|orb|blast)";
  const beats: Array<{ key: OrderedSequenceBeatKey; index: number }> = [{ key: "setup", index: -1 }];
  const candidates: Array<{ key: OrderedSequenceBeatKey; pattern: RegExp }> = [
    {
      key: "right-hand-projectile",
      pattern: new RegExp(`\\bright hand\\b[\\s\\S]{0,64}\\b${projectilePattern}\\b|\\b${projectilePattern}\\b[\\s\\S]{0,64}\\bright hand\\b`, "i"),
    },
    {
      key: "left-hand-projectile",
      pattern: new RegExp(`\\bleft hand\\b[\\s\\S]{0,64}\\b${projectilePattern}\\b|\\b${projectilePattern}\\b[\\s\\S]{0,64}\\bleft hand\\b`, "i"),
    },
    {
      key: "jump",
      pattern: /\b(jump|leap|vault)\b/i,
    },
    {
      key: "spin",
      pattern: /\b(spin(?:ning)?|tornado spin|spinning airborne)\b/i,
    },
    {
      key: "airborne-projectile",
      pattern: new RegExp(
        `\\b(?:airborne|midair|mid-air|in the air)\\b[\\s\\S]{0,64}\\b${projectilePattern}\\b|\\b${projectilePattern}\\b[\\s\\S]{0,64}\\b(?:airborne|midair|mid-air|in the air)\\b`,
        "i",
      ),
    },
    {
      key: "guard-landing",
      pattern: /\b(landing|land|ending in|ending with|ends in|ends with)\b[\s\S]{0,96}\b(martial arts guard stance|guard stance|ready stance|guard)\b|\b(martial arts guard stance|guard stance|ready stance)\b/i,
    },
  ];

  for (const candidate of candidates) {
    const index = findPatternIndex(prompt, candidate.pattern);
    if (index >= 0) {
      beats.push({ key: candidate.key, index });
    }
  }

  return beats
    .sort((left, right) => left.index - right.index)
    .filter((beat, index, items) => items.findIndex((candidate) => candidate.key === beat.key) === index);
};

const buildOrderedSequenceActorPhrase = (analysis: GenerateFramesRuntimeAnalysis) => {
  const characterSubject = analysis.subjects.find((subject) => subject.type === "character");
  if (characterSubject) {
    return `the ${formatSceneSubjectLabel(characterSubject)}`;
  }

  if (
    analysis.componentFamilies.includes("character") ||
    /\b(guard|stance|martial arts|right hand|left hand|jump|spin|airborne)\b/i.test(analysis.prompt)
  ) {
    return "the same fighter";
  }

  return buildGenericActionSubjectPhrase(analysis);
};

const buildOrderedSequenceProjectileLabel = (analysis: GenerateFramesRuntimeAnalysis) => {
  const baseLabel = /\bprojectile\b/i.test(analysis.prompt) && !/\bfireball\b/i.test(analysis.prompt) ? "projectile" : "fireball";
  return analysis.requestedColor ? `${analysis.requestedColor} ${baseLabel}` : baseLabel;
};

const buildOrderedSequenceDrafts = (analysis: GenerateFramesRuntimeAnalysis) => {
  if (!isOrderedStagedActionRequest(analysis)) {
    return null;
  }

  const structuredBeats = analysis.sequenceBeats
    .filter((beat) => isOrderedSequenceBeatKey(beat.id))
    .map((beat) => ({ key: beat.id, index: beat.order }));
  const beats = structuredBeats.length > 0 ? structuredBeats : collectOrderedSequenceBeats(analysis);
  if (beats.length < 3) {
    return null;
  }

  const actorPhrase = buildOrderedSequenceActorPhrase(analysis);
  const projectileLabel = buildOrderedSequenceProjectileLabel(analysis);
  const scenePhrase =
    analysis.sceneSetting != null || analysis.sceneDescriptors.length > 0 || analysis.sceneProps.length > 0
      ? `${buildSceneSettingPhrase(analysis)}. ${buildScenePropPhrase(analysis)}`.replace(/\s+/g, " ").trim()
      : "Keep the same scene space readable around the combo so every beat still belongs to one continuous action.";

  const drafts = beats.flatMap(({ key }) => {
    switch (key) {
      case "setup":
        return [{
          pose: "Combo setup",
          description: `${scenePhrase} Stage ${actorPhrase} in a loaded readable stance with both hands visible, clear balance, and room for the sequence to unfold so the combo starts from a real setup instead of spawning mid-action.`
            .replace(/\s+/g, " ")
            .trim(),
        }];
      case "right-hand-projectile":
        return [{
          pose: "Right-hand projectile release",
          description: `${actorPhrase} throws the first ${projectileLabel} from the right hand with a clear shoulder-to-hand line, a readable release source, and a separate first attack beat instead of blending both shots together.`
            .replace(/\s+/g, " ")
            .trim(),
        }];
      case "left-hand-projectile":
        return [{
          pose: "Left-hand projectile release",
          description: `${actorPhrase} answers with the next ${projectileLabel} from the left hand, keeping the torso turn, opposite arm lead, and second attack beat clearly distinct from the first release.`
            .replace(/\s+/g, " ")
            .trim(),
        }];
      case "jump":
        return [{
          pose: "Jump launch",
          description: `After the hand attacks, ${actorPhrase} compresses and jumps upward with a readable launch line, clear takeoff force, and no teleport from the ground to midair.`
            .replace(/\s+/g, " ")
            .trim(),
        }];
      case "spin":
        return [{
          pose: "Air spin transition",
          description: `${actorPhrase} turns through an airborne spin with a readable torso twist, clear leg path, and strong silhouette change so the combo visibly rotates before the next release.`
            .replace(/\s+/g, " ")
            .trim(),
        }];
      case "airborne-projectile":
        return [{
          pose: "Airborne projectile release",
          description: `While still airborne, ${actorPhrase} releases the next ${projectileLabel} from the spinning pose with a clear hand-to-projectile source and a readable midair silhouette instead of a generic floating effect burst.`
            .replace(/\s+/g, " ")
            .trim(),
        }];
      case "guard-landing":
        return [{
          pose: "Guard landing finish",
          description: `${actorPhrase} lands into a readable martial-arts guard stance with balance, follow-through, and recovery so the whole sequence finishes cleanly instead of freezing midair or mid-attack.`
            .replace(/\s+/g, " ")
            .trim(),
        }];
      default:
        return [];
    }
  });

  return fitDraftCount(
    analysis,
    beats.some((beat) => beat.key === "guard-landing")
      ? drafts
      : [
          ...drafts,
          {
            pose: "Resolved combo finish",
            description: `${actorPhrase} settles into a guarded readable finish with clear recovery so the sequence has a real ending instead of stopping in the middle of the last attack.`
              .replace(/\s+/g, " ")
              .trim(),
          },
        ],
  );
};

const buildGenericActionSequenceDrafts = (analysis: GenerateFramesRuntimeAnalysis) => {
  const actionLabel = buildPrimaryActionLabel(analysis);
  const subjectPhrase = buildGenericActionSubjectPhrase(analysis);
  const stagingPhrase = buildGenericActionStagingPhrase(analysis);
  const scenePhrase =
    analysis.sceneSetting != null || analysis.sceneDescriptors.length > 0 || analysis.sceneProps.length > 0
      ? `${buildSceneSettingPhrase(analysis)}. ${buildScenePropPhrase(analysis)}`.replace(/\s+/g, " ").trim()
      : "The same screen geography stays readable around the action.";
  const tonePhrase =
    analysis.tone !== "neutral" || analysis.forceLevel !== "medium"
      ? `The motion stays ${analysis.tone !== "neutral" ? analysis.tone : "intentional"} with ${analysis.forceLevel} force.`
      : "The motion stays readable and intentional.";
  const forceAccent =
    analysis.variationProfile.timingBias === "sharp"
      ? "The impact timing stays sharp and committed."
      : analysis.variationProfile.timingBias === "linger"
        ? "The motion leaves enough hang time and settle to read the full action."
        : "The action keeps a balanced rhythm with readable setup and finish.";

  if (isMultiSubjectCombatRequest(analysis)) {
    return fitDraftCount(analysis, [
      {
        pose: `${actionLabel} faceoff setup`,
        description: `${scenePhrase} ${stagingPhrase} A clear guard or faceoff comes first, so both fighters read before the exchange begins. ${tonePhrase} ${forceAccent}`
          .replace(/\s+/g, " ")
          .trim(),
      },
      {
        pose: `${actionLabel} advance`,
        description: `${buildActionKeywordPhrase(analysis)} ${subjectPhrase} move into a readable advance with clear anticipation, preserved left-right spacing, and no subject drift before the clash lands.`
          .replace(/\s+/g, " ")
          .trim(),
      },
      {
        pose: `${actionLabel} clash impact`,
        description: `The main ${actionLabel} exchange lands with a readable strike, clash, or contact beat between ${subjectPhrase}, so the combat does not skip the actual hit. ${buildRequestedEditPhrase(analysis)}`
          .replace(/\s+/g, " ")
          .trim(),
      },
      {
        pose: `${actionLabel} recoil recovery`,
        description: `${subjectPhrase} carry through follow-through, recoil, and recovery, so the same fight resolves into a readable reset or separated guard instead of stopping mid-exchange.`
          .replace(/\s+/g, " ")
          .trim(),
      },
    ]);
  }

  return fitDraftCount(analysis, [
    {
      pose: `${actionLabel} setup`,
      description: `${scenePhrase} ${stagingPhrase} ${subjectPhrase} read clearly before the main ${actionLabel}, so the action has a proper setup instead of spawning from nowhere. ${tonePhrase} ${forceAccent}`
        .replace(/\s+/g, " ")
        .trim(),
    },
    {
      pose: `${actionLabel} release`,
      description: `${buildActionKeywordPhrase(analysis)} ${subjectPhrase} commit to the main ${actionLabel} beat with clear direction, readable silhouettes, preserved staging, and preserved subject identity. ${buildRequestedEditPhrase(analysis)}`
        .replace(/\s+/g, " ")
        .trim(),
    },
    {
      pose: `${actionLabel} follow-through`,
      description: `${subjectPhrase} carry through a readable follow-through or settle, so the same action resolves cleanly instead of cutting off mid-beat. Preserve the same scene, props, build direction, and subject layout.`
        .replace(/\s+/g, " ")
        .trim(),
    },
    {
      pose: `${actionLabel} resolved beat`,
      description: `${subjectPhrase} settle into a readable resolved beat, so the same ${actionLabel} sequence has a finish, the scene still reads clearly, and the action does not stop midway through the setup.`
        .replace(/\s+/g, " ")
        .trim(),
    },
  ]);
};

const buildStatefulActionContinuationDrafts = (analysis: GenerateFramesRuntimeAnalysis) => {
  const subjectPhrase = buildGenericActionSubjectPhrase(analysis);
  const stagingPhrase = buildGenericActionStagingPhrase(analysis);
  const actionLabel = buildPrimaryActionLabel(analysis);
  const scenePhrase =
    analysis.sceneSetting != null || analysis.sceneDescriptors.length > 0 || analysis.sceneProps.length > 0
      ? `${buildSceneSettingPhrase(analysis)}. ${buildScenePropPhrase(analysis)}`.replace(/\s+/g, " ").trim()
      : "The same scene geography stays readable around the existing action.";
  const tonePhrase =
    analysis.tone !== "neutral" || analysis.forceLevel !== "medium"
      ? `The continuation stays ${analysis.tone !== "neutral" ? analysis.tone : "intentional"} with ${analysis.forceLevel} force.`
      : "The continuation stays readable and intentional.";

  return fitDraftCount(analysis, [
    {
      pose: `${actionLabel} continuation preserve`,
      description: `${scenePhrase} ${stagingPhrase} ${subjectPhrase} stay the same ongoing action setup; only the requested edit changes, and the scene does not restart from scratch. ${buildRequestedEditPhrase(analysis)} ${tonePhrase}`
        .replace(/\s+/g, " ")
        .trim(),
    },
    {
      pose: `${actionLabel} continuation release`,
      description: `${buildActionKeywordPhrase(analysis)} ${subjectPhrase} carry into the next readable ${actionLabel} beat while preserving the same props, side assignments, subject identity, and scene build direction. ${buildRecentEditPhrase(analysis)}`
        .replace(/\s+/g, " ")
        .trim(),
    },
    {
      pose: `${actionLabel} continuation resolve`,
      description: `The same ${actionLabel} sequence resolves with ${subjectPhrase}, so the requested edit reads clearly, the scene stays intact, and the action does not collapse into a reset or generic replacement.`
        .replace(/\s+/g, " ")
        .trim(),
    },
  ]);
};

const buildComposedStillSceneDrafts = (analysis: GenerateFramesRuntimeAnalysis) =>
  fitDraftCount(analysis, [
    {
      pose: "Opening setup scene",
      description: `${buildSceneSettingPhrase(analysis)}. ${buildSceneSubjectPhrase(analysis)} ${buildScenePropPhrase(analysis)} ${buildSceneReadabilityPhrase(analysis)} ${buildSceneContinuationFocusPhrase(analysis)} The frame stays still and composition-first, reading like a finished setup instead of a half-started animation.`
        .replace(/\s+/g, " ")
        .trim(),
    },
  ]);

const buildGenericStillSubjectDrafts = (analysis: GenerateFramesRuntimeAnalysis) => {
  const visibleSubjects = analysis.subjects.filter((subject) => subject.type !== "background");
  if (visibleSubjects.length >= 2) {
    const leftSubject = visibleSubjects.find((subject) => subject.side === "left") ?? visibleSubjects[0]!;
    const rightSubject = visibleSubjects.find((subject) => subject.side === "right") ?? visibleSubjects[1] ?? visibleSubjects[0]!;
    return fitDraftCount(analysis, [
      {
        pose: "Readable multi-subject setup",
        description: `A still setup frame with the ${formatSceneSubjectLabel(leftSubject)} staged on the left and the ${formatSceneSubjectLabel(rightSubject)} staged on the right, both kept as the same readable subjects with solid head silhouettes when appropriate, clean limbs, clear spacing, and no collapse into a single replacement figure.`,
      },
    ]);
  }

  const primarySubject =
    analysis.subjects.find((subject) => subject.type !== "background") ??
    analysis.subjects[0] ??
    null;
  const label = primarySubject?.label?.trim() || analysis.promptSubject || "subject";
  const colorPhrase = analysis.requestedColor ? `${analysis.requestedColor} ` : "";
  const detailPhrase =
    primarySubject?.details && primarySubject.details.length > 0
      ? ` with ${primarySubject.details.join(", ")}`
      : "";
  const silhouettePhrase = buildSubjectDrawingQualityPhrase({
    subject: primarySubject,
    analysis,
  });
  const stagingAccent =
    analysis.variationProfile.stagingBias === "offset"
      ? "with a slightly offset but still readable camera composition"
      : "with a centered readable camera composition";
  const stillSubjectDescription =
    primarySubject?.type === "object"
      ? `A single ${colorPhrase}${label}${detailPhrase} centered in the camera area as a readable still object ${stagingAccent}, with ${silhouettePhrase}, stable proportions, and no accidental humanoid features or unnecessary motion.`
      : `A single ${colorPhrase}${label}${detailPhrase} setup frame centered in the camera area in a neutral balanced pose ${stagingAccent}, with feet planted, readable proportions, ${silhouettePhrase}${
          analysis.visualExpectationTags.includes("no-face-unless-asked")
            ? ", a solid head silhouette, and no facial features unless explicitly requested"
            : ""
        }, and no unrelated subject drift or unnecessary animation.`;

  return fitDraftCount(analysis, [
    {
      pose: `Readable ${label} setup`,
      description: stillSubjectDescription
        .replace(/\s+/g, " ")
        .trim(),
    },
  ]);
};

const buildGenericEventAnimationDrafts = (analysis: GenerateFramesRuntimeAnalysis) => {
  const label = analysis.promptSubject ?? analysis.subjects.find((subject) => subject.type !== "background")?.label ?? "event";
  const actionPhrase = analysis.actionKeywords.join(" ") || analysis.motionType || "release";
  const drawingQualityPhrase = buildSubjectDrawingQualityPhrase({
    subject: analysis.subjects.find((subject) => subject.type !== "background") ?? null,
    analysis,
  });
  const eventCueText = normalizePrompt(
    [
      analysis.promptSubject,
      analysis.actionKeywords.join(" "),
      analysis.motionType,
      analysis.sceneSetting,
      analysis.sceneDescriptors.join(" "),
      analysis.sceneProps.join(" "),
      analysis.concepts.join(" "),
    ]
      .filter(Boolean)
      .join(" "),
  );
  const isShatterLike = /\b(glass|window|bottle|shatter|break|smash|fracture|crack)\b/.test(eventCueText);
  const isImpactLike = /\b(impact|ground|bullet|projectile|collision|crash|slam|debris|dust|spark|shard|fragment)\b/.test(eventCueText);
  const isEruptionLike = /\b(volcano|eruption|erupt|lava|magma|ash|crater|plume)\b/.test(eventCueText);
  const isSmokeLike = /\b(smoke|smoky|smoke bomb|cloud|billow|mist|fog|gas|vapor|vapour|canister)\b/.test(eventCueText);
  const colorPhrase =
    analysis.requestedColor != null
      ? `${analysis.requestedColor} dominant color treatment`
      : isEruptionLike
        ? "hot lava orange-red against dark ash and smoke"
        : isImpactLike
          ? "brief pale spark against dusty earth tones"
          : isSmokeLike
            ? "dense gray charcoal smoke with softer outer wisps"
            : "readable color contrast with a clear dominant material";

  if (isShatterLike) {
    return fitDraftCount(analysis, [
      {
        pose: `${label} intact setup`,
        description: `Start with the glass object still mostly intact so its shape reads clearly before the break begins, with ${drawingQualityPhrase}.`,
      },
      {
        pose: `${label} first fracture`,
        description: `Show the first sharp fracture line or breaking point so the shatter starts from a clear impact or stress origin instead of exploding from nowhere.`,
      },
      {
        pose: `${label} shatter burst`,
        description: `Break the form apart into readable shards and splinters with a decisive shatter beat, keeping the original object identity visible inside the breakup and the fracture origin readable.`,
      },
      {
        pose: `${label} fragment spread`,
        description: `Carry the broken pieces outward and downward with lighter fragments still traveling while larger shards begin to fall or rotate away.`,
      },
      {
        pose: `${label} settling shards`,
        description: `End with the main shards settling, scattered fragments visible, and only a few late pieces still moving so the break clearly resolves.`,
      },
    ]);
  }

  if (isImpactLike) {
    return fitDraftCount(analysis, [
      {
        pose: `${label} approach`,
        description: `Start with a small fast projectile or impact source clearly approaching the ground so the viewer can read where the hit will happen before the contact beat.`,
      },
      {
        pose: `${label} contact`,
        description: `Show the first sharp ${actionPhrase} moment with a tight contact flash, a compact dust pop, a small spray of dirt or debris, and ${drawingQualityPhrase} instead of a giant explosion.`,
      },
      {
        pose: `${label} debris burst`,
        description: `Push the main impact outward with a low cone of debris, dust, and fragments so the ground strike reads as forceful, directional, and still clearly tied to the same contact point.`,
      },
      {
        pose: `${label} fallout`,
        description: `Let the heavier debris drop while a broader dust fan spreads near the ground, keeping the impact point readable as the burst loses energy.`,
      },
      {
        pose: `${label} aftermath`,
        description: `End with settling dust, a small divot or disturbed ground mark, and only a faint remaining haze so the impact clearly resolves instead of freezing on the burst.`,
      },
    ]);
  }

  if (isEruptionLike) {
    return fitDraftCount(analysis, [
      {
        pose: `${label} pressure build`,
        description: `Start with a readable crater or source opening under pressure, with a subtle internal glow and the first hint of smoke or ash gathering before the eruption breaks loose.`,
      },
      {
        pose: `${label} breakout`,
        description: `Show the first decisive ${actionPhrase} beat with lava or hot material forcing upward from the source while darker smoke and ash begin to ride around it.`,
      },
      {
        pose: `${label} eruption peak`,
        description: `Hit the main peak with the tallest plume, strongest upward force, ${colorPhrase}, and ${drawingQualityPhrase}, keeping lava, ash, and smoke clearly separated instead of collapsing into one blob.`,
      },
      {
        pose: `${label} plume spread`,
        description: `Carry the same eruption into a wider plume and fallout phase where smoke mushrooms outward, ash spreads, and the hottest material begins to arc or cool.`,
      },
      {
        pose: `${label} cooling aftermath`,
        description: `End with a readable aftermath of drifting smoke and ash plus cooling lava traces or crater glow so the eruption resolves instead of stopping at peak violence.`,
      },
    ]);
  }

  if (isSmokeLike) {
    const smokeStructurePhrase = "a dense central release, layered cloud mass, and softer outer wisps";
    const smokeAppearancePhrase =
      analysis.requestedColor != null
        ? `${analysis.requestedColor} dominant smoke with ${smokeStructurePhrase}`
        : "dense gray charcoal smoke, a layered central mass, and softer outer wisps";
    return fitDraftCount(analysis, [
      {
        pose: `${label} source ready`,
        description: `Start with the smoke source clearly established, such as a canister or tight origin point, before the cloud expands so the event reads from a real source instead of an instant fog blob.`,
      },
      {
        pose: `${label} release burst`,
        description: `Show the first decisive ${actionPhrase} beat as a compact burst of dense smoke pushing outward from the source with a strong central puff and clear edge separation.`,
      },
      {
        pose: `${label} cloud spread`,
        description: `Expand the smoke into a larger layered cloud with ${smokeAppearancePhrase}, keeping it smoke-like rather than fiery or humanoid.`,
      },
      {
        pose: `${label} drift and thin`,
        description: `Let the cloud spread and lift while the edges loosen into wisps, so the same smoke event keeps progressing instead of freezing at maximum density.`,
      },
      {
        pose: `${label} lingering haze`,
        description: `End with a thinner lingering haze and a readable dissipating source area so the smoke bomb clearly resolves into fade and fallout rather than cutting off halfway.`,
      },
    ]);
  }

  return fitDraftCount(analysis, [
      {
        pose: `${label} buildup`,
        description: `Start the ${label} with a clear readable setup that establishes the source, shape, ${colorPhrase}, ${drawingQualityPhrase}, and tension before the main ${actionPhrase} happens.`,
      },
      {
        pose: `${label} onset`,
        description: `Show the first decisive ${actionPhrase} beat with a readable silhouette change, stronger energy release, ${drawingQualityPhrase}, and no unrelated subject drift.`,
      },
    {
      pose: `${label} peak`,
      description: `Hit the main ${label} peak with the largest readable shape, strongest visual force, and no unrelated subject drift.`,
    },
    {
      pose: `${label} breakup`,
      description: `Carry the same ${label} into breakup, spread, or fallout so the event keeps progressing instead of freezing at peak intensity, while preserving the same source logic and event identity.`,
    },
    {
      pose: `${label} aftermath`,
      description: `End with a real aftermath beat where the same ${label} settles, thins, fades, or resolves cleanly instead of cutting off halfway through.`,
    },
  ]);
};

const buildSceneContinuationDrafts = (analysis: GenerateFramesRuntimeAnalysis) =>
  fitDraftCount(analysis, [
    {
      pose: analysis.stillFrameRequested ? "Edited setup scene" : "Scene continuity edit",
      description: `${buildSceneSettingPhrase(analysis)}. ${buildSceneSubjectPhrase(analysis)} ${buildScenePropPhrase(analysis)} ${buildRequestedEditPhrase(analysis)} ${buildRecentEditPhrase(analysis)} Preserve the same scene identity, subject staging, composition, and build direction instead of replacing the whole setup.`
        .replace(/\s+/g, " ")
        .trim(),
    },
  ]);

const buildZombieApocalypseDrafts = (analysis: GenerateFramesRuntimeAnalysis) =>
  fitDraftCount(analysis, [
    {
      pose: "Zombie horde breach",
      description: "A survival scene opens with multiple zombies breaching into the space, damaged undead silhouettes, broken environment detail, and clear outbreak pressure instead of generic crowd noise.",
    },
    {
      pose: "Apocalypse rush",
      description: "The zombie horde surges forward with chaotic crowd layering, collapsing props or debris, and strong outbreak pressure across the shot without losing readability.",
    },
    {
      pose: "Overrun aftermath",
      description: "The scene widens into a heavier apocalypse read with more undead presence, debris, panic energy, and damaged surroundings so it feels like a real zombie-overrun environment instead of a weak placeholder.",
    },
  ]);

const buildAlienApocalypseDrafts = (analysis: GenerateFramesRuntimeAnalysis) =>
  fitDraftCount(analysis, [
    {
      pose: "Alien invasion arrival",
      description: "An alien threat enters the scene with readable non-human silhouettes, invasion lighting or energy, and large-scale menace instead of vague creature noise.",
    },
    {
      pose: "Apocalypse strike",
      description: "The alien attack escalates with invasion force, destructive pressure, and environmental damage so the shot reads as a broader alien apocalypse instead of a single random creature beat.",
    },
    {
      pose: "Invasion aftermath",
      description: "The shot holds the alien apocalypse read with damaged surroundings, hostile presence, and a clear sense of large-scale takeover across the environment.",
    },
  ]);

const buildMixedExplosionCharacterDrafts = (analysis: GenerateFramesRuntimeAnalysis) =>
  fitDraftCount(analysis, [
    {
      pose: "Blast and silhouette break",
      description: "A hot explosion bursts open with bright fire and smoke while a stick figure silhouette starts breaking out of the smoke instead of merging into it.",
    },
    {
      pose: "Run out of smoke",
      description: "The explosion stays behind as a real effect while the stick figure runs out of the smoke with a clear readable stride and separate identity.",
    },
    {
      pose: "Escape with blast behind",
      description: "The stick figure clears the smoke while the explosion settles into smoke and debris behind them, preserving both the effect and the character.",
    },
    {
      pose: "Escape aftermath",
      description: "The runner keeps clearing the blast while the explosion finishes in smoke and debris behind them, so the mixed scene reaches a readable ending instead of stopping midway.",
    },
  ]);

const buildContinuationDrafts = (analysis: GenerateFramesRuntimeAnalysis, workspaceContext?: DrawingAiWorkspaceContext | null) => {
  if (!workspaceContext?.currentFrameHasBitmap && analysis.continuationState == null) {
    return null;
  }

  const hasExplicitSubjectAnchor =
    analysis.subjects.length > 0 &&
    !(
      analysis.subjects.length === 1 &&
      analysis.subjects[0]?.side === "center" &&
      (!analysis.subjects[0]?.label || isGenericSubjectLabel(analysis.subjects[0]?.label))
    );
  const preservedSubjectPhrase =
    hasExplicitSubjectAnchor
      ? analysis.subjects
          .map((subject) => `${subject.side} ${formatSceneSubjectLabel(subject)}`.trim())
          .join(", ")
      : "the same subject identity from the current sequence";
  const scenePhrase =
    analysis.sceneSetting != null || analysis.sceneProps.length > 0 || analysis.sceneDescriptors.length > 0
      ? `${buildSceneSettingPhrase(analysis)}. ${buildScenePropPhrase(analysis)}`.replace(/\s+/g, " ").trim()
      : "Keep the same scene staging and screen geography.";
  const editHistoryPhrase = buildRecentEditPhrase(analysis);
  const actionPhrase = buildActionKeywordPhrase(analysis);
  const requestedEditPhrase = buildRequestedEditPhrase(analysis);

  if (analysis.stillFrameRequested || analysis.requestKind === "single-frame" || analysis.motionType === "scene") {
    return fitDraftCount(analysis, [
      {
        pose: analysis.stillFrameRequested ? "Preserved edited frame" : "Stateful continuation edit",
        description: `${scenePhrase} ${
          hasExplicitSubjectAnchor
            ? `Preserve ${preservedSubjectPhrase} exactly as the current scene identity, keep the same color, side, role, props, tone, and build direction, and`
            : "Continue the current sequence into the immediate next beat, preserving the same subject identity, motion family, and build direction, and"
        } ${requestedEditPhrase} ${actionPhrase} ${editHistoryPhrase}`
          .replace(/\s+/g, " ")
          .trim(),
      },
    ]);
  }

  return fitDraftCount(analysis, [
    {
      pose: "Continuation preserve and load",
      description: `${
        hasExplicitSubjectAnchor
          ? `Keep ${preservedSubjectPhrase} as the same ongoing animation, preserve the same scene, color logic, side assignments, props, tone, and build direction, and load directly into the next readable beat instead of restarting.`
          : "Continue the current sequence into the immediate next beat, preserving the same subject identity, motion family, and scene continuity instead of restarting."
      } ${requestedEditPhrase} ${actionPhrase} ${editHistoryPhrase}`
        .replace(/\s+/g, " ")
        .trim(),
    },
    {
      pose: "Continuation edited follow-through",
      description: `Carry the same motion family forward with ${preservedSubjectPhrase}, let the requested change show up clearly without replacing the whole setup, and keep the action readable as one continuous sequence. ${scenePhrase} ${actionPhrase}`
        .replace(/\s+/g, " ")
        .trim(),
    },
    {
      pose: "Continuation resolved beat",
      description: `Resolve the edit into a readable next beat while preserving continuity, scene identity, build direction, and every previously established subject detail that the user did not ask to change.`
        .replace(/\s+/g, " ")
        .trim(),
    },
  ]);
};

const buildExplosionContinuationDrafts = (analysis: GenerateFramesRuntimeAnalysis) => {
  const wantsBigger = hasPromptPattern(analysis, /\b(bigger|larger|more powerful|stronger|ultimate|more violent|violent)\b/i);
  const wantsShockwave = hasPromptPattern(analysis, /\b(shockwave|dusty shockwave|dust ring|blast ring)\b/i);
  const wantsSmokePush = hasPromptPattern(analysis, /\b(smoke coming toward camera|toward the camera)\b/i);
  const wantsMoreSmoke = hasPromptPattern(analysis, /\b(more smoke|add smoke|fade it slower|slower fade)\b/i);
  const wantsDust = hasPromptPattern(analysis, /\b(add dust|more dust|dusty|dust cloud)\b/i);
  const wantsPoisonous = hasPromptPattern(analysis, /\b(poisonous|toxic|acid(?:ic)?|green instead)\b/i);
  const wantsSpiky = hasPromptPattern(analysis, /\b(spiky|jagged|starburst)\b/i);
  const wantsDisintegrate = hasPromptPattern(
    analysis,
    /\b(disintegrat(?:e|ing)|dissipat(?:e|ing)|fade(?: it)? (?:away|out)|fade away|fade out|break apart more|fall apart|finish fading)\b/i,
  );

  if (!wantsBigger && !wantsShockwave && !wantsSmokePush && !wantsMoreSmoke && !wantsDust && !wantsPoisonous && !wantsSpiky && !wantsDisintegrate) {
    return null;
  }

  const palettePhrase = wantsPoisonous
    ? "Shift the whole effect into a toxic green core, acid-lime glow, and murky poisonous vapor"
    : wantsBigger
      ? "Make the same explosion visibly bigger with a brighter larger core and a wider hotter fire shell than before"
      : "preserve the same hot blast core";
  const shapePhrase = wantsSpiky
    ? "Make the blast silhouette sharply spiked across the whole effect, not just in one corner."
    : "Keep the blast silhouette broad and readable.";
  const shockwavePhrase = wantsShockwave
    ? "Add a dusty ground shockwave ring that expands clearly under the explosion."
    : "No ground shockwave is needed.";
  const smokePhrase = wantsSmokePush
    ? "Drive thick smoke outward and toward the camera with a strong depth read."
    : wantsMoreSmoke
      ? "Build thicker lingering smoke so the aftermath does not disappear too quickly."
      : wantsDust
        ? "Carry a dusty breakup through the aftermath so the blast feels grounded instead of clean air only."
        : "Let smoke stay secondary to the main blast.";
  const endingPhrase = wantsDisintegrate
    ? "Carry the same explosion event into a real disintegration ending where the fire shell breaks apart, thins out, and disintegrates away into smoke and dust."
    : wantsMoreSmoke || wantsDust || wantsSmokePush
      ? "Let the same explosion event finish in a readable smoky ending instead of cutting off abruptly."
      : "Let the same explosion event finish cleanly instead of repeating the peak forever.";

  return fitDraftCount(analysis, [
    {
      pose: "Edited explosion continuation",
      description: `Continue the same explosion event instead of starting a separate blast. ${palettePhrase}. ${shapePhrase} The opening should still read as the same effect the user already has, only safely edited.`,
    },
    {
      pose: wantsShockwave ? "Expanded blast with shockwave" : wantsBigger ? "Expanded blast release" : "Edited blast release",
      description: `${palettePhrase}. ${shapePhrase} ${shockwavePhrase} Keep the same explosion event centered and make it clearly bigger, stronger, and wider without turning into runaway growth.`,
    },
    {
      pose: wantsSpiky ? "Spiky peak breakup" : "Peak breakup continuation",
      description: `${wantsSpiky ? "The jagged spike silhouette should dominate the whole burst at peak spread." : wantsBigger ? "The same explosion should hit a bigger wider peak spread before it begins tearing apart, instead of freezing at its old size." : "The same explosion should reach peak energy and then begin tearing apart instead of freezing."} ${wantsPoisonous ? "The toxic green treatment must stay dominant across the whole fire shell." : ""}`.trim(),
    },
    {
      pose: wantsSmokePush ? "Smoke push toward camera" : wantsDust ? "Dusty breakup cloud" : "Smoke and debris spread",
      description: `${smokePhrase} ${wantsDust ? "Add dusty breakup and ground-level particulate spread under the main fire." : wantsBigger ? "Keep debris and smoke tied to the same explosion while the larger blast still reads clearly through the aftermath." : "Keep debris and smoke tied to the same explosion."}`.trim(),
    },
    {
      pose: wantsDisintegrate ? "Explosion disintegration" : "Edited smoky aftermath",
      description: `${endingPhrase} ${wantsBigger ? "The bigger blast should still feel larger and stronger here, even as it starts losing density." : ""} ${wantsShockwave ? "The dusty ring should widen and thin rather than staying heavy forever." : ""}`.trim(),
    },
    {
      pose: "Explosion ending fade",
      description: `${wantsDisintegrate ? "The last glowing fragments, dust, and smoke finish dissolving away so the same explosion event clearly ends instead of restarting or freezing." : wantsBigger ? "The smoke, dust, and remaining glow settle into a readable ending while the larger stronger explosion still feels like the same edited event instead of stopping halfway." : "The smoke, dust, and remaining glow settle into a readable ending so the same edited explosion does not stop halfway."} ${wantsPoisonous ? "Keep only toxic green vapor traces in the ending so the poisonous treatment stays clean all the way through." : ""}`.trim(),
    },
  ]);
};

const buildWalkingContinuationDrafts = (analysis: GenerateFramesRuntimeAnalysis) => {
  if (/\b(sad|downcast|depressed|gloomy)\b/i.test(analysis.prompt)) {
    return fitDraftCount(analysis, [
      {
        pose: "Sad walk contact",
        description: "Keep the same walk but drop the chest and head line, shorten the stride slightly, and make the planted step feel emotionally heavy and subdued instead of neutral.",
      },
      {
        pose: "Sad walk passing beat",
        description: "Carry the same walk through a low-energy passing beat with softer arm swing, less bounce, and a weary weight transfer.",
      },
      {
        pose: "Sad second contact",
        description: "Land the next step with the same downcast identity so the walk clearly reads sad all the way through instead of snapping back to a generic cycle.",
      },
    ]);
  }

  if (/\b(mad|angry|furious|grumpy|irritated)\b/i.test(analysis.prompt)) {
    return fitDraftCount(analysis, [
      {
        pose: "Angry walk contact",
        description: "Keep the same walk but make the contact stomp harder with tighter shoulders, sharper forward drive, and a more irritated body line.",
      },
      {
        pose: "Angry walk passing beat",
        description: "Push through the passing beat with tense impatient carry, stronger arm drive, and less relaxed hang time between steps.",
      },
      {
        pose: "Angry second contact",
        description: "Land the next step with the same angry stomp energy so the whole walk reads mad and force-driven instead of merely faster.",
      },
    ]);
  }

  if (/\b(joyful|happy|cheerful|playful|bouncy)\b/i.test(analysis.prompt)) {
    return fitDraftCount(analysis, [
      {
        pose: "Joyful walk contact",
        description: "Keep the same walk but lift the chest, open the arm swing, and make the planted step feel buoyant and upbeat instead of flat.",
      },
      {
        pose: "Joyful walk passing beat",
        description: "Carry the same walk through a springier passing beat with extra rise, playful flow, and a lighter happier transfer of weight.",
      },
      {
        pose: "Joyful second contact",
        description: "Land the next step with the same buoyant cheerful identity so the walk keeps its joyful mood through the whole cycle.",
      },
    ]);
  }

  if (hasPromptPattern(analysis, /\b(run instead of walk|turn .* into a run|make .* run)\b/i)) {
    return fitDraftCount(analysis, [
      {
        pose: "Run push-off conversion",
        description: "Change the same figure from a walk into a run by pitching the body farther forward, increasing push-off, and opening the stride.",
      },
      {
        pose: "Run passing conversion",
        description: "The middle beat carries faster through center with stronger arm drive, higher leg recovery, and less hang time than the walk.",
      },
      {
        pose: "Run extension conversion",
        description: "The next step lands as a real run beat with longer travel, stronger forward commitment, and clean running mechanics.",
      },
    ]);
  }

  if (hasPromptPattern(analysis, /\b(smoother|cleaner|polish|tweak|fix|better in[- ]betweens?)\b/i)) {
    return fitDraftCount(analysis, [
      {
        pose: "Cleaner walk contact",
        description: "Keep the same walk idea but tighten the first contact with clearer planted footing, better spacing into the step, and cleaner arm opposition.",
      },
      {
        pose: "Walk down and transition",
        description: "Add a smoother down-and-through transition so the hips settle and rise more naturally instead of popping between poses.",
      },
      {
        pose: "Smoother walk passing beat",
        description: "Preserve the same walk while smoothing the middle passing beat so the shoulders, hips, and step timing flow more naturally.",
      },
      {
        pose: "Cleaner second contact",
        description: "Land the next contact beat with the same walk identity, cleaner balance, more readable stride direction, and a cleaner in-between lead-in.",
      },
    ]);
  }

  if (hasPromptPattern(analysis, /\b(faster|quicker|snappier|more energetic)\b/i)) {
    return fitDraftCount(analysis, [
      {
        pose: "Faster walk contact",
        description: "Keep the same walk but shorten the contact beat so the planted foot hits and releases faster, with a slightly stronger forward lean and livelier arm swing.",
      },
      {
        pose: "Compressed passing beat",
        description: "Move through the middle beat more quickly with less hang time, tighter spacing, and a sharper body carry over the planted leg.",
      },
      {
        pose: "Longer stride contact",
        description: "Land the next step farther forward with quicker recovery and a more energetic stride so the walk clearly feels faster instead of unchanged.",
      },
      {
        pose: "Fast walk recovery",
        description: "Carry momentum into the next transition with less pause between steps so the cycle reads as a faster continuous walk.",
      },
    ]);
  }

  if (hasPromptPattern(analysis, /\b(impact|heavier|harder|weightier|more weight)\b/i)) {
    return fitDraftCount(analysis, [
      {
        pose: "Heavy step plant",
        description: "Keep the same walk but make the foot plant hit harder with clearer down force, a firmer knee bend, and more visible body drop into the step.",
      },
      {
        pose: "Weighted passing beat",
        description: "Carry the mass through the passing beat with stronger compression and clearer weight transfer so the body feels heavier between steps.",
      },
      {
        pose: "Heavy second plant",
        description: "Land the next step with another firm impact beat, clearer foot-contact force, and stronger body drop so the walk gains real step weight.",
      },
      {
        pose: "Step recoil recovery",
        description: "Let the body recover from the heavier step with grounded recoil instead of floating lightly into the next stride.",
      },
    ]);
  }

  return buildWalkingDrafts(analysis);
};

const buildPunchContinuationDrafts = (analysis: GenerateFramesRuntimeAnalysis) => {
  const actor = getPrimaryCharacterSubject(analysis);
  const target = getTargetCharacterSubject(analysis);
  const actorPhrase =
    actor?.side === "left"
      ? "Keep the left figure"
      : actor?.side === "right"
        ? "Keep the right figure"
        : "Keep the same figure";
  const targetPhrase =
    target?.side === "left"
      ? "toward the left-side target"
      : target?.side === "right"
        ? "toward the right-side target"
        : "through the target line";
  if (hasPromptPattern(analysis, /\b(hit harder|harder|heavier|more powerful|stronger recoil|stronger impact|violent|brutal|savage)\b/i)) {
    return fitDraftCount(analysis, [
      {
        pose: "Heavier punch load",
        description: `${actorPhrase} and load the body more deeply so the hit feels earned, with clearer weight on the back side before driving ${targetPhrase}.`,
      },
      {
        pose: "Explosive punch release",
        description: `Drive the striking side forward faster ${targetPhrase} with more extension, stronger line of action, and clearer body commitment into the hit.`,
      },
      {
        pose: "Heavy impact beat",
        description: `Make the contact feel harder ${targetPhrase} with sharper follow-through, stronger recoil in the torso, and a more forceful stop.`,
      },
      {
        pose: "Punch recoil recovery",
        description: `${actorPhrase} on the same side and carry the force into a stronger recovery beat so the punch feels like it hit hard instead of snapping back gently.`,
      },
    ]);
  }

  return buildPunchDrafts(analysis);
};

const buildBallContinuationDrafts = (analysis: GenerateFramesRuntimeAnalysis) => {
  const colorPrefix = analysis.requestedColor ? `${analysis.requestedColor} ` : "";
  const wantsSmoother = hasPromptPattern(analysis, /\b(smoother|smooth this out|cleaner|polish|better in[- ]betweens?)\b/i);
  const wantsFaster = hasPromptPattern(analysis, /\b(faster|quicker|snappier|more energetic)\b/i);

  if (analysis.concepts.includes("morphing-ball")) {
    return fitDraftCount(analysis, [
      {
        pose: "Ball base form",
        description: `Keep the same ${colorPrefix}ball identity clear and centered before any transformation starts so the edit still reads from a real object base.`,
      },
      {
        pose: "Cleaner morph transition",
        description: `Push the transformation through a more deliberate in-between that shows what is changing, instead of vague stretching or creature drift.`,
      },
      {
        pose: "Resolved transformed form",
        description: `Land the new form clearly while preserving a believable relationship to the original ${colorPrefix}ball.`,
      },
    ]);
  }

  if (hasPromptPattern(analysis, /\b(heavier|more weight|weightier)\b/i)) {
    return fitDraftCount(analysis, [
      {
        pose: "Heavy ball high start",
        description: `The same ${colorPrefix}ball starts on the same bounce path but with less float and a more weight-driven setup.`,
      },
      {
        pose: "Heavy ball drop",
        description: `The ${colorPrefix}ball falls with more downward pull and less float, clearly carrying more weight into the bounce.`,
      },
      {
        pose: "Heavy pre-impact",
        description: `The same ${colorPrefix}ball closes the last gap to the floor on a continuous path so the heavier impact feels earned instead of jumping to contact.`,
      },
      {
        pose: "Heavy impact squash",
        description: `The ${colorPrefix}ball hits harder with a denser squash and a stronger downbeat before it starts to recover.`,
      },
      {
        pose: "Lower heavy rebound",
        description: `The rebound stays controlled and lower than before so the bounce feels heavier instead of springy.`,
      },
      {
        pose: "Heavy settle",
        description: `The ball keeps its round identity while settling with less lift and more grounded weight after the heavy bounce.`,
      },
    ]);
  }

  if (hasPromptPattern(analysis, /\b(cartoony|toon|more cartoon)\b/i)) {
    return fitDraftCount(analysis, [
      {
        pose: "Cartoony high start",
        description: `The same ${colorPrefix}ball begins from the same bounce idea but with a clearer playful setup and more elastic timing.`,
      },
      {
        pose: "Cartoony stretch drop",
        description: `The ${colorPrefix}ball stretches vertically on the way down while still reading as the same ball with a clean object-only silhouette.`,
      },
      {
        pose: "Cartoony pre-impact stretch",
        description: `The drop carries into a clearer pre-impact stretch so the playful motion stays continuous instead of snapping straight to squash.`,
      },
      {
        pose: "Cartoony squash hit",
        description: `The ball lands with a broader exaggerated squash for playful cartoon impact while keeping a clean simple object read.`,
      },
      {
        pose: "Cartoony pop rebound",
        description: `The rebound snaps upward with a lively arc and restored roundness, clearly more playful and elastic than the realistic bounce.`,
      },
      {
        pose: "Cartoony settle",
        description: `The motion finishes with a light playful settle that preserves the same ball identity and exaggerated bounce style.`,
      },
    ]);
  }

  if (wantsSmoother) {
    return fitDraftCount(analysis, [
      {
        pose: "Smoothed ball high start",
        description: `Keep the same ${colorPrefix}ball and same bounce idea, but open on a clearer starting arc so the motion reads continuously from the first frame.`,
      },
      {
        pose: "Smoothed descending arc",
        description: `Carry the ${colorPrefix}ball downward through a cleaner in-between on the same path with more even spacing and no teleporting.`,
      },
      {
        pose: "Smoothed pre-impact",
        description: `Add a cleaner pre-impact beat so the ball visibly approaches the ground before the squash instead of jumping straight to contact.`,
      },
      {
        pose: "Smoothed contact squash",
        description: `The same ${colorPrefix}ball hits with a readable controlled squash that still preserves a clean object silhouette.`,
      },
      {
        pose: "Smoothed rebound arc",
        description: `The rebound rises through a clearer in-between arc so the ball feels continuous and smooth rather than popping upward.`,
      },
      {
        pose: "Smoothed settle",
        description: `The bounce resolves into a gentle lower settle so the same animation now finishes cleanly instead of stopping mid-motion.`,
      },
    ]);
  }

  if (wantsFaster) {
    return fitDraftCount(analysis, [
      {
        pose: "Fast ball setup",
        description: `Keep the same ${colorPrefix}ball and same bounce path, but shorten the hang time so the bounce starts moving sooner.`,
      },
      {
        pose: "Fast descending arc",
        description: `The ${colorPrefix}ball drops faster through the same arc with tighter spacing and less float before impact.`,
      },
      {
        pose: "Fast pre-impact",
        description: `The ball races into the floor with very little delay so the faster bounce still reads continuously right before contact.`,
      },
      {
        pose: "Fast impact squash",
        description: `The same ${colorPrefix}ball hits with a quick readable squash and immediate recoil, preserving the same bounce identity.`,
      },
      {
        pose: "Fast rebound",
        description: `The rebound snaps upward more quickly but still follows the same path instead of becoming a teleport.`,
      },
      {
        pose: "Fast settle",
        description: `The bounce finishes in a quicker controlled settle so the animation clearly ends instead of cutting off after the rebound.`,
      },
    ]);
  }

  return analysis.concepts.includes("rolling-ball") ? buildRollingBallDrafts(analysis) : buildBouncingBallDrafts(analysis);
};

const buildMixedExplosionCharacterContinuationDrafts = (analysis: GenerateFramesRuntimeAnalysis) => {
  if (hasPromptPattern(analysis, /\b(later|come out later|runner later)\b/i) && hasPromptPattern(analysis, /\b(bigger|larger|stronger)\b/i)) {
    return fitDraftCount(analysis, [
      {
        pose: "Bigger blast before runner emerges",
        description: "Make the explosion larger first, with a wider hotter blast and thicker smoke while the runner remains mostly obscured inside the smoke.",
      },
      {
        pose: "Delayed runner break-through",
        description: "Hold the runner back one beat longer so the figure begins emerging only after the bigger explosion has already taken over the shot.",
      },
      {
        pose: "Runner clears larger blast",
        description: "The stick figure finally breaks free later, while the enlarged explosion and smoke still read strongly behind them as separate elements.",
      },
      {
        pose: "Late escape aftermath",
        description: "The figure continues escaping as the bigger blast settles into smoke and debris, preserving both the delayed runner timing and the larger explosion scale.",
      },
    ]);
  }

  return buildMixedExplosionCharacterDrafts(analysis);
};

const buildBackgroundScrollCharacterDrafts = (analysis: GenerateFramesRuntimeAnalysis) =>
  fitDraftCount(analysis, [
    {
      pose: "Character centered with background offset left",
      description: `${buildBackgroundScrollScenePhrase(analysis)}. Keep the character locked in the same screen position while the background starts offset, creating a clear camera-follow illusion with the environment moving behind them.`,
    },
    {
      pose: "Character centered with background mid-scroll",
      description: `The character stays centered while the background scrolls farther behind them, with readable layer separation, clear environment travel, and no subject drift. ${buildBackgroundScrollTonePhrase(analysis)}`,
    },
    {
      pose: "Character centered with background offset right",
      description: "The background continues moving behind the centered character so the environment read changes from one side of the scene to the other, but the subject remains anchored and does not slide with the backdrop.",
    },
    {
      pose: "Character centered with background finish",
      description: "The subject stays anchored in the same screen position while the background completes the move into a readable ending offset, so the scroll feels finished instead of cut short or reduced to a treadmill walk.",
    },
  ]);

const buildContinuationSpecificDrafts = (
  analysis: GenerateFramesRuntimeAnalysis,
  workspaceContext?: DrawingAiWorkspaceContext | null,
) => {
  if (!workspaceContext?.currentFrameHasBitmap && analysis.continuationState == null) {
    return null;
  }

  if (
    analysis.componentFamilies.includes("effect") &&
    analysis.componentFamilies.includes("character") &&
    analysis.concepts.includes("explosion") &&
    (analysis.concepts.includes("running") || analysis.concepts.includes("stick-figure"))
  ) {
    return buildMixedExplosionCharacterContinuationDrafts(analysis);
  }

  if (analysis.motionType === "scene" && analysis.stillFrameRequested) {
    return buildSceneContinuationDrafts(analysis);
  }

  if (analysis.motionType === "scene") {
    return buildSceneContinuationDrafts(analysis);
  }

  if (analysis.motionType === "explosion" || analysis.concepts.includes("explosion")) {
    return buildExplosionContinuationDrafts(analysis) ?? buildExplosionDrafts(analysis);
  }

  if (analysis.motionType === "background-scroll") {
    return buildBackgroundScrollCharacterDrafts(analysis);
  }

  if (analysis.motionType === "punch" || analysis.concepts.includes("punch")) {
    return buildPunchContinuationDrafts(analysis);
  }

  if (
    analysis.motionType === "bounce" ||
    analysis.motionType === "roll" ||
    analysis.motionType === "morph" ||
    analysis.concepts.includes("bouncing-ball") ||
    analysis.concepts.includes("rolling-ball") ||
    analysis.concepts.includes("morphing-ball") ||
    (analysis.componentFamilies.includes("object") &&
      (analysis.actionKeywords.some((keyword) => ["bounce", "roll", "morph"].includes(keyword)) ||
        analysis.editIntents.some((intent) => ["timing", "scale", "transform"].includes(intent))))
  ) {
    return buildBallContinuationDrafts(analysis);
  }

  if (analysis.motionType === "walk" || analysis.concepts.includes("walking")) {
    return buildWalkingContinuationDrafts(analysis);
  }

  if (analysis.motionType === "run" || analysis.concepts.includes("running")) {
    return buildRunningDrafts(analysis);
  }

  if (
    analysis.motionType === "stance" ||
    analysis.concepts.includes("fighting-stance") ||
    SHARED_GUARD_STANCE_PATTERN.test(analysis.normalizedPrompt)
  ) {
    return buildFightingStanceDrafts(analysis);
  }

  if (analysis.motionType === "action" || analysis.actionKeywords.length > 0) {
    return buildStatefulActionContinuationDrafts(analysis);
  }

  if (analysis.concepts.includes("night-city")) {
    return buildNightCityDrafts(analysis);
  }

  if (analysis.concepts.includes("mountain-landscape")) {
    return buildMountainLandscapeDrafts(analysis);
  }

  return buildContinuationDrafts(analysis, workspaceContext);
};

const buildGenerateFramesBestEffortDrafts = (
  analysis: GenerateFramesRuntimeAnalysis,
  workspaceContext?: DrawingAiWorkspaceContext | null,
) => {
  if (isGenerateFramesHardNoPlanBlocker(analysis)) {
    return null;
  }

  const explicitSceneRequest =
    /\b(background|backdrop|scene|setting|environment|landscape)\b/i.test(analysis.prompt);
  const prefersStillSubjectOverScene =
    analysis.requestKind === "single-frame" &&
    analysis.primaryFamily !== "background" &&
    analysis.promptSubject != null &&
    (analysis.expectedVisualClass === "still-object" || analysis.expectedVisualClass === "still-character") &&
    !explicitSceneRequest;

  if (analysis.primaryFamily === "continuation") {
    return buildContinuationSpecificDrafts(analysis, workspaceContext);
  }

  const orderedSequenceDrafts = buildOrderedSequenceDrafts(analysis);
  if (orderedSequenceDrafts != null) {
    return orderedSequenceDrafts;
  }

  const shouldBuildSceneFallback =
    analysis.requestKind === "single-frame" &&
    !prefersStillSubjectOverScene &&
    (
      analysis.outputMode === "still" ||
      analysis.visualKind === "scene" ||
      analysis.primaryFamily === "background" ||
      analysis.motionType === "scene" ||
      analysis.sceneSetting != null ||
      analysis.sceneDescriptors.length > 0 ||
      analysis.sceneProps.length > 0 ||
      analysis.sceneElements.length > 0
    );

  if (shouldBuildSceneFallback) {
    return buildComposedStillSceneDrafts(analysis);
  }

  if (prefersStillSubjectOverScene) {
    return buildGenericStillSubjectDrafts(analysis);
  }

  if (analysis.motionType === "punch" || analysis.concepts.includes("punch")) {
    return buildPunchDrafts(analysis);
  }

  if (analysis.motionType === "kick" || analysis.concepts.includes("kick")) {
    return buildKickDrafts(analysis);
  }

  if (analysis.actionKeywords.includes("breathe")) {
    return buildBreathingDrafts(analysis);
  }

  if (analysis.actionKeywords.includes("spin") && /\b(fan|propeller)\b/i.test(analysis.normalizedPrompt)) {
    return buildSpinningFanDrafts(analysis);
  }

  if (analysis.actionKeywords.includes("jump")) {
    return buildJumpDrafts(analysis);
  }

  if (analysis.motionType === "walk" || analysis.concepts.includes("walking")) {
    return buildWalkingDrafts(analysis);
  }

  if (analysis.motionType === "run" || analysis.concepts.includes("running")) {
    return buildRunningDrafts(analysis);
  }

  if (analysis.outputMode === "animation") {
    if (
      analysis.actionKeywords.length > 0 ||
      analysis.subjects.some((subject) => subject.type === "character" || subject.type === "object")
    ) {
      return buildGenericActionSequenceDrafts(analysis);
    }

    return buildGenericEventAnimationDrafts(analysis);
  }

  if (
    analysis.visualKind === "scene" ||
    analysis.primaryFamily === "background" ||
    analysis.motionType === "scene" ||
    analysis.sceneSetting != null ||
    analysis.sceneDescriptors.length > 0 ||
    analysis.sceneProps.length > 0 ||
    analysis.sceneElements.length > 0
  ) {
    return buildComposedStillSceneDrafts(analysis);
  }

  if (analysis.promptSubject != null || analysis.subjects.length > 0) {
    return buildGenericStillSubjectDrafts(analysis);
  }

  return null;
};

export const buildGenerateFramesDeterministicDrafts = ({
  analysis,
  workspaceContext = null,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  workspaceContext?: DrawingAiWorkspaceContext | null;
}) => {
  if (isGenerateFramesHardNoPlanBlocker(analysis)) {
    return null;
  }

  const explicitSceneRequest =
    /\b(background|backdrop|scene|setting|environment|landscape)\b/i.test(analysis.prompt);
  const prefersStillSubjectOverScene =
    analysis.requestKind === "single-frame" &&
    analysis.primaryFamily !== "background" &&
    analysis.promptSubject != null &&
    (analysis.expectedVisualClass === "still-object" || analysis.expectedVisualClass === "still-character") &&
    !explicitSceneRequest;

  if (analysis.primaryFamily === "continuation") {
    return buildContinuationSpecificDrafts(analysis, workspaceContext);
  }

  const orderedSequenceDrafts = buildOrderedSequenceDrafts(analysis);
  if (orderedSequenceDrafts != null) {
    return orderedSequenceDrafts;
  }

  const shouldBuildGenericStillScene =
    analysis.requestKind === "single-frame" &&
    !prefersStillSubjectOverScene &&
    (
      analysis.stillFrameRequested ||
      analysis.visualKind === "scene" ||
      (analysis.primaryFamily === "background" && analysis.outputMode === "still") ||
      analysis.motionType === "scene" ||
      analysis.sceneSetting != null ||
      analysis.sceneDescriptors.length > 0 ||
      analysis.sceneProps.length > 0
    ) &&
    (analysis.subjects.length > 0 || analysis.componentFamilies.includes("background"));

  if (shouldBuildGenericStillScene) {
    return buildComposedStillSceneDrafts(analysis);
  }

  if (
    analysis.primaryFamily === "mixed" &&
    analysis.componentFamilies.includes("effect") &&
    analysis.componentFamilies.includes("character")
  ) {
    return buildMixedExplosionCharacterDrafts(analysis);
  }

  if (
    analysis.primaryFamily === "mixed" &&
    analysis.componentFamilies.includes("background") &&
    analysis.componentFamilies.includes("character") &&
    /\b(scroll|move the background|background move|stay centered|stays centered|centered)\b/i.test(analysis.prompt)
  ) {
    return buildBackgroundScrollCharacterDrafts(analysis);
  }

  if (
    analysis.primaryFamily === "mixed" &&
    analysis.componentFamilies.includes("background") &&
    (analysis.componentFamilies.includes("character") || analysis.componentFamilies.includes("object")) &&
    analysis.requestKind === "single-frame"
  ) {
    return buildComposedStillSceneDrafts(analysis);
  }

  if (analysis.concepts.includes("explosion") || analysis.motionType === "explosion") return buildExplosionDrafts(analysis);
  if (analysis.concepts.includes("lightning") || analysis.motionType === "lightning" || /\b(lightning|bolt)\b/.test(analysis.normalizedPrompt)) {
    return buildLightningDrafts(analysis);
  }
  if (analysis.concepts.includes("shockwave")) return buildShockwaveDrafts(analysis);
  if (analysis.concepts.includes("concrete-cracks")) return buildConcreteCrackDrafts(analysis);
  if (analysis.concepts.includes("bouncing-ball")) return buildBouncingBallDrafts(analysis);
  if (analysis.concepts.includes("rolling-ball") || /\broll(?:ing)?\b.*\b(ball|circle|orb|sphere|dot)\b|\b(ball|circle|orb|sphere|dot)\b.*\broll(?:ing)?\b/.test(analysis.normalizedPrompt)) {
    return buildRollingBallDrafts(analysis);
  }
  if (analysis.concepts.includes("morphing-ball")) return buildMorphingBallDrafts(analysis);
  if (analysis.concepts.includes("punch")) return buildPunchDrafts(analysis);
  if (analysis.concepts.includes("kick")) return buildKickDrafts(analysis);
  if (analysis.actionKeywords.includes("breathe")) return buildBreathingDrafts(analysis);
  if (analysis.actionKeywords.includes("spin") && /\b(fan|propeller)\b/i.test(analysis.normalizedPrompt)) {
    return buildSpinningFanDrafts(analysis);
  }
  if (analysis.actionKeywords.includes("jump")) return buildJumpDrafts(analysis);
  if (analysis.concepts.includes("fighting-stance") || analysis.motionType === "stance" || analysis.actionKeywords.includes("guard")) {
    return buildFightingStanceDrafts(analysis);
  }
  if (analysis.concepts.includes("walking")) return buildWalkingDrafts(analysis);
  if (analysis.concepts.includes("running")) return buildRunningDrafts(analysis);
  if (analysis.concepts.includes("dark-room")) return buildDarkRoomDrafts(analysis);
  if (analysis.concepts.includes("mountain-landscape")) return buildMountainLandscapeDrafts(analysis);
  if (analysis.concepts.includes("night-city")) return buildNightCityDrafts(analysis);
  if (analysis.concepts.includes("zombie-apocalypse")) return buildZombieApocalypseDrafts(analysis);
  if (analysis.concepts.includes("alien-apocalypse")) return buildAlienApocalypseDrafts(analysis);

  if (analysis.outputMode === "animation" && analysis.visualKind === "event" && analysis.promptSubject != null) {
    return buildGenericEventAnimationDrafts(analysis);
  }

  if (
    analysis.actionKeywords.length > 0 &&
    analysis.subjects.some((subject) => subject.type === "character" || subject.type === "object")
  ) {
    return buildGenericActionSequenceDrafts(analysis);
  }

  if (
    analysis.requestKind === "single-frame" &&
    analysis.primaryFamily !== "background" &&
    analysis.promptSubject != null &&
    (analysis.visualKind === "thing" || analysis.concepts.includes("stick-figure") || analysis.outputMode === "still")
  ) {
    return buildGenericStillSubjectDrafts(analysis);
  }

  if (analysis.outputMode === "animation" && analysis.promptSubject != null) {
    return buildGenericEventAnimationDrafts(analysis);
  }

  return buildGenerateFramesBestEffortDrafts(analysis, workspaceContext);
};

const detectAnimationPhaseFromDrafts = (
  frames: readonly DrawingAiGeneratedFrameDraft[],
): DrawingAiGenerateFramesState["animationPhase"] => {
  const aggregate = aggregateDraftText(frames);
  const endingText = normalizePrompt(
    frames
      .slice(Math.max(0, frames.length - 2))
      .map((frame) => `${frame.pose} ${frame.description}`)
      .join(" "),
  );

  if (/\b(fade|disintegrat|dissipat|settle|recovery|aftermath|final|finish|ending|clear(?:ly)? ends?)\b/.test(endingText)) {
    return "ending";
  }
  if (frames.length === 1 && /\b(opening|setup|starting point|starting scene|first frame|still)\b/.test(aggregate)) {
    return "start";
  }
  if (/\b(build|start|opening|setup|high start|pre[- ]impact|anticipation)\b/.test(aggregate)) {
    return "progression";
  }
  return "progression";
};

export const buildUpdatedGenerateFramesState = ({
  analysis,
  frames,
  workspaceContext = null,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  frames: readonly DrawingAiGeneratedFrameDraft[];
  workspaceContext?: DrawingAiWorkspaceContext | null;
}): DrawingAiGenerateFramesState => {
  const subjectBindings = buildStableSubjectBindings({
    subjects: analysis.subjects,
    previousBindings: analysis.continuationState?.subjectBindings ?? [],
  });

  return {
    ownerProjectId:
      typeof workspaceContext?.projectId === "string" && workspaceContext.projectId.trim().length > 0
        ? workspaceContext.projectId.trim()
        : null,
    subjectType:
      analysis.visualKind === "scene" &&
      analysis.outputMode === "still" &&
      analysis.subjects.every((subject) => subject.type === "background")
        ? "background"
        : detectStateSubjectType(analysis.primaryFamily, analysis.componentFamilies),
    subjects: analysis.subjects,
    projectScope: analysis.projectScope,
    shotScope: analysis.shotScope,
    motionType: analysis.motionType,
    tone: analysis.tone,
    forceLevel: analysis.forceLevel,
    animationPhase: detectAnimationPhaseFromDrafts(frames),
    frameCount: clampRequestedFrameCount(Math.max(frames.length, analysis.requestedFrameCount)),
    fps: Math.max(1, Math.min(55, Math.round(analysis.fps || workspaceContext?.timelineFps || 12))),
    modifiers: analysis.modifiers,
    sceneSetting: analysis.sceneSetting,
    sceneDescriptors: analysis.sceneDescriptors,
    sceneProps: analysis.sceneProps,
    sceneElements: analysis.sceneElements,
    focusTargets: analysis.focusTargets,
    actionKeywords: analysis.actionKeywords,
    buildDirection: analysis.buildDirection,
    sequenceBeats: analysis.sequenceBeats,
    layerPlan: analysis.layerPlan,
    cameraPlan: analysis.cameraPlan,
    executionGuidance: analysis.executionGuidance,
    searchConfidence: analysis.searchConfidence,
    qualityFloor: analysis.qualityFloor,
    recentVariationSignatures: buildUpdatedRecentVariationSignatures({
      previousSignatures: analysis.recentVariationSignatures,
      nextSignature: analysis.variationSignature,
    }),
    subjectBindings,
    recentEdits: analysis.recentEdits,
  };
};

export const buildGenerateFramesFallbackOutput = ({
  analysis: _analysis,
  usedDeterministicPlan: _usedDeterministicPlan,
}: {
  analysis: GenerateFramesRuntimeAnalysis;
  usedDeterministicPlan: boolean;
}) => {
  return "";
};
