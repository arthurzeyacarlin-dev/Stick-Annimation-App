import {
  GENERATE_PLANS_LLM_TRAINING_EXAMPLES,
  formatGeneratePlansExamplesForPrompt,
  selectRelevantGeneratePlansExamples,
  type GeneratePlansExample,
} from "./plansTraining";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../dbAdmin";

/**
 * Supabase table: public.generate_plans_training_examples
 *
 * Suggested SQL:
 * create table if not exists public.generate_plans_training_examples (
 *   id text primary key,
 *   mode text not null,
 *   category text not null,
 *   user_prompt text not null,
 *   story text not null,
 *   known_facts jsonb not null default '[]'::jsonb,
 *   missing_facts jsonb not null default '[]'::jsonb,
 *   ranked_missing_facts jsonb not null default '[]'::jsonb,
 *   strongest_gap text,
 *   best_question text,
 *   acceptable_options jsonb not null default '[]'::jsonb,
 *   bad_questions jsonb not null default '[]'::jsonb,
 *   reasoning text not null,
 *   should_plan_now boolean not null default false,
 *   should_ask_question boolean not null default false,
 *   story_help_mode text not null default 'none',
 *   enough_known_to_plan boolean not null default false,
 *   max_questions_before_planning integer not null default 3,
 *   bad_style_notes jsonb not null default '[]'::jsonb,
 *   story_quality_notes jsonb not null default '[]'::jsonb,
 *   plan_quality_notes jsonb not null default '[]'::jsonb,
 *   story_structure jsonb not null default '{}'::jsonb,
 *   story_options jsonb not null default '[]'::jsonb,
 *   tags jsonb not null default '[]'::jsonb,
 *   version integer not null default 1,
 *   is_active boolean not null default true,
 *   created_at timestamptz not null default timezone('utc', now()),
 *   updated_at timestamptz not null default timezone('utc', now())
 * );
 *
 * create index if not exists generate_plans_training_examples_mode_idx
 *   on public.generate_plans_training_examples (mode, is_active);
 */

const GENERATE_PLANS_TRAINING_TABLE = "generate_plans_training_examples";
const CACHE_TTL_MS = 60_000;

