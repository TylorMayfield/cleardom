#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";
import { detectAgents, installAgents, parseAgentId } from "./agents.js";
import { mergeBaselineFindings, pruneBaselineFindings, readBaseline, writeBaseline, writeBaselineFile } from "./baseline.js";
import { installManagedBrowser } from "./browser.js";
import { prepareCheck } from "./check.js";
import { help } from "./cli-help.js";
import { parseBaselinePolicy, parseCommentMode, parseComponentPreset, parseFormat, parseReportFormat, parseRuleOption, parseSemanticMode, parseSeverity, requireValue } from "./cli-options.js";
import { resolveScanOptions } from "./config.js";
import { formatDoctor, runDoctor } from "./doctor.js";
import { formatAgentFixJson, formatAgentFixPrompt } from "./fix.js";
import { buildFixPlan, formatFixPlan, formatFixRunResult, formatFixVerification, runSafeFixes, verifyFixRun } from "./fixes.js";
import { formatRules, formatSarif, formatScanHtml, formatScanJson, formatScanResult, formatStandards } from "./format.js";
import { githubWorkflow, installGithubActions, runGithubPr } from "./github.js";
import { runNativeScan } from "./native.js";
import { createScanProgressReporter } from "./progress.js";
import { detectProjectStack, recommendedConfig, type StackDetection } from "./project.js";
import { formatReport, type ReportFormat } from "./report.js";
import { findRule, normalizeRuleId, rules, summarizeRule } from "./rules/index.js";
import { scanPath, scanUrl, shouldFail } from "./scanner.js";
import { standards } from "./standards.js";
import type { FailOn, Finding, OutputFormat, ScanConfig, ScanOptions } from "./types.js";

const args = process.argv.slice(2).filter((arg, index) => index !== 0 || arg !== "--");
const command = args[0] ?? "check";
const execFileAsync = promisify(execFile);

