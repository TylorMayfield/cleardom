import * as path from "node:path";
import { sourceAdapters } from "./source-adapters.js";
import type { Finding, RuleCategory, RuleSummary, ScanResult, Severity, StandardDefinition } from "./types.js";

const severityLabels: Record<Severity, string> = {
  critical: "Critical",
  warning: "Warnings",
  info: "Info"
};

const categories: RuleCategory[] = ["names-and-roles", "forms", "keyboard", "structure", "readability", "react-native"];

export function formatScanResult(result: ScanResult, verbose = false): string {
  const lines = [
    `ClearDOM score: ${result.score}/100 - ${issueSummary(result)}`,
    `Checked ${result.checkedFiles} ${pluralize("file", result.checkedFiles)} against ${result.standard.label}${result.standard.status === "draft" ? " (draft)" : ""}`,
    "",
  ];

  for (const severity of ["critical", "warning", "info"] as const) {
    const findings = result.activeFindings.filter((finding) => finding.severity === severity);
    if (findings.length === 0) continue;

    lines.push(severityLabels[severity]);
    for (const finding of findings) {
      const rule = result.rules.find((candidate) => candidate.id === finding.ruleId);
      lines.push(`  ${finding.ruleId} ${formatFindingLocation(finding)} ${finding.title}`);
      lines.push(`     ${finding.message}`);
      lines.push(`     Detection: ${finding.detectionMode}; confidence ${finding.confidence} (${finding.confidenceReason})`);
      if (rule?.guidance) {
        lines.push(`     Fix: ${rule.guidance}`);
      }
      if (rule?.remediation?.safeAutofix) {
        lines.push(`     Autofix: ${rule.remediation.safeAutofix}`);
      }
      lines.push(`     Learn: cleardom explain ${finding.ruleId}${rule?.docsUrl ? ` | ${rule.docsUrl}` : ""}`);
      if (verbose) {
        lines.push(`     ${finding.excerpt}`);
        lines.push(`     Standards: ${formatStandardRefs(finding.standards)}`);
        lines.push(`     Target: ${finding.target}`);
        if (finding.runtime) {
          lines.push(`     Runtime: ${finding.runtime.route} ${finding.runtime.viewport.name ?? `${finding.runtime.viewport.width}x${finding.runtime.viewport.height}`} selector ${finding.runtime.selector}`);
        }
        if (finding.native) {
          lines.push(`     Native: ${finding.native.platform} ${finding.native.screen ?? ""}${finding.native.deepLink ? ` ${finding.native.deepLink}` : ""}`.trimEnd());
        }
      }
    }
    lines.push("");
  }

  if (result.activeFindings.length === 0) {
    lines.push("No high-confidence accessibility or readability issues found.", "");
  }

  if (verbose) {
    lines.push("Scan details");
    lines.push(`  Semantic analysis: ${semanticLabel(result)}`);
    lines.push(`  Framework adapters: ${sourceAdapters.map((adapter) => `${adapter.label} ${adapter.supportTier}`).join(", ")}`);
    lines.push(`  Web runtime checks: ${result.activeFindings.some((finding) => finding.source === "runtime") ? "ran for configured URL" : "available with --runtime-url and Chromium"}`);
    lines.push("  React Native checks: static source guidance; verify VoiceOver and TalkBack behavior manually on device or simulator");
    lines.push(`  Active: ${result.summary.activeFindings}`);
    lines.push(`  Baseline: ${result.summary.baselineFindings}`);
    lines.push(`  Suppressed: ${result.summary.suppressedFindings}`);
    lines.push(`  ${result.baseline ? "Regressions" : "New findings"}: ${result.summary.regressions}`);
    if (result.runtimePages.length > 0) lines.push(`  Runtime pages: ${result.runtimePages.length}`);
    if (result.runtimeDiagnostics.length > 0) lines.push(`  Runtime diagnostics: ${result.runtimeDiagnostics.length}`);
    for (const category of categories) {
      const count = result.activeFindings.filter((finding) => finding.category === category).length;
      if (count > 0) lines.push(`  ${category}: ${count}`);
    }
    lines.push("");
    lines.push("Score breakdown");
    lines.push(`  Semantic clarity: ${result.scoreBreakdown.semanticClarity}/100`);
    lines.push(`  Keyboard/focus: ${result.scoreBreakdown.keyboardFocus}/100`);
    lines.push(`  Readability: ${result.scoreBreakdown.readability}/100`);
    lines.push(`  Touch accessibility: ${result.scoreBreakdown.touchAccessibility}/100`);
    lines.push(`  Standards coverage: ${result.scoreBreakdown.standardsCoverage}/100`);
    lines.push("");
  }

  if (result.activeFindings.length > 0) {
    lines.push("PR reviewer:");
    lines.push("  cleardom review . --dry-run");
    lines.push("  cleardom install");
    lines.push("");
  }

  lines.push("Next:");
  const topFinding = topPriorityFinding(result.activeFindings);
  if (topFinding) {
    lines.push(`  cleardom explain ${topFinding.ruleId}`);
  }
  lines.push("  cleardom rules");
  if (result.activeFindings.length > 0 && !result.baseline) {
    lines.push("  cleardom scan . --write-baseline cleardom-baseline.json");
  }

  return lines.join("\n");
}

