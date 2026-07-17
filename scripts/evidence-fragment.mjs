import { promises as fs } from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

const releaseStages = new Set(["alpha", "beta", "rc", "final"]);

export function resolveReleaseStage(requested = process.env.CLEARDOM_RELEASE_STAGE, ref = process.env.GITHUB_REF_NAME || process.env.npm_package_version || "") {
  if (requested) {
    if (!releaseStages.has(requested)) throw new Error(`Unknown release stage: ${requested}.`);
    return requested;
  }
  if (ref.includes("-alpha.")) return "alpha";
  if (ref.includes("-beta.")) return "beta";
  if (ref.includes("-rc.")) return "rc";
  return "final";
}

export async function writeEvidenceFragment(root, fileName, category, values, stage = resolveReleaseStage()) {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const directory = path.join(root, ".cleardom", "evidence");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, fileName), `${JSON.stringify({ schemaVersion: 1, kind: "cleardom-release-evidence-fragment", category, commit, stage, values }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}
