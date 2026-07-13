import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { createInterface } from "node:readline/promises";
import { installManagedBrowser, resolveBrowserExecutable, type BrowserResolution } from "./browser.js";
import { resolveScanOptions } from "./config.js";
import { detectProjectStack } from "./project.js";
import type { ScanOptions } from "./types.js";

export type PreparedCheck = {
  options: ScanOptions;
  messages: string[];
  close: () => Promise<void>;
};

type RuntimeProcess = {
  child: ChildProcess;
  command: string;
  output: () => string;
};

export type PrepareCheckDependencies = {
  resolveBrowserExecutable?: (options: Awaited<ReturnType<typeof resolveScanOptions>>) => Promise<BrowserResolution>;
  installManagedBrowser?: (rootDir: string) => Promise<string>;
  confirmBrowserInstall?: () => Promise<boolean>;
  isInteractive?: () => boolean;
};

export async function prepareCheck(
  target: string,
  options: ScanOptions,
  sourceOnly = false,
  dependencies: PrepareCheckDependencies = {}
): Promise<PreparedCheck> {
  if (sourceOnly || /^https?:\/\//i.test(target)) {
    return idle(sourceOnlyOptions(options), sourceOnly ? "Source-only check requested; rendered checks were skipped." : undefined);
  }

  const targetPath = path.resolve(target);
  const root = await projectRoot(targetPath);
  const resolved = await resolveScanOptions(options, root);
  if (resolved.runtime.baseUrl || resolved.runtimeUrl) {
    return idle(options, `Using configured runtime at ${resolved.runtime.baseUrl ?? resolved.runtimeUrl}.`);
  }

  const detection = await detectProjectStack(root);
  if (!detection.hasRuntimeApp) {
    return idle(options, "No runnable web app was detected; completed source checks only.");
  }

  const browser = await ensureBrowser(resolved, dependencies);
  if (!browser.resolution.executablePath) {
    return idle(options, browser.message);
  }

  const command = await runtimeCommand(root);
  if (!command) {
    return idle(options, "No dev or Storybook script was found; completed source checks only.");
  }

  const running = startRuntimeProcess(root, command);
  try {
    const url = await waitForRuntime(running, 30_000);
    return {
      options: { ...options, runtimeUrl: url, runtime: { ...options.runtime, baseUrl: url } },
      messages: [
        ...(browser.message.startsWith("Installed managed Chromium") ? [browser.message] : []),
        `Started ${running.command}.`,
        `Running source and rendered checks at ${url}.`
      ],
      close: () => stopRuntimeProcess(running.child)
    };
  } catch (error) {
    await stopRuntimeProcess(running.child);
    const detail = running.output().trim();
    const suffix = detail ? ` Last output: ${detail.slice(-500)}` : "";
    return idle(options, `${error instanceof Error ? error.message : String(error)} Completed source checks only.${suffix}`);
  }
}

async function ensureBrowser(
  options: Awaited<ReturnType<typeof resolveScanOptions>>,
  dependencies: PrepareCheckDependencies
): Promise<{ resolution: BrowserResolution; message: string }> {
  const resolve = dependencies.resolveBrowserExecutable ?? resolveBrowserExecutable;
  const initial = await resolve(options);
  if (initial.executablePath) return { resolution: initial, message: initial.message };

  const interactive = dependencies.isInteractive?.() ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!interactive) {
    return {
      resolution: initial,
      message: "Chromium is unavailable; completed source checks only. Non-interactive runs do not download browsers. Run `cleardom browser install` to enable rendered checks."
    };
  }

  const accepted = await (dependencies.confirmBrowserInstall ?? confirmBrowserInstall)();
  if (!accepted) {
    return {
      resolution: initial,
      message: "Chromium is unavailable; completed source checks only. Managed browser installation was declined. Run `cleardom browser install` to enable rendered checks."
    };
  }

  try {
    const installed = await (dependencies.installManagedBrowser ?? installManagedBrowser)(options.rootDir);
    const resolved = await resolve(options);
    if (resolved.executablePath) {
      return {
        resolution: resolved,
        message: `Installed managed Chromium at ${installed}.`
      };
    }
    return {
      resolution: resolved,
      message: "Chromium installation completed but ClearDOM could not locate the executable. Completed source checks only. Run `cleardom browser install` to retry."
    };
  } catch (error) {
    return {
      resolution: initial,
      message: `Chromium is unavailable; completed source checks only. Managed browser installation failed: ${error instanceof Error ? error.message : String(error)}. Run \`cleardom browser install\` to retry.`
    };
  }
}

