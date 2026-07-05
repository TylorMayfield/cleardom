import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { writeBaseline } from "./baseline.js";
import { compareScanResults } from "./compare.js";
import { resolveScanOptions } from "./config.js";
import { formatSarif } from "./format.js";
import { scanPath, shouldFail } from "./scanner.js";
import type { ComparisonResult, Finding, OutputFormat, PackageConfig, PrBaselinePolicy, ResolvedScanOptions, ScanOptions, ScanResult, Severity } from "./types.js";

const marker = "<!-- cleardom:pr-summary -->";
const inlineMarker = "<!-- cleardom:inline -->";
const defaultWorkflowPath = path.join(".github", "workflows", "cleardom.yml");
const execFileAsync = promisify(execFile);

type GithubPrOptions = {
  target: string;
  options: ScanOptions;
  format?: OutputFormat;
  writeBaseline?: string;
  dryRun?: boolean;
  maxComments?: number;
};

type PullRequestDiff = {
  files: GithubChangedFile[];
  changedFiles: Set<string>;
  addedLines: Map<string, Set<number>>;
};

export type GithubContext = {
  token: string;
  repository: string;
  apiUrl: string;
  serverUrl: string;
  pullRequest: {
    number: number;
    headSha: string;
    baseSha: string;
    baseRef: string;
  };
};

type GithubChangedFile = {
  filename: string;
  patch?: string;
};

type GithubComment = {
  id: number;
  body?: string;
  path?: string;
  line?: number;
};

export async function installGithubActions(rootDir = process.cwd()): Promise<{ filePath: string; status: "created" | "updated" | "unchanged" }> {
  const resolved = path.join(rootDir, defaultWorkflowPath);
  const existing = await readOptional(resolved);
  const workflow = githubWorkflow();

  if (existing === workflow) {
    return { filePath: defaultWorkflowPath, status: "unchanged" };
  }

  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, workflow, "utf8");
  return { filePath: defaultWorkflowPath, status: existing === undefined ? "created" : "updated" };
}

export async function runGithubPr(options: GithubPrOptions): Promise<{ result: ScanResult; comparison?: ComparisonResult; posted: boolean; summary: string }> {
  const resolvedOptions = await resolveScanOptions(options.options);
  const context = await githubContext();
  const prOptions = {
    ...resolvedOptions.pr,
    maxComments: options.maxComments ?? resolvedOptions.pr.maxComments
  };
  const diff = context && !options.dryRun ? await pullRequestDiff(context) : undefined;
  const scanOptions = prOptions.changedFilesOnly && diff
    ? { ...resolvedOptions, include: changedFileIncludes(diff.changedFiles, resolvedOptions) }
    : resolvedOptions;
  const result = await scanPath(options.target, scanOptions);
  const comparison = context && !options.dryRun
    ? await compareWithBaseTree(context, options.target, scanOptions, result)
    : undefined;

  if (options.writeBaseline) {
    await writeBaseline(options.writeBaseline, resolvedOptions.rootDir, resolvedOptions.standard, result.findings);
  }

  const summary = comparison
    ? formatPullRequestComparisonSummary(comparison, scanOptions)
    : formatPullRequestSummary(result, scanOptions);

  if (context && !options.dryRun) {
    const reviewFindings = filterReviewFindings(findingsForPolicy(result, comparison, prOptions.baselinePolicy), scanOptions, prOptions.severityThreshold, diff);
    if (prOptions.commentMode === "summary" || prOptions.commentMode === "both") {
      await postStickySummary(context, summary);
    }
    if (prOptions.commentMode === "inline" || prOptions.commentMode === "both") {
      await postInlineComments(context, result, scanOptions, prOptions.maxComments, reviewFindings, diff);
    }
    await createCheckRun(context, result, comparison, scanOptions, reviewFindings, summary, prOptions.statusCheckName);
    if (prOptions.uploadSarif) {
      await uploadSarif(context, result, scanOptions);
    }
  }

  process.exitCode = comparison ? (filterBySeverity(comparison.newFindings, prOptions.severityThreshold).length > 0 ? 1 : 0) : (shouldFail(result, scanOptions.failOn) ? 1 : 0);
  return { result, comparison, posted: Boolean(context && !options.dryRun), summary };
}

