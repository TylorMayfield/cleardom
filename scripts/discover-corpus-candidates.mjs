import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = process.cwd();
const manifest = JSON.parse(await fs.readFile(path.join(root, "examples", "oss-corpus", "manifest.json"), "utf8"));
const truth = JSON.parse(await fs.readFile(path.join(root, "examples", "oss-corpus", "ground-truth.json"), "utf8"));
const reviewedByProject = new Map((truth.projects ?? []).map((project) => [project.id, new Set((project.labels ?? []).map((label) => label.fingerprint))]));
const candidates = [];

for (const project of manifest.projects ?? []) {
  const scanPaths = [...new Set(project.candidatePaths ?? [project.scanPath])].sort();
  const checkout = await fs.mkdtemp(path.join(os.tmpdir(), "cleardom-candidates-"));
  try {
    await exec("git", ["clone", "--filter=blob:none", "--no-checkout", project.repository, checkout], { timeout: 120_000 });
    await exec("git", ["sparse-checkout", "set", "--no-cone", ...scanPaths], { cwd: checkout, timeout: 30_000 });
    await exec("git", ["checkout", "--detach", project.commit], { cwd: checkout, timeout: 120_000 });
    for (const scanPath of scanPaths) {
      assertSafePath(project.id, scanPath);
      const target = path.resolve(checkout, scanPath);
      const result = await exec(process.execPath, [path.join(root, "dist", "cli.js"), "scan", target, "--format", "json", "--fail-on", "none"], {
        cwd: checkout,
        timeout: 300_000,
        maxBuffer: 20 * 1024 * 1024
      });
      const scan = JSON.parse(result.stdout);
      for (const finding of scan.activeFindings ?? []) {
        if (finding.detectionMode !== "automated") continue;
        const selectionHash = createHash("sha256").update(`${project.commit}\0${project.id}\0${scanPath}\0${finding.ruleId}\0${finding.fingerprint}`).digest("hex");
        candidates.push({
          selectionHash,
          projectId: project.id,
          repository: project.repository,
          commit: project.commit,
          evaluationSet: project.evaluationSet,
          platform: project.platform,
          adapterFamily: project.adapterFamily,
          scanPath,
          ruleId: finding.ruleId,
          fingerprint: finding.fingerprint,
          alreadyReviewed: reviewedByProject.get(project.groundTruthId)?.has(finding.fingerprint) ?? false
        });
      }
    }
  } finally {
    await fs.rm(checkout, { recursive: true, force: true });
  }
}

candidates.sort((left, right) =>
  left.ruleId.localeCompare(right.ruleId) ||
  left.platform.localeCompare(right.platform) ||
  left.selectionHash.localeCompare(right.selectionHash)
);
const groups = Object.values(Object.groupBy(candidates, (candidate) => `${candidate.ruleId}:${candidate.platform}`))
  .map((group) => group ?? []);
const output = {
  schemaVersion: 1,
  kind: "cleardom-corpus-candidate-discovery",
  selection: "sha256(commit, project, scanPath, rule, fingerprint)",
  groups: groups.map((group) => ({
    ruleId: group[0].ruleId,
    platform: group[0].platform,
    candidates: group
  }))
};
await fs.mkdir(path.join(root, ".cleardom"), { recursive: true });
await fs.writeFile(path.join(root, ".cleardom", "corpus-candidates.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Discovered ${candidates.length} deterministic automated candidates in ${groups.length} rule/platform groups.`);

function assertSafePath(projectId, candidatePath) {
  if (!candidatePath || path.isAbsolute(candidatePath) || candidatePath.split(/[\\/]/).includes("..")) {
    throw new Error(`Corpus project ${projectId} has an unsafe candidate path: ${String(candidatePath)}.`);
  }
}
