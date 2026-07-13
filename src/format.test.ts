import * as assert from "node:assert/strict";
import { test } from "node:test";
import { formatScanResult } from "./format.js";
import type { Finding, ScanResult } from "./types.js";

test("compact output summarizes runtime coverage, groups viewports, and exposes failures", () => {
  const mobile = runtimeFinding("mobile", 360, "runtime-mobile");
  const desktop = runtimeFinding("desktop", 1280, "runtime-desktop");
  const result = scanResult([mobile, desktop]);
  result.runtimePages = [
    { url: "http://localhost/settings", route: "/settings", viewport: mobile.runtime!.viewport, status: 200, findings: 1 },
    { url: "http://localhost/settings", route: "/settings", viewport: desktop.runtime!.viewport, status: 500, findings: 0 }
  ];
  result.runtimeDiagnostics = [{
    url: "http://localhost/settings",
    route: "/settings",
    viewport: "desktop",
    stage: "navigation",
    severity: "error",
    message: "Failed to load settings: 500"
  }];

  const output = formatScanResult(result, false, "test", ".");

  assert.match(output, /Score: 90\/100 \(Great, partial — 1 rendered page run failed\)/);
  assert.match(output, /Rendered: 1 route · 2 viewports · 2 page runs/);
  assert.match(output, /Runtime results: 1 passed · 1 failed · 2 findings/);
  assert.equal(output.match(/Low contrast text/g)?.length, 1);
  assert.match(output, /Seen in mobile, desktop \(2 occurrences\)/);
  assert.match(output, /Runtime warnings[\s\S]*FAIL navigation · \/settings · desktop/);
  assert.match(output, /Failed to load settings: 500/);
});

test("terminal colors are opt-in and do not contaminate redirected output", () => {
  const result = scanResult([runtimeFinding("mobile", 360, "runtime-mobile")]);
  assert.doesNotMatch(formatScanResult(result, false, "test", "."), /\u001b\[/);
  assert.match(formatScanResult(result, false, "test", ".", true), /\u001b\[32m✓ Scan complete\u001b\[0m/);
});

function runtimeFinding(viewport: string, width: number, fingerprint: string): Finding {
  return {
    ruleId: "CDOM_1_4_3_CONTRAST",
    title: "Low contrast text",
    severity: "warning",
    confidence: "high",
    impact: "serious",
    confidenceReason: "Rendered colors were measured.",
    detectionMode: "automated",
    source: "runtime",
    fixKind: "guided-fix",
    category: "readability",
    file: "http://localhost/settings",
    line: 1,
    column: 1,
    excerpt: ".price",
    message: "Increase text contrast to at least 4.5:1.",
    wcag: ["1.4.3"],
    standards: [],
    platforms: ["web"],
    target: ".price",
    semanticLocation: ".price",
    fingerprint,
    baselineStatus: "active",
    runtime: {
      url: "http://localhost/settings",
      route: "/settings",
      viewport: { name: viewport, width, height: 800 },
      selector: ".price"
    }
  };
}

function scanResult(findings: Finding[]): ScanResult {
  return {
    checkedFiles: 1,
    findings,
    activeFindings: findings,
    baselineFindings: [],
    suppressedFindings: [],
    regressions: findings,
    summary: { totalFindings: 2, activeFindings: 2, baselineFindings: 0, suppressedFindings: 0, regressions: 2, critical: 0, warning: 2, info: 0 },
    scoreBreakdown: { semanticClarity: 100, keyboardFocus: 100, readability: 50, touchAccessibility: 100, standardsCoverage: 100 },
    score: 90,
    rules: [],
    semanticAnalysis: { mode: "auto", adapter: "lightweight", filesAnalyzed: 0, filesFallback: 1 },
    semanticDiagnostics: [],
    runtimeDiagnostics: [],
    runtimePages: [],
    standard: { id: "wcag22-aa", label: "WCAG 2.2 Level AA", version: "wcag22", status: "recommendation", level: "aa", recommended: true, note: "" }
  };
}
