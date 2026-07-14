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

export function formatScanResult(result: ScanResult, verbose = false, version = "unknown", target = ".", color = false): string {
  return verbose
    ? formatVerboseScanResult(result, version, target, color)
    : formatCompactScanResult(result, version, target, color);
}

function formatVerboseScanResult(result: ScanResult, version: string, target: string, color: boolean): string {
  const failedRuns = runtimeFailedRuns(result);
  const lines = [
    `ClearDOM v${version}`,
    "",
    scanCompletionLabel(failedRuns, color),
    "",
    `Score: ${result.score}/100 (${scoreLabel(result.score)}${failedRuns > 0 ? ", provisional — runtime coverage incomplete" : ""})`,
    `${issueSummary(result)} across ${result.checkedFiles} ${pluralize("file", result.checkedFiles)} against ${result.standard.label}${result.standard.status === "draft" ? " (draft)" : ""}`,
    ""
  ];

  const groups = groupTerminalFindings(result.activeFindings).sort((left, right) => compareFindingPriority(left.finding, right.finding));
  for (const severity of ["critical", "warning", "info"] as const) {
    const severityGroups = groups.filter(({ finding }) => finding.severity === severity);
    if (severityGroups.length === 0) continue;
    lines.push(severityLabels[severity]);
    for (const group of severityGroups) appendVerboseFinding(lines, group, result);
    lines.push("");
  }

  if (groups.length === 0) lines.push("No active accessibility or readability findings.", "");
  appendRuntimeDiagnostics(lines, result, true);

  lines.push("Scan details");
  lines.push(`  Semantic analysis: ${semanticLabel(result)}`);
  lines.push(`  Framework adapters: ${sourceAdapters.map((adapter) => `${adapter.label} ${adapter.supportTier}`).join(", ")}`);
  lines.push(`  Web runtime checks: ${result.runtimePages.length > 0 ? `${result.runtimePages.length} page ${pluralize("run", result.runtimePages.length)}` : "available with --runtime-url and Chromium"}`);
  lines.push("  React Native checks: static source guidance; verify VoiceOver and TalkBack behavior manually on device or simulator");
  lines.push(`  Active: ${result.summary.activeFindings}`);
  lines.push(`  Baseline: ${result.summary.baselineFindings}`);
  lines.push(`  Suppressed: ${result.summary.suppressedFindings}`);
  lines.push(`  ${result.baseline ? "Regressions" : "New findings"}: ${result.summary.regressions}`);
  for (const category of categories) {
    const count = result.activeFindings.filter((finding) => finding.category === category).length;
    if (count > 0) lines.push(`  ${category}: ${count}`);
  }
  lines.push("", "Score breakdown");
  lines.push(`  Semantic clarity: ${result.scoreBreakdown.semanticClarity}/100`);
  lines.push(`  Keyboard/focus: ${result.scoreBreakdown.keyboardFocus}/100`);
  lines.push(`  Readability: ${result.scoreBreakdown.readability}/100`);
  lines.push(`  Touch accessibility: ${result.scoreBreakdown.touchAccessibility}/100`);
  lines.push(`  Standards coverage: ${result.scoreBreakdown.standardsCoverage}/100`);
  if (result.timings) appendTimings(lines, result);
  appendNextActions(lines, result, target);
  return lines.join("\n");
}

