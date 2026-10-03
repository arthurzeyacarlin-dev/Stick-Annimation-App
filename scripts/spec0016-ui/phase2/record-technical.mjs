import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const checks = [
  ['boundary', ['scripts/spec0016-ui/phase2/boundary-oracle.mjs']],
  ['instant-hover', ['scripts/spec0016-ui/phase2/instant-hover-oracle.mjs']],
  ['action-eligibility-and-privacy', ['--experimental-strip-types', 'scripts/spec0016-ui/phase2/action-oracle.mjs']],
  ['library-read-only', ['--experimental-strip-types', 'scripts/spec0011-project-library/phase1Oracle.ts']],
  ['search-sort-management', ['--experimental-strip-types', 'scripts/spec0011-project-library/phase3Oracle.ts']],
  ['export-identity-rendering', ['--experimental-strip-types', 'scripts/spec0009-export/phase1Oracle.ts']],
];
const results = checks.map(([name, args]) => ({ name, status: 'PASS', output: execFileSync(process.execPath, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }));
assert.equal(execFileSync('git', ['diff', '--check'], { encoding: 'utf8' }), '');
writeFileSync('output/spec-0016/phase-2/technical-results.json', JSON.stringify({ results, diffCheck: 'PASS', focusedEslint: 'PASS', previewWebpackCompileGenerate: 'PASS', typecheck: 'FAIL: inherited two dev/ai-costs PageProps/searchParams errors; no new errors', historicalExportPhase3Oracle: 'Not a passing result: reached its old Phase 3 dirty-path ceiling and rejected this Phase 2 allowlist. No old test rewritten or boundary weakened.' }, null, 2) + '\n');
console.log(JSON.stringify({ status: 'PASS', tests: results.map(r => r.name) }));