export function formatScanJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

export function formatScanHtml(result: ScanResult): string {
  const findings = result.activeFindings.map((finding) => `
      <article class="finding">
        <h3>${escapeHtml(finding.ruleId)}: ${escapeHtml(finding.title)}</h3>
        <dl>
          <div><dt>Location</dt><dd>${escapeHtml(formatFindingLocation(finding))}</dd></div>
          <div><dt>Severity</dt><dd>${escapeHtml(finding.severity)}</dd></div>
          <div><dt>Confidence</dt><dd>${escapeHtml(finding.confidence)}</dd></div>
          <div><dt>Message</dt><dd>${escapeHtml(finding.message)}</dd></div>
          ${finding.runtime ? `<div><dt>Runtime selector</dt><dd><code>${escapeHtml(finding.runtime.selector)}</code></dd></div>
          <div><dt>Runtime route</dt><dd>${escapeHtml(finding.runtime.route)} at ${escapeHtml(finding.runtime.viewport.name ?? `${finding.runtime.viewport.width}x${finding.runtime.viewport.height}`)}</dd></div>` : ""}
          ${finding.native ? `<div><dt>Native evidence</dt><dd>${escapeHtml(finding.native.platform)} ${escapeHtml(finding.native.screen ?? "")}</dd></div>` : ""}
          ${ruleRemediationHtml(result, finding)}
        </dl>
        ${finding.runtime?.screenshot ? `<img alt="Screenshot evidence for ${escapeHtml(finding.ruleId)}" src="${finding.runtime.screenshot}">` : ""}
        ${finding.native?.screenshot ? `<img alt="Native screenshot evidence for ${escapeHtml(finding.ruleId)}" src="${finding.native.screenshot}">` : ""}
      </article>`).join("\n");
  const diagnostics = result.runtimeDiagnostics.map((diagnostic) => `<li>${escapeHtml(diagnostic.severity)} ${escapeHtml(diagnostic.stage)}${diagnostic.url ? ` ${escapeHtml(diagnostic.url)}` : ""}: ${escapeHtml(diagnostic.message)}</li>`).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ClearDOM Scan Report</title>
  <style>
    body { font-family: system-ui, sans-serif; line-height: 1.5; margin: 0; color: #172033; background: #f6f7f9; }
    main { max-width: 980px; margin: 0 auto; padding: 32px 20px 48px; }
    .summary, .finding, .diagnostics { background: #fff; border: 1px solid #d8dee8; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
    .metric strong { display: block; font-size: 1.4rem; }
    dl div { margin: 8px 0; }
    dt { font-weight: 700; }
    dd { margin: 2px 0 0; }
    code { background: #eef2f7; padding: 2px 4px; border-radius: 4px; }
    img { display: block; max-width: 100%; border: 1px solid #d8dee8; border-radius: 6px; margin-top: 12px; }
  </style>
</head>
<body>
  <main>
    <h1>ClearDOM Scan Report</h1>
    <section class="summary" aria-label="Scan summary">
      ${htmlMetric("Score", `${result.score}/100`)}
      ${htmlMetric("Standard", result.standard.label)}
      ${htmlMetric("Checked", String(result.checkedFiles))}
      ${htmlMetric("Active", String(result.summary.activeFindings))}
      ${htmlMetric("Runtime Pages", String(result.runtimePages.length))}
      ${htmlMetric("Diagnostics", String(result.runtimeDiagnostics.length))}
    </section>
    <section>
      <h2>Active Findings</h2>
      ${findings || "<p>No active ClearDOM findings.</p>"}
    </section>
    ${diagnostics ? `<section class="diagnostics"><h2>Runtime Diagnostics</h2><ul>${diagnostics}</ul></section>` : ""}
  </main>
</body>
</html>`;
}

export function formatSarif(result: ScanResult): string {
  return JSON.stringify({
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "ClearDOM",
            informationUri: "https://github.com/cleardom/cleardom",
            rules: result.rules.map((rule) => ({
              id: rule.id,
              name: rule.title,
              shortDescription: { text: rule.title },
              fullDescription: { text: `${rule.category}; WCAG: ${rule.wcag.join(", ")}` },
              properties: {
                confidence: rule.confidence,
                detectionMode: rule.detectionMode,
                remediation: rule.remediation
              },
              defaultConfiguration: {
                level: sarifLevel(rule.severity)
              }
            }))
          }
        },
        results: result.activeFindings.map((finding) => ({
          ruleId: finding.ruleId,
          level: sarifLevel(finding.severity),
          message: { text: finding.message },
          fingerprints: {
            clearDom: finding.fingerprint
          },
          properties: {
            confidence: finding.confidence,
            detectionMode: finding.detectionMode,
            impact: finding.impact,
            source: finding.source,
            fixKind: finding.fixKind,
            confidenceReason: finding.confidenceReason,
            target: finding.target,
            semanticLocation: finding.semanticLocation
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: finding.file },
                region: {
                  startLine: finding.line,
                  startColumn: finding.column,
                  snippet: { text: finding.excerpt }
                }
              }
            }
          ]
        }))
      }
    ]
  }, null, 2);
}

export function formatRules(rules: RuleSummary[]): string {
  const lines = ["ClearDOM rules", ""];
  for (const rule of rules) {
    lines.push(`${rule.id} ${rule.title}`);
    lines.push(`  Severity: ${rule.severity}`);
    lines.push(`  Detection: ${rule.detectionMode}`);
    lines.push(`  Confidence: ${rule.confidence}`);
    lines.push(`  Category: ${rule.category}`);
    lines.push(`  Platforms: ${rule.platforms.join(", ")}`);
    lines.push(`  WCAG: ${rule.wcag.join(", ")}`);
    lines.push(`  Standards: ${formatStandardRefs(rule.standards)}`);
    if (rule.remediation?.safeAutofix) lines.push(`  Safe autofix: ${rule.remediation.safeAutofix}`);
    if (rule.remediation?.manualVerification) lines.push(`  Manual verification: ${rule.remediation.manualVerification}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function formatStandards(standards: StandardDefinition[]): string {
  const lines = ["ClearDOM supported standards", ""];
  for (const standard of standards) {
    lines.push(`${standard.id} ${standard.label}`);
    lines.push(`  Status: ${standard.status}`);
    if (standard.level) lines.push(`  Level: ${standard.level.toUpperCase()}`);
    if (standard.recommended) lines.push("  Default: yes");
    lines.push(`  ${standard.note}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function formatFindingJson(findings: Finding[]): string {
  return JSON.stringify({ findings }, null, 2);
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}

function issueSummary(result: ScanResult): string {
  if (result.activeFindings.length === 0) return "0 findings";
  const parts = [
    `${result.summary.critical} critical`,
    `${result.summary.warning} ${pluralize("warning", result.summary.warning)}`
  ];
  if (result.summary.info > 0) parts.push(`${result.summary.info} info`);
  return `${parts.join(", ")} (${result.baseline ? `${result.summary.regressions} regressions` : `${result.summary.regressions} new`})`;
}

function semanticLabel(result: ScanResult): string {
  if (result.semanticAnalysis.adapter === "typescript") {
    return `TypeScript Program (${result.semanticAnalysis.filesAnalyzed} ${pluralize("file", result.semanticAnalysis.filesAnalyzed)})`;
  }
  return `lightweight fallback (${result.semanticAnalysis.filesFallback} ${pluralize("file", result.semanticAnalysis.filesFallback)})`;
}

function formatFindingLocation(finding: Finding): string {
  if (/^https?:\/\//i.test(finding.file)) {
    return `${finding.file}:${finding.line}:${finding.column}`;
  }
  return `${normalizePath(path.relative(process.cwd(), finding.file))}:${finding.line}:${finding.column}`;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function formatStandardRefs(standards: RuleSummary["standards"]): string {
  const unique = new Set(standards.map((reference) => reference.level ? `${reference.version} ${reference.criterion} ${reference.level.toUpperCase()}` : `${reference.version} ${reference.criterion}`));
  return [...unique].join("; ");
}

function topPriorityFinding(findings: Finding[]): Finding | undefined {
  const severityOrder: Severity[] = ["critical", "warning", "info"];
  for (const severity of severityOrder) {
    const finding = findings.find((candidate) => candidate.severity === severity);
    if (finding) return finding;
  }
  return undefined;
}

function sarifLevel(severity: Severity): "error" | "warning" | "note" {
  if (severity === "critical") return "error";
  if (severity === "warning") return "warning";
  return "note";
}

function htmlMetric(label: string, value: string): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function ruleRemediationHtml(result: ScanResult, finding: Finding): string {
  const remediation = result.rules.find((rule) => rule.id === finding.ruleId)?.remediation;
  if (!remediation?.safeAutofix && !remediation?.manualVerification) return "";
  return `<div><dt>Remediation</dt><dd>${escapeHtml([remediation.safeAutofix, remediation.manualVerification].filter(Boolean).join(" "))}</dd></div>`;
}

function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
