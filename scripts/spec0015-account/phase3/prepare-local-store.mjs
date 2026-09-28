import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), ".local/spec0015-phase3");
const secretPath = path.join(root, "auth-secret");

fs.mkdirSync(root, { recursive: true, mode: 0o700 });
fs.chmodSync(root, 0o700);
if (!fs.existsSync(secretPath)) fs.writeFileSync(secretPath, randomBytes(48).toString("base64url"), { mode: 0o600 });
fs.chmodSync(secretPath, 0o600);

for (const entry of fs.readdirSync(root)) {
  if (/\.sqlite(?:-wal|-shm)?$/.test(entry)) fs.chmodSync(path.join(root, entry), 0o600);
}

process.stdout.write("Local Phase 3 account store is prepared.\n");