try {
  if (command === "help" || command === "--help" || command === "-h") {
    help(args.includes("--all"));
  } else if (command === "--version" || command === "-v") {
    await printVersion();
  } else if (command === "check" || command === "scan" || command === "ci") {
    await runScan(command, args.slice(1));
  } else if (command.startsWith("-") || isPathLikeCommand(command) || await pathExists(command)) {
    await runScan("check", args);
  } else if (command === "install") {
    await installCommand(args.slice(1));
  } else if (command === "agents") {
    await agentsCommand(args.slice(1));
  } else if (command === "github-pr" || command === "review") {
    await githubPrCommand(args.slice(1));
  } else if (command === "init") {
    await initConfig(args.slice(1));
  } else if (command === "explain") {
    const ruleId = args[1];
    if (!ruleId) {
      throw new Error("Usage: cleardom explain CDOM_4_1_2_UNNAMED_CONTROL");
    }
    explain(ruleId);
  } else if (command === "rules") {
    console.log(formatRules(rules.map((rule) => summarizeRule(rule))));
  } else if (command === "standards") {
    console.log(formatStandards(standards));
  } else if (command === "fix") {
    await fixCommand(args.slice(1));
  } else if (command === "doctor") {
    await doctorCommand(args.slice(1));
  } else if (command === "report") {
    await reportCommand(args.slice(1));
  } else if (command === "suppress") {
    await suppressCommand(args.slice(1));
  } else if (command === "baseline") {
    await baselineCommand(args.slice(1));
  } else if (command === "browser") {
    await browserCommand(args.slice(1));
  } else if (command === "native") {
    await nativeCommand(args.slice(1));
  } else {
    help();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function explain(ruleId: string): void {
  const rule = findRule(ruleId);
  if (!rule) {
    throw new Error(`Unknown rule ${ruleId}. Known rules: ${rules.map((candidate) => candidate.id).join(", ")}`);
  }

  console.log(`${rule.id}: ${rule.title}`);
  console.log("");
  console.log(rule.summary);
  console.log("");
  console.log(`Severity: ${rule.severity}`);
  console.log(`Confidence: ${rule.confidence}`);
  console.log(`Detection: ${rule.detectionMode ?? (rule.confidence === "high" ? "automated" : rule.confidence === "medium" ? "needs-review" : "manual-guidance")}`);
  console.log(`Fix kind: ${rule.fixKind ?? (rule.fixable && rule.confidence === "high" ? "safe-auto-fix" : rule.confidence === "low" ? "manual-review" : "guided-fix")}`);
  console.log(`Category: ${rule.category}`);
  console.log(`WCAG: ${rule.wcag.join(", ")}`);
  console.log(`Standards: ${rule.standards.map((reference) => reference.level ? `${reference.version} ${reference.criterion} ${reference.level.toUpperCase()}` : `${reference.version} ${reference.criterion}`).join("; ")}`);
  console.log(`Platforms: ${rule.platforms.join(", ")}`);
  console.log("");
  console.log(rule.guidance);
  const remediation = rule.remediation ?? {
    before: rule.examples[0]?.code,
    after: rule.examples[1]?.code,
    safeAutofix: rule.fixable ? "Some instances may be safely autofixable when ClearDOM can preserve the accessibility intent mechanically." : undefined,
    manualVerification: "Re-run ClearDOM and verify the user-facing behavior."
  };
  if (remediation.before || remediation.after || remediation.safeAutofix || remediation.manualVerification) {
    console.log("");
    console.log("Remediation:");
    if (remediation.safeAutofix) console.log(`Safe autofix: ${remediation.safeAutofix}`);
    if (remediation.manualVerification) console.log(`Manual verification: ${remediation.manualVerification}`);
    if (remediation.before) {
      console.log("");
      console.log("Before:");
      console.log(remediation.before);
    }
    if (remediation.after) {
      console.log("");
      console.log("After:");
      console.log(remediation.after);
    }
  }
  if (rule.examples.length > 0) {
    console.log("");
    console.log("Examples:");
    for (const example of rule.examples) {
      console.log(`\n${example.label}:`);
      console.log(example.code);
    }
  }
}

function parseScanArgs(values: string[]): { target: string; format?: OutputFormat; writeBaseline?: string; diff: boolean; includeRules: boolean; scoreOnly: boolean; sourceOnly: boolean; options: ScanOptions } {
  const options: ScanOptions = {};
  let target = ".";
  let format: OutputFormat | undefined;
  let writeBaselinePath: string | undefined;
  let diff = false;
  let includeRules = false;
  let scoreOnly = false;
  let sourceOnly = false;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--json") {
      format = "json";
      continue;
    }

    if (value === "--include-rules") {
      includeRules = true;
      continue;
    }

    if (value === "--score") {
      scoreOnly = true;
      continue;
    }

    if (value === "--verbose") {
      options.verbose = true;
      continue;
    }

    if (value === "--diff") {
      diff = true;
      continue;
    }

    if (value === "--source-only") {
      sourceOnly = true;
      continue;
    }

    if (value === "--format") {
      format = parseFormat(requireValue(values, index, "--format"));
      options.format = format;
      index += 1;
      continue;
    }

    if (value === "--config") {
      options.configPath = requireValue(values, index, "--config");
      index += 1;
      continue;
    }

    if (value === "--fail-on") {
      options.failOn = parseFailOn(requireValue(values, index, "--fail-on"));
      index += 1;
      continue;
    }

    if (value === "--baseline") {
      options.baseline = requireValue(values, index, "--baseline");
      index += 1;
      continue;
    }

    if (value === "--write-baseline") {
      writeBaselinePath = requireValue(values, index, "--write-baseline");
      index += 1;
      continue;
    }

    if (value === "--standard") {
      options.standard = requireValue(values, index, "--standard") as ScanOptions["standard"];
      index += 1;
      continue;
    }

    if (value === "--runtime-url") {
      options.runtimeUrl = requireValue(values, index, "--runtime-url");
      index += 1;
      continue;
    }

    if (value === "--semantic") {
      options.semantic = parseSemanticMode(requireValue(values, index, "--semantic"));
      index += 1;
      continue;
    }

    if (value === "--component-preset") {
      options.componentPresets = [...(options.componentPresets ?? []), parseComponentPreset(requireValue(values, index, "--component-preset"))];
      index += 1;
      continue;
    }

    if (value === "--rule") {
      const ruleOption = parseRuleOption(requireValue(values, index, "--rule"));
      options.rules = { ...options.rules, [ruleOption.id]: ruleOption.option };
      index += 1;
      continue;
    }

    if (!value.startsWith("--")) {
      target = value;
    }
  }

  return { target, format, writeBaseline: writeBaselinePath, diff, includeRules, scoreOnly, sourceOnly, options };
}

async function installCommand(values: string[]): Promise<void> {
  const parsed = parseInstallArgs(values);
  const lines = ["Installed ClearDOM developer workflow", ""];

  if (parsed.githubActions) {
    const workflow = await installGithubActions(process.cwd());
    lines.push(`  ${workflow.status.padEnd(9)} ${workflow.filePath} (GitHub Actions PR review)`);
  }

  if (parsed.agents) {
    const results = await installAgents(process.cwd(), parsed.agentIds, "install");
    lines.push(...results.map((result) => `  ${result.status.padEnd(9)} ${result.filePath} (${result.label})`));
  }

  if (!parsed.githubActions && !parsed.agents) {
    lines.push("  nothing   No install targets selected");
  }

  console.log(lines.join("\n"));
}

