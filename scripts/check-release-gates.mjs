import { promises as fs } from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const failures = [];
const stage = releaseStage();
const stageRank = { alpha: 0, beta: 1, rc: 2, final: 3 }[stage];
const gates = JSON.parse(await fs.readFile(path.join(root, "release-gates.json"), "utf8"));
const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const corpus = JSON.parse(await fs.readFile(path.join(root, "examples", "oss-corpus", "manifest.json"), "utf8"));
const conformance = JSON.parse(await fs.readFile(path.join(root, "examples", "conformance", "manifest.json"), "utf8"));
const ruleTrust = JSON.parse(await fs.readFile(path.join(root, "rule-trust.json"), "utf8"));
const evidence = await readJson(path.join(root, ".cleardom", "release-evidence.json"));
const precisionFragment = await readJson(path.join(root, ".cleardom", "evidence", "corpus-precision.json"));

if (process.env.GITHUB_REF_NAME && process.env.GITHUB_REF_NAME !== `v${packageJson.version}`) failures.push(`Release tag ${process.env.GITHUB_REF_NAME} must match package version v${packageJson.version}.`);

const builtRules = await import(pathToFileURL(path.join(root, "dist", "rules", "index.js")).href).catch(() => undefined);
let blockingRuleIds = [];
if (!builtRules) {
  failures.push("Built rule catalog is missing; run `pnpm build` before release gates.");
} else {
  blockingRuleIds = builtRules.rules.filter((rule) => rule.detectionMode === "automated" && rule.confidence === "high").map((rule) => rule.id).sort();
  const trustEntries = new Map((ruleTrust.blockingRules ?? []).map((entry) => [entry.ruleId, entry]));
  for (const ruleId of blockingRuleIds) {
    const entry = trustEntries.get(ruleId);
    if (!entry) {
      failures.push(`Default-blocking rule ${ruleId} has no trust manifest entry.`);
      continue;
    }
    for (const field of ["positive", "negative", "adversarial", "boundary", "verify"]) if (!entry[field]) failures.push(`${ruleId} trust entry is missing ${field}.`);
    if (!Array.isArray(entry.frameworks) || entry.frameworks.length === 0) failures.push(`${ruleId} trust entry has no framework cases.`);
  }
  for (const ruleId of trustEntries.keys()) if (!blockingRuleIds.includes(ruleId)) failures.push(`Rule trust entry ${ruleId} is not currently default-blocking.`);
}

if (stageRank >= 1 && !process.env.CLEARDOM_GA4_API_SECRET) failures.push("CLEARDOM_GA4_API_SECRET has not been provisioned for the beta/final build.");

const conformanceByStack = new Map((conformance.applications ?? []).map((application) => [application.stack, application]));
const conformanceFixtureOwners = new Map();
for (const stack of stageRank >= 1 ? conformance.requiredStacks ?? [] : []) {
  const application = conformanceByStack.get(stack);
  if (!application) {
    failures.push(`Conformance manifest is missing ${stack}.`);
    continue;
  }
  for (const fixtureType of ["clean", "broken"]) {
    const fixture = application[fixtureType];
    if (!fixture || !await isDirectory(path.join(root, fixture))) {
      failures.push(`${stack} ${fixtureType} conformance app must be a runnable, stack-owned directory.`);
      continue;
    }
    const fixturePackage = await readJson(path.join(root, fixture, "package.json"));
    if (!fixturePackage?.scripts?.start) failures.push(`${stack} ${fixtureType} conformance app has no package start command.`);
    const owner = conformanceFixtureOwners.get(fixture);
    if (owner) failures.push(`${stack} ${fixtureType} conformance app reuses ${fixture}, already owned by ${owner}; every GA stack needs its own app.`);
    else conformanceFixtureOwners.set(fixture, `${stack} ${fixtureType}`);
  }
  if (!application.caseManifest || !await exists(path.join(root, application.caseManifest))) failures.push(`${stack} conformance case manifest is missing.`);
  else await validateCaseManifest(stack, path.join(root, application.caseManifest));
  for (const evidenceType of stack === "react-native" || stack === "expo" ? ["source", "native-ios", "native-android", "fix", "protection"] : ["source", "runtime", "fix", "protection"]) {
    if (!application.evidence?.includes(evidenceType)) failures.push(`${stack} conformance fixture does not require ${evidenceType} evidence.`);
  }
}

