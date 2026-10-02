import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const allowed = new Set(['src/components/account/ExistingHome.tsx', 'src/components/chrome/AIcreditspage.tsx']);
const git = (...args) => execFileSync('git', args);
const tracked = git('ls-files', 'src', 'app', 'package.json', 'package-lock.json', 'next.config.ts').toString().trim().split('\n');
let checked = 0;
for (const path of tracked) {
  if (allowed.has(path)) continue;
  assert.ok(readFileSync(path).equals(git('show', `HEAD:${path}`)), `Protected bytes changed: ${path}`);
  checked++;
}
const homePath = 'src/components/account/ExistingHome.tsx';
const home = readFileSync(homePath, 'utf8');
const oldHome = git('show', `HEAD:${homePath}`).toString();
const segment = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));
const tailMarker = '{view === "tutorials" && (';
assert.equal(home.slice(home.indexOf(tailMarker)), oldHome.slice(oldHome.indexOf(tailMarker)), 'Protected child-screen mounts changed');
assert.equal(segment(home, '  const recoverStartupDraft =', '  if (startupRecovery.kind'), segment(oldHome, '  const recoverStartupDraft =', '  if (startupRecovery.kind'), 'Recovery actions changed');
const chromePath = 'src/components/chrome/AIcreditspage.tsx';
const chrome = readFileSync(chromePath, 'utf8');
const oldChrome = git('show', `HEAD:${chromePath}`).toString();
assert.equal(segment(chrome, '  const logOut =', '\n  return ('), segment(oldChrome, '  const logOut =', '\n  return ('), 'Logout implementation changed');
assert.equal(git('diff', '--cached', '--name-only').toString().trim(), '', 'Index must remain empty');
console.log(`PASS: ${checked} protected runtime/config files byte-identical; recovery, child mounts and logout unchanged; empty index.`);
