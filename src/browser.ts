import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import type { ResolvedScanOptions } from "./types.js";

const managedBrowserDir = path.join(".cleardom", "browser");
const execFileAsync = promisify(execFile);

export type BrowserResolution = {
  executablePath?: string;
  source: "explicit" | "env" | "managed" | "system" | "missing";
  message: string;
};

export async function resolveBrowserExecutable(options: ResolvedScanOptions, chromePath?: string): Promise<BrowserResolution> {
  const explicit = chromePath || options.runtime.browser.executablePath;
  if (explicit && await exists(explicit)) return { executablePath: explicit, source: "explicit", message: `Using explicit browser ${explicit}` };

  if (options.runtime.browser.mode !== "managed") {
    const env = process.env.CHROME_PATH ?? process.env.PUPPETEER_EXECUTABLE_PATH;
    if (env && await exists(env)) return { executablePath: env, source: "env", message: `Using browser from environment ${env}` };
  }

  if (options.runtime.browser.mode !== "system") {
    const managed = await findManagedBrowser(options.rootDir);
    if (managed) return { executablePath: managed, source: "managed", message: `Using managed browser ${managed}` };
  }

  if (options.runtime.browser.mode !== "managed") {
    const system = await findSystemBrowser();
    if (system) return { executablePath: system, source: "system", message: `Using system browser ${system}` };
  }

  return {
    source: "missing",
    message: "No Chrome executable found. Run `cleardom browser install` or set CHROME_PATH/PUPPETEER_EXECUTABLE_PATH."
  };
}

export async function installManagedBrowser(rootDir = process.cwd()): Promise<string> {
  const cacheDir = path.resolve(rootDir, managedBrowserDir);
  await fs.mkdir(cacheDir, { recursive: true });
  const browsers = await import("@puppeteer/browsers");
  const installed = await browsers.install({
    browser: "chrome",
    buildId: "stable",
    cacheDir
  } as Parameters<typeof browsers.install>[0]);
  return installed;
}

async function findManagedBrowser(rootDir: string): Promise<string | undefined> {
  const root = path.resolve(rootDir, managedBrowserDir);
  const candidates = await collectExecutableCandidates(root).catch(() => []);
  return candidates.find((candidate) => /(?:chrome|chromium)(?:\.exe)?$/i.test(path.basename(candidate)));
}

async function collectExecutableCandidates(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await collectExecutableCandidates(full));
    if (entry.isFile() && await exists(full)) files.push(full);
  }
  return files;
}

async function findSystemBrowser(): Promise<string | undefined> {
  const fromPath = await findBrowserOnPath();
  if (fromPath) return fromPath;

  const candidates = platformBrowserCandidates();
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return undefined;
}

async function findBrowserOnPath(): Promise<string | undefined> {
  const names = process.platform === "win32"
    ? ["chrome.exe", "msedge.exe", "chromium.exe"]
    : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome", "microsoft-edge", "msedge"];
  for (const name of names) {
    const resolved = await resolveCommand(name);
    if (resolved) return resolved;
  }
  return undefined;
}

async function resolveCommand(command: string): Promise<string | undefined> {
  try {
    const result = process.platform === "win32"
      ? await execFileAsync("where", [command])
      : await execFileAsync("/bin/sh", ["-c", `command -v ${shellQuote(command)}`]);
    return result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  } catch {
    return undefined;
  }
}

function platformBrowserCandidates(): string[] {
  if (process.platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      path.join(process.env.HOME ?? "", "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
      path.join(process.env.HOME ?? "", "Applications/Chromium.app/Contents/MacOS/Chromium")
    ].filter((candidate) => Boolean(candidate) && path.isAbsolute(candidate));
  }

  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA ?? "";
    const programFiles = process.env.PROGRAMFILES ?? "";
    const programFilesX86 = process.env["PROGRAMFILES(X86)"] ?? "";
    return [
      path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(local, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(local, "Microsoft", "Edge", "Application", "msedge.exe")
    ].filter((candidate) => Boolean(candidate) && path.isAbsolute(candidate));
  }

  return [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "/opt/google/chrome/chrome",
    "/usr/bin/microsoft-edge",
    "/usr/bin/msedge"
  ];
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