async function confirmBrowserInstall(): Promise<boolean> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await prompt.question("ClearDOM needs Chromium for rendered checks. Install a managed browser for this project now? [y/N] ");
    return /^(?:y|yes)$/i.test(answer.trim());
  } finally {
    prompt.close();
  }
}

function idle(options: ScanOptions, message?: string): PreparedCheck {
  return { options, messages: message ? [message] : [], close: async () => undefined };
}

function sourceOnlyOptions(options: ScanOptions): ScanOptions {
  return {
    ...options,
    runtimeUrl: "",
    runtime: { ...options.runtime, baseUrl: "" }
  };
}

async function projectRoot(target: string): Promise<string> {
  let current = (await fs.stat(target)).isDirectory() ? target : path.dirname(target);
  while (true) {
    try {
      await fs.access(path.join(current, "package.json"));
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return (await fs.stat(target)).isDirectory() ? target : path.dirname(target);
      current = parent;
    }
  }
}

async function runtimeCommand(root: string): Promise<{ executable: string; args: string[]; label: string } | undefined> {
  let packageJson: { scripts?: Record<string, string> };
  try {
    packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8")) as { scripts?: Record<string, string> };
  } catch {
    return undefined;
  }

  const script = ["dev", "serve", "storybook"].find((name) => packageJson.scripts?.[name])
    ?? (looksLikeWebServer(packageJson.scripts?.start) ? "start" : undefined);
  if (!script) return undefined;
  const manager = await packageManager(root);
  const args = manager === "yarn" ? [script] : ["run", script];
  return { executable: manager, args, label: `${manager} ${args.join(" ")}` };
}

function looksLikeWebServer(command: string | undefined): boolean {
  return Boolean(command && /\b(next|vite|react-scripts|gatsby|remix|astro|nuxt|webpack|http-server|serve|ng)\b/i.test(command));
}

async function packageManager(root: string): Promise<"pnpm" | "yarn" | "bun" | "npm"> {
  for (const [file, manager] of [["pnpm-lock.yaml", "pnpm"], ["yarn.lock", "yarn"], ["bun.lockb", "bun"], ["bun.lock", "bun"]] as const) {
    try {
      await fs.access(path.join(root, file));
      return manager;
    } catch {
      // Try the next package manager marker.
    }
  }
  return "npm";
}

function startRuntimeProcess(root: string, command: NonNullable<Awaited<ReturnType<typeof runtimeCommand>>>): RuntimeProcess {
  let captured = "";
  const child = spawn(command.executable, command.args, {
    cwd: root,
    detached: process.platform !== "win32",
    env: { ...process.env, BROWSER: "none", CLEARDOM_CHECK: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const collect = (chunk: Buffer | string): void => {
    captured = `${captured}${chunk.toString()}`.slice(-8_000);
  };
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);
  return { child, command: command.label, output: () => captured };
}

async function waitForRuntime(process: RuntimeProcess, timeoutMs: number): Promise<string> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (process.child.exitCode !== null) {
      throw new Error(`${process.command} exited before the app became ready.`);
    }
    const urls = runtimeUrls(process.output());
    for (const url of urls) {
      if (await isReady(url)) return url;
    }
    await delay(250);
  }
  throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${process.command}.`);
}

function runtimeUrls(output: string): string[] {
  const matches = output.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+/gi) ?? [];
  return [...new Set(matches.map((url) => url.replace("127.0.0.1", "localhost")))];
}

async function isReady(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(500), redirect: "manual" });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function stopRuntimeProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.killed) return;
  try {
    child.kill("SIGTERM");
  } catch {
    return;
  }
  await Promise.race([new Promise<void>((resolve) => child.once("exit", () => resolve())), delay(1_000)]);
  if (child.exitCode === null) {
    try {
      child.kill("SIGKILL");
    } catch {
      // The process exited between the status check and signal.
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
