import {readFileSync} from "node:fs";
import {resolve} from "node:path";

export const SPEC0003_BASE_COMMIT = "2cd25fd0bdfb8a775370641ffd65db315cc94532";
export const SPEC0003_OUTPUT_DIR = "output/spec-0003/single-implementation";
export const SPEC0003_MANIFEST_PATH = `${SPEC0003_OUTPUT_DIR}/proof-manifest.json`;

export const SPEC0003_DIRTY_PATHS = [
  "app/page.tsx",
  "scripts/fixtures/spec0003-tutorials/v1/browser-plan.json",
  "scripts/fixtures/spec0003-tutorials/v1/proof-commands.json",
  "scripts/recordSpec0003TutorialsProof.ts",
  "scripts/runSpec0003TutorialsBrowserProof.ts",
  "scripts/spec0003-tutorials/browserProofContract.ts",
  "scripts/validateSpec0003TutorialsProof.ts",
  "src/components/tutorials/TutorialsScreen.module.css",
  "src/components/tutorials/TutorialsScreen.tsx",
  "src/lib/tutorials/tutorialCatalog.ts"
] as const;

export type BrowserPlan = {
  version: 1;
  welcomeHeading: string;
  status: string;
  cards: ReadonlyArray<{id: string; title: string; featured: boolean}>;
  viewports: ReadonlyArray<{id: string; width: number; height: number}>;
};

export const readBrowserPlan = (root = process.cwd()): BrowserPlan =>
  JSON.parse(readFileSync(resolve(root, "scripts/fixtures/spec0003-tutorials/v1/browser-plan.json"), "utf8")) as BrowserPlan;

export const assertBrowserPlan = (plan: BrowserPlan) => {
  const titles = ["Start Here", "Create Your First Animation", "Create with AI", "Finalize Your Animation"];
  if (plan.version !== 1 || plan.welcomeHeading !== "Welcome to Diamond Animator" || plan.status !== "COMING LATER") {
    throw new Error("SPEC0003_PLAN_COPY_MISMATCH");
  }
  if (plan.cards.length !== 4 || plan.cards.map((card) => card.title).join("\u0000") !== titles.join("\u0000")) {
    throw new Error("SPEC0003_PLAN_CARD_MISMATCH");
  }
  if (plan.cards.filter((card) => card.featured).length !== 1 || plan.cards[0]?.featured !== true) {
    throw new Error("SPEC0003_PLAN_FEATURE_MISMATCH");
  }
  if (JSON.stringify(plan.viewports) !== JSON.stringify([
    {id: "desktop", width: 1440, height: 900},
    {id: "tablet", width: 1024, height: 768},
    {id: "phone", width: 390, height: 844},
  ])) {
    throw new Error("SPEC0003_PLAN_VIEWPORT_MISMATCH");
  }
};
