#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";
import { detectAgents, installAgents, parseAgentId } from "./agents.js";
import { createBaseline, writeBaseline } from "./baseline.js";
import { resolveScanOptions } from "./config.js";
import { formatAgentFixPrompt } from "./fix.js";
import { formatRules, formatSarif, formatScanJson, formatScanResult, formatStandards } from "./format.js";
import { githubWorkflow, installGithubActions, runGithubPr } from "./github.js";
import { findRule, normalizeRuleId, rules, summarizeRule } from "./rules/index.js";
import { scanPath, scanUrl, shouldFail } from "./scanner.js";
import { standards } from "./standards.js";
import type { ComponentPreset, FailOn, OutputFormat, RuleOption, ScanConfig, ScanOptions, SemanticMode } from "./types.js";

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
    await fixCommand(args.slice(1));
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

async function fixCommand(values: string[]): Promise<void> {
  const parsed = parseFixArgs(values);
  if (parsed.scan.diff) {
    parsed.scan.options.include = await diffIncludes(parsed.scan.target, parsed.scan.options);
  }

  const resolvedOptions = await resolveScanOptions({ ...parsed.scan.options, failOn: "none" });
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

  console.log(fixPrompt.prompt);
}

function parseFixArgs(values: string[]): {
  scan: ReturnType<typeof parseScanArgs>;
  agent: ReturnType<typeof parseAgentId>;
  ruleIds: string[];
  file?: string;
  limit: number;
} {
  const scanArgs: string[] = [];
  const ruleIds: string[] = [];
  let agent: ReturnType<typeof parseAgentId> = "codex";
  let file: string | undefined;
  let limit = 1;

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
      index += 1;
      continue;
    }

    if (value === "--interactive") {
      limit = 1;
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

  return {
    scan: parseScanArgs(scanArgs),
    agent,
    ruleIds,
    file,
    limit
  };
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
  cleardom init [--dry-run] [--yes] [--target path] [--create-baseline] [--ci-dry-run] [--install-ci]
  cleardom scan [path|url] [--diff] [--format text|json|sarif] [--semantic auto|off|required] [--runtime-url http://localhost:3000] [--baseline cleardom-baseline.json] [--write-baseline cleardom-baseline.json]
  cleardom ci [path] [--format text|json|sarif] [--baseline cleardom-baseline.json]
  cleardom review [path] [--dry-run] [--max-comments 20]
  cleardom agents detect|install|uninstall|upgrade [--agent codex|claude|cursor]
  cleardom explain CDOM_4_1_2_UNNAMED_CONTROL
  cleardom rules
  cleardom standards
  cleardom fix [path] [--agent codex|claude|cursor] [--rule CDOM_4_1_2_UNNAMED_CONTROL] [--file src/App.tsx] [--limit 1]
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
    next.push(`Create a starting baseline: cleardom scan . --write-baseline ${config.baseline ?? "cleardom-baseline.json"}`);
  }

  if (parsed.installCi) {
    const workflow = await installGithubActions(rootDir);
    changed.push(`${workflow.status.padEnd(9)} ${workflow.filePath} (GitHub Actions PR review)`);
  } else if (parsed.ciDryRun) {
    changed.push("previewed .github/workflows/cleardom.yml (not written)");
  } else {
    next.push("Preview CI setup: cleardom init --ci-dry-run");
  }

  next.push("Run locally: cleardom scan .");
  next.push("Gate only new issues in CI: cleardom ci .");

  console.log(formatInitSummary(rootDir, detection, config, changed, next, parsed.ciDryRun));
}

type InitOptions = {
  dryRun: boolean;
  target: string;
  createBaseline: boolean;
  ciDryRun: boolean;
  installCi: boolean;
};

