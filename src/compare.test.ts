import * as assert from "node:assert/strict";
import * as path from "node:path";
import { test } from "node:test";
import { compareScanResults } from "./compare.js";
import type { Finding, ScanResult } from "./types.js";

test("compareScanResults classifies new, fixed, and unchanged findings by relative path", () => {
  const baseRoot = path.resolve("/tmp/cleardom-base");
  const headRoot = path.resolve("/tmp/cleardom-head");
  const baseOnly = finding(baseRoot, "src/Old.tsx", "CDOM_4_1_2_ANCHOR_HREF", "Add href.");
  const unchangedBase = finding(baseRoot, "src/Button.tsx", "CDOM_4_1_2_UNNAMED_CONTROL", "Add label.");
  const unchangedHead = finding(headRoot, "src/Button.tsx", "CDOM_4_1_2_UNNAMED_CONTROL", "Add label.");
  const headOnly = finding(headRoot, "src/New.tsx", "CDOM_2_1_1_KEYBOARD", "Use button.");

  const comparison = compareScanResults(
    scanResult([baseOnly, unchangedBase]),
    scanResult([unchangedHead, headOnly]),
    { baseRoot, headRoot }
  );

  assert.deepEqual(comparison.newFindings.map((item) => item.ruleId), ["CDOM_2_1_1_KEYBOARD"]);
  assert.deepEqual(comparison.fixedFindings.map((item) => item.ruleId), ["CDOM_4_1_2_ANCHOR_HREF"]);
  assert.deepEqual(comparison.unchangedFindings.map((item) => item.ruleId), ["CDOM_4_1_2_UNNAMED_CONTROL"]);
  assert.equal(comparison.summary.newFindings, 1);
  assert.equal(comparison.summary.fixedFindings, 1);
  assert.equal(comparison.summary.unchangedFindings, 1);
});

test("compareScanResults preserves finding identity across a Git rename", () => {
  const baseRoot = path.resolve("/tmp/cleardom-base");
  const headRoot = path.resolve("/tmp/cleardom-head");
  const before = finding(baseRoot, "src/OldButton.tsx", "CDOM_4_1_2_UNNAMED_CONTROL", "Add label.");
  const after = finding(headRoot, "src/Button.tsx", "CDOM_4_1_2_UNNAMED_CONTROL", "Add label.");
  const comparison = compareScanResults(scanResult([before]), scanResult([after]), {
    baseRoot,
    headRoot,
    renamedFiles: { "src/OldButton.tsx": "src/Button.tsx" }
  });
  assert.equal(comparison.newFindings.length, 0);
  assert.equal(comparison.fixedFindings.length, 0);
  assert.deepEqual(comparison.unchangedFindings, [after]);
});

function finding(root: string, relativeFile: string, ruleId: string, message: string): Finding {
  const file = path.join(root, relativeFile);
  return {
    ruleId,
    title: `${ruleId} title`,
    severity: "critical",
    confidence: "high",
    impact: "serious",
    confidenceReason: "test",
    detectionMode: "automated",
    source: "static",
    fixKind: "guided-fix",
    category: "names-and-roles",
    file,
    line: 1,
    column: 1,
    excerpt: "<button />",
    message,
    wcag: [],
    standards: [],
    platforms: ["web"],
    target: "button",
    semanticLocation: "button:nth-1",
    fingerprint: `${ruleId}-${file}`,
    baselineStatus: "active"
  };
}

function scanResult(findings: Finding[]): ScanResult {
  return {
    schemaVersion: 1,
    kind: "cleardom-scan-result",
    checkedFiles: 1,
    findings,
    activeFindings: findings,
    baselineFindings: [],
    suppressedFindings: [],
    regressions: findings,
    summary: {
      totalFindings: findings.length,
      activeFindings: findings.length,
      baselineFindings: 0,
      suppressedFindings: 0,
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
    runtimeDiagnostics: [],
    runtimePages: [],
    outcome: { source: { requestedFiles: 1, completedFiles: 1, semanticFiles: 0, fallbackFiles: 1 }, runtime: { requested: false, attemptedPages: 0, completedPages: 0, failedPages: 0 }, native: { requested: false, capturedStates: 0, findings: 0 }, findings: { automated: findings.length, needsReview: 0, manualGuidance: 0, safeAutoFix: 0, guidedFix: findings.length, manualReview: 0, suppressed: 0, baselined: 0, regressions: findings.length } },
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
