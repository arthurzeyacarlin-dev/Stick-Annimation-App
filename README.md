# Diamond Animator

Diamond Animator is an AI-first animation application intended to let beginners create professional stick-figure animation through conversation while preserving direct, advanced editing controls for human animators.

The current repository is a local Next.js prototype. It contains a substantial raster drawing workspace, timeline and position-tween systems, local project persistence, a hybrid deterministic/OpenAI procedural frame-generation pipeline, and early stick-figure workspace and creator surfaces. It is not yet a production-ready animation product.

## Start Here

Repository continuity is controlled by [docs/README.md](docs/README.md). Every new Codex task must begin with `AGENTS.md` and the read order defined there. The frozen initial audit is [docs/baselines/2026-08-09-repository-audit.md](docs/baselines/2026-08-09-repository-audit.md).

Important: the initial audit found that almost all substantive application work was untracked or modified relative to the two scaffold commits. Do not reset, restore, broadly stage, or commit until the mixed working tree has been reviewed.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Required environment variable names are documented in `.env.example`. Never commit real credentials. Current verification commands and known baseline failures are recorded in [docs/testing_workflow.md](docs/testing_workflow.md).

## Current Technical Shape

- Next.js 16, React 19, TypeScript
- Browser-local drawing projects stored in `localStorage`
- OpenAI Responses API for AI text and structured planning
- Optional Supabase-backed Generate Plans example retrieval plus drawing-project AI-memory sync code paths
- Hand-authored prompt/reference examples; no custom-trained LLM exists yet
- Bespoke validation scripts; no conventional unit/E2E suite or CI gate yet

See [docs/architecture.md](docs/architecture.md) and [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) for evidence-backed detail.