type GeneratePlansTrainingRow = {
  id: string;
  mode: "generate-plans";
  category: string;
  user_prompt: string;
  story: string;
  known_facts: string[];
  missing_facts: string[];
  ranked_missing_facts: string[];
  strongest_gap: string | null;
  best_question: string | null;
  acceptable_options: string[];
  bad_questions: string[];
  reasoning: string;
  should_plan_now: boolean;
  should_ask_question: boolean;
  story_help_mode: GeneratePlansExample["storyHelpMode"];
  enough_known_to_plan: boolean;
  max_questions_before_planning: number;
  bad_style_notes: string[];
  story_quality_notes: string[];
  plan_quality_notes: string[];
  story_structure: NonNullable<GeneratePlansExample["storyStructure"]>;
  story_options: NonNullable<GeneratePlansExample["storyOptions"]>;
  tags: string[];
  version: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

let cachedExamples: { expiresAt: number; examples: GeneratePlansExample[] } | null = null;

const toRow = (example: GeneratePlansExample): GeneratePlansTrainingRow => ({
  id: example.id,
  mode: example.mode,
  category: example.category,
  user_prompt: example.userPrompt,
  story: example.story,
  known_facts: example.knownFacts,
  missing_facts: example.missingFacts,
  ranked_missing_facts: example.rankedMissingFacts,
  strongest_gap: example.strongestGap || null,
  best_question: example.bestQuestion,
  acceptable_options: example.acceptableOptions,
  bad_questions: example.badQuestions,
  reasoning: example.reasoning,
  should_plan_now: example.shouldPlanNow,
  should_ask_question: example.shouldAskQuestion,
  story_help_mode: example.storyHelpMode,
  enough_known_to_plan: example.enoughKnownToPlan ?? example.shouldPlanNow,
  max_questions_before_planning:
    example.maxQuestionsBeforePlanning ?? (example.shouldPlanNow ? 0 : example.storyHelpMode === "none" ? 3 : 4),
  bad_style_notes: example.badStyleNotes ?? [],
  story_quality_notes: example.storyQualityNotes ?? [],
  plan_quality_notes: example.planQualityNotes ?? [],
  story_structure: example.storyStructure ?? {},
  story_options: example.storyOptions ?? [],
  tags: example.tags,
  version: example.version,
  is_active: example.isActive,
});

const toExample = (row: GeneratePlansTrainingRow): GeneratePlansExample => ({
  id: row.id,
  mode: "generate-plans",
  category: row.category,
  userPrompt: row.user_prompt,
  story: row.story,
  knownFacts: row.known_facts ?? [],
  missingFacts: row.missing_facts ?? [],
  rankedMissingFacts: row.ranked_missing_facts ?? [],
  strongestGap: row.strongest_gap ?? "",
  bestQuestion: row.best_question,
  acceptableOptions: row.acceptable_options ?? [],
  badQuestions: row.bad_questions ?? [],
  reasoning: row.reasoning,
  shouldPlanNow: row.should_plan_now,
  shouldAskQuestion: row.should_ask_question,
  storyHelpMode: row.story_help_mode ?? "none",
  enoughKnownToPlan: row.enough_known_to_plan ?? row.should_plan_now ?? false,
  maxQuestionsBeforePlanning: row.max_questions_before_planning ?? (row.should_plan_now ? 0 : 3),
  badStyleNotes: row.bad_style_notes ?? [],
  storyQualityNotes: row.story_quality_notes ?? [],
  planQualityNotes: row.plan_quality_notes ?? [],
  storyStructure: row.story_structure ?? {},
  storyOptions: row.story_options ?? [],
  tags: row.tags ?? [],
  version: row.version ?? 1,
  isActive: row.is_active ?? true,
});

export const insertExamples = async (
  examples: GeneratePlansExample[] = GENERATE_PLANS_LLM_TRAINING_EXAMPLES,
) => {
  const supabase = getSupabaseAdminClient();
  const rows = examples.map(toRow);
  const { error } = await supabase.from(GENERATE_PLANS_TRAINING_TABLE).upsert(rows, {
    onConflict: "id",
  });

  if (error) {
    throw error;
  }

  cachedExamples = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    examples,
  };

  return rows.length;
};

export const getExamples = async ({
  forceRefresh = false,
}: {
  forceRefresh?: boolean;
} = {}): Promise<GeneratePlansExample[]> => {
  if (!forceRefresh && cachedExamples && cachedExamples.expiresAt > Date.now()) {
    return cachedExamples.examples;
  }

  if (!isSupabaseAdminConfigured()) {
    return GENERATE_PLANS_LLM_TRAINING_EXAMPLES;
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from(GENERATE_PLANS_TRAINING_TABLE)
      .select("*")
      .eq("mode", "generate-plans")
      .eq("is_active", true)
      .order("category", { ascending: true })
      .order("id", { ascending: true });

    if (error || !data) {
      throw error ?? new Error("Failed to load Generate Plans training examples.");
    }

    const examples = (data as GeneratePlansTrainingRow[]).map(toExample);
    cachedExamples = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      examples,
    };

    return examples.length > 0 ? examples : GENERATE_PLANS_LLM_TRAINING_EXAMPLES;
  } catch (error) {
    console.warn("Falling back to local Generate Plans training examples.", error);
    return GENERATE_PLANS_LLM_TRAINING_EXAMPLES;
  }
};

export const getRelevantExamples = async ({
  userMessage,
  analysisInput,
  limit = 6,
}: {
  userMessage: string;
  analysisInput: string;
  limit?: number;
}) => {
  const examples = await getExamples();
  return selectRelevantGeneratePlansExamples({
    examples,
    userMessage,
    analysisInput,
    limit,
  });
};

export const getRelevantExamplesPromptBlock = async ({
  userMessage,
  analysisInput,
  limit = 6,
}: {
  userMessage: string;
  analysisInput: string;
  limit?: number;
}) => {
  const examples = await getRelevantExamples({
    userMessage,
    analysisInput,
    limit,
  });

  return {
    examples,
    formatted: formatGeneratePlansExamplesForPrompt(examples),
  };
};
