import * as path from "node:path";
import type { ComparisonResult, Finding, ScanResult } from "./types.js";

export type CompareOptions = {
  baseRoot?: string;
  headRoot?: string;
};

export function compareScanResults(base: ScanResult, head: ScanResult, options: CompareOptions = {}): ComparisonResult {
  const baseFindings = uniqueByComparisonKey(base.activeFindings, options.baseRoot);
  const headFindings = uniqueByComparisonKey(head.activeFindings, options.headRoot);
  const baseKeys = new Set(baseFindings.map((finding) => comparisonKey(finding, options.baseRoot)));
  const headKeys = new Set(headFindings.map((finding) => comparisonKey(finding, options.headRoot)));

  const newFindings = headFindings.filter((finding) => !baseKeys.has(comparisonKey(finding, options.headRoot)));
  const fixedFindings = baseFindings.filter((finding) => !headKeys.has(comparisonKey(finding, options.baseRoot)));
  const unchangedFindings = headFindings.filter((finding) => baseKeys.has(comparisonKey(finding, options.headRoot)));

  return {
    base,
    head,
    newFindings,
    fixedFindings,
    unchangedFindings,
    summary: {
      newFindings: newFindings.length,
      fixedFindings: fixedFindings.length,
      unchangedFindings: unchangedFindings.length,
      headActiveFindings: head.activeFindings.length,
      baseActiveFindings: base.activeFindings.length
    }
  };
}

function uniqueByComparisonKey(findings: Finding[], rootDir: string | undefined): Finding[] {
  const seen = new Set<string>();
  const unique: Finding[] = [];

  for (const finding of findings) {
    const key = comparisonKey(finding, rootDir);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(finding);
  }

  return unique;
}

function comparisonKey(finding: Finding, rootDir: string | undefined): string {
  return [
    finding.ruleId,
    normalizeFindingPath(finding.file, rootDir),
    normalizeSource(finding.semanticLocation || finding.excerpt),
    normalizeSource(finding.target || finding.message)
  ].join("|");
}

function normalizeFindingPath(file: string, rootDir: string | undefined): string {
  if (/^https?:\/\//i.test(file)) return file;
  if (!rootDir) return normalizePath(file);
  const relative = path.relative(rootDir, file);
  return normalizePath(relative && !relative.startsWith("..") ? relative : file);
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function normalizeSource(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