function formatCompactScanResult(result: ScanResult, version: string, target: string, color = false): string {
  const lines = [
    `ClearDOM v${version}`,
    `Detected: ${detectedLabel(result)}`
  ];

  const failedRuntimeRuns = runtimeFailedRuns(result);
  lines.push("", scanCompletionLabel(failedRuntimeRuns, color), "");
  lines.push(`Score: ${result.score}/100 (${scoreLabel(result.score)}${failedRuntimeRuns > 0 ? ", provisional — runtime coverage incomplete" : ""})`);
  lines.push(`${issueSummary(result)} across ${result.checkedFiles} ${pluralize("file", result.checkedFiles)} against ${result.standard.label}${result.standard.status === "draft" ? " (draft)" : ""}`);

  if (result.runtimePages.length > 0) {
    const routes = new Set(result.runtimePages.map((page) => page.route)).size;
    const viewports = new Set(result.runtimePages.map((page) => page.viewport.name ?? `${page.viewport.width}x${page.viewport.height}`)).size;
    const completed = Math.max(0, result.runtimePages.length - Math.min(failedRuntimeRuns, result.runtimePages.length));
    const runtimeFindings = result.activeFindings.filter((finding) => finding.source === "runtime").length;
    lines.push(`Rendered: ${routes} ${pluralize("route", routes)} · ${viewports} ${pluralize("viewport", viewports)} · ${result.runtimePages.length} page ${pluralize("run", result.runtimePages.length)}`);
    lines.push(`Page runs: ${completed} completed · ${failedRuntimeRuns} failed`);
    lines.push(`Runtime findings: ${runtimeFindings}`);
  }

  const modeCounts = detectionModeCounts(result.activeFindings);
  if (result.activeFindings.length > 0) {
    lines.push(`Detection: ${modeCounts.automated} automated, ${modeCounts.needsReview} needs review, ${modeCounts.manualGuidance} manual guidance`);
  }

  const findingGroups = groupTerminalFindings(result.activeFindings).sort((left, right) => compareFindingPriority(left.finding, right.finding));
  const shownGroups = findingGroups.slice(0, 5);
  if (shownGroups.length > 0) {
    lines.push("", "Top findings");
    for (const { finding, occurrences } of shownGroups) {
      const rule = result.rules.find((candidate) => candidate.id === finding.ruleId);
      lines.push(`  ${terminalStyle(severitySymbol(finding.severity), finding.severity === "critical" ? "red" : finding.severity === "warning" ? "yellow" : "dim", color)} ${finding.title}`);
      lines.push(`    ${formatFindingLocation(finding)}`);
      lines.push(`    ${finding.message}`);
      if (occurrences.length > 1 && finding.runtime) lines.push(`    ${formatOccurrenceSummary(occurrences)}`);
      if (rule?.guidance) lines.push(`    Fix: ${rule.guidance}`);
      lines.push(`    Rule: ${finding.ruleId}`);
    }
    if (findingGroups.length > shownGroups.length) {
      lines.push(`  Showing ${shownGroups.length} of ${findingGroups.length} finding groups. Run with --verbose for every finding.`);
    }
  } else {
    lines.push("", "No active accessibility or readability findings.");
  }

  appendRuntimeDiagnostics(lines, result, false);
  if (result.timings) appendTimings(lines, result);
  appendNextActions(lines, result, target);

  return lines.join("\n");
}

function scanCompletionLabel(failedRuns: number, color: boolean): string {
  return failedRuns > 0
    ? terminalStyle(`⚠ Scan incomplete — ${failedRuns} rendered page ${pluralize("run", failedRuns)} failed`, "yellow", color)
    : terminalStyle("✓ Scan complete", "green", color);
}

function terminalStyle(value: string, style: "red" | "yellow" | "green" | "dim", enabled: boolean): string {
  if (!enabled) return value;
  const code = style === "red" ? 31 : style === "yellow" ? 33 : style === "green" ? 32 : 2;
  return `\u001b[${code}m${value}\u001b[0m`;
}

function groupTerminalFindings(findings: Finding[]): Array<{ finding: Finding; occurrences: Finding[] }> {
  const groups = new Map<string, { finding: Finding; occurrences: Finding[] }>();
  for (const finding of findings) {
    const key = finding.runtime
      ? [finding.ruleId, finding.runtime.route, finding.runtime.selector, finding.message].join("\n")
      : finding.fingerprint;
    const group = groups.get(key);
    if (group) group.occurrences.push(finding);
    else groups.set(key, { finding, occurrences: [finding] });
  }
  return [...groups.values()];
}

