import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { resolveBrowserExecutable } from "./browser.js";
import { resolveScanOptions } from "./config.js";
import { detectProjectStack, type StackDetection } from "./project.js";
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

const execFileAsync = promisify(execFile);

export async function runDoctor(options: ScanOptions = {}, cwd = process.cwd()): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  let resolved: ResolvedScanOptions | undefined;

  try {
    resolved = await resolveScanOptions(options, cwd);
    checks.push({ name: "Config", status: "pass", message: resolved.configPath ? `Loaded ${resolved.configPath}` : "Using defaults; no config path was required." });
  } catch (error) {
    checks.push({ name: "Config", status: "fail", message: errorMessage(error) });
  }

  checks.push(githubTokenCheck());

  if (resolved) {
    const detection = await detectProjectStack(resolved.rootDir);
    checks.push(projectStackCheck(detection));
    checks.push(...setupFlowChecks(resolved, detection));
    checks.push(await browserCheck(resolved));
    checks.push(patternCheck("Include patterns", resolved.include));
    checks.push(patternCheck("Exclude patterns", resolved.exclude));
    checks.push(await baselineCheck(resolved));
    checks.push(semanticCheck(resolved));
    checks.push(await runtimeUrlCheck(resolved));
    checks.push(...await nativeChecks(resolved, cwd));
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

async function browserCheck(options: ResolvedScanOptions): Promise<DoctorCheck> {
  const resolution = await resolveBrowserExecutable(options);
  return {
    name: "Browser",
    status: resolution.executablePath ? "pass" : "warn",
    message: resolution.message
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

function projectStackCheck(detection: StackDetection): DoctorCheck {
  if (detection.summary === "generic source project") {
    return { name: "Project stack", status: "warn", message: "No common app stack detected. Run cleardom init --dry-run to preview a generic config." };
  }
  const manager = detection.packageManagers.length > 0 ? ` Package manager: ${detection.packageManagers.join(", ")}.` : "";
  const source = detection.detectedFrom.length > 0 ? ` Detected from: ${detection.detectedFrom.join(", ")}.` : "";
  return { name: "Project stack", status: "pass", message: `Detected ${detection.summary}.${manager}${source}` };
}

function setupFlowChecks(options: ResolvedScanOptions, detection: StackDetection): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const frameworks = new Set(detection.frameworks);
  const isReactWeb = ["React", "Next.js", "Remix", "Gatsby"].some((framework) => frameworks.has(framework));
  const isSolid = frameworks.has("Solid");
  const isNative = frameworks.has("Expo") || frameworks.has("React Native");
  const isElectron = frameworks.has("Electron");
  const webContainers = detection.webContainers;
  const templateFrameworks = ["Vite Vue", "Vue", "Svelte", "Astro", "Angular"].filter((framework) => frameworks.has(framework));
  const isVanillaWeb = !isReactWeb && !isSolid && !isNative && webContainers.length === 0 && templateFrameworks.length === 0 && (frameworks.has("Vite") || options.include.some((pattern) => pattern.includes("html")));

  if (isReactWeb) {
    const presets = options.componentPresets.length > 0 ? options.componentPresets.join(", ") : "none";
    checks.push({
      name: "React setup",
      status: options.semantic === "off" ? "warn" : "pass",
      message: `JSX/TSX source scans are enabled with semantic ${options.semantic}. Component presets: ${presets}. Next: cleardom scan . --diff.`
    });
  }

  if (isSolid) {
    checks.push({
      name: "Solid setup",
      status: options.semantic === "off" ? "warn" : "pass",
      message: `JSX/TSX source scans are enabled with semantic ${options.semantic}. Next: cleardom scan . --diff.`
    });
  }

  if (templateFrameworks.length > 0) {
    checks.push({
      name: "Template setup",
      status: "pass",
      message: `${templateFrameworks.join(", ")} source adapters are in scope. Pair with --runtime-url for rendered DOM, CSS, and keyboard checks.`
    });
  }

  if (isVanillaWeb) {
    checks.push({
      name: "Vanilla web setup",
      status: "pass",
      message: "HTML files are in scope. For rendered CSS and keyboard checks, start the app and run cleardom doctor . --runtime-url http://localhost:3000."
    });
  }

  if (isNative) {
    checks.push({
      name: "Expo setup",
      status: options.componentPresets.includes("react-native") ? "pass" : "warn",
      message: options.componentPresets.includes("react-native")
        ? `React Native component mappings are enabled. Local native checks are ${options.native.enabled ? "enabled" : "available but disabled"}; run cleardom native scan . after setting native.appIds or deepLinks and booting a simulator/emulator.`
        : "Add componentPresets: [\"react-native\"] so Pressable, TextInput, Image, and touchables are understood."
    });
  }

  if (isElectron) {
    checks.push({
      name: "Electron setup",
      status: options.runtimeUrl ? "pass" : "warn",
      message: options.runtimeUrl
        ? `Electron renderer checks are configured at ${options.runtimeUrl}.`
        : "Electron source scanning is enabled. Run cleardom check so ClearDOM can discover BrowserWindow.loadFile(...) or attach to the renderer dev server."
    });
  }

  if (webContainers.length > 0) {
    checks.push({
      name: "Web container setup",
      status: "pass",
      message: `${webContainers.join(", ")} UI uses the shared web source and rendered rule engine. Run cleardom check for a detected dev server; use runtime routes or built HTML for shell-specific popup, options, and webview surfaces.`
    });
  }

  if (checks.length === 0) {
    checks.push({
      name: "Setup flow",
      status: "warn",
      message: "Run cleardom init to write a project config, then cleardom scan . or cleardom ci ."
    });
  }

  return checks;
}

async function runtimeUrlCheck(options: ResolvedScanOptions): Promise<DoctorCheck> {
  if (!options.runtimeUrl) {
    return { name: "Runtime URL", status: "warn", message: "No runtimeUrl configured; browser-only checks will be skipped." };
  }

  if (options.runtimeUrl.startsWith("file:")) {
    try {
      await fs.access(fileURLToPath(options.runtimeUrl));
      return { name: "Runtime URL", status: "pass", message: `${options.runtimeUrl} is available as a local Electron renderer.` };
    } catch (error) {
      return { name: "Runtime URL", status: "warn", message: `${options.runtimeUrl} is not readable: ${errorMessage(error)}` };
    }
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

function label(status: DoctorStatus): string {
  if (status === "pass") return "pass";
  if (status === "warn") return "warn";
  return "fail";
}

async function nativeChecks(options: ResolvedScanOptions, cwd: string): Promise<DoctorCheck[]> {
  if (!options.native.enabled) return [];
  const checks: DoctorCheck[] = [];
  checks.push({ name: "Native runner", status: "pass", message: "Configured runner: local agent-device" });
  checks.push(await commandCheck("agent-device", ["npx", ["--yes", "agent-device@0.19.3", "--version"], cwd]));
  for (const platform of options.native.platforms) {
    checks.push(options.native.appIds[platform]
      ? { name: `${platform} app identifier`, status: "pass", message: options.native.appIds[platform] }
      : { name: `${platform} app identifier`, status: "fail", message: `Set native.appIds.${platform} to the installed application identifier.` });
  }
  if (options.native.platforms.includes("ios")) {
    checks.push(process.platform === "darwin"
      ? await commandCheck("Xcode simulator tools", ["xcrun", ["simctl", "list", "devices", "available"], cwd])
      : { name: "Xcode simulator tools", status: "fail", message: "Local iOS scanning requires macOS with Xcode." });
  }
  if (options.native.platforms.includes("android")) checks.push(await commandCheck("Android ADB", ["adb", ["devices"], cwd]));
  return checks;
}

async function commandCheck(name: string, command: [string, string[], string]): Promise<DoctorCheck> {
  try {
    const result = await execFileAsync(command[0], command[1], { cwd: command[2], timeout: 15000 });
    return { name, status: "pass", message: result.stdout.trim() || "available" };
  } catch {
    return { name, status: "warn", message: `${name} was not available through npx.` };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
