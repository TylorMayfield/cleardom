import * as assert from "node:assert/strict";
import * as path from "node:path";
import { test } from "node:test";
import { compareScanResults } from "./compare.js";
import type { Finding, ScanResult } from "./types.js";

test("compareScanResults classifies new, fixed, and unchanged findings by relative path", () => {
  const baseRoot = path.resolve("/tmp/cleardom-base");
  const headRoot = path.resolve("/tmp/cleardom-head");
  const baseOnly = finding(baseRoot, "src/Old.tsx", "CDOM006", "Add href.");
  const unchangedBase = finding(baseRoot, "src/Button.tsx", "CDOM001", "Add label.");
  const unchangedHead = finding(headRoot, "src/Button.tsx", "CDOM001", "Add label.");
  const headOnly = finding(headRoot, "src/New.tsx", "CDOM007", "Use button.");

  const comparison = compareScanResults(
    scanResult([baseOnly, unchangedBase]),
    scanResult([unchangedHead, headOnly]),
    { baseRoot, headRoot }
  );

  assert.deepEqual(comparison.newFindings.map((item) => item.ruleId), ["CDOM007"]);
  assert.deepEqual(comparison.fixedFindings.map((item) => item.ruleId), ["CDOM006"]);
  assert.deepEqual(comparison.unchangedFindings.map((item) => item.ruleId), ["CDOM001"]);
  assert.equal(comparison.summary.newFindings, 1);
  assert.equal(comparison.summary.fixedFindings, 1);
  assert.equal(comparison.summary.unchangedFindings, 1);
});

function finding(root: string, relativeFile: string, ruleId: string, message: string): Finding {
  const file = path.join(root, relativeFile);
  return {
    ruleId,
    title: `${ruleId} title`,
    severity: "critical",
    confidence: "high",
    category: "names-and-roles",
    file,
    line: 1,
    column: 1,
    excerpt: "<button />",
    message,
    wcag: [],
    standards: [],
    platforms: ["web"],
    fingerprint: `${ruleId}-${file}`,
    baselineStatus: "active"
  };
}

function scanResult(findings: Finding[]): ScanResult {
  return {
    checkedFiles: 1,
    findings,
    activeFindings: findings,
    baselineFindings: [],
    regressions: findings,
    summary: {
      totalFindings: findings.length,
      activeFindings: findings.length,
      baselineFindings: 0,
      regressions: findings.length,
      critical: findings.length,
      warning: 0,
      info: 0
    },
    scoreBreakdown: {
      semanticClarity: 100,
      keyboardFocus: 100,
      readability: 100,
      touchAccessibility: 100,
      standardsCoverage: 100
    },
    score: 100,
    rules: [],
    semanticAnalysis: {
      mode: "auto",
      adapter: "lightweight",
      filesAnalyzed: 0,
      filesFallback: 1
    },
    semanticDiagnostics: [],
    standard: {
      id: "wcag22-aa",
      label: "WCAG 2.2 Level AA",
      version: "wcag22",
      status: "recommendation",
      level: "aa",
      recommended: true,
      note: ""
    }
  };
}