export function formatPullRequestSummary(result: ScanResult, options: ResolvedScanOptions): string {
  const lines = [
    marker,
    `# ClearDOM PR review: ${result.activeFindings.length === 0 ? "passed" : issueSummary(result)}`,
    "",
    `Score: **${result.score}/100**`,
    `Status check: **${shouldFail(result, options.failOn) ? "failing" : "passing"}**`,
    `Checked: **${result.checkedFiles}** ${result.checkedFiles === 1 ? "file" : "files"} against **${result.standard.label}${result.standard.status === "draft" ? " (draft)" : ""}**`,
    `Semantic analysis: **${result.semanticAnalysis.adapter === "typescript" ? "TypeScript Program" : "lightweight fallback"}**`,
    "",
    "| Result | Count |",
    "| --- | ---: |",
    `| Active findings | ${result.summary.activeFindings} |`,
    `| ${result.baseline ? "Regressions" : "New findings"} | ${result.summary.regressions} |`,
    `| Baseline findings | ${result.summary.baselineFindings} |`,
    `| Critical | ${result.summary.critical} |`,
    `| Warnings | ${result.summary.warning} |`,
    `| Info | ${result.summary.info} |`,
    ""
  ];
  pushPackageSummary(lines, result.activeFindings, options);

  const findings = result.activeFindings.slice(0, 30);
  if (findings.length > 0) {
    lines.push("## Findings", "");
    pushFindingsByFile(lines, findings, result, options);
    if (result.activeFindings.length > findings.length) {
      lines.push("", `Showing ${findings.length} of ${result.activeFindings.length} active findings. See the workflow logs for the complete scan.`);
    }
  } else {
    lines.push("No active ClearDOM findings on this run.");
  }

  lines.push("", "<sub>ClearDOM updates this comment on each run. Use `cleardom explain <rule-id>` for rule docs and fix examples.</sub>");
  return lines.join("\n");
}

export function formatPullRequestComparisonSummary(comparison: ComparisonResult, options: ResolvedScanOptions): string {
  const result = comparison.head;
  const lines = [
    marker,
    `# ClearDOM PR review: ${comparison.newFindings.length === 0 ? "passed" : `${comparison.summary.newFindings} new ${comparison.summary.newFindings === 1 ? "finding" : "findings"}`}`,
    "",
    `Score: **${result.score}/100**`,
    `Status check: **${comparison.newFindings.length > 0 ? "failing" : "passing"}** - pull requests fail only on new findings.`,
    `Checked: **${result.checkedFiles}** ${result.checkedFiles === 1 ? "file" : "files"} against **${result.standard.label}${result.standard.status === "draft" ? " (draft)" : ""}**`,
    `Semantic analysis: **${result.semanticAnalysis.adapter === "typescript" ? "TypeScript Program" : "lightweight fallback"}**`,
    "",
    "| Delta | Count |",
    "| --- | ---: |",
    `| New findings | ${comparison.summary.newFindings} |`,
    `| Fixed findings | ${comparison.summary.fixedFindings} |`,
    `| Existing findings | ${comparison.summary.unchangedFindings} |`,
    `| Head active findings | ${comparison.summary.headActiveFindings} |`,
    `| Base active findings | ${comparison.summary.baseActiveFindings} |`,
    ""
  ];
  pushPackageSummary(lines, result.activeFindings, options);

  if (comparison.newFindings.length > 0) {
    lines.push("## New Findings", "");
    pushFindingsByFile(lines, comparison.newFindings.slice(0, 30), result, options);
    if (comparison.newFindings.length > 30) {
      lines.push("", `Showing 30 of ${comparison.newFindings.length} new findings. See the workflow logs for the complete scan.`);
    }
  } else {
    lines.push("No new ClearDOM findings introduced by this pull request.");
  }

  if (comparison.fixedFindings.length > 0) {
    lines.push("", "## Fixed Findings", "");
    for (const finding of comparison.fixedFindings.slice(0, 10)) {
      lines.push(`- **${finding.ruleId}** ${markdownLocation(finding, options)}: ${finding.title}`);
    }
    if (comparison.fixedFindings.length > 10) {
      lines.push("", `Showing 10 of ${comparison.fixedFindings.length} fixed findings.`);
    }
  }

  lines.push("", "<sub>ClearDOM updates this comment on each run. Use `cleardom explain <rule-id>` for rule docs and fix examples.</sub>");
  return lines.join("\n");
}