const familyCounts = new Map();
const groundTruthCache = new Map();
for (const project of stageRank >= 2 ? corpus.projects ?? [] : []) {
  for (const key of corpus.projectContract?.required ?? []) if (project[key] === undefined) failures.push(`OSS corpus entry is missing ${key}.`);
  if (!/^[a-f0-9]{40}$/.test(project.commit ?? "")) failures.push(`OSS corpus ${project.id ?? "entry"} must pin a full commit SHA.`);
  if (project.licenseReviewed !== true) failures.push(`OSS corpus ${project.repository ?? "entry"} lacks recorded license review.`);
  for (const key of ["source", "reviewedBy", "reviewedAt"]) if (!project.licenseReview?.[key]) failures.push(`OSS corpus ${project.id ?? "entry"} license review is missing ${key}.`);
  if (project.shadowMode !== true) failures.push(`OSS corpus ${project.repository ?? "entry"} must run in shadow mode.`);
  let groundTruth = groundTruthCache.get(project.groundTruth);
  if (!groundTruth) {
    groundTruth = await readJson(path.join(root, project.groundTruth));
    groundTruthCache.set(project.groundTruth, groundTruth);
  }
  const truth = groundTruth?.projects?.find((entry) => entry.id === project.groundTruthId);
  if (!truth) failures.push(`OSS corpus ${project.id ?? "entry"} has no separate ground-truth record.`);
  else {
    if (truth.commit !== project.commit) failures.push(`OSS corpus ${project.id} ground truth is not bound to its pinned commit.`);
    if (truth.reviewStatus !== "reviewed") failures.push(`OSS corpus ${project.id} ground truth is not reviewed.`);
    if (!Array.isArray(truth.reviewers) || truth.reviewers.length === 0) failures.push(`OSS corpus ${project.id} has no ground-truth reviewer.`);
    for (const disputed of truth.disputedBlockingFindings ?? []) {
      if (!Array.isArray(disputed.reviewers) || disputed.reviewers.length < corpus.requirements.disputedFindingReviewers) failures.push(`OSS corpus ${project.id} disputed blocking finding ${disputed.fingerprint ?? "entry"} lacks two-person agreement.`);
    }
  }
  familyCounts.set(project.adapterFamily, (familyCounts.get(project.adapterFamily) ?? 0) + 1);
}
for (const family of stageRank >= 2 ? ["jsx", "html", "vue", "svelte", "astro", "angular", "mdx"] : []) {
  if ((familyCounts.get(family) ?? 0) < corpus.requirements.minimumPerAdapterFamily) failures.push(`OSS corpus needs ${corpus.requirements.minimumPerAdapterFamily} ${family} projects.`);
}
const nativeProjects = (corpus.projects ?? []).filter((project) => project.adapterFamily === "react-native").length;
if (stageRank >= 2 && nativeProjects < corpus.requirements.minimumNativeProjects) failures.push(`OSS corpus needs ${corpus.requirements.minimumNativeProjects} React Native/Expo projects.`);
for (const container of stageRank >= 2 ? corpus.requirements.requiredContainers : []) {
  if (!(corpus.projects ?? []).some((project) => project.platform === container)) failures.push(`OSS corpus is missing ${container}.`);
}

