// (Nov 16, Arthur: "delete some projects, it clears up some space") Until today Delete only HID a project: every file it had ever
// stored stayed in the account's storage for good (15 GB in six weeks, on a plan that holds 1 GB). A deleted project is never read
// again - every read asks for a project that is not deleted, and a deleted project can never be saved again - so its files are
// really removed. This file only knows HOW (a folder is listed, its files are removed); projectServer.ts says WHICH project, and
// only ever names one whose own row says it is deleted.

export type PurgeBucket = {
  // One page of what is directly in a folder, by name; a sub-folder has no id.
  list: (folder: string, offset: number, limit: number) => Promise<Array<{ name: string; id: string | null }> | null>;
  // Removes these files; false when the storage refused.
  remove: (paths: string[]) => Promise<boolean>;
};

const PAGE = 1000;
const REMOVE_AT_ONCE = 200;
const DEEPEST = 3;   // <project>/assets/<picture>, <project>/<revision>/<attempt>/<part>

// Every file under a folder (never the folder's own siblings: the walk only ever goes down).
export const storedFilesUnder = async (bucket: PurgeBucket, folder: string, depth = 0): Promise<string[]> => {
  const paths: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await bucket.list(folder, offset, PAGE);
    if (!page) throw new Error("account_project_read_failed");
    for (const item of page) {
      if (!item.name || item.name.includes("/") || item.name === "." || item.name === "..") continue;
      if (item.id) paths.push(`${folder}/${item.name}`);
      else if (depth < DEEPEST) paths.push(...await storedFilesUnder(bucket, `${folder}/${item.name}`, depth + 1));
    }
    if (page.length < PAGE) return paths;
  }
};

// Removes every stored file of ONE project folder; says how many. `stillDeleted` is asked again right before anything is
// removed, so a project that is not (or no longer) marked deleted loses nothing.
export const purgeProjectFolder = async (bucket: PurgeBucket, folder: string, stillDeleted: () => Promise<boolean>) => {
  if (!/^[a-zA-Z0-9_-]{1,256}\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(folder)) throw new Error("account_project_invalid_scope");
  if (!await stillDeleted()) return 0;
  const paths = await storedFilesUnder(bucket, folder);
  if (paths.some(path => !path.startsWith(`${folder}/`))) throw new Error("account_project_invalid_scope");
  if (paths.length && !await stillDeleted()) return 0;
  for (let start = 0; start < paths.length; start += REMOVE_AT_ONCE) {
    if (!await bucket.remove(paths.slice(start, start + REMOVE_AT_ONCE))) throw new Error("account_project_delete_failed");
  }
  return paths.length;
};

// (Nov 16) The second way the storage filled up: a project he KEEPS stored every picture of every save it ever had (an AI
// animation edited five times held five whole animations). After a save is published, what only OLDER saves used is removed:
//  - pictures that neither this save nor the save before it names (the save before stays whole, as a safety net);
//  - the saved descriptions of revisions older than the one before this.
// Nothing here can touch what the current save needs: `keep` holds every picture name of this save and the one before, only
// names that look like a picture are ever removed, and `stillCurrent` is asked again before every batch (a newer save stops it).
// It works for a few seconds at most (`until`); what is left goes at the next save.
export const purgeOlderSaves = async (bucket: PurgeBucket, folder: string, options: {
  revision: number; keep: ReadonlySet<string>; storedPictures: Iterable<string>; stillCurrent: () => Promise<boolean>; until: number; now?: () => number;
}) => {
  if (!/^[a-zA-Z0-9_-]{1,256}\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(folder)) throw new Error("account_project_invalid_scope");
  const now = options.now ?? Date.now;
  const paths: string[] = [];
  for (const name of options.storedPictures) {
    if (/^[0-9a-f]{64}\.(raw|deflate)$/.test(name) && !options.keep.has(name)) paths.push(`${folder}/assets/${name}`);
  }
  for (let offset = 0; ; offset += PAGE) {
    const page = await bucket.list(folder, offset, PAGE);
    if (!page) throw new Error("account_project_read_failed");
    for (const item of page) {
      if (item.id === null && /^[1-9][0-9]{0,14}$/.test(item.name) && Number(item.name) <= options.revision - 2 && now() < options.until) {
        paths.push(...await storedFilesUnder(bucket, `${folder}/${item.name}`, 1));
      }
    }
    if (page.length < PAGE) break;
  }
  let removed = 0;
  for (let start = 0; start < paths.length; start += REMOVE_AT_ONCE) {
    if (now() >= options.until || !await options.stillCurrent()) break;
    const batch = paths.slice(start, start + REMOVE_AT_ONCE);
    if (!await bucket.remove(batch)) throw new Error("account_project_delete_failed");
    removed += batch.length;
  }
  return removed;
};
