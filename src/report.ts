import * as path from "node:path";
import type { Finding, ResolvedScanOptions, ScanResult } from "./types.js";

export type ReportFormat = "html" | "markdown" | "json";

export function formatReport(result: ScanResult, options: ResolvedScanOptions, format: ReportFormat): string {
  if (format === "json") return JSON.stringify(result, null, 2);
  if (format === "html") return htmlReport(result, options);
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

function htmlReport(result: ScanResult, options: ResolvedScanOptions): string {
  const findings = result.activeFindings.map((finding) => `
      <article class="finding">
        <h3>${escapeHtml(finding.ruleId)}: ${escapeHtml(finding.title)}</h3>
        <dl>
          <div><dt>Location</dt><dd>${escapeHtml(formatLocation(finding, options.rootDir))}</dd></div>
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
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.5; margin: 0; color: #1f2937; background: #f8fafc; }
    main { max-width: 960px; margin: 0 auto; padding: 32px 20px 48px; }
    h1, h2, h3 { color: #111827; }
    .summary, .breakdown, .finding { background: white; border: 1px solid #d7dee8; border-radius: 8px; padding: 18px; margin: 16px 0; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
    .metric strong { display: block; font-size: 1.5rem; color: #0f766e; }
    dl { margin: 0; }
    dl div { margin: 10px 0; }
    dt { font-weight: 700; }
    dd { margin: 2px 0 0; }
    code { background: #eef2f7; padding: 2px 4px; border-radius: 4px; }
    img { display: block; max-width: 100%; border: 1px solid #d7dee8; border-radius: 6px; margin-top: 12px; }
  </style>
</head>
<body>
  <main>
    <h1>ClearDOM Scan Report</h1>
    <p>Generated ${escapeHtml(new Date().toISOString())}</p>
    <section class="summary" aria-label="Scan summary">
      ${metric("Score", `${result.score}/100`)}
      ${metric("Standard", `${result.standard.label}${result.standard.status === "draft" ? " (draft)" : ""}`)}
      ${metric("Checked Files", String(result.checkedFiles))}
      ${metric("Active Findings", String(result.summary.activeFindings))}
      ${metric("Baseline Findings", String(result.summary.baselineFindings))}
      ${metric("Regressions", String(result.summary.regressions))}
    </section>
    <section class="breakdown">
      <h2>Score Breakdown</h2>
      <ul>
        ${Object.entries(result.scoreBreakdown).map(([label, score]) => `<li>${escapeHtml(titleCase(label))}: ${score}/100</li>`).join("\n        ")}
      </ul>
    </section>
    <section>
      <h2>Active Findings</h2>
      ${findings || "<p>No active ClearDOM findings.</p>"}
    </section>
    ${diagnostics ? `<section class="finding"><h2>Runtime Diagnostics</h2><ul>${diagnostics}</ul></section>` : ""}
  </main>
</body>
</html>
`;
}

function metric(label: string, value: string): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function ruleRemediationHtml(result: ScanResult, finding: Finding): string {
  const remediation = result.rules.find((rule) => rule.id === finding.ruleId)?.remediation;
  if (!remediation?.safeAutofix && !remediation?.manualVerification) return "";
  return `<div><dt>Remediation</dt><dd>${escapeHtml([remediation.safeAutofix, remediation.manualVerification].filter(Boolean).join(" "))}</dd></div>`;
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

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}
