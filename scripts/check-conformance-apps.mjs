import { promises as fs } from "node:fs";
import * as path from "node:path";
import { scanPath } from "../dist/scanner.js";
import { writeEvidenceFragment } from "./evidence-fragment.mjs";

const root = process.cwd();
const manifest = JSON.parse(await fs.readFile(path.join(root, "examples", "conformance", "manifest.json"), "utf8"));
const failures = [];
const compilerStacks = new Set(["vue", "svelte", "astro", "angular", "mdx"]);
const stackEvidence = {};
let expectedBlocking = 0;
let detectedBlocking = 0;
let cleanBlockingFindings = 0;

for (const application of manifest.applications ?? []) {
  const cases = JSON.parse(await fs.readFile(path.join(root, application.caseManifest), "utf8"));
  const expectedBrokenRules = new Set(cases.cases.filter((testCase) => testCase.fixture === "broken").map((testCase) => testCase.ruleId));
  const current = stackEvidence[application.stack] = { sourceCompleted: true, blockingRecall: 0, cleanBlockingFindings: 0, cases: cases.cases };
  for (const mode of ["clean", "broken"]) {
    const directory = path.join(root, application[mode]);
    const packageJson = JSON.parse(await fs.readFile(path.join(directory, "package.json"), "utf8"));
    if (!packageJson.scripts?.start) failures.push(`${application.stack} ${mode} has no start script.`);
    const result = await scanPath(directory, { runtime: { enabled: false }, native: { enabled: false }, failOn: "none" });
    const activeRules = new Set(result.activeFindings.map((finding) => finding.ruleId));
    const blocking = result.activeFindings.filter((finding) => finding.blocking);
    if (mode === "clean" && blocking.length > 0) failures.push(`${application.stack} clean has blocking findings: ${blocking.map((finding) => finding.ruleId).join(", ")}.`);
    if (mode === "clean") { current.cleanBlockingFindings = blocking.length; cleanBlockingFindings += blocking.length; }
    if (mode === "broken") for (const ruleId of expectedBrokenRules) {
      expectedBlocking += 1;
      if (activeRules.has(ruleId)) detectedBlocking += 1;
      else failures.push(`${application.stack} broken did not detect ${ruleId}.`);
    }
    if (result.checkedFiles === 0) failures.push(`${application.stack} ${mode} checked no source files.`);
    if (compilerStacks.has(application.stack) && !result.semanticDiagnostics.some((diagnostic) => diagnostic.adapter === "framework-compiler")) failures.push(`${application.stack} ${mode} did not invoke its project framework compiler.`);
  }
}

if (failures.length) {
  console.error(`Conformance application validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
for (const current of Object.values(stackEvidence)) current.blockingRecall = 1;
await writeEvidenceFragment(root, "conformance-source.json", "conformance-source", {
  conformanceBlockingRecall: expectedBlocking === 0 ? 0 : detectedBlocking / expectedBlocking,
  conformanceCleanBlockingFindings: cleanBlockingFindings,
  conformanceStacks: stackEvidence
});
console.log(`Validated ${(manifest.applications ?? []).length} stack-owned conformance apps and ${(manifest.applications ?? []).length * 2} source surfaces.`);
