import { promises as fs } from "node:fs";
import * as path from "node:path";
import { resolveScanOptions } from "./config.js";
import type { ResolvedScanOptions, ScanOptions } from "./types.js";

export type DoctorStatus = "pass" | "warn" | "fail";

export type DoctorCheck = {
  name: string;
  status: DoctorStatus;
  message: string;
};

export type DoctorResult = {
  ok: boolean;
  checks: DoctorCheck[];
};

export async function runDoctor(options: ScanOptions = {}, cwd = process.cwd()): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  let resolved: ResolvedScanOptions | undefined;

  try {
    resolved = await resolveScanOptions(options, cwd);
    checks.push({ name: "Config", status: "pass", message: resolved.configPath ? `Loaded ${resolved.configPath}` : "Using defaults; no config path was required." });
  } catch (error) {
    checks.push({ name: "Config", status: "fail", message: errorMessage(error) });
  }

  checks.push(await chromeCheck());
  checks.push(githubTokenCheck());

  if (resolved) {
    checks.push(patternCheck("Include patterns", resolved.include));
    checks.push(patternCheck("Exclude patterns", resolved.exclude));
    checks.push(await baselineCheck(resolved));
    checks.push(semanticCheck(resolved));
    checks.push(await runtimeUrlCheck(resolved));
  }

  return {
    ok: !checks.some((check) => check.status === "fail"),
    checks
  };
}

export function formatDoctor(result: DoctorResult): string {
  const lines = ["ClearDOM doctor", ""];
  for (const check of result.checks) {
    lines.push(`${label(check.status).padEnd(6)} ${check.name}: ${check.message}`);
  }
  lines.push("", result.ok ? "Ready for local ClearDOM scans." : "Doctor found blocking setup issues.");
  return lines.join("\n");
}

async function chromeCheck(): Promise<DoctorCheck> {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (await isExecutable(candidate)) {
      return { name: "Chrome", status: "pass", message: `Found ${candidate}` };
    }
  }

  return {
    name: "Chrome",
    status: "warn",
    message: "No Chrome executable found. Static scans work; URL/runtime scans need CHROME_PATH or PUPPETEER_EXECUTABLE_PATH."
  };
}

function githubTokenCheck(): DoctorCheck {
  if (process.env.GITHUB_TOKEN) {
    return { name: "GitHub token", status: "pass", message: process.env.GITHUB_ACTIONS ? "GITHUB_TOKEN is available in GitHub Actions." : "GITHUB_TOKEN is set." };
  }
  if (process.env.GH_TOKEN) {
    return { name: "GitHub token", status: "pass", message: "GH_TOKEN is set." };
  }
  return { name: "GitHub token", status: "warn", message: "No token found. Local scans work; PR review posting needs GITHUB_TOKEN or GH_TOKEN." };
}

function patternCheck(name: string, patterns: string[]): DoctorCheck {
  if (patterns.length === 0) {
    return { name, status: "warn", message: "No patterns configured; ClearDOM will scan supported files under the target." };
  }

  const invalid = patterns.filter((pattern) => !pattern || pattern.includes("\0"));
  if (invalid.length > 0) {
    return { name, status: "fail", message: `Invalid pattern values: ${invalid.join(", ")}` };
  }

  return { name, status: "pass", message: `${patterns.length} configured.` };
}

async function baselineCheck(options: ResolvedScanOptions): Promise<DoctorCheck> {
  if (!options.baseline) {
    return { name: "Baseline", status: "warn", message: "No baseline configured. Adoption gates can use cleardom baseline update." };
  }

  const resolved = path.resolve(options.rootDir, options.baseline);
  try {
    await fs.access(resolved);
    return { name: "Baseline", status: "pass", message: `Found ${resolved}` };
  } catch {
    return { name: "Baseline", status: "warn", message: `${resolved} does not exist yet.` };
  }
}

function semanticCheck(options: ResolvedScanOptions): DoctorCheck {
  if (options.semantic === "auto" || options.semantic === "off" || options.semantic === "required") {
    return { name: "Semantic mode", status: "pass", message: options.semantic };
  }
  return { name: "Semantic mode", status: "fail", message: `Unsupported semantic mode ${String(options.semantic)}` };
}

async function runtimeUrlCheck(options: ResolvedScanOptions): Promise<DoctorCheck> {
  if (!options.runtimeUrl) {
    return { name: "Runtime URL", status: "warn", message: "No runtimeUrl configured; browser-only checks will be skipped." };
  }

  try {
    const response = await fetch(options.runtimeUrl, { method: "GET", signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      return { name: "Runtime URL", status: "pass", message: `${options.runtimeUrl} returned HTTP ${response.status}.` };
    }
    return { name: "Runtime URL", status: "warn", message: `${options.runtimeUrl} returned HTTP ${response.status}.` };
  } catch (error) {
    return { name: "Runtime URL", status: "warn", message: `${options.runtimeUrl} is not reachable: ${errorMessage(error)}` };
  }
}

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function label(status: DoctorStatus): string {
  if (status === "pass") return "pass";
  if (status === "warn") return "warn";
  return "fail";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
