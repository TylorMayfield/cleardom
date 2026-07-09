import * as path from "node:path";
import { formatScanHtmlReport } from "./html-report.js";
import { sourceAdapters } from "./source-adapters.js";
import type { Finding, RuleCategory, RuleSummary, ScanResult, Severity, StandardDefinition } from "./types.js";

const severityLabels: Record<Severity, string> = {
  critical: "Critical",
  warning: "Warnings",
  info: "Info"
};

const categories: RuleCategory[] = ["names-and-roles", "forms", "keyboard", "structure", "readability", "react-native"];

export function formatScanResult(result: ScanResult, verbose = false, version = "unknown", target = "."): string {
  if (!verbose) return formatCompactScanResult(result, version, target);

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
    lines.push("Keep checking:");
    lines.push(`  cleardom check ${shellTarget(target)} --diff`);
    lines.push("  cleardom install");
    lines.push("");
  }

  lines.push("Next:");
  const topFinding = topPriorityFinding(result.activeFindings);
  if (topFinding) {
    lines.push(`  cleardom fix ${shellTarget(target)} --rule ${topFinding.ruleId}`);
  }
  if (result.activeFindings.length > 0 && !result.baseline) {
    lines.push("  cleardom install");
  }

  return lines.join("\n");
}

function formatCompactScanResult(result: ScanResult, version: string, target: string): string {
  const lines = [
    `ClearDOM v${version}`,
    `Detected: ${detectedLabel(result)}`,
    "Running source checks..."
  ];

  if (result.runtimePages.length > 0 || result.runtimeDiagnostics.some((diagnostic) => diagnostic.url)) {
    lines.push("Running runtime checks...");
  }
  if (result.baseline) {
    lines.push("Comparing baseline...");
  }

  lines.push("", "✓ Scan complete", "");
  lines.push(`Score: ${result.score}/100 (${scoreLabel(result.score)})`);
  lines.push(`${issueSummary(result)} across ${result.checkedFiles} ${pluralize("file", result.checkedFiles)} against ${result.standard.label}${result.standard.status === "draft" ? " (draft)" : ""}`);

  const modeCounts = detectionModeCounts(result.activeFindings);
  if (result.activeFindings.length > 0) {
    lines.push(`Detection: ${modeCounts.automated} automated, ${modeCounts.needsReview} needs review, ${modeCounts.manualGuidance} manual guidance`);
  }

  const findings = [...result.activeFindings].sort(compareFindingPriority).slice(0, 5);
  if (findings.length > 0) {
    lines.push("", "Top findings");
    for (const finding of findings) {
      const rule = result.rules.find((candidate) => candidate.id === finding.ruleId);
      lines.push(`  ${severitySymbol(finding.severity)} ${finding.ruleId} ${formatFindingLocation(finding)}`);
      lines.push(`    ${finding.message}`);
      if (rule?.guidance) lines.push(`    Fix: ${rule.guidance}`);
    }
    if (result.activeFindings.length > findings.length) {
      lines.push(`  Showing ${findings.length} of ${result.activeFindings.length}. Run with --verbose for every finding.`);
    }
  } else {
    lines.push("", "No high-confidence accessibility or readability issues found.");
  }

  lines.push("", "Next:");
  const topFinding = topPriorityFinding(result.activeFindings);
  if (topFinding) {
    lines.push(`  cleardom fix ${shellTarget(target)} --rule ${topFinding.ruleId}`);
    lines.push(`  cleardom check ${shellTarget(target)} --diff`);
  }
  if (result.activeFindings.length > 0 && !result.baseline) {
    lines.push("  cleardom install");
  }
  if (result.runtimePages.length === 0 && result.runtimeDiagnostics.length === 0) {
    lines.push(`  Rendered checks: cleardom check ${shellTarget(target)}`);
  }
  if (result.activeFindings.length === 0) {
    lines.push("  cleardom install");
  }

  return lines.join("\n");
}

function shellTarget(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function formatScanJson(result: ScanResult, options: { includeRules?: boolean } = {}): string {
  const payload = options.includeRules ? result : withoutRules(result);
  return JSON.stringify(payload, null, 2);
}

function withoutRules(result: ScanResult): Omit<ScanResult, "rules"> {
  const { rules: _rules, ...payload } = result;
  return payload;
}

export function formatScanHtml(result: ScanResult): string {
  return formatScanHtmlReport(result);
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

function scoreLabel(score: number): string {
  if (score >= 95) return "Excellent";
  if (score >= 85) return "Great";
  if (score >= 70) return "Needs work";
  return "At risk";
}

function severitySymbol(severity: Severity): string {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "warning";
  return "info";
}

function detectedLabel(result: ScanResult): string {
  const labels = new Set<string>();
  if (result.semanticAnalysis.adapter === "typescript") labels.add("TypeScript");
  for (const finding of result.findings) {
    if (finding.platforms?.some((platform) => platform.startsWith("react-native"))) labels.add("React Native");
    if (finding.source === "runtime") labels.add("Web runtime");
  }
  for (const finding of result.findings) {
    const extension = path.extname(finding.file).toLowerCase();
    if (extension === ".tsx" || extension === ".jsx") labels.add("JSX/TSX");
    if ([".html", ".vue", ".svelte", ".astro", ".mdx"].includes(extension)) labels.add(sourceLabel(extension));
  }
  return [...labels].join(", ") || (result.semanticAnalysis.adapter === "lightweight" ? "source files" : "project files");
}

function sourceLabel(extension: string): string {
  if (extension === ".html") return "HTML";
  if (extension === ".vue") return "Vue";
  if (extension === ".svelte") return "Svelte";
  if (extension === ".astro") return "Astro";
  if (extension === ".mdx") return "MDX";
  return extension.slice(1).toUpperCase();
}

function detectionModeCounts(findings: Finding[]): { automated: number; needsReview: number; manualGuidance: number } {
  return {
    automated: findings.filter((finding) => finding.detectionMode === "automated").length,
    needsReview: findings.filter((finding) => finding.detectionMode === "needs-review").length,
    manualGuidance: findings.filter((finding) => finding.detectionMode === "manual-guidance").length
  };
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

function compareFindingPriority(left: Finding, right: Finding): number {
  const severityOrder: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  return severityOrder[left.severity] - severityOrder[right.severity]
    || left.file.localeCompare(right.file)
    || left.line - right.line
    || left.column - right.column
    || left.ruleId.localeCompare(right.ruleId);
}

function sarifLevel(severity: Severity): "error" | "warning" | "note" {
  if (severity === "critical") return "error";
  if (severity === "warning") return "warning";
  return "note";
}