type StackDetection = {
  frameworks: string[];
  uiLibraries: ComponentPreset[];
  packageManagers: string[];
  hasTests: boolean;
  hasStorybook: boolean;
  hasRuntimeApp: boolean;
  summary: string;
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

async function detectProjectStack(rootDir: string): Promise<StackDetection> {
  const packageJson = await readPackageJson(rootDir);
  const dependencies = new Set(Object.keys({
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {}),
    ...(packageJson?.peerDependencies ?? {})
  }));
  const files = await topLevelEntries(rootDir);
  const frameworks = new Set<string>();

  if (dependencies.has("next") || files.has("next.config.js") || files.has("next.config.mjs") || files.has("next.config.ts")) frameworks.add("Next.js");
  if (dependencies.has("@remix-run/react")) frameworks.add("Remix");
  if (dependencies.has("gatsby")) frameworks.add("Gatsby");
  if (dependencies.has("vite") || files.has("vite.config.js") || files.has("vite.config.ts")) frameworks.add(dependencies.has("vue") ? "Vite Vue" : "Vite");
  if (dependencies.has("react") || dependencies.has("preact")) frameworks.add("React");
  if (dependencies.has("vue")) frameworks.add("Vue");
  if (dependencies.has("svelte") || dependencies.has("@sveltejs/kit")) frameworks.add("Svelte");
  if (dependencies.has("astro")) frameworks.add("Astro");
  if (dependencies.has("@angular/core") || files.has("angular.json")) frameworks.add("Angular");
  if (dependencies.has("solid-js")) frameworks.add("Solid");
  if (dependencies.has("react-native")) frameworks.add("React Native");
  if (dependencies.has("expo")) frameworks.add("Expo");
  if (frameworks.size === 0 && (files.has("src") || files.has("app") || files.has("components"))) frameworks.add("JavaScript/TypeScript");

  const uiLibraries: ComponentPreset[] = [];
  if (hasAnyDependency(dependencies, ["@radix-ui/react-dialog", "@radix-ui/react-slot", "@radix-ui/themes"])) uiLibraries.push("radix");
  if (hasAnyDependency(dependencies, ["@mui/material", "@material-ui/core"])) uiLibraries.push("mui");
  if (hasAnyDependency(dependencies, ["react-aria", "react-aria-components", "@react-aria/button"])) uiLibraries.push("react-aria");
  if (hasAnyDependency(dependencies, ["react-native", "expo"])) uiLibraries.push("react-native");
  if (dependencies.has("@chakra-ui/react")) uiLibraries.push("chakra");
  if (dependencies.has("antd")) uiLibraries.push("ant-design");
  if (dependencies.has("@headlessui/react")) uiLibraries.push("headless-ui");
  if (dependencies.has("@mantine/core")) uiLibraries.push("mantine");
  if (dependencies.has("react-bootstrap")) uiLibraries.push("react-bootstrap");

  const packageManagers = [
    files.has("pnpm-lock.yaml") ? "pnpm" : "",
    files.has("yarn.lock") ? "yarn" : "",
    files.has("package-lock.json") ? "npm" : "",
    files.has("bun.lockb") ? "bun" : ""
  ].filter(Boolean);
  const hasTests = await containsMatchingFile(rootDir, /\.(test|spec)\.(js|jsx|ts|tsx|vue|svelte)$/);
  const hasStorybook = files.has(".storybook") || dependencies.has("@storybook/react") || dependencies.has("@storybook/vue3") || dependencies.has("@storybook/svelte");
  const hasRuntimeApp = frameworks.size > 0 && !frameworks.has("JavaScript/TypeScript");

  return {
    frameworks: [...frameworks],
    uiLibraries: unique(uiLibraries),
    packageManagers,
    hasTests,
    hasStorybook,
    hasRuntimeApp,
    summary: [...frameworks].join(", ") || "generic source project"
  };
}

