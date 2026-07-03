#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";
import { detectAgents, installAgents, parseAgentId } from "./agents.js";
import { createBaseline, writeBaseline } from "./baseline.js";
import { resolveScanOptions } from "./config.js";
import { formatRules, formatSarif, formatScanJson, formatScanResult, formatStandards } from "./format.js";
import { installGithubActions, runGithubPr } from "./github.js";
import { findRule, rules, summarizeRule } from "./rules/index.js";
import { scanPath, scanUrl, shouldFail } from "./scanner.js";
import { standards } from "./standards.js";
import type { ComponentPreset, FailOn, OutputFormat, RuleOption, ScanOptions, SemanticMode } from "./types.js";

const args = process.argv.slice(2).filter((arg, index) => index !== 0 || arg !== "--");
const command = args[0] ?? "scan";
const execFileAsync = promisify(execFile);

try {
  if (command === "scan" || command === "ci") {
    await runScan(command, args.slice(1));
  } else if (command.startsWith("-") || isPathLikeCommand(command) || await pathExists(command)) {
    await runScan("scan", args);
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
    console.log("ClearDOM fix is not automatic yet. Start with `cleardom explain CDOM_4_1_2_UNNAMED_CONTROL` for the smallest safe fix.");
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
  console.log(`Category: ${rule.category}`);
  console.log(`WCAG: ${rule.wcag.join(", ")}`);
  console.log(`Standards: ${rule.standards.map((reference) => reference.level ? `${reference.version} ${reference.criterion} ${reference.level.toUpperCase()}` : `${reference.version} ${reference.criterion}`).join("; ")}`);
  console.log(`Platforms: ${rule.platforms.join(", ")}`);
  console.log("");
  console.log(rule.guidance);
  if (rule.examples.length > 0) {
    console.log("");
    console.log("Examples:");
    for (const example of rule.examples) {
      console.log(`\n${example.label}:`);
      console.log(example.code);
    }
  }
}

function parseScanArgs(values: string[]): { target: string; format?: OutputFormat; writeBaseline?: string; diff: boolean; options: ScanOptions } {
  const options: ScanOptions = {};
  let target = ".";
  let format: OutputFormat | undefined;
  let writeBaselinePath: string | undefined;
  let diff = false;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--json") {
      format = "json";
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

  return { target, format, writeBaseline: writeBaselinePath, diff, options };
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
  let agents = values.length === 0;
  let githubActions = values.length === 0;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--yes" || value === "-y") {
      agents = true;
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

async function runScan(command: "scan" | "ci", values: string[]): Promise<void> {
  const parsed = parseScanArgs(values);
  const options = command === "ci" ? await ciOptions(parsed.target, parsed.options) : parsed.options;
  if (parsed.diff) {
    options.include = await diffIncludes(parsed.target, options);
  }
  const resolvedOptions = await resolveScanOptions(options);
  const result = isUrlTarget(parsed.target)
    ? await scanUrl(parsed.target, resolvedOptions)
    : await scanPath(parsed.target, resolvedOptions);

  if (parsed.writeBaseline) {
    await writeBaseline(parsed.writeBaseline, resolvedOptions.rootDir, resolvedOptions.standard, result.findings);
  }
  console.log(formatScan(result, parsed.format ?? resolvedOptions.format, resolvedOptions.verbose));
  process.exitCode = shouldFail(result, resolvedOptions.failOn) ? 1 : 0;
}

async function githubPrCommand(values: string[]): Promise<void> {
  let dryRun = false;
  let maxComments: number | undefined;
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
    scanArgs.push(value);
  }

  const parsed = parseScanArgs(scanArgs);
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
    console.log(result.comparison ? JSON.stringify(result.comparison, null, 2) : formatScanJson(result.result));
    return;
  }

  if (parsed.format === "sarif") {
    console.log(formatSarif(result.result));
    return;
  }

  console.log(result.summary);
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

function parseFormat(value: string): OutputFormat {
  if (value === "text" || value === "json" || value === "sarif") return value;
  throw new Error("--format must be one of: text, json, sarif");
}

function parseSemanticMode(value: string): SemanticMode {
  if (value === "auto" || value === "off" || value === "required") return value;
  throw new Error("--semantic must be one of: auto, off, required");
}

function parseComponentPreset(value: string): ComponentPreset {
  if (value === "radix" || value === "mui" || value === "react-aria" || value === "react-native" || value === "chakra" || value === "ant-design" || value === "headless-ui" || value === "mantine" || value === "react-bootstrap") return value;
  throw new Error("--component-preset must be one of: radix, mui, react-aria, react-native, chakra, ant-design, headless-ui, mantine, react-bootstrap");
}

function parseRuleOption(value: string): { id: string; option: RuleOption } {
  const [id, option] = value.split("=");
  if (!id || !option) {
    throw new Error("--rule must look like CDOM_4_1_2_UNNAMED_CONTROL=off or CDOM_4_1_2_UNNAMED_CONTROL=warning");
  }
  if (option === "off" || option === "critical" || option === "warning" || option === "info") {
    return { id, option };
  }
  throw new Error("--rule supports off, critical, warning, or info");
}

function requireValue(values: string[], index: number, flag: string): string {
  const value = values[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function help(): void {
  console.log(`ClearDOM finds accessibility, readability, and assistive-tech regressions before they ship.

Usage:
  cleardom [path|url] [--diff] [--format text|json|sarif]
  cleardom install [--yes] [--agents] [--github-actions] [--agent codex|claude|cursor]
  cleardom init [--dry-run]
  cleardom scan [path|url] [--diff] [--format text|json|sarif] [--semantic auto|off|required] [--runtime-url http://localhost:3000] [--baseline cleardom-baseline.json] [--write-baseline cleardom-baseline.json]
  cleardom ci [path] [--format text|json|sarif] [--baseline cleardom-baseline.json]
  cleardom review [path] [--dry-run] [--max-comments 20]
  cleardom agents detect|install|uninstall|upgrade [--agent codex|claude|cursor]
  cleardom explain CDOM_4_1_2_UNNAMED_CONTROL
  cleardom rules
  cleardom standards
  cleardom fix
`);
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

function formatScan(result: Awaited<ReturnType<typeof scanPath>>, format: OutputFormat, verbose: boolean): string {
  if (format === "json") return formatScanJson(result);
  if (format === "sarif") return formatSarif(result);
  return formatScanResult(result, verbose);
}

async function initConfig(values: string[]): Promise<void> {
  const dryRun = values.includes("--dry-run");
  const config = {
    include: ["src/**/*.{js,jsx,ts,tsx,html,vue,svelte,astro,mdx}", "app/**/*.{js,jsx,ts,tsx,html,vue,svelte,astro,mdx}", "components/**/*.{js,jsx,ts,tsx,html,vue,svelte,astro,mdx}", "src/**/*.component.html"],
    exclude: ["src/**/*.test.{js,jsx,ts,tsx}", "src/**/*.spec.{js,jsx,ts,tsx}", "**/*.stories.{js,jsx,ts,tsx,mdx}"],
    standard: "wcag22-aa",
    failOn: "critical",
    format: "text",
    baseline: "cleardom-baseline.json",
    verbose: false,
    runtimeUrl: "",
    semantic: "auto",
    componentPresets: ["radix", "mui", "react-aria"],
    components: {
      IconButton: { role: "button", nameProps: ["aria-label", "label"] },
      Button: { role: "button", nameProps: ["aria-label", "label"] },
      TextInput: { role: "textbox", nameProps: ["aria-label", "label"] }
    },
    rules: {
      CDOM_2_4_4_AMBIGUOUS_LABEL: "warning"
    }
  };
  const output = `${JSON.stringify(config, null, 2)}\n`;
  if (dryRun) {
    console.log(output.trimEnd());
    return;
  }

  const target = path.resolve("cleardom.config.json");
  try {
    await fs.writeFile(target, output, { flag: "wx" });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST") {
      throw new Error("cleardom.config.json already exists. Use `cleardom init --dry-run` to preview the default config.");
    }
    throw error;
  }
  console.log(`Created ${target}`);
}
