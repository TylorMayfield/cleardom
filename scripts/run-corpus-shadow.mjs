import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = process.cwd();
const manifest = JSON.parse(await fs.readFile(path.join(root, "examples", "oss-corpus", "manifest.json"), "utf8"));
const projects = manifest.projects ?? [];
if (projects.length === 0) {
  throw new Error("The required OSS corpus is empty. Add pinned, license-reviewed projects to examples/oss-corpus/manifest.json before enabling the corpus regression check.");
}
const outputRoot = path.join(root, ".cleardom", "corpus-results");
await fs.mkdir(outputRoot, { recursive: true });

for (const [index, project] of projects.entries()) {
  if (!project.repository || !/^[a-f0-9]{40}$/.test(project.commit)) throw new Error(`Corpus project ${index + 1} must pin a repository and full commit SHA.`);
  if (!project.scanPath || path.isAbsolute(project.scanPath) || project.scanPath.split(/[\\/]/).includes("..")) throw new Error(`Corpus project ${project.id ?? index + 1} has an unsafe scanPath.`);
  const checkout = await fs.mkdtemp(path.join(os.tmpdir(), "cleardom-corpus-"));
  try {
    await exec("git", ["clone", "--filter=blob:none", "--no-checkout", project.repository, checkout], { timeout: 120_000 });
    if (project.scanPath !== ".") await exec("git", ["sparse-checkout", "set", "--no-cone", project.scanPath], { cwd: checkout, timeout: 30_000 });
    await exec("git", ["checkout", "--detach", project.commit], { cwd: checkout, timeout: 120_000 });
    const target = path.resolve(checkout, project.scanPath);
    if (target !== checkout && !target.startsWith(`${checkout}${path.sep}`)) throw new Error(`Corpus project ${project.id} escaped its checkout.`);
    const result = await exec(process.execPath, [path.join(root, "dist", "cli.js"), "scan", target, "--format", "json", "--fail-on", "none"], { cwd: checkout, timeout: 300_000, maxBuffer: 20 * 1024 * 1024 });
    const scan = JSON.parse(result.stdout);
    const record = { schemaVersion: 1, kind: "cleardom-corpus-shadow-result", project: { id: project.id, repository: project.repository, commit: project.commit, scanPath: project.scanPath, adapterFamily: project.adapterFamily, platform: project.platform }, scan };
    const name = `${String(index + 1).padStart(2, "0")}-${safeName(project.id ?? project.adapterFamily ?? "project")}.json`;
    const outputFile = path.join(outputRoot, name);
    const previous = await readJson(outputFile);
    if (process.env.CLEARDOM_UPDATE_CORPUS !== "1" && previous?.project?.commit === project.commit && fingerprintSet(previous.scan).join("\n") !== fingerprintSet(scan).join("\n")) throw new Error(`Stable fingerprint regression for ${project.id}; review the scanner change and rerun once with CLEARDOM_UPDATE_CORPUS=1 before updating ground truth intentionally.`);
    await fs.writeFile(outputFile, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    const status = await exec("git", ["status", "--porcelain"], { cwd: checkout, timeout: 30_000 });
    if (status.stdout.trim()) throw new Error(`Shadow scan modified ${project.id}: ${status.stdout.trim()}`);
  } finally {
    await fs.rm(checkout, { recursive: true, force: true });
  }
}

console.log(`ClearDOM corpus shadow scan completed for ${projects.length} pinned projects. Upstream checkouts were not modified.`);

function safeName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "project";
}

function fingerprintSet(scan) {
  return (scan?.activeFindings ?? []).map((finding) => `${finding.ruleId}:${finding.fingerprint}`).sort();
}

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return undefined; }
}
