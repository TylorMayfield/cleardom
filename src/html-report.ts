import * as path from "node:path";
import type { Finding, ScanResult } from "./types.js";

export type HtmlReportOptions = {
  rootDir?: string;
  title?: string;
  generatedAt?: Date;
};

export function formatScanHtmlReport(result: ScanResult, options: HtmlReportOptions = {}): string {
  const title = options.title ?? "ClearDOM Scan Report";
  const generatedAt = options.generatedAt ?? new Date();
  const rootDir = options.rootDir ?? process.cwd();
  const activeFindings = result.activeFindings;
  const groupedFindings = groupFindings(activeFindings, rootDir);
  const diagnostics = result.runtimeDiagnostics.map((diagnostic) => `<li>${escapeHtml(diagnostic.severity)} ${escapeHtml(diagnostic.stage)}${diagnostic.url ? ` ${escapeHtml(diagnostic.url)}` : ""}: ${escapeHtml(diagnostic.message)}</li>`).join("\n");
  const semanticDiagnostics = result.semanticDiagnostics.map((diagnostic) => `<li>${escapeHtml(diagnostic.severity)}${diagnostic.file ? ` ${escapeHtml(formatFile(diagnostic.file, rootDir))}` : ""}: ${escapeHtml(diagnostic.message)}</li>`).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; --ink: #172033; --muted: #5f6b7a; --line: #d8dee8; --panel: #fff; --soft: #f6f8fb; --accent: #0f766e; --danger: #b42318; --warn: #9a5b08; --info: #285d9f; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.5; margin: 0; color: var(--ink); background: #f8fafc; }
    main { max-width: 1120px; margin: 0 auto; padding: 32px 20px 48px; }
    h1, h2, h3 { line-height: 1.2; margin: 0; letter-spacing: 0; }
    h1 { font-size: 2rem; }
    h2 { font-size: 1.2rem; }
    h3 { font-size: 1rem; }
    p { margin: 8px 0 0; color: var(--muted); }
    code { background: #eef2f7; padding: 2px 4px; border-radius: 4px; }
    .summary, .controls, .group, .diagnostics { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; margin: 16px 0; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; padding: 16px; }
    .metric span { display: block; color: var(--muted); font-size: .85rem; }
    .metric strong { display: block; color: var(--accent); font-size: 1.45rem; }
    .controls { display: grid; grid-template-columns: minmax(180px, 1fr) repeat(2, minmax(150px, 220px)); gap: 12px; align-items: end; padding: 16px; }
    label { display: grid; gap: 5px; color: var(--muted); font-size: .86rem; font-weight: 700; }
    input, select { width: 100%; min-height: 38px; border: 1px solid var(--line); border-radius: 6px; padding: 7px 9px; color: var(--ink); background: #fff; font: inherit; }
    :focus-visible { outline: 3px solid #2563eb; outline-offset: 3px; }
    .group { overflow: hidden; }
    summary { cursor: pointer; padding: 14px 16px; font-weight: 800; background: #edf2f7; }
    .finding { padding: 16px; border-top: 1px solid var(--line); }
    .finding[hidden], .group[hidden] { display: none; }
    .meta { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 10px; }
    .pill { border: 1px solid currentColor; border-radius: 999px; padding: 2px 8px; font-size: .8rem; font-weight: 700; }
    .critical { color: var(--danger); }
    .warning { color: var(--warn); }
    .info { color: var(--info); }
    dl { margin: 0; display: grid; gap: 8px; }
    dl div { display: grid; gap: 2px; }
    dt { font-weight: 700; }
    dd { margin: 0; color: var(--muted); overflow-wrap: anywhere; }
    code { overflow-wrap: anywhere; }
    img { display: block; max-width: 100%; border: 1px solid var(--line); border-radius: 6px; margin-top: 12px; }
    .diagnostics { padding: 16px; }
    .empty { padding: 16px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
    @media (max-width: 760px) { .controls { grid-template-columns: 1fr; } main { padding: 22px 12px 36px; } }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(title)}</h1>
      <p>Generated ${escapeHtml(generatedAt.toISOString())}</p>
    </header>
    <section class="summary" aria-label="Scan summary">
      ${metric("Score", `${result.score}/100`)}
      ${metric("Standard", `${result.standard.label}${result.standard.status === "draft" ? " (draft)" : ""}`)}
      ${metric("Checked", String(result.checkedFiles))}
      ${metric("Active", String(result.summary.activeFindings))}
      ${metric("Blocking", String(result.activeFindings.filter((finding) => finding.blocking).length))}
      ${metric("Regressions", String(result.summary.regressions))}
      ${metric("Runtime Pages", String(result.runtimePages.length))}
    </section>
    <section class="controls" aria-label="Finding filters">
      <label>Search
        <input id="finding-search" type="search" placeholder="Rule, file, message" autocomplete="off">
      </label>
      <label>Severity
        <select id="severity-filter">
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
      </label>
      <label>Confidence
        <select id="confidence-filter">
          <option value="">All confidence</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </label>
    </section>
    <section aria-labelledby="findings-heading">
      <h2 id="findings-heading">Active Findings</h2>
      ${activeFindings.length === 0 ? '<p class="empty">No active ClearDOM findings.</p>' : groupedFindings.map((group) => findingGroupHtml(result, group, rootDir)).join("\n")}
    </section>
    ${diagnostics ? `<section class="diagnostics"><h2>Runtime Diagnostics</h2><ul>${diagnostics}</ul></section>` : ""}
    ${semanticDiagnostics ? `<section class="diagnostics"><h2>Semantic Diagnostics</h2><ul>${semanticDiagnostics}</ul></section>` : ""}
  </main>
  <script>
    const search = document.getElementById("finding-search");
    const severity = document.getElementById("severity-filter");
    const confidence = document.getElementById("confidence-filter");
    function applyFilters() {
      const query = search.value.trim().toLowerCase();
      const severityValue = severity.value;
      const confidenceValue = confidence.value;
      for (const group of document.querySelectorAll(".group")) {
        let visibleInGroup = 0;
        for (const finding of group.querySelectorAll(".finding")) {
          const matchesQuery = !query || finding.dataset.search.includes(query);
          const matchesSeverity = !severityValue || finding.dataset.severity === severityValue;
          const matchesConfidence = !confidenceValue || finding.dataset.confidence === confidenceValue;
          const visible = matchesQuery && matchesSeverity && matchesConfidence;
          finding.hidden = !visible;
          if (visible) visibleInGroup += 1;
        }
        group.hidden = visibleInGroup === 0;
      }
    }
    search.addEventListener("input", applyFilters);
    severity.addEventListener("change", applyFilters);
    confidence.addEventListener("change", applyFilters);
  </script>
</body>
</html>`;
}

type FindingGroup = {
  file: string;
  findings: Finding[];
};

function groupFindings(findings: Finding[], rootDir: string): FindingGroup[] {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    const file = formatFile(finding.file, rootDir);
    groups.set(file, [...(groups.get(file) ?? []), finding]);
  }
  return [...groups.entries()]
    .map(([file, groupFindings]) => ({ file, findings: groupFindings }))
    .sort((left, right) => left.file.localeCompare(right.file));
}

function findingGroupHtml(result: ScanResult, group: FindingGroup, rootDir: string): string {
  return `<details class="group" open>
        <summary>${escapeHtml(group.file)} (${group.findings.length})</summary>
        ${group.findings.map((finding) => findingHtml(result, finding, rootDir)).join("\n")}
      </details>`;
}

function findingHtml(result: ScanResult, finding: Finding, rootDir: string): string {
  const location = formatLocation(finding, rootDir);
  const remediation = ruleRemediationHtml(result, finding);
  const search = [
    finding.ruleId,
    finding.title,
    finding.message,
    finding.file,
    location,
    finding.wcag.join(" ")
  ].join(" ").toLowerCase();

  return `<article class="finding" data-severity="${escapeHtml(finding.severity)}" data-confidence="${escapeHtml(finding.confidence)}" data-search="${escapeHtml(search)}">
          <h3>${escapeHtml(finding.ruleId)}: ${escapeHtml(finding.title)}</h3>
          <div class="meta">
            <span class="pill ${escapeHtml(finding.severity)}">${escapeHtml(finding.severity)}</span>
            <span class="pill">${escapeHtml(finding.confidence)} confidence</span>
            <span class="pill">${escapeHtml(finding.detectionMode)}</span>
          </div>
          <dl>
            <div><dt>Location</dt><dd>${escapeHtml(location)}</dd></div>
            <div><dt>Message</dt><dd>${escapeHtml(finding.message)}</dd></div>
            <div><dt>WCAG</dt><dd>${escapeHtml(finding.wcag.join(", ") || "not mapped")}</dd></div>
            ${finding.runtime ? `<div><dt>Runtime selector</dt><dd><code>${escapeHtml(finding.runtime.selector)}</code></dd></div>
            <div><dt>Runtime route</dt><dd>${escapeHtml(finding.runtime.route)} at ${escapeHtml(finding.runtime.viewport.name ?? `${finding.runtime.viewport.width}x${finding.runtime.viewport.height}`)}</dd></div>` : ""}
            ${finding.native ? `<div><dt>Native evidence</dt><dd>${escapeHtml(finding.native.platform)} ${escapeHtml(finding.native.screen ?? "")}</dd></div>` : ""}
            ${remediation}
          </dl>
          ${finding.runtime?.screenshot ? `<img alt="Screenshot evidence for ${escapeHtml(finding.ruleId)}" src="${escapeHtml(finding.runtime.screenshot)}">` : ""}
          ${finding.native?.screenshot ? `<img alt="Native screenshot evidence for ${escapeHtml(finding.ruleId)}" src="${escapeHtml(finding.native.screenshot)}">` : ""}
        </article>`;
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
  return `${formatFile(finding.file, rootDir)}:${finding.line}:${finding.column}`;
}

function formatFile(file: string, rootDir: string): string {
  if (/^(?:https?|file):/i.test(file)) return file;
  const relative = path.relative(rootDir, file);
  const display = relative && !relative.startsWith("..") ? relative : path.relative(process.cwd(), file);
  return display.replace(/\\/g, "/");
}

function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
