import "server-only";

import { getSupabaseAdminClient } from "../dbAdmin";
import { createAccountProjectStore } from "./projectStorageCore.ts";

// Service-role wiring for account project storage. All logic (owner checks,
// signed upload/download links, server-side verification) is in projectStorageCore.ts.
export { ACCOUNT_PROJECT_PART_BYTES, accountProjectErrorStatus, parseAccountProjectUploadBody } from "./projectStorageCore.ts";

const store = createAccountProjectStore(() => getSupabaseAdminClient());

export const {
  accountProjectHeadReceipt,
  accountProjectBelongsToOwner,
  listAccountProjectHeads,
  accountProjectDownload,
  prepareAccountProjectUpload,
  commitAccountProjectUpload,
  deleteAccountProject,
} = store;
