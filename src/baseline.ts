import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { BaselineFile, BaselineFinding, Finding, StandardId } from "./types.js";

export async function readBaseline(filePath: string | undefined, rootDir: string): Promise<BaselineFile | undefined> {
  if (!filePath) return undefined;
  const resolved = path.resolve(rootDir, filePath);
  const raw = await fs.readFile(resolved, "utf8");
  const baseline = JSON.parse(raw) as BaselineFile;
  if (baseline.version !== 1 || !Array.isArray(baseline.findings)) {
    throw new Error(`Invalid ClearDOM baseline at ${resolved}`);
  }
  return baseline;
}

export async function writeBaseline(filePath: string, rootDir: string, standard: StandardId, findings: Finding[]): Promise<BaselineFile> {
  const baseline = createBaseline(standard, findings);
  const resolved = path.resolve(rootDir, filePath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  return baseline;
}

export function createBaseline(standard: StandardId, findings: Finding[]): BaselineFile {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    standard,
    findings: findings.map(toBaselineFinding)
  };
}

export function markBaselineFindings(findings: Finding[], baseline: BaselineFile | undefined): {
  findings: Finding[];
  activeFindings: Finding[];
  baselineFindings: Finding[];
  regressions: Finding[];
} {
  const fingerprints = new Set(baseline?.findings.map((finding) => finding.fingerprint) ?? []);
  const marked = findings.map((finding) => ({
    ...finding,
    baselineStatus: fingerprints.has(finding.fingerprint) ? "baseline" as const : "active" as const
  }));
  const baselineFindings = marked.filter((finding) => finding.baselineStatus === "baseline");
  const activeFindings = marked.filter((finding) => finding.baselineStatus === "active");
  return {
    findings: marked,
    activeFindings,
    baselineFindings,
    regressions: activeFindings
  };
}

export function fingerprintFinding(input: {
  ruleId: string;
  file: string;
  excerpt: string;
  message: string;
}): string {
  return stableHash([
    input.ruleId,
    normalizePath(input.file),
    normalizeSource(input.excerpt),
    normalizeSource(input.message)
  ].join("|"));
}

function toBaselineFinding(finding: Finding): BaselineFinding {
  return {
    fingerprint: finding.fingerprint,
    ruleId: finding.ruleId,
    file: normalizePath(finding.file),
    message: finding.message
  };
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function normalizeSource(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