function recommendedConfig(detection: StackDetection): ScanConfig {
  const include = new Set<string>();
  const exclude = new Set(["**/*.test.{js,jsx,ts,tsx}", "**/*.spec.{js,jsx,ts,tsx}", "**/*.stories.{js,jsx,ts,tsx,mdx}", "**/node_modules/**", "**/dist/**", "**/build/**", "**/.next/**"]);
  const frameworks = new Set(detection.frameworks);

  if (frameworks.has("Next.js")) {
    include.add("app/**/*.{js,jsx,ts,tsx,mdx}");
    include.add("pages/**/*.{js,jsx,ts,tsx,mdx}");
    include.add("components/**/*.{js,jsx,ts,tsx,mdx}");
  }
  if (frameworks.has("React Native") || frameworks.has("Expo")) {
    include.add("app/**/*.{js,jsx,ts,tsx}");
    include.add("src/**/*.{js,jsx,ts,tsx}");
  }
  if (frameworks.has("Vue")) include.add("src/**/*.vue");
  if (frameworks.has("Svelte")) include.add("src/**/*.svelte");
  if (frameworks.has("Astro")) include.add("src/**/*.astro");
  if (frameworks.has("Angular")) include.add("src/**/*.component.html");
  include.add("src/**/*.{js,jsx,ts,tsx,html,vue,svelte,astro,mdx}");
  include.add("components/**/*.{js,jsx,ts,tsx,html,vue,svelte,astro,mdx}");

  return {
    include: [...include],
    exclude: [...exclude],
    standard: "wcag22-aa",
    failOn: "critical",
    format: "text",
    baseline: "cleardom-baseline.json",
    verbose: false,
    runtimeUrl: "",
    semantic: "auto",
    componentPresets: detection.uiLibraries.length > 0 ? detection.uiLibraries : ["radix", "mui", "react-aria"],
    components: {
      IconButton: { role: "button", nameProps: ["aria-label", "label", "title"] },
      Button: { role: "button", nameProps: ["aria-label", "label"], labelProps: ["children"] },
      TextInput: { role: "textbox", nameProps: ["aria-label", "label", "placeholder"] }
    },
    rules: {
      CDOM_2_4_4_AMBIGUOUS_LABEL: "warning"
    }
  };
}

function formatInitSummary(rootDir: string, detection: StackDetection, config: ScanConfig, changed: string[], next: string[], showWorkflow: boolean): string {
  const lines = [
    "ClearDOM setup wizard",
    "",
    `Project: ${rootDir}`,
    `Detected: ${detection.summary}`,
    `Recommended stack config: ${config.standard}, semantic ${config.semantic}, fail on ${config.failOn}`,
    `Component presets: ${(config.componentPresets ?? []).join(", ") || "none"}`,
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

async function readPackageJson(rootDir: string): Promise<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string>; peerDependencies?: Record<string, string> } | undefined> {
  try {
    return JSON.parse(await fs.readFile(path.join(rootDir, "package.json"), "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; peerDependencies?: Record<string, string> };
  } catch {
    return undefined;
  }
}

async function topLevelEntries(rootDir: string): Promise<Set<string>> {
  try {
    return new Set(await fs.readdir(rootDir));
  } catch {
    return new Set();
  }
}

async function containsMatchingFile(rootDir: string, pattern: RegExp, depth = 0): Promise<boolean> {
  if (depth > 3) return false;
  let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist" || entry.name === "build" || entry.name === ".next") continue;
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isFile() && pattern.test(entry.name)) return true;
    if (entry.isDirectory() && await containsMatchingFile(entryPath, pattern, depth + 1)) return true;
  }
  return false;
}

function hasAnyDependency(dependencies: Set<string>, names: string[]): boolean {
  return names.some((name) => dependencies.has(name));
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function indent(value: string, prefix: string): string {
  return value.split(/\r?\n/).map((line) => `${prefix}${line}`).join("\n");
}

function relativeOrAbsolute(rootDir: string, filePath: string): string {
  const relative = path.relative(rootDir, filePath);
  return relative && !relative.startsWith("..") ? relative : filePath;
}