export function githubWorkflow(): string {
  return `name: ClearDOM

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  push:
    branches: [main]

concurrency:
  group: cleardom-\${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  cleardom:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      issues: write
      security-events: write
      checks: write
      statuses: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: ClearDOM PR review
        if: github.event_name == 'pull_request'
        run: npx cleardom@latest review . --changed-files-only
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
      - name: ClearDOM main scan
        if: github.event_name != 'pull_request'
        run: npx cleardom@latest ci . --format sarif > cleardom.sarif
      - uses: github/codeql-action/upload-sarif@v3
        if: always() && github.event_name != 'pull_request'
        with:
          sarif_file: cleardom.sarif
`;
}

async function githubContext(): Promise<GithubContext | undefined> {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!token || !repository || !eventPath) return undefined;

  const event = JSON.parse(await fs.readFile(eventPath, "utf8")) as {
    pull_request?: {
      number: number;
      base: { ref: string; sha: string };
      head: { sha: string };
    };
  };
  if (!event.pull_request) return undefined;

  return {
    token,
    repository,
    apiUrl: process.env.GITHUB_API_URL ?? "https://api.github.com",
    serverUrl: process.env.GITHUB_SERVER_URL ?? "https://github.com",
    pullRequest: {
      number: event.pull_request.number,
      headSha: event.pull_request.head.sha,
      baseSha: event.pull_request.base.sha,
      baseRef: event.pull_request.base.ref
    }
  };
}

async function compareWithBaseTree(context: GithubContext, target: string, options: ResolvedScanOptions, head: ScanResult): Promise<ComparisonResult> {
  const worktree = await fs.mkdtemp(path.join(tmpdir(), "cleardom-base-"));

  try {
    await execFileAsync("git", ["fetch", "--no-tags", "--depth=1", "origin", context.pullRequest.baseSha], { cwd: options.rootDir });
    await execFileAsync("git", ["worktree", "add", "--detach", worktree, context.pullRequest.baseSha], { cwd: options.rootDir });
    const configPath = rebaseOptionalPath(options.configPath ?? await defaultConfigPath(options.rootDir), options.rootDir, worktree);
    const baseOptions: ScanOptions = {
      include: options.include,
      exclude: options.exclude,
      rules: options.rules,
      standard: options.standard,
      failOn: options.failOn,
      format: options.format,
      verbose: options.verbose,
      runtimeUrl: options.runtimeUrl,
      componentPresets: options.componentPresets,
      components: options.components,
      configPath,
      baseline: rebaseOptionalPath(options.baseline, options.rootDir, worktree)
    };
    const baseTarget = rebaseTarget(target, options.rootDir, worktree);
    const base = await scanPath(baseTarget, baseOptions);
    return compareScanResults(base, head, { baseRoot: worktree, headRoot: options.rootDir });
  } finally {
    await execFileAsync("git", ["worktree", "remove", "--force", worktree], { cwd: options.rootDir }).catch(async () => {
      await fs.rm(worktree, { recursive: true, force: true });
    });
  }
}

async function postStickySummary(context: GithubContext, summary: string): Promise<void> {
  const comments = await githubRequestAll<GithubComment>(context, `/repos/${context.repository}/issues/${context.pullRequest.number}/comments?per_page=100`);
  const existing = comments.find((comment) => comment.body?.includes(marker));
  if (existing) {
    await githubRequest(context, `/repos/${context.repository}/issues/comments/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ body: summary })
    });
    return;
  }

  await githubRequest(context, `/repos/${context.repository}/issues/${context.pullRequest.number}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: summary })
  });
}