function appendVerboseFinding(
  lines: string[],
  group: ReturnType<typeof groupTerminalFindings>[number],
  result: ScanResult
): void {
  const { finding, occurrences } = group;
  const rule = result.rules.find((candidate) => candidate.id === finding.ruleId);
  lines.push(`  ${finding.ruleId} ${formatFindingLocation(finding)} ${finding.title}`);
  lines.push(`     ${finding.message}`);
  if (occurrences.length > 1 && finding.runtime) lines.push(`     ${formatOccurrenceSummary(occurrences)}`);
  lines.push(`     Detection: ${finding.detectionMode}; confidence ${finding.confidence} (${finding.confidenceReason})`);
  if (rule?.guidance) lines.push(`     Fix: ${rule.guidance}`);
  if (rule?.remediation?.safeAutofix && !finding.runtime) lines.push(`     Autofix: ${rule.remediation.safeAutofix}`);
  lines.push(`     Learn: cleardom explain ${finding.ruleId}${rule?.docsUrl ? ` | ${rule.docsUrl}` : ""}`);
  if (!finding.runtime && finding.excerpt) lines.push(`     Evidence: ${finding.excerpt}`);
  lines.push(`     Standards: ${formatStandardRefs(finding.standards)}`);
  if (finding.native) {
    lines.push(`     Native: ${finding.native.platform} ${finding.native.screen ?? ""}${finding.native.deepLink ? ` ${finding.native.deepLink}` : ""}`.trimEnd());
  }
}

function formatOccurrenceSummary(occurrences: Finding[]): string {
  const viewports = [...new Set(occurrences.map((item) => item.runtime
    ? item.runtime.viewport.name ?? `${item.runtime.viewport.width}x${item.runtime.viewport.height}`
    : undefined).filter((value): value is string => Boolean(value)))];
  return `Seen in ${viewports.join(", ")} (${occurrences.length} occurrences)`;
}

function appendRuntimeDiagnostics(lines: string[], result: ScanResult, verbose: boolean): void {
  const groups = groupRuntimeDiagnostics(result);
  if (groups.length === 0) return;
  if (lines.at(-1) !== "") lines.push("");
  lines.push("Runtime diagnostics");
  const shown = verbose ? groups : groups.slice(0, 3);
  for (const group of shown) {
    const diagnostic = group.diagnostics[0];
    if (!diagnostic) continue;
    const viewports = [...new Set(group.diagnostics.map((item) => item.viewport).filter(Boolean))];
    const location = [diagnostic.route, viewports.length > 0 ? viewports.join(", ") : undefined].filter(Boolean).join(" · ");
    const label = diagnostic.severity === "error" ? "FAIL" : diagnostic.severity === "warning" ? "WARN" : "INFO";
    lines.push(`  ${label} ${diagnostic.stage}${location ? ` · ${location}` : ""}`);
    lines.push(`    ${diagnostic.message}`);
    if (verbose) lines.push(`    Remedy: ${runtimeDiagnosticRemedy(diagnostic.stage)}`);
  }
  if (!verbose && groups.length > shown.length) {
    lines.push(`  ${groups.length - shown.length} more diagnostic ${pluralize("group", groups.length - shown.length)}; run with --verbose for details.`);
  }
  lines.push("");
}

function groupRuntimeDiagnostics(result: ScanResult): Array<{ diagnostics: ScanResult["runtimeDiagnostics"] }> {
  const groups = new Map<string, ScanResult["runtimeDiagnostics"]>();
  for (const diagnostic of result.runtimeDiagnostics) {
    const key = [diagnostic.severity, diagnostic.stage, diagnostic.route, diagnostic.message].join("\n");
    const group = groups.get(key);
    if (group) group.push(diagnostic);
    else groups.set(key, [diagnostic]);
  }
  return [...groups.values()].map((diagnostics) => ({ diagnostics }));
}

function runtimeDiagnosticRemedy(stage: ScanResult["runtimeDiagnostics"][number]["stage"]): string {
  if (stage === "navigation") return "Verify the route and server response, then rerun the rendered check.";
  if (stage === "setup") return "Check the runtime setup or authentication script and its configured data.";
  if (stage === "browser") return "Run cleardom browser install or configure runtime.browser.executablePath.";
  if (stage === "discover-routes") return "Review runtime.routes, discovery, crawl, and Storybook configuration.";
  if (stage === "screenshot") return "Rerun with screenshot capture disabled or inspect the selector and page state.";
  if (stage === "interaction") return "Review the configured interaction and the rendered state it expects.";
  if (stage === "native") return "Verify the native provider, app identifier, and target screen configuration.";
  return "Inspect the rendered page state and selector, then rerun the check.";
}