async function agentsCommand(values: string[]): Promise<void> {
  const subcommand = values[0] ?? "detect";
  const parsed = parseAgentArgs(values.slice(1));

  if (subcommand === "detect") {
    const results = await detectAgents(process.cwd(), parsed.agentIds);
    console.log(formatAgentDetectionResults(results));
    return;
  }

  if (subcommand === "install" || subcommand === "upgrade") {
    const results = await installAgents(process.cwd(), parsed.agentIds, "install");
    console.log(formatAgentInstallResults(subcommand === "upgrade" ? "Upgraded ClearDOM agent guidance" : "Installed ClearDOM agent guidance", results));
    return;
  }

  if (subcommand === "uninstall") {
    const results = await installAgents(process.cwd(), parsed.agentIds, "uninstall");
    console.log(formatAgentInstallResults("Removed ClearDOM agent guidance", results));
    return;
  }

  throw new Error("Usage: cleardom agents detect|install|uninstall|upgrade [--agent codex|claude|cursor]");
}

function parseAgentArgs(values: string[]): { agents: boolean; agentIds: Array<ReturnType<typeof parseAgentId>> } {
  const agentIds: Array<ReturnType<typeof parseAgentId>> = [];
  let agents = false;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--agents") {
      agents = true;
      continue;
    }

    if (value === "--yes" || value === "-y") {
      continue;
    }

    if (value === "--agent") {
      agentIds.push(parseAgentId(requireValue(values, index, "--agent")));
      agents = true;
      index += 1;
      continue;
    }

    throw new Error("Usage: cleardom install --agents [--agent codex|claude|cursor] [--yes]");
  }

  return { agents, agentIds };
}

function parseInstallArgs(values: string[]): { agents: boolean; githubActions: boolean; agentIds: Array<ReturnType<typeof parseAgentId>> } {
  const agentIds: Array<ReturnType<typeof parseAgentId>> = [];
  let agents = false;
  let githubActions = values.length === 0;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--yes" || value === "-y") {
      githubActions = true;
      continue;
    }

    if (value === "--agents") {
      agents = true;
      continue;
    }

    if (value === "--github-actions") {
      githubActions = true;
      continue;
    }

    if (value === "--no-github-actions") {
      githubActions = false;
      continue;
    }

    if (value === "--agent") {
      agentIds.push(parseAgentId(requireValue(values, index, "--agent")));
      agents = true;
      index += 1;
      continue;
    }

    throw new Error("Usage: cleardom install [--yes] [--agents] [--github-actions] [--no-github-actions] [--agent codex|claude|cursor]");
  }

  return { agents, githubActions, agentIds };
}

function formatAgentInstallResults(title: string, results: Awaited<ReturnType<typeof installAgents>>): string {
  return [
    title,
    "",
    ...results.map((result) => `  ${result.status.padEnd(9)} ${result.filePath} (${result.label})`)
  ].join("\n");
}

function formatAgentDetectionResults(results: Awaited<ReturnType<typeof detectAgents>>): string {
  return [
    "ClearDOM agent guidance",
    "",
    ...results.map((result) => `  ${result.installed ? "installed" : "missing  "} ${result.filePath} (${result.label})`)
  ].join("\n");
}

async function runScan(command: "check" | "scan" | "ci", values: string[]): Promise<void> {
  const parsed = parseScanArgs(values);
  let options = command === "ci" ? await ciOptions(parsed.target, parsed.options) : parsed.options;
  if (parsed.diff) {
    options.include = await diffIncludes(parsed.target, options);
  }
  const prepared = command === "check" ? await prepareCheck(parsed.target, options, parsed.sourceOnly) : undefined;
  if (prepared) options = prepared.options;
  let progressReporter: ReturnType<typeof createScanProgressReporter> | undefined;
  try {
    const resolvedOptions = await resolveOptionsForTarget(options, parsed.target);
    const outputFormat = parsed.format ?? resolvedOptions.format;
    const showProgress = outputFormat === "text" && !parsed.scoreOnly;
    progressReporter = showProgress ? createScanProgressReporter() : undefined;
    if (showProgress && prepared?.messages.length) process.stderr.write(`${prepared.messages.join("\n")}\n`);
    const result = isUrlTarget(parsed.target)
      ? await scanUrl(parsed.target, resolvedOptions, undefined, progressReporter?.report)
      : await scanPath(parsed.target, resolvedOptions, progressReporter?.report);

    if (parsed.writeBaseline) {
      await writeBaseline(parsed.writeBaseline, resolvedOptions.rootDir, resolvedOptions.standard, result.findings);
    }
    const output = await formatScan(result, parsed.format ?? resolvedOptions.format, resolvedOptions.verbose, parsed.includeRules, parsed.scoreOnly, parsed.target);
    console.log(output);
    process.exitCode = shouldFail(result, resolvedOptions.failOn) ? 1 : 0;
  } finally {
    progressReporter?.finish();
    await prepared?.close();
  }
}

async function resolveOptionsForTarget(options: ScanOptions, target: string) {
  if (options.configPath || isUrlTarget(target)) return await resolveScanOptions(options);
  const resolved = path.resolve(target);
  try {
    const stat = await fs.stat(resolved);
    return await resolveScanOptions(options, stat.isDirectory() ? resolved : path.dirname(resolved));
  } catch {
    return await resolveScanOptions(options);
  }
}

