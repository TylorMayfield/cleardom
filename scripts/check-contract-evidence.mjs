import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { resolveReleaseStage, writeEvidenceFragment } from "./evidence-fragment.mjs";

const root = process.cwd();
const stageFlag = process.argv.indexOf("--stage");
const stage = resolveReleaseStage(stageFlag >= 0 ? process.argv[stageFlag + 1] : undefined);
const contractTests = [
  path.join(root, "dist", "scanner.test.js"),
  path.join(root, "dist", "native.test.js"),
  path.join(root, "dist", "release-evidence.test.js")
];
execFileSync(process.execPath, ["--test", ...contractTests], { cwd: root, stdio: "inherit" });
await writeEvidenceFragment(root, "contracts.json", "contracts", {
  contractsStable: true,
  nativeRunnerStable: true
}, stage);
console.log(`Validated scanner and native contracts for ${stage} evidence.`);