function appendTimings(lines: string[], result: ScanResult): void {
  if (!result.timings) return;
  if (lines.at(-1) !== "") lines.push("");
  lines.push(`Completed in ${formatDuration(result.timings.totalMs)}`);
  if (result.timings.runtimeMs > 0) lines.push(`  Source ${formatDuration(result.timings.sourceMs)} · Runtime ${formatDuration(result.timings.runtimeMs)}`);
  lines.push("");
}

function appendNextActions(lines: string[], result: ScanResult, target: string): void {
  const actions = terminalActions(result, target);
  if (lines.at(-1) !== "") lines.push("");
  lines.push("Next:");
  if (actions.length === 0) lines.push("  No action required.");
  else lines.push(...actions.map((action) => `  ${action}`));
}

function terminalActions(result: ScanResult, target: string): string[] {
  const actions = new Set<string>();
  const topFinding = topPriorityFinding(result.activeFindings);
  const runtimeUrl = runtimeBaseUrl(result);
  const runtimeOption = runtimeUrl && !/^https?:\/\//i.test(target) ? ` --runtime-url ${shellTarget(runtimeUrl)}` : "";

  if (topFinding?.runtime) {
    actions.add(`Inspect rendered issue: ${formatFindingLocation(topFinding)}`);
  } else if (topFinding) {
    const rule = result.rules.find((candidate) => candidate.id === topFinding.ruleId);
    if (rule?.remediation?.safeAutofix) actions.add(`cleardom fix ${shellTarget(target)} --rule ${topFinding.ruleId} --apply`);
  }

  if (result.runtimePages.length > 0 || result.runtimeDiagnostics.some((diagnostic) => diagnostic.url)) {
    actions.add(`cleardom check ${shellTarget(target)}${runtimeOption}`);
  } else if (result.activeFindings.length > 0) {
    actions.add(`cleardom check ${shellTarget(target)} --diff`);
  }

  if (result.activeFindings.some((finding) => finding.runtime)) {
    actions.add(`cleardom report ${shellTarget(target)}${runtimeOption} --format html --output cleardom-report.html`);
  }
  if (result.runtimePages.length === 0 && !result.runtimeDiagnostics.some((diagnostic) => diagnostic.url)) {
    actions.add(`Configure rendered checks: cleardom doctor ${shellTarget(target)}`);
  }
  if (result.runtimeDiagnostics.some((diagnostic) => /Chromium|browser install/i.test(diagnostic.message))) {
    actions.add("cleardom browser install");
  }
  return [...actions];
}

function runtimeBaseUrl(result: ScanResult): string | undefined {
  const url = result.runtimePages[0]?.url ?? result.runtimeDiagnostics.find((diagnostic) => diagnostic.url)?.url;
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

function runtimeFailedRuns(result: ScanResult): number {
  const failedPages = result.runtimePages.filter((page) => {
    if (page.status === undefined || page.status >= 400) return true;
    return result.runtimeDiagnostics.some((diagnostic) => diagnostic.severity === "error"
      && diagnostic.route === page.route
      && (!diagnostic.viewport || diagnostic.viewport === (page.viewport.name ?? `${page.viewport.width}x${page.viewport.height}`)));
  });
  const unmatchedErrors = result.runtimeDiagnostics.filter((diagnostic) => diagnostic.severity === "error"
    && !failedPages.some((page) => diagnostic.route === page.route
      && (!diagnostic.viewport || diagnostic.viewport === (page.viewport.name ?? `${page.viewport.width}x${page.viewport.height}`))));
  return failedPages.length + unmatchedErrors.length;
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) return `${milliseconds}ms`;
  return `${(milliseconds / 1000).toFixed(1)}s`;
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
  if (finding.runtime) {
    const viewport = finding.runtime.viewport.name ?? `${finding.runtime.viewport.width}x${finding.runtime.viewport.height}`;
    const interaction = finding.runtime.evidence?.interactionStep;
    return [finding.runtime.route, viewport, finding.runtime.selector, interaction].filter(Boolean).join(" · ");
  }
  if (/^(?:https?|file):/i.test(finding.file)) {
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