async function githubPrCommand(values: string[]): Promise<void> {
  let dryRun = false;
  let maxComments: number | undefined;
  const pr: NonNullable<ScanOptions["pr"]> = {};
  const scanArgs: string[] = [];

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (value === "--max-comments") {
      maxComments = Number(requireValue(values, index, "--max-comments"));
      if (!Number.isInteger(maxComments) || maxComments < 0) {
        throw new Error("--max-comments must be a non-negative integer");
      }
      index += 1;
      continue;
    }
    if (value === "--severity-threshold") {
      pr.severityThreshold = parseSeverity(requireValue(values, index, "--severity-threshold"));
      index += 1;
      continue;
    }
    if (value === "--comment-mode") {
      pr.commentMode = parseCommentMode(requireValue(values, index, "--comment-mode"));
      index += 1;
      continue;
    }
    if (value === "--changed-files-only") {
      pr.changedFilesOnly = true;
      continue;
    }
    if (value === "--no-changed-files-only") {
      pr.changedFilesOnly = false;
      continue;
    }
    if (value === "--baseline-policy") {
      pr.baselinePolicy = parseBaselinePolicy(requireValue(values, index, "--baseline-policy"));
      index += 1;
      continue;
    }
    if (value === "--status-check-name") {
      pr.statusCheckName = requireValue(values, index, "--status-check-name");
      index += 1;
      continue;
    }
    if (value === "--upload-sarif") {
      pr.uploadSarif = true;
      continue;
    }
    scanArgs.push(value);
  }

  const parsed = parseScanArgs(scanArgs);
  parsed.options.pr = { ...parsed.options.pr, ...pr };
  if (parsed.diff) {
    parsed.options.include = await diffIncludes(parsed.target, parsed.options);
  }
  const result = await runGithubPr({
    target: parsed.target,
    options: await ciOptions(parsed.target, parsed.options),
    format: parsed.format,
    writeBaseline: parsed.writeBaseline,
    dryRun,
    maxComments
  });

  if (parsed.format === "json") {
    console.log(result.comparison ? JSON.stringify(result.comparison, null, 2) : formatScanJson(result.result, { includeRules: parsed.includeRules }));
    return;
  }

  if (parsed.format === "sarif") {
    console.log(formatSarif(result.result));
    return;
  }

  console.log(result.summary);
}

async function fixCommand(values: string[]): Promise<void> {
  const parsed = parseFixArgs(values);
  if (parsed.verify && !parsed.apply) {
    throw new Error("--verify requires --apply. `cleardom fix --apply` verifies automatically.");
  }
  if (parsed.scan.diff) {
    parsed.scan.options.include = await diffIncludes(parsed.scan.target, parsed.scan.options);
  }

  let resolvedOptions = await resolveOptionsForTarget({ ...parsed.scan.options, failOn: "none" }, parsed.scan.target);
  const prepared = parsed.apply && !isUrlTarget(parsed.scan.target)
    ? await prepareCheck(parsed.scan.target, resolvedOptions, parsed.scan.sourceOnly)
    : undefined;
  if (prepared) resolvedOptions = await resolveOptionsForTarget(prepared.options, parsed.scan.target);

  try {
    const result = isUrlTarget(parsed.scan.target)
      ? await scanUrl(parsed.scan.target, resolvedOptions)
      : await scanPath(parsed.scan.target, resolvedOptions);
    const fixPrompt = await formatAgentFixPrompt(result, resolvedOptions, {
      target: parsed.scan.target,
      agent: parsed.agent,
      ruleIds: parsed.ruleIds,
      file: parsed.file,
      limit: parsed.limit
    });

    if (parsed.plan) {
      const plan = buildFixPlan(fixPrompt.findings, result.rules, resolvedOptions, parsed.scan.target);
      console.log(formatFixPlan(plan, parsed.planFormat));
      return;
    }

    if (parsed.preview) {
      console.log(formatFixRunResult(await runSafeFixes(fixPrompt.findings, false), false));
      return;
    }

    if (parsed.apply) {
      const applied = await runSafeFixes(fixPrompt.findings, true);
      const after = isUrlTarget(parsed.scan.target)
        ? await scanUrl(parsed.scan.target, resolvedOptions)
        : await scanPath(parsed.scan.target, resolvedOptions);
      const verification = verifyFixRun(result.activeFindings, fixPrompt.findings, after.activeFindings);
      if (parsed.scan.format === "json") {
        console.log(JSON.stringify({
          schemaVersion: 1,
          kind: "cleardom-fix-verification",
          target: parsed.scan.target,
          applied: {
            edits: applied.applied,
            error: applied.error,
            actions: applied.actions.map((action) => ({
              ruleId: action.finding.ruleId,
              fingerprint: action.finding.fingerprint,
              outcome: action.outcome,
              reason: action.reason
            }))
          },
          verification: {
            fixed: verification.fixed.map((finding) => finding.fingerprint),
            remaining: verification.remaining.map((finding) => finding.fingerprint),
            introduced: verification.introduced.map((finding) => finding.fingerprint)
          },
          before: result.outcome,
          after: after.outcome
        }, null, 2));
        if (verification.introduced.length > 0) process.exitCode = 1;
        return;
      }
      const preparation = prepared?.messages.length ? `${prepared.messages.join("\n")}\n\n` : "";
      console.log(`${preparation}${formatFixRunResult(applied, true)}\n\n${formatFixVerification(verification)}`);
      if (verification.introduced.length > 0) process.exitCode = 1;
      return;
    }

    if (parsed.scan.format === "json") {
      console.log(formatAgentFixJson(result, resolvedOptions, {
        target: parsed.scan.target,
        agent: parsed.agent,
        ruleIds: parsed.ruleIds,
        file: parsed.file,
        limit: parsed.limit
      }, fixPrompt));
      return;
    }

    console.log(fixPrompt.prompt);
  } finally {
    await prepared?.close();
  }
}