if (!evidence) {
  failures.push(".cleardom/release-evidence.json is missing; run the conformance, performance, runtime, native, fix and corpus evidence jobs.");
} else {
  const currentCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  if (evidence.commit !== currentCommit) failures.push(`Release evidence commit must equal ${currentCommit}; received ${String(evidence.commit)}.`);
  for (const field of ["contractsStable", "nativeRunnerStable"]) {
    if (evidence[field] !== true) failures.push(`${field} evidence must be true; received ${String(evidence[field])}.`);
  }
  const priorStages = stage === "beta" ? ["alphaPublished"] : stage === "rc" ? ["alphaPublished", "betaPublished"] : stage === "final" ? ["alphaPublished", "betaPublished", "rcPublished"] : [];
  for (const field of priorStages) {
    if (evidence[field] !== true) failures.push(`${field} must be true before the ${stage} release.`);
  }
  const threshold = gates.thresholds;
  if (stageRank >= 1) {
    requireMinimum("conformance blocking recall", evidence.conformanceBlockingRecall, threshold.conformanceBlockingRecall);
    requireMaximum("clean blocking findings", evidence.conformanceCleanBlockingFindings, threshold.conformanceCleanBlockingFindings);
    for (const stack of conformance.requiredStacks ?? []) validateStackEvidence(stack, evidence.conformanceStacks?.[stack]);
  }
  if (stageRank >= 2) {
    requireMinimum("blocking rule precision", evidence.blockingRulePrecision, threshold.blockingRulePrecision);
    requireMinimum("aggregate automated precision", evidence.aggregateAutomatedPrecision, threshold.aggregateAutomatedPrecision);
    requireMinimum("source completion", evidence.sourceCompletion, threshold.sourceCompletion);
    requireMinimum("runtime completion", evidence.runtimeCompletion, threshold.runtimeCompletion);
    requireMinimum("native completion", evidence.nativeCompletion, threshold.nativeCompletion);
    requireMinimum("verified fix success", evidence.verifiedFixSuccess, threshold.verifiedFixSuccess);
    requireMaximum("introduced blocking findings", evidence.introducedBlockingFindings, threshold.introducedBlockingFindings);
    requireMaximum("1,000-file source time", evidence.source1000Ms, threshold.source1000MaxMs);
    requireMaximum("1,000-file source RSS", evidence.source1000RssMb, threshold.source1000MaxRssMb);
    requireMaximum("ten-route runtime time", evidence.runtimeTenRoutesMs, threshold.runtimeTenRoutesMaxMs);
    requireMaximum("native screen time", evidence.nativeScreenMs, threshold.nativeScreenMaxMs);
    const recomputedPrecision = await recomputeCorpusPrecision();
    if (!precisionFragment) failures.push("Corpus precision evidence fragment is missing; run `pnpm test:corpus` before assembling release evidence.");
    else {
      if (precisionFragment.kind !== "cleardom-release-evidence-fragment" || precisionFragment.category !== "precision") failures.push("Corpus precision evidence has an invalid contract.");
      if (precisionFragment.commit !== currentCommit) failures.push(`Corpus precision evidence commit must equal ${currentCommit}; received ${String(precisionFragment.commit)}.`);
    }
    if (recomputedPrecision) {
      compareNumber("aggregate automated precision", evidence.aggregateAutomatedPrecision, recomputedPrecision.aggregate.precision);
      compareNumber("precision fragment aggregate", precisionFragment?.values?.aggregateAutomatedPrecision, recomputedPrecision.aggregate.precision);
      compareCounts("aggregate precision counts", precisionFragment?.values?.aggregateAutomatedPrecisionCounts, recomputedPrecision.aggregate);
    }
    for (const ruleId of blockingRuleIds) {
      const recomputed = recomputedPrecision?.byRule?.[ruleId];
      requireMinimum(`${ruleId} precision`, evidence.blockingRulePrecisionByRule?.[ruleId], threshold.blockingRulePrecision);
      requireMinimum(`${ruleId} reviewed automated sample size`, evidence.precisionSampleSizeByRule?.[ruleId], threshold.minimumReviewedAutomatedFindingsPerBlockingRule);
      if (!recomputed) {
        failures.push(`${ruleId} has no current reviewed automated corpus findings.`);
        continue;
      }
      compareNumber(`${ruleId} evidence precision`, evidence.blockingRulePrecisionByRule?.[ruleId], recomputed.precision);
      compareNumber(`${ruleId} fragment precision`, precisionFragment?.values?.blockingRulePrecisionByRule?.[ruleId], recomputed.precision);
      compareNumber(`${ruleId} evidence sample size`, evidence.precisionSampleSizeByRule?.[ruleId], recomputed.sampleSize);
      compareNumber(`${ruleId} fragment sample size`, precisionFragment?.values?.precisionSampleSizeByRule?.[ruleId], recomputed.sampleSize);
      compareCounts(`${ruleId} precision counts`, precisionFragment?.values?.precisionCountsByRule?.[ruleId], recomputed);
    }
  }
  for (const field of stageRank >= 2 ? gates.requiredEvidence ?? [] : []) {
    if (evidence[field] !== true) failures.push(`${field} evidence must be true; received ${String(evidence[field])}.`);
  }
}

