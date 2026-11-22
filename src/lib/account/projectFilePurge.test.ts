import assert from "node:assert/strict";
import { test } from "node:test";
import { purgeProjectFolder, storedFilesUnder, type PurgeBucket } from "./projectFilePurge.ts";

// (Nov 16) A deleted project's stored files are really removed - and nothing else ever is.
const OWNER = "owner_1", A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";

const fakeBucket = (files: string[]) => {
  const held = new Set(files);
  const calls = { remove: 0 };
  const bucket: PurgeBucket = {
    list: async (folder, offset, limit) => {
      const names = new Map<string, string | null>();
      for (const path of held) {
        if (!path.startsWith(`${folder}/`)) continue;
        const rest = path.slice(folder.length + 1), cut = rest.indexOf("/");
        names.set(cut < 0 ? rest : rest.slice(0, cut), cut < 0 ? "id" : null);
      }
      return [...names].sort().slice(offset, offset + limit).map(([name, id]) => ({ name, id }));
    },
    remove: async paths => { calls.remove += 1; for (const path of paths) held.delete(path); return true; },
  };
  return { bucket, held, calls };
};
const picture = (n: number) => `${n.toString(16).padStart(64, "0")}.raw`;

test("(Nov 16) deleting a project removes every file it stored - its pictures and its saved descriptions - and no other project's", async () => {
  const mine = [...Array.from({ length: 2300 }, (_, n) => `${OWNER}/${A}/assets/${picture(n)}`),
    `${OWNER}/${A}/1/attempt-a/0.gzpart`, `${OWNER}/${A}/2/attempt-b/0.gzpart`, `${OWNER}/${A}/2/attempt-b/1.gzpart`];
  const others = [`${OWNER}/${B}/assets/${picture(1)}`, `${OWNER}/${B}/1/attempt-c/0.gzpart`, `other_owner/${A}/assets/${picture(2)}`];
  const { bucket, held, calls } = fakeBucket([...mine, ...others]);
  assert.equal((await storedFilesUnder(bucket, `${OWNER}/${A}`)).length, mine.length);   // more than one page of pictures is all found
  assert.equal(await purgeProjectFolder(bucket, `${OWNER}/${A}`, async () => true), mine.length);
  assert.deepEqual([...held].sort(), [...others].sort());
  assert.ok(calls.remove >= 12);                                                          // in small batches
  assert.equal(await purgeProjectFolder(bucket, `${OWNER}/${A}`, async () => true), 0);   // again: nothing left, nothing harmed
  assert.deepEqual([...held].sort(), [...others].sort());
});

test("(Nov 16) a project that is NOT deleted never loses a file, also when it stops being deleted while the files are listed", async () => {
  const files = [`${OWNER}/${A}/assets/${picture(1)}`, `${OWNER}/${A}/1/attempt-a/0.gzpart`];
  const live = fakeBucket(files);
  assert.equal(await purgeProjectFolder(live.bucket, `${OWNER}/${A}`, async () => false), 0);
  assert.equal(live.held.size, 2);
  const changed = fakeBucket(files);
  let asked = 0;
  assert.equal(await purgeProjectFolder(changed.bucket, `${OWNER}/${A}`, async () => (asked += 1) === 1), 0);
  assert.equal(changed.held.size, 2);
  assert.equal(changed.calls.remove, 0);
});

test("(Nov 16) only a real project folder can be named, and a storage that refuses is an error, not a silent success", async () => {
  const { bucket, held } = fakeBucket([`${OWNER}/${A}/assets/${picture(1)}`]);
  for (const folder of [OWNER, `${OWNER}/`, `${OWNER}/${A}/assets`, `${OWNER}/../${A}`, `${OWNER}/not-a-project`, ""]) {
    await assert.rejects(purgeProjectFolder(bucket, folder, async () => true), /account_project_invalid_scope/);
  }
  assert.equal(held.size, 1);
  await assert.rejects(purgeProjectFolder({ ...bucket, remove: async () => false }, `${OWNER}/${A}`, async () => true), /account_project_delete_failed/);
  await assert.rejects(purgeProjectFolder({ ...bucket, list: async () => null }, `${OWNER}/${A}`, async () => true), /account_project_read_failed/);
  assert.equal(held.size, 1);
});

const { purgeOlderSaves } = await import("./projectFilePurge.ts");

test("(Nov 16) after a save, what only OLDER saves used is removed - and never a picture of this save or the one before it", async () => {
  const folder = `${OWNER}/${A}`;
  const current = [picture(1), picture(2), picture(3)], before = [picture(3), picture(4)], old = Array.from({ length: 450 }, (_, n) => picture(100 + n));
  const files = [...current, ...before, ...old].map(name => `${folder}/assets/${name}`);
  const descriptions = [`${folder}/7/a/0.gzpart`, `${folder}/6/b/0.gzpart`, `${folder}/5/c/0.gzpart`, `${folder}/5/c/1.gzpart`, `${folder}/4/d/0.gzpart`, `${folder}/4/e/0.gzpart`];
  const strange = [`${folder}/assets/notes.txt`, `${OWNER}/${B}/assets/${picture(100)}`, `${OWNER}/${B}/1/x/0.gzpart`];
  const { bucket, held } = fakeBucket([...new Set(files), ...descriptions, ...strange]);
  const storedPictures = [...held].filter(path => path.startsWith(`${folder}/assets/`)).map(path => path.slice(folder.length + 8));
  const removed = await purgeOlderSaves(bucket, folder, { revision: 7, keep: new Set([...current, ...before]), storedPictures, stillCurrent: async () => true, until: Date.now() + 60_000 });
  assert.equal(removed, 450 + 4);
  assert.deepEqual([...held].sort(), [...new Set([...current, ...before])].map(name => `${folder}/assets/${name}`)
    .concat([`${folder}/7/a/0.gzpart`, `${folder}/6/b/0.gzpart`], strange).sort());
  assert.equal(await purgeOlderSaves(bucket, folder, { revision: 7, keep: new Set([...current, ...before]), storedPictures: [...current, ...before], stillCurrent: async () => true, until: Date.now() + 60_000 }), 0);
});

test("(Nov 16) a newer save, or the time being up, stops the clean-up at once; a first or second save removes nothing", async () => {
  const folder = `${OWNER}/${A}`;
  const old = Array.from({ length: 450 }, (_, n) => picture(100 + n));
  const start = [...old.map(name => `${folder}/assets/${name}`), `${folder}/1/a/0.gzpart`, `${folder}/2/b/0.gzpart`, `${folder}/3/c/0.gzpart`];
  const moved = fakeBucket(start);
  let asked = 0;
  assert.equal(await purgeOlderSaves(moved.bucket, folder, { revision: 3, keep: new Set(), storedPictures: old, stillCurrent: async () => (asked += 1) < 2, until: Date.now() + 60_000 }), 200);
  assert.equal(moved.held.size, start.length - 200);
  const late = fakeBucket(start);
  assert.equal(await purgeOlderSaves(late.bucket, folder, { revision: 3, keep: new Set(), storedPictures: old, stillCurrent: async () => true, until: 5, now: () => 10 }), 0);
  assert.equal(late.held.size, start.length);
  const young = fakeBucket([`${folder}/1/a/0.gzpart`, `${folder}/2/b/0.gzpart`, `${folder}/assets/${picture(1)}`]);
  assert.equal(await purgeOlderSaves(young.bucket, folder, { revision: 2, keep: new Set([picture(1)]), storedPictures: [picture(1)], stillCurrent: async () => true, until: Date.now() + 60_000 }), 0);
  assert.equal(young.held.size, 3);
});
