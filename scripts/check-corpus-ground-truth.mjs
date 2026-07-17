import { promises as fs } from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { calculateReviewedPrecision } from "../dist/release-evidence.js";

const root = process.cwd();
const manifest = JSON.parse(await fs.readFile(path.join(root, "examples", "oss-corpus", "manifest.json"), "utf8"));
const truth = JSON.parse(await fs.readFile(path.join(root, "examples", "oss-corpus", "ground-truth.json"), "utf8"));
const resultDirectory = path.join(root, ".cleardom", "corpus-results");
const resultFiles = await fs.readdir(resultDirectory);
const results = new Map();
for (const file of resultFiles.filter((file) => file.endsWith(".json"))) {
  const result = JSON.parse(await fs.readFile(path.join(resultDirectory, file), "utf8"));
  results.set(result.project.id, result);
}

const failures = [];
const verdicts = new Set(["true-positive", "false-positive", "review-guidance"]);
for (const project of manifest.projects ?? []) {
  const result = results.get(project.id);
  const record = truth.projects?.find((entry) => entry.id === project.groundTruthId);
  if (!result) { failures.push(`${project.id} has no shadow result.`); continue; }
  if (!record) { failures.push(`${project.id} has no ground-truth record.`); continue; }
  if (record.commit !== project.commit) failures.push(`${project.id} ground truth is not bound to ${project.commit}.`);
  if (record.reviewStatus !== "reviewed") failures.push(`${project.id} ground truth is not reviewed.`);
  const findings = new Map((result.scan.activeFindings ?? []).map((finding) => [finding.fingerprint, finding]));
  const labels = new Map((record.labels ?? []).map((label) => [label.fingerprint, label]));
  for (const finding of findings.values()) if (!labels.has(finding.fingerprint)) failures.push(`${project.id} finding ${finding.fingerprint} (${finding.ruleId}) is unlabeled.`);
  for (const label of labels.values()) {
    const finding = findings.get(label.fingerprint);
    if (!finding && label.verdict !== "false-positive") failures.push(`${project.id} label ${label.fingerprint} is stale.`);
    if (!verdicts.has(label.verdict)) failures.push(`${project.id} label ${label.fingerprint} has invalid verdict ${label.verdict}.`);
    if (!label.rationale) failures.push(`${project.id} label ${label.fingerprint} has no rationale.`);
    if (finding && label.ruleId !== finding.ruleId) failures.push(`${project.id} label ${label.fingerprint} rule does not match scan output.`);
  }
  for (const disputed of record.disputedBlockingFindings ?? []) {
    if (!Array.isArray(disputed.reviewers) || disputed.reviewers.length < manifest.requirements.disputedFindingReviewers) failures.push(`${project.id} disputed finding ${disputed.fingerprint ?? "entry"} lacks two independent reviewers.`);
  }
}

if (failures.length) {
  console.error(`Corpus ground-truth validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const findingsByProject = new Map([...results].map(([id, result]) => [id, result.scan.activeFindings ?? []]));
const precision = calculateReviewedPrecision(truth.projects ?? [], findingsByProject);
const precisionByRule = Object.fromEntries(Object.entries(precision.byRule).map(([ruleId, count]) => [ruleId, count.precision]));
const sampleSizeByRule = Object.fromEntries(Object.entries(precision.byRule).map(([ruleId, count]) => [ruleId, count.sampleSize]));
const observedRulePrecisions = Object.values(precision.byRule).map((count) => count.precision).filter((value) => typeof value === "number");
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const evidenceDirectory = path.join(root, ".cleardom", "evidence");
await fs.mkdir(evidenceDirectory, { recursive: true });
await fs.writeFile(path.join(evidenceDirectory, "corpus-precision.json"), `${JSON.stringify({
  schemaVersion: 1,
  kind: "cleardom-release-evidence-fragment",
  category: "precision",
  commit,
  values: {
    blockingRulePrecision: observedRulePrecisions.length ? Math.min(...observedRulePrecisions) : null,
    blockingRulePrecisionByRule: precisionByRule,
    precisionSampleSizeByRule: sampleSizeByRule,
    precisionCountsByRule: precision.byRule,
    aggregateAutomatedPrecision: precision.aggregate.precision,
    aggregateAutomatedPrecisionCounts: precision.aggregate,
    resolvedCorpusFalsePositives: precision.resolvedFalsePositives,
    reviewedNonAutomatedFindings: precision.reviewedNonAutomated
  }
}, null, 2)}\n`, "utf8");
console.log(`Validated ${manifest.projects.length} pinned corpus projects and ${precision.aggregate.sampleSize} current reviewed automated findings (observed precision ${precision.aggregate.precision === null ? "n/a" : `${(precision.aggregate.precision * 100).toFixed(1)}%`}; ${precision.resolvedFalsePositives} resolved false positives; ${precision.reviewedNonAutomated} downgraded findings).`);
