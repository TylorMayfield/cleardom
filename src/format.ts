import * as path from "node:path";
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
      if (rule?.guidance) {
        lines.push(`     Fix: ${rule.guidance}`);
      }
      lines.push(`     Learn: cleardom explain ${finding.ruleId}${rule?.docsUrl ? ` | ${rule.docsUrl}` : ""}`);
      if (verbose) {
        lines.push(`     ${finding.excerpt}`);
        lines.push(`     Standards: ${formatStandardRefs(finding.standards)}`);
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
    lines.push(`  Active: ${result.summary.activeFindings}`);
    lines.push(`  Baseline: ${result.summary.baselineFindings}`);
    lines.push(`  ${result.baseline ? "Regressions" : "New findings"}: ${result.summary.regressions}`);
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
    lines.push(`  Category: ${rule.category}`);
    lines.push(`  Platforms: ${rule.platforms.join(", ")}`);
    lines.push(`  WCAG: ${rule.wcag.join(", ")}`);
    lines.push(`  Standards: ${formatStandardRefs(rule.standards)}`);
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
