import { promises as fs } from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { assembleEvidence } from "../dist/release-evidence.js";
import { resolveReleaseStage } from "./evidence-fragment.mjs";

const root = process.cwd();
const gates = JSON.parse(await fs.readFile(path.join(root, "release-gates.json"), "utf8"));
const stageFlag = process.argv.indexOf("--stage");
const stage = resolveReleaseStage(stageFlag >= 0 ? process.argv[stageFlag + 1] : undefined);
const directory = path.join(root, ".cleardom", "evidence");
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
let files;
try {
  files = (await fs.readdir(directory)).filter((file) => file.endsWith(".json")).sort();
} catch {
  throw new Error(`Release evidence directory is missing: ${directory}. Run every evidence-producing job first.`);
}
const fragments = [];
for (const file of files) {
  const contents = await fs.readFile(path.join(directory, file), "utf8");
  const secret = process.env.CLEARDOM_GA4_API_SECRET;
  if (secret && contents.includes(secret)) throw new Error(`Release evidence fragment ${file} contains the GA4 release secret.`);
  fragments.push(JSON.parse(contents));
}
const requiredCategories = gates.requiredEvidenceFragmentsByStage?.[stage];
if (!Array.isArray(requiredCategories)) throw new Error(`Release gates do not define evidence fragments for ${stage}.`);
const evidence = assembleEvidence(commit, stage, fragments, requiredCategories);
const target = path.join(root, ".cleardom", "release-evidence.json");
const temporary = `${target}.${process.pid}.tmp`;
await fs.writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
await fs.rename(temporary, target);
console.log(`Assembled ${requiredCategories.length} required same-commit ${stage} evidence fragments into ${path.relative(root, target)}.`);