function parseFixArgs(values: string[]): {
  scan: ReturnType<typeof parseScanArgs>;
  agent: ReturnType<typeof parseAgentId>;
  ruleIds: string[];
  file?: string;
  limit: number;
  apply: boolean;
  preview: boolean;
  plan: boolean;
  verify: boolean;
  planFormat: "text" | "json" | "markdown";
} {
  const scanArgs: string[] = [];
  const ruleIds: string[] = [];
  let agent: ReturnType<typeof parseAgentId> = "codex";
  let file: string | undefined;
  let limit = 1;
  let limitSet = false;
  let apply = false;
  let preview = false;
  let plan = false;
  let verify = false;
  let planFormat: "text" | "json" | "markdown" = "text";

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--agent") {
      agent = parseAgentId(requireValue(values, index, "--agent"));
      index += 1;
      continue;
    }

    if (value === "--file") {
      file = requireValue(values, index, "--file");
      index += 1;
      continue;
    }

    if (value === "--limit") {
      limit = Number(requireValue(values, index, "--limit"));
      if (!Number.isInteger(limit) || limit < 1) {
        throw new Error("--limit must be a positive integer");
      }
      limitSet = true;
      index += 1;
      continue;
    }

    if (value === "--interactive") {
      limit = 1;
      continue;
    }

    if (value === "--apply") {
      apply = true;
      continue;
    }

    if (value === "--verify") {
      verify = true;
      continue;
    }

    if (value === "--preview") {
      preview = true;
      continue;
    }

    if (value === "--plan") {
      plan = true;
      limit = Number.MAX_SAFE_INTEGER;
      continue;
    }

    if (value === "--format" && plan) {
      const format = requireValue(values, index, "--format");
      if (format !== "text" && format !== "json" && format !== "markdown") {
        throw new Error("fix --plan --format must be one of: text, json, markdown");
      }
      planFormat = format;
      index += 1;
      continue;
    }

    if (value === "--rule") {
      const ruleValue = requireValue(values, index, "--rule");
      if (ruleValue.includes("=")) {
        scanArgs.push(value, ruleValue);
      } else {
        ruleIds.push(normalizeRuleId(ruleValue));
      }
      index += 1;
      continue;
    }

    scanArgs.push(value);
  }

  if ((apply || preview) && !limitSet) limit = Number.MAX_SAFE_INTEGER;

  return {
    scan: parseScanArgs(scanArgs),
    agent,
    ruleIds,
    file,
    limit,
    apply,
    preview,
    plan,
    verify,
    planFormat
  };
}

async function doctorCommand(values: string[]): Promise<void> {
  const parsed = parseScanArgs(values);
  const result = await runDoctor(parsed.options, path.resolve(parsed.target));
  console.log(formatDoctor(result));
  process.exitCode = result.ok ? 0 : 1;
}

async function reportCommand(values: string[]): Promise<void> {
  const parsed = parseReportArgs(values);
  if (parsed.scan.diff) {
    parsed.scan.options.include = await diffIncludes(parsed.scan.target, parsed.scan.options);
  }

  const resolvedOptions = await resolveScanOptions({ ...parsed.scan.options, failOn: "none" });
  const result = isUrlTarget(parsed.scan.target)
    ? await scanUrl(parsed.scan.target, resolvedOptions)
    : await scanPath(parsed.scan.target, resolvedOptions);
  const output = formatReport(result, resolvedOptions, parsed.reportFormat);

  if (parsed.output) {
    const outputPath = path.resolve(parsed.output);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, output, "utf8");
    console.log(`Wrote ClearDOM ${parsed.reportFormat} report to ${outputPath}`);
    return;
  }

  console.log(output);
}

function parseReportArgs(values: string[]): { scan: ReturnType<typeof parseScanArgs>; reportFormat: ReportFormat; output?: string } {
  const scanArgs: string[] = [];
  let reportFormat: ReportFormat = "html";
  let output: string | undefined;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--format") {
      reportFormat = parseReportFormat(requireValue(values, index, "--format"));
      index += 1;
      continue;
    }
    if (value === "--output" || value === "-o") {
      output = requireValue(values, index, value);
      index += 1;
      continue;
    }
    scanArgs.push(value);
  }

  return { scan: parseScanArgs(scanArgs), reportFormat, output };
}

