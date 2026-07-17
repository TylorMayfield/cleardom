import { promises as fs } from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

export async function writeEvidenceFragment(root, fileName, category, values) {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const directory = path.join(root, ".cleardom", "evidence");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, fileName), `${JSON.stringify({ schemaVersion: 1, kind: "cleardom-release-evidence-fragment", category, commit, values }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}