async function pullRequestDiff(context: GithubContext): Promise<PullRequestDiff> {
  const files = await githubRequestAll<GithubChangedFile>(context, `/repos/${context.repository}/pulls/${context.pullRequest.number}/files?per_page=100`);
  return {
    files,
    changedFiles: new Set(files.map((file) => file.filename)),
    addedLines: new Map(files.map((file) => [file.filename, parseAddedLines(file.patch ?? "")]))
  };
}

async function postInlineComments(context: GithubContext, result: ScanResult, options: ResolvedScanOptions, maxComments: number, findings: Finding[], diff?: PullRequestDiff): Promise<void> {
  const resolvedDiff = diff ?? await pullRequestDiff(context);
  const existing = await githubRequestAll<GithubComment>(context, `/repos/${context.repository}/pulls/${context.pullRequest.number}/comments?per_page=100`);
  const existingKeys = new Set(existing.filter((comment) => comment.body?.includes(inlineMarker)).map((comment) => `${comment.path}:${comment.line}:${extractRuleId(comment.body ?? "")}`));

  let posted = 0;
  for (const finding of findings) {
    if (posted >= maxComments) return;
    const file = relativeFindingPath(finding, options);
    const lines = resolvedDiff.addedLines.get(file);
    if (!lines?.has(finding.line)) continue;

    const key = `${file}:${finding.line}:${finding.ruleId}`;
    if (existingKeys.has(key)) continue;

    await githubRequest(context, `/repos/${context.repository}/pulls/${context.pullRequest.number}/comments`, {
      method: "POST",
      body: JSON.stringify({
        body: inlineCommentBody(finding, result),
        commit_id: context.pullRequest.headSha,
        path: file,
        line: finding.line,
        side: "RIGHT"
      })
    });
    posted += 1;
  }
}

async function createCheckRun(
  context: GithubContext,
  result: ScanResult,
  comparison: ComparisonResult | undefined,
  options: ResolvedScanOptions,
  findings: Finding[],
  summary: string,
  name: string
): Promise<void> {
  const annotations = findings.slice(0, 50).map((finding) => ({
    path: relativeFindingPath(finding, options),
    start_line: finding.line,
    end_line: finding.line,
    annotation_level: checkAnnotationLevel(finding.severity),
    message: finding.message,
    title: `${finding.ruleId}: ${finding.title}`,
    raw_details: finding.excerpt
  }));

  await githubRequest(context, `/repos/${context.repository}/check-runs`, {
    method: "POST",
    headers: { Accept: "application/vnd.github+json" },
    body: JSON.stringify({
      name,
      head_sha: context.pullRequest.headSha,
      status: "completed",
      conclusion: comparison
        ? (comparison.newFindings.length > 0 ? "failure" : "success")
        : (shouldFail(result, options.failOn) ? "failure" : "success"),
      output: {
        title: `${name}: ${findings.length === 0 ? "passed" : `${findings.length} actionable ${findings.length === 1 ? "finding" : "findings"}`}`,
        summary: truncate(summary.replace(marker, "").trim(), 65000),
        annotations
      }
    })
  });
}

async function uploadSarif(context: GithubContext, result: ScanResult, options: ResolvedScanOptions): Promise<void> {
  const sarif = formatSarif(result);
  await githubRequest(context, `/repos/${context.repository}/code-scanning/sarifs`, {
    method: "POST",
    body: JSON.stringify({
      commit_sha: context.pullRequest.headSha,
      ref: `refs/pull/${context.pullRequest.number}/head`,
      sarif: Buffer.from(sarif, "utf8").toString("base64"),
      checkout_uri: `${context.serverUrl}/${context.repository}`,
      tool_name: options.pr.statusCheckName
    })
  });
}

function findingsForPolicy(result: ScanResult, comparison: ComparisonResult | undefined, policy: PrBaselinePolicy): Finding[] {
  if (policy === "all") return result.activeFindings;
  return comparison?.newFindings ?? result.regressions;
}

function filterReviewFindings(findings: Finding[], options: ResolvedScanOptions, severity: Severity, diff?: PullRequestDiff): Finding[] {
  const bySeverity = filterBySeverity(findings, severity);
  if (!diff) return bySeverity;
  return bySeverity.filter((finding) => {
    const file = relativeFindingPath(finding, options);
    return diff.addedLines.get(file)?.has(finding.line) ?? false;
  });
}