async function suppressCommand(values: string[]): Promise<void> {
  const parsed = parseSuppressionArgs(values);
  const resolvedOptions = await resolveScanOptions({ ...parsed.scan.options, baseline: undefined, failOn: "none" });
  const result = isUrlTarget(parsed.scan.target)
    ? await scanUrl(parsed.scan.target, resolvedOptions)
    : await scanPath(parsed.scan.target, resolvedOptions);
  const findings = filterFindings(result.activeFindings, resolvedOptions.rootDir, parsed.ruleIds, parsed.file).slice(0, parsed.limit);
  const baselinePath = parsed.baseline ?? parsed.scan.options.baseline ?? resolvedOptions.baseline ?? "cleardom-baseline.json";
  const existing = await readBaseline(baselinePath, resolvedOptions.rootDir).catch(() => undefined);
  const baseline = mergeBaselineFindings(existing, resolvedOptions.standard, findings);

  if (parsed.dryRun) {
    console.log(`Would suppress ${findings.length} ${findings.length === 1 ? "finding" : "findings"} in ${baselinePath}.`);
    return;
  }

  await writeBaselineFile(baselinePath, resolvedOptions.rootDir, baseline);
  console.log(`Suppressed ${findings.length} ${findings.length === 1 ? "finding" : "findings"} in ${baselinePath}.`);
}

function parseSuppressionArgs(values: string[]): {
  scan: ReturnType<typeof parseScanArgs>;
  ruleIds: string[];
  file?: string;
  limit: number;
  baseline?: string;
  dryRun: boolean;
} {
  const scanArgs: string[] = [];
  const ruleIds: string[] = [];
  let file: string | undefined;
  let limit = Number.POSITIVE_INFINITY;
  let baseline: string | undefined;
  let dryRun = false;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--rule") {
      const ruleValue = requireValue(values, index, "--rule");
      if (ruleValue.includes("=")) {
        scanArgs.push(value, ruleValue);
      } else {
        ruleIds.push(normalizeRuleId(ruleValue));
      }
      index += 1;
      continue;
    }
    if (value === "--file") {
      file = requireValue(values, index, "--file");
      index += 1;
      continue;
    }
    if (value === "--limit") {
      limit = Number(requireValue(values, index, "--limit"));
      if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");
      index += 1;
      continue;
    }
    if (value === "--baseline") {
      baseline = requireValue(values, index, "--baseline");
      index += 1;
      continue;
    }
    if (value === "--dry-run") {
      dryRun = true;
      continue;
    }
    scanArgs.push(value);
  }

  return { scan: parseScanArgs(scanArgs), ruleIds, file, limit, baseline, dryRun };
}

async function baselineCommand(values: string[]): Promise<void> {
  const subcommand = values[0];
  if (subcommand !== "update" && subcommand !== "prune") {
    throw new Error("Usage: cleardom baseline update|prune [path] [--baseline cleardom-baseline.json]");
  }

  const parsed = parseScanArgs(values.slice(1));
  const resolvedOptions = await resolveScanOptions({ ...parsed.options, baseline: undefined, failOn: "none" });
  const result = isUrlTarget(parsed.target)
    ? await scanUrl(parsed.target, resolvedOptions)
    : await scanPath(parsed.target, resolvedOptions);
  const baselinePath = parsed.options.baseline ?? resolvedOptions.baseline ?? "cleardom-baseline.json";

  if (subcommand === "update") {
    await writeBaseline(baselinePath, resolvedOptions.rootDir, resolvedOptions.standard, result.findings);
    console.log(`Updated ${baselinePath} with ${result.findings.length} current ${result.findings.length === 1 ? "finding" : "findings"}.`);
    return;
  }

  const existing = await readBaseline(baselinePath, resolvedOptions.rootDir);
  if (!existing) {
    throw new Error(`Could not read ClearDOM baseline at ${baselinePath}`);
  }
  const pruned = pruneBaselineFindings(existing, result.findings);
  await writeBaselineFile(baselinePath, resolvedOptions.rootDir, pruned);
  const removed = existing.findings.length - pruned.findings.length;
  console.log(`Pruned ${removed} stale ${removed === 1 ? "finding" : "findings"} from ${baselinePath}.`);
}

async function browserCommand(values: string[]): Promise<void> {
  const subcommand = values[0] ?? "install";
  if (subcommand !== "install") {
    throw new Error("Usage: cleardom browser install");
  }
  const executablePath = await installManagedBrowser(process.cwd());
  console.log(`Installed ClearDOM managed browser at ${executablePath}`);
}

