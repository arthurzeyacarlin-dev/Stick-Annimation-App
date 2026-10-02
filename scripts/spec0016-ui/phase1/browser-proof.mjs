import assert from 'node:assert/strict';
const origin = process.env.REVIEW_ORIGIN ?? 'http://127.0.0.1:58584';
assert.equal(new URL(origin).hostname, '127.0.0.1');
const home = await fetch(origin);
assert.equal(home.status, 200);
assert.ok((await home.text()).includes('Sign in'));
for (const path of ['/api/account/data?namespace=preferences&key=home', '/api/account/usage']) {
  const response = await fetch(origin + path);
  assert.equal(response.status, 401, `Unauthenticated account boundary: ${path}`);
}
console.log('PASS: review server reachable; signed-out entry rendered; account data remains session-protected. Signed-in visual evidence is separate.');