function filterBySeverity(findings: Finding[], threshold: Severity): Finding[] {
  const order: Record<Severity, number> = { critical: 3, warning: 2, info: 1 };
  return findings.filter((finding) => order[finding.severity] >= order[threshold]);
}

function changedFileIncludes(files: Set<string>, options: ResolvedScanOptions): string[] {
  const sourceFiles = [...files].filter((file) => !file.startsWith(".github/"));
  return sourceFiles.length > 0 ? sourceFiles : ["__cleardom_no_changed_files__"];
}

function checkAnnotationLevel(severity: Severity): "failure" | "warning" | "notice" {
  if (severity === "critical") return "failure";
  if (severity === "warning") return "warning";
  return "notice";
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 20)}\n\n[truncated]`;
}

function inlineCommentBody(finding: Finding, result: ScanResult): string {
  const rule = result.rules.find((candidate) => candidate.id === finding.ruleId);
  return [
    inlineMarker,
    `**${finding.ruleId}: ${finding.title}**`,
    "",
    finding.message,
    finding.owner ? `Owner: ${finding.owner}` : undefined,
    rule?.guidance ? `Fix: ${rule.guidance}` : undefined,
    rule?.remediation?.safeAutofix ? `Autofix: ${rule.remediation.safeAutofix}` : undefined,
    rule?.docsUrl ? `Docs: ${rule.docsUrl}` : undefined
  ].filter(Boolean).join("\n");
}

function pushFinding(lines: string[], finding: Finding, result: ScanResult, options: ResolvedScanOptions): void {
  const rule = result.rules.find((candidate) => candidate.id === finding.ruleId);
  lines.push(`- **${finding.ruleId}** ${markdownLocation(finding, options)}: ${finding.title}`);
  lines.push(`  ${finding.message}`);
  if (finding.owner) lines.push(`  Owner: ${finding.owner}`);
  if (rule?.guidance) lines.push(`  Fix: ${rule.guidance}`);
  if (rule?.remediation?.safeAutofix) lines.push(`  Autofix: ${rule.remediation.safeAutofix}`);
  if (rule?.docsUrl) lines.push(`  Docs: ${rule.docsUrl}`);
}

function pushFindingsByFile(lines: string[], findings: Finding[], result: ScanResult, options: ResolvedScanOptions): void {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    const file = relativeFindingPath(finding, options);
    groups.set(file, [...(groups.get(file) ?? []), finding]);
  }

  for (const [file, fileFindings] of groups) {
    lines.push(`### ${file}`, "");
    for (const finding of fileFindings) {
      pushFinding(lines, finding, result, options);
    }
    lines.push("");
  }
  if (lines[lines.length - 1] === "") lines.pop();
}

function pushPackageSummary(lines: string[], findings: Finding[], options: ResolvedScanOptions): void {
  if (options.packages.length === 0) return;
  const packages = options.packages.map((pkg) => ({ ...pkg, label: pkg.label ?? pkg.name }));
  const rows = packages.map((pkg) => {
    const packageFindings = findings.filter((finding) => findingPackage(finding, options, pkg) === pkg.label);
    return {
      label: pkg.label,
      critical: packageFindings.filter((finding) => finding.severity === "critical").length,
      warning: packageFindings.filter((finding) => finding.severity === "warning").length,
      info: packageFindings.filter((finding) => finding.severity === "info").length,
      total: packageFindings.length
    };
  }).filter((row) => row.total > 0);

  if (rows.length === 0) return;
  lines.push("## Package Summary", "");
  lines.push("| Package | Active | Critical | Warnings | Info |");
  lines.push("| --- | ---: | ---: | ---: | ---: |");
  for (const row of rows) {
    lines.push(`| ${row.label} | ${row.total} | ${row.critical} | ${row.warning} | ${row.info} |`);
  }
  lines.push("");
}

function findingPackage(finding: Finding, options: ResolvedScanOptions, pkg: PackageConfig): string | undefined {
  const file = relativeFindingPath(finding, options);
  const packagePath = normalizePath(pkg.path).replace(/\/$/, "");
  return file === packagePath || file.startsWith(`${packagePath}/`) ? (pkg.label ?? pkg.name) : undefined;
}

