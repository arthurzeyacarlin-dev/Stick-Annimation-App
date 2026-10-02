import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const home = readFileSync('src/components/account/ExistingHome.tsx', 'utf8');
const chrome = readFileSync('src/components/chrome/AIcreditspage.tsx', 'utf8');
for (const destination of ['openProject', 'myProjects', 'tutorials', 'animationExport']) {
  assert.ok(home.includes(`setView("${destination}")`), destination);
}
assert.ok(home.includes('router.push("/assistant")'));
assert.ok(chrome.includes('href="/credits"'));
assert.ok(home.includes('openProject(recentProject.entry)'));
assert.ok(home.includes('diamondHomeRecentProjects ??= new Map<string, string>()'));
assert.ok(home.includes('No recent projects edited'));
const homeCss = readFileSync('src/components/home/HomeWorkspace.module.css', 'utf8');
const chromeCss = readFileSync('src/components/chrome/appChrome.module.css', 'utf8');
assert.ok(homeCss.includes('.shortcutGroup:hover .shortcut'), 'Inner-link hover retains the shared parent highlight');
assert.ok(!home.includes('homeStyles.arrow'), 'No large primary arrows');
assert.ok(home.includes('className={homeStyles.recentProjectButton}'), 'Whole recent area is a native button');
assert.ok(home.includes('className={homeStyles.shortcutGroup}'), 'Independent primary/secondary button siblings');
assert.ok(chrome.includes('<div className={chromeStyles.homeBrand}>'), 'Home brand is not a link');
assert.ok(!chromeCss.includes('.homeBrand:hover'), 'Brand has no hover affordance');
for (const css of [homeCss, chromeCss]) {
  for (const declaration of css.matchAll(/transition\s*:\s*([^;}]+)/g)) {
    assert.ok(/^none\b/.test(declaration[1].trim()), 'No fading transitions');
  }
  assert.ok(!/transform\s*:/.test(css), 'No hover movement');
  assert.ok(css.includes('#0066ff'), 'Exact requested hover color');
}
console.log('PASS: destinations/open callbacks retained; primary arrows removed; whole recent target; inert brand; instant #0066FF hover with no movement.');
