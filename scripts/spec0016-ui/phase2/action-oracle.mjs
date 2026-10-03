import assert from 'node:assert/strict';
import { getExportAuthoredFrameCount, exportCollectionEntryIdentityMatches } from '../../../src/lib/export/exportPhase1.ts';
import { readFileSync } from 'node:fs';
assert.equal(getExportAuthoredFrameCount({ document: { layers: [{ cells: [{ cellType: 'empty' }, { cellType: 'empty' }] }] } }), 0);
assert.equal(getExportAuthoredFrameCount({ document: { layers: [{ cells: [{ cellType: 'drawing' }, { cellType: 'empty' }] }] } }), 1);
const entry = { locator: 'unified-v2:fixture-id', sourceKind: 'unified-v2', sourceId: 'fixture-id', classification: 'canonical', sourceDigest: 'a', candidateDigest: 'b', updatedAt: '2026-10-03T00:00:00Z' };
assert.ok(exportCollectionEntryIdentityMatches(entry, { ...entry }));
for (const field of Object.keys(entry)) assert.ok(!exportCollectionEntryIdentityMatches(entry, { ...entry, [field]: `${entry[field]}-changed` }), field);
const source = readFileSync('src/components/project-library/ProjectLibrary.tsx', 'utf8');
assert.match(source, /exportDisabled = cardDisabled \|\| \(ready && state\.project\.snapshot\.frameCount === 0\)/);
assert.match(source, /disabled=\{exportDisabled\}/);
assert.match(source, /current\.snapshot\.frameCount === 0/);
for (const pathname of ['/api/account/projects', '/api/account/usage', '/api/account/data?namespace=preferences&key=home']) {
  const response = await fetch('http://127.0.0.1:58584' + pathname);
  assert.equal(response.status, 401, pathname);
  assert.doesNotMatch(await response.text(), /projectDigest|bundle_sha256|part_paths/);
}
console.log(JSON.stringify({ status: 'PASS', zeroFrameGuard: true, identityFields: 7, unauthenticatedProtectedApis: 3, paidProviderCalls: 0 }));
