import { GENERATE_PLANS_LLM_TRAINING_EXAMPLES } from "../src/lib/ai/plansTraining";
import { insertExamples } from "../src/lib/ai/plansTrainingStore";

const run = async () => {
  const insertedCount = await insertExamples(GENERATE_PLANS_LLM_TRAINING_EXAMPLES);
  console.info(`Seeded ${insertedCount} Generate Plans training examples to Supabase.`);
};

run().catch((error) => {
  console.error("Failed to seed Generate Plans training examples.", error);
  process.exitCode = 1;
});