async function nativeCommand(values: string[]): Promise<void> {
  const subcommand = values[0] ?? "scan";
  if (subcommand !== "scan") {
    throw new Error("Usage: cleardom native scan [path] [--format text|json|sarif|html]");
  }
  const parsed = parseScanArgs(values.slice(1));
  const resolvedOptions = await resolveScanOptions({ ...parsed.options, native: { ...parsed.options.native, enabled: true } });
  const staticResult = await scanPath(parsed.target, resolvedOptions);
  const result = await runNativeScan(parsed.target, resolvedOptions, staticResult);
  console.log(await formatScan(result, parsed.format ?? resolvedOptions.format, resolvedOptions.verbose, parsed.includeRules, parsed.scoreOnly));
  process.exitCode = shouldFail(result, resolvedOptions.failOn) ? 1 : 0;
}

function filterFindings(findings: Finding[], rootDir: string, ruleIds: string[], file?: string): Finding[] {
  const requestedRules = new Set(ruleIds.map((ruleId) => ruleId.toLowerCase()));
  const requestedFile = file ? path.resolve(rootDir, file) : undefined;
  return findings.filter((finding) => {
    if (requestedRules.size > 0 && !requestedRules.has(finding.ruleId.toLowerCase())) return false;
    if (!requestedFile) return true;
    if (/^https?:\/\//i.test(finding.file)) return finding.file === file;
    return path.resolve(finding.file) === requestedFile || normalizePath(path.relative(rootDir, finding.file)) === normalizePath(file ?? "");
  });
}

async function ciOptions(target: string, options: ScanOptions): Promise<ScanOptions> {
  return {
    ...options,
    baseline: options.baseline ?? await defaultCiBaseline(target, options),
    failOn: options.failOn ?? "regression"
  };
}

async function defaultCiBaseline(target: string, options: ScanOptions): Promise<string | undefined> {
  const baseline = "cleardom-baseline.json";
  const root = options.configPath ? path.dirname(path.resolve(options.configPath)) : path.resolve(isUrlTarget(target) ? "." : target);
  try {
    const stat = await fs.stat(root);
    const directory = stat.isDirectory() ? root : path.dirname(root);
    const baselinePath = path.join(directory, baseline);
    await fs.access(baselinePath);
    return baselinePath;
  } catch {
    return undefined;
  }
}

function isUrlTarget(target: string): boolean {
  return /^https?:\/\//i.test(target);
}

function parseFailOn(value: string): FailOn {
  if (value === "none" || value === "critical" || value === "warning" || value === "findings" || value === "regression") {
    return value;
  }
  throw new Error("--fail-on must be one of: none, critical, warning, findings, regression");
}

async function diffIncludes(target: string, options: ScanOptions): Promise<string[]> {
  if (isUrlTarget(target)) {
    throw new Error("--diff can only scan local files.");
  }

  const resolvedOptions = await resolveScanOptions(options);
  const targetRoot = path.resolve(target);
  const rootDir = resolvedOptions.rootDir;
  const changed = await changedFiles(rootDir);
  const insideTarget = changed.filter((file) => {
    const absolute = path.resolve(rootDir, file);
    return absolute === targetRoot || absolute.startsWith(`${targetRoot}${path.sep}`) || targetRoot === rootDir;
  });

  if (insideTarget.length === 0) {
    return ["__cleardom_no_changed_files__"];
  }

  return insideTarget.map((file) => normalizePath(file));
}

async function changedFiles(rootDir: string): Promise<string[]> {
  const base = await git(["merge-base", "HEAD", "origin/main"], rootDir)
    .catch(() => git(["merge-base", "HEAD", "main"], rootDir))
    .catch(() => git(["rev-parse", "HEAD"], rootDir))
    .catch(() => "");
  const tracked = await git(["diff", "--name-only", "--diff-filter=ACMRTUXB", base.trim() || "HEAD", "--"], rootDir)
    .catch(() => "");
  const unstaged = await git(["diff", "--name-only", "--diff-filter=ACMRTUXB", "--"], rootDir)
    .catch(() => "");
  const staged = await git(["diff", "--cached", "--name-only", "--diff-filter=ACMRTUXB", "--"], rootDir)
    .catch(() => "");
  const untracked = await git(["ls-files", "--others", "--exclude-standard"], rootDir)
    .catch(() => "");
  return uniqueLines([tracked, unstaged, staged, untracked].join("\n"));
}

async function git(args: string[], cwd: string): Promise<string> {
  const result = await execFileAsync("git", args, { cwd });
  return result.stdout;
}

function uniqueLines(value: string): string[] {
  return [...new Set(value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
}

function isPathLikeCommand(value: string): boolean {
  return value === "." || value === ".." || value.startsWith("/") || value.startsWith("./") || value.startsWith("../") || /^https?:\/\//i.test(value);
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

async function pathExists(value: string): Promise<boolean> {
  try {
    await fs.access(value);
    return true;
  } catch {
    return false;
  }
}

async function formatScan(result: Awaited<ReturnType<typeof scanPath>>, format: OutputFormat, verbose: boolean, includeRules = false, scoreOnly = false, target = "."): Promise<string> {
  if (scoreOnly) return String(result.score);
  if (format === "json") return formatScanJson(result, { includeRules });
  if (format === "sarif") return formatSarif(result);
  return formatScanResult(result, verbose, await packageVersion(), target, Boolean(process.stdout.isTTY && !process.env.NO_COLOR));
}

async function printVersion(): Promise<void> {
  console.log(await packageVersion());
}

async function packageVersion(): Promise<string> {
  const packageJson = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8")) as { version?: string };
  return packageJson.version ?? "unknown";
}

async function initConfig(values: string[]): Promise<void> {
  const parsed = parseInitArgs(values);
  const rootDir = path.resolve(parsed.target);
  const detection = await detectProjectStack(rootDir);
  const config = recommendedConfig(detection);
  const output = `${JSON.stringify(config, null, 2)}\n`;

  if (parsed.dryRun) {
    console.log(output.trimEnd());
    return;
  }

  const changed: string[] = [];
  const next: string[] = [];
  const target = path.join(rootDir, "cleardom.config.json");
  try {
    await fs.writeFile(target, output, { flag: "wx" });
    changed.push(`created   ${relativeOrAbsolute(rootDir, target)} (${detection.summary})`);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST") {
      throw new Error("cleardom.config.json already exists. Use `cleardom init --dry-run` to preview the recommended config.");
    }
    throw error;
  }

  if (parsed.createBaseline) {
    const resolvedOptions = await resolveScanOptions({ configPath: target }, rootDir);
    const result = await scanPath(rootDir, { configPath: target, baseline: "" });
    await writeBaseline(config.baseline ?? "cleardom-baseline.json", resolvedOptions.rootDir, resolvedOptions.standard, result.findings);
    changed.push(`created   ${config.baseline ?? "cleardom-baseline.json"} (${result.findings.length} current findings captured)`);
  } else {
    next.push("Run the complete check: cleardom check .");
  }

  if (parsed.installCi) {
    const workflow = await installGithubActions(rootDir);
    changed.push(`${workflow.status.padEnd(9)} ${workflow.filePath} (GitHub Actions PR review)`);
  } else if (parsed.ciDryRun) {
    changed.push("previewed .github/workflows/cleardom.yml (not written)");
  } else {
    next.push("Preview CI setup: cleardom init --ci-dry-run");
  }

  next.push("Apply safe fixes and verify: cleardom fix . --apply");
  next.push("Install pull-request protection: cleardom install");

  console.log(formatInitSummary(rootDir, detection, config, changed, next, parsed.ciDryRun));
}

type InitOptions = {
  dryRun: boolean;
  target: string;
  createBaseline: boolean;
  ciDryRun: boolean;
  installCi: boolean;
};

function parseInitArgs(values: string[]): InitOptions {
  const options: InitOptions = {
    dryRun: false,
    target: ".",
    createBaseline: false,
    ciDryRun: false,
    installCi: false
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (value === "--yes" || value === "-y") {
      continue;
    }
    if (value === "--target") {
      options.target = requireValue(values, index, "--target");
      index += 1;
      continue;
    }
    if (value === "--create-baseline" || value === "--baseline") {
      options.createBaseline = true;
      continue;
    }
    if (value === "--ci-dry-run") {
      options.ciDryRun = true;
      continue;
    }
    if (value === "--install-ci" || value === "--github-actions") {
      options.installCi = true;
      continue;
    }
    throw new Error("Usage: cleardom init [--dry-run] [--yes] [--target path] [--create-baseline] [--ci-dry-run] [--install-ci]");
  }

  return options;
}

function formatInitSummary(rootDir: string, detection: StackDetection, config: ScanConfig, changed: string[], next: string[], showWorkflow: boolean): string {
  const scaffolded = [
    "source scanning",
    "runtime browser checks",
    "safe autofix planning",
    "ownership routing",
    "suppression policy",
    "native simulator checks"
  ];
  const lines = [
    "ClearDOM setup wizard",
    "",
    `Project: ${rootDir}`,
    `Detected: ${detection.summary}`,
    `Recommended stack config: ${config.standard}, semantic ${config.semantic}, fail on ${config.failOn}`,
    `Component presets: ${(config.componentPresets ?? []).join(", ") || "none"}`,
    `Scaffolded paths: ${scaffolded.join(", ")}`,
    "",
    "What changed:",
    ...changed.map((line) => `  ${line}`)
  ];

  if (showWorkflow) {
    lines.push("", "CI dry-run preview:", indent(githubWorkflow().trimEnd(), "  "));
  }

  lines.push("", "Next steps:", ...next.map((line) => `  ${line}`));
  return lines.join("\n");
}

function indent(value: string, prefix: string): string {
  return value.split(/\r?\n/).map((line) => `${prefix}${line}`).join("\n");
}

function relativeOrAbsolute(rootDir: string, filePath: string): string {
  const relative = path.relative(rootDir, filePath);
  return relative && !relative.startsWith("..") ? relative : filePath;
}
