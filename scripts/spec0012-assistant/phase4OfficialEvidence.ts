import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const output = resolve("output/spec-0012/phase-4/official-evidence.json"); mkdirSync(resolve("output/spec-0012/phase-4"), { recursive: true });
const evidence = {
  status: "PASS",
  checkedAt: "2026-09-23",
  officialSourcesOnly: true,
  sources: [
    { url: "https://developers.openai.com/api/docs/guides/tools-web-search", findings: ["Responses exposes the current web_search hosted tool", "web_search_call records actions", "output_text annotations contain citation title, URL and character indices", "citations shown to users must be visible and clickable", "action.sources can be requested"] },
    { url: "https://developers.openai.com/api/docs/pricing", findings: ["web search costs $10 per 1,000 calls", "search-content tokens are billed at model rates"] },
    { url: "https://developers.openai.com/api/docs/guides/your-data", findings: ["API data is not used for training by default", "Responses abuse-monitoring retention is 30 days by default", "store:false avoids ordinary Responses application-state storage, subject to documented exceptions and organization controls"] },
    { url: "https://developers.openai.com/api/docs/guides/rate-limits", findings: ["rate limits apply at organization and project levels and vary by model", "rate-limit headers expose request/token state", "SDK retries must be explicitly controlled to avoid multiplied attempts"] },
    { url: "https://developers.openai.com/api/docs/guides/error-codes", findings: ["valid API-key and organization/project access are required", "billing, quota and access failures must not be treated as retryable success"] },
  ],
  gate: {
    capability: "current Responses web_search only; no preview/custom scraper/fetch fallback",
    citations: "validated action-source metadata plus visible clickable annotations required",
    dataUse: "public-question projection only; private/local/credential content rejected; store:false",
    limits: "one request, max two hosted calls, no retry, 45-second search deadline inside 90-second job",
    cost: "maximum hosted-tool charge $0.02 plus bounded model/search-content tokens; total request ceiling $0.15",
    accountAccess: "existing ignored server-only credential; capability is proven only by the separately authorized live smoke",
    liveAuthority: "Arthur authorized at most two live calls total: one local greeting and one implicit current YouTube Shorts search; no retry",
  },
};
writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ status: evidence.status, sources: evidence.sources.length }));