function issueSummary(result: ScanResult): string {
  const parts = [
    `${result.summary.critical} critical`,
    `${result.summary.warning} ${result.summary.warning === 1 ? "warning" : "warnings"}`
  ];
  if (result.summary.info > 0) parts.push(`${result.summary.info} info`);
  return parts.join(", ");
}

function markdownLocation(finding: Finding, options: ResolvedScanOptions): string {
  const file = relativeFindingPath(finding, options);
  return `\`${file}:${finding.line}:${finding.column}\``;
}

function relativeFindingPath(finding: Finding, options: ResolvedScanOptions): string {
  if (/^https?:\/\//i.test(finding.file)) return finding.file;
  const relative = path.relative(options.rootDir, finding.file);
  return relative && !relative.startsWith("..") ? normalizePath(relative) : normalizePath(path.relative(process.cwd(), finding.file));
}

async function defaultConfigPath(rootDir: string): Promise<string | undefined> {
  const candidate = path.join(rootDir, "cleardom.config.json");
  try {
    await fs.access(candidate);
    return candidate;
  } catch {
    return undefined;
  }
}

function rebaseOptionalPath(value: string | undefined, fromRoot: string, toRoot: string): string | undefined {
  if (!value) return undefined;
  const absolute = path.isAbsolute(value) ? value : path.resolve(fromRoot, value);
  const relative = path.relative(fromRoot, absolute);
  if (relative.startsWith("..")) return value;
  return path.join(toRoot, relative);
}

function rebaseTarget(target: string, fromRoot: string, toRoot: string): string {
  if (/^https?:\/\//i.test(target)) return target;
  const absolute = path.isAbsolute(target) ? target : path.resolve(process.cwd(), target);
  const relative = path.relative(fromRoot, absolute);
  if (relative.startsWith("..")) return path.join(toRoot, path.basename(target));
  return path.join(toRoot, relative);
}

function parseAddedLines(patch: string): Set<number> {
  const added = new Set<number>();
  let line = 0;

  for (const raw of patch.split("\n")) {
    const header = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (header) {
      line = Number(header[1]);
      continue;
    }

    if (raw.startsWith("+") && !raw.startsWith("+++")) {
      added.add(line);
      line += 1;
      continue;
    }

    if (raw.startsWith("-") && !raw.startsWith("---")) {
      continue;
    }

    if (line > 0) line += 1;
  }

  return added;
}

export function extractRuleId(body: string): string {
  return body.match(/\*\*(CDOM[A-Z0-9_]*):/)?.[1] ?? "";
}

async function githubRequest<T = unknown>(context: GithubContext, route: string, init: RequestInit = {}): Promise<T> {
  const { data } = await githubRequestPage<T>(context, route, init);
  return data;
}

export async function githubRequestAll<T = unknown>(context: GithubContext, route: string): Promise<T[]> {
  const items: T[] = [];
  let next: string | undefined = route;

  while (next) {
    const { data, link } = await githubRequestPage<T[]>(context, next);
    items.push(...data);
    next = parseNextLink(link);
  }

  return items;
}

async function githubRequestPage<T = unknown>(context: GithubContext, route: string, init: RequestInit = {}): Promise<{ data: T; link?: string }> {
  const response = await fetch(githubUrl(context, route), {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${context.token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${init.method ?? "GET"} ${route} failed: ${response.status} ${text}`);
  }

  const data = response.status === 204 ? undefined as T : await response.json() as T;
  return { data, link: response.headers.get("link") ?? undefined };
}

function githubUrl(context: GithubContext, route: string): string {
  return /^https?:\/\//i.test(route) ? route : `${context.apiUrl}${route}`;
}

export function parseNextLink(link: string | undefined): string | undefined {
  if (!link) return undefined;
  for (const part of link.split(",")) {
    const match = part.trim().match(/^<([^>]+)>;\s*rel="([^"]+)"$/);
    if (match?.[2] === "next") return match[1];
  }
  return undefined;
}

async function readOptional(resolved: string): Promise<string | undefined> {
  try {
    return await fs.readFile(resolved, "utf8");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}