if (failures.length > 0) {
  console.error(`ClearDOM 1.0 ${stage} release gates failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`ClearDOM 1.0 ${stage} release gates passed.`);
}

function requireMinimum(label, actual, expected) {
  if (typeof actual !== "number" || actual < expected) failures.push(`${label} must be >= ${expected}; received ${String(actual)}.`);
}

function requireMaximum(label, actual, expected) {
  if (typeof actual !== "number" || actual > expected) failures.push(`${label} must be <= ${expected}; received ${String(actual)}.`);
}

function compareNumber(label, actual, expected) {
  if (typeof actual !== "number" || typeof expected !== "number" || Math.abs(actual - expected) > Number.EPSILON) failures.push(`${label} does not match recomputed corpus evidence; received ${String(actual)}, expected ${String(expected)}.`);
}

function compareCounts(label, actual, expected) {
  if (!actual || actual.truePositive !== expected.truePositive || actual.falsePositive !== expected.falsePositive || actual.sampleSize !== expected.sampleSize) failures.push(`${label} do not match recomputed corpus evidence.`);
}

async function recomputeCorpusPrecision() {
  try {
    const module = await import(pathToFileURL(path.join(root, "dist", "release-evidence.js")).href);
    const directory = path.join(root, ".cleardom", "corpus-results");
    const files = (await fs.readdir(directory)).filter((file) => file.endsWith(".json"));
    const findings = new Map();
    for (const file of files) {
      const result = await readJson(path.join(directory, file));
      if (result?.project?.id) findings.set(result.project.id, result.scan?.activeFindings ?? []);
    }
    const truth = await readJson(path.join(root, "examples", "oss-corpus", "ground-truth.json"));
    return module.calculateReviewedPrecision(truth?.projects ?? [], findings);
  } catch (error) {
    failures.push(`Could not recompute corpus precision: ${error instanceof Error ? error.message : String(error)}.`);
    return undefined;
  }
}

function validateStackEvidence(stack, stackEvidence) {
  if (!stackEvidence) {
    failures.push(`${stack} conformance evidence is missing.`);
    return;
  }
  requireMinimum(`${stack} blocking recall`, stackEvidence.blockingRecall, gates.thresholds.conformanceBlockingRecall);
  requireMaximum(`${stack} clean blocking findings`, stackEvidence.cleanBlockingFindings, gates.thresholds.conformanceCleanBlockingFindings);
  for (const field of ["sourceCompleted", "fixVerified", "protectionVerified"]) if (stackEvidence[field] !== true) failures.push(`${stack} ${field} must be true.`);
  const native = stack === "react-native" || stack === "expo";
  for (const field of native ? ["nativeIosCompleted", "nativeAndroidCompleted"] : ["runtimeCompleted"]) if (stackEvidence[field] !== true) failures.push(`${stack} ${field} must be true.`);
  if (!Array.isArray(stackEvidence.cases) || stackEvidence.cases.length === 0) {
    failures.push(`${stack} has no case evidence.`);
    return;
  }
  for (const [index, testCase] of stackEvidence.cases.entries()) {
    for (const field of conformance.caseManifestRequiredFields ?? []) if (testCase[field] === undefined) failures.push(`${stack} case ${index + 1} is missing ${field}.`);
  }
}

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return undefined; }
}

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

async function isDirectory(directory) {
  try { return (await fs.stat(directory)).isDirectory(); } catch { return false; }
}

async function validateCaseManifest(stack, file) {
  const manifest = await readJson(file);
  if (!manifest || !Array.isArray(manifest.cases) || manifest.cases.length === 0) {
    failures.push(`${stack} conformance case manifest must contain at least one case.`);
    return;
  }
  for (const [index, testCase] of manifest.cases.entries()) {
    for (const field of conformance.caseManifestRequiredFields ?? []) {
      if (testCase[field] === undefined) failures.push(`${stack} conformance case ${index + 1} is missing ${field}.`);
    }
  }
}

function releaseStage() {
  const stageFlag = process.argv.indexOf("--stage");
  const requested = stageFlag >= 0 ? process.argv[stageFlag + 1] : undefined;
  if (requested && ["alpha", "beta", "rc", "final"].includes(requested)) return requested;
  const ref = process.env.GITHUB_REF_NAME ?? "";
  if (ref.includes("-alpha.")) return "alpha";
  if (ref.includes("-beta.")) return "beta";
  if (ref.includes("-rc.")) return "rc";
  return "final";
}
