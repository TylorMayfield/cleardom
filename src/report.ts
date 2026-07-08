import * as path from "node:path";
import { formatScanHtmlReport } from "./html-report.js";
import type { Finding, ResolvedScanOptions, ScanResult } from "./types.js";

export type ReportFormat = "html" | "markdown" | "json";

export function formatReport(result: ScanResult, options: ResolvedScanOptions, format: ReportFormat): string {
  if (format === "json") return JSON.stringify(result, null, 2);
  if (format === "html") return formatScanHtmlReport(result, { rootDir: options.rootDir });
  return markdownReport(result, options);
}

function markdownReport(result: ScanResult, options: ResolvedScanOptions): string {
  const lines = [
    "# ClearDOM Scan Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Score: ${result.score}/100`,
    `- Standard: ${result.standard.label}${result.standard.status === "draft" ? " (draft)" : ""}`,
    `- Checked files: ${result.checkedFiles}`,
    `- Active findings: ${result.summary.activeFindings}`,
    `- Baseline findings: ${result.summary.baselineFindings}`,
    `- Regressions: ${result.summary.regressions}`,
    `- Semantic analysis: ${result.semanticAnalysis.adapter} (${result.semanticAnalysis.mode})`,
    ""
  ];

  lines.push("## Score Breakdown", "");
  for (const [label, score] of Object.entries(result.scoreBreakdown)) {
    lines.push(`- ${titleCase(label)}: ${score}/100`);
  }

  lines.push("", "## Active Findings", "");
  if (result.activeFindings.length === 0) {
    lines.push("No active ClearDOM findings.");
  } else {
    for (const finding of result.activeFindings) {
      lines.push(`### ${finding.ruleId}: ${finding.title}`);
      lines.push("");
      lines.push(`- Location: ${formatLocation(finding, options.rootDir)}`);
      lines.push(`- Severity: ${finding.severity}`);
      lines.push(`- Confidence: ${finding.confidence}`);
      lines.push(`- Message: ${finding.message}`);
      lines.push(`- WCAG: ${finding.wcag.join(", ") || "not mapped"}`);
      if (finding.runtime) {
        lines.push(`- Runtime selector: \`${finding.runtime.selector}\``);
        lines.push(`- Runtime route: ${finding.runtime.route} (${finding.runtime.viewport.name ?? `${finding.runtime.viewport.width}x${finding.runtime.viewport.height}`})`);
        if (finding.runtime.evidence?.interactionStep) lines.push(`- Interaction: ${finding.runtime.evidence.interactionStep}`);
      }
      if (finding.native) {
        lines.push(`- Native platform: ${finding.native.platform}`);
        if (finding.native.screen) lines.push(`- Native screen: ${finding.native.screen}`);
        if (finding.native.deepLink) lines.push(`- Native deep link: ${finding.native.deepLink}`);
      }
      const rule = result.rules.find((candidate) => candidate.id === finding.ruleId);
      if (rule?.remediation?.safeAutofix) lines.push(`- Safe autofix: ${rule.remediation.safeAutofix}`);
      if (rule?.remediation?.manualVerification) lines.push(`- Verify: ${rule.remediation.manualVerification}`);
      lines.push("");
    }
  }

  if (result.runtimeDiagnostics.length > 0) {
    lines.push("", "## Runtime Diagnostics", "");
    for (const diagnostic of result.runtimeDiagnostics) {
      lines.push(`- ${diagnostic.severity} ${diagnostic.stage}: ${diagnostic.message}${diagnostic.url ? ` (${diagnostic.url})` : ""}`);
    }
  }

  if (result.semanticDiagnostics.length > 0) {
    lines.push("", "## Semantic Diagnostics", "");
    for (const diagnostic of result.semanticDiagnostics) {
      lines.push(`- ${diagnostic.severity}: ${diagnostic.message}${diagnostic.file ? ` (${diagnostic.file})` : ""}`);
    }
  }

  return lines.join("\n");
}

function formatLocation(finding: Finding, rootDir: string): string {
  if (/^https?:\/\//i.test(finding.file)) return `${finding.file}:${finding.line}:${finding.column}`;
  const relative = path.relative(rootDir, finding.file);
  const file = relative && !relative.startsWith("..") ? relative : path.relative(process.cwd(), finding.file);
  return `${normalizePath(file)}:${finding.line}:${finding.column}`;
}

function titleCase(value: string): string {
  return value.replace(/[A-Z]/g, (match) => ` ${match}`).replace(/^./, (match) => match.toUpperCase());
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}
