import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import { fingerprintFinding } from "./baseline.js";
import { ownerForFinding } from "./config.js";
import type { Finding, NativeScreenAction, ResolvedScanOptions, RuntimeDiagnostic, ScanResult } from "./types.js";

const execFileAsync = promisify(execFile);

export async function runNativeScan(target: string, options: ResolvedScanOptions, staticResult: ScanResult): Promise<ScanResult> {
  if (!options.native.enabled) return staticResult;
  const diagnostics: RuntimeDiagnostic[] = [...staticResult.runtimeDiagnostics];
  const findings: Finding[] = [...staticResult.findings];
  let capturedStates = 0;

  try {
    const native = await collectNativeFindings(options, diagnostics);
    findings.push(...native.findings);
    capturedStates = native.capturedStates;
  } finally {
    if (!process.env.CLEARDOM_NATIVE_MOCK_SNAPSHOT) {
      await stopEasSimulator(options.rootDir);
    }
  }

  const activeFindings = findings.filter((finding) => finding.baselineStatus === "active");
  const nativeFindings = findings.filter((finding) => finding.source === "native-runtime");
  return {
    ...staticResult,
    findings,
    activeFindings,
    regressions: activeFindings,
    summary: {
      ...staticResult.summary,
      totalFindings: findings.length,
      activeFindings: activeFindings.length,
      regressions: activeFindings.length,
      critical: activeFindings.filter((finding) => finding.severity === "critical").length,
      warning: activeFindings.filter((finding) => finding.severity === "warning").length,
      info: activeFindings.filter((finding) => finding.severity === "info").length
    },
    runtimeDiagnostics: diagnostics,
    outcome: {
      ...staticResult.outcome,
      native: {
        requested: true,
        capturedStates,
        findings: nativeFindings.length
      },
      findings: {
        ...staticResult.outcome.findings,
        automated: activeFindings.filter((finding) => finding.detectionMode === "automated").length,
        needsReview: activeFindings.filter((finding) => finding.detectionMode === "needs-review").length,
        manualGuidance: activeFindings.filter((finding) => finding.detectionMode === "manual-guidance").length,
        safeAutoFix: activeFindings.filter((finding) => finding.fixKind === "safe-auto-fix").length,
        guidedFix: activeFindings.filter((finding) => finding.fixKind === "guided-fix").length,
        manualReview: activeFindings.filter((finding) => finding.fixKind === "manual-review").length
      }
    }
  };
}

async function collectNativeFindings(options: ResolvedScanOptions, diagnostics: RuntimeDiagnostic[]): Promise<{ findings: Finding[]; capturedStates: number }> {
  if (process.env.CLEARDOM_NATIVE_MOCK_SNAPSHOT) {
    return { findings: findingsFromSnapshot(process.env.CLEARDOM_NATIVE_MOCK_SNAPSHOT, options, "ios", "mock"), capturedStates: 1 };
  }

  if (!options.native.appId && options.native.deepLinks.length === 0 && options.native.screens.length === 0) {
    diagnostics.push({ stage: "native", severity: "warning", message: "Native scan is enabled but native.appId, deepLinks, or screens were not configured." });
    return { findings: [], capturedStates: 0 };
  }

  const findings: Finding[] = [];
  let capturedStates = 0;
  await writeSimulatorEnv(options.rootDir);
  for (const platform of options.native.platforms) {
    await eas(["simulator:start", "--platform", platform, "--type", "agent-device", "--non-interactive", "--max-duration-minutes", String(options.native.maxDurationMinutes)], options.rootDir, diagnostics);
    await waitForEasSimulator(options.rootDir, diagnostics);
    const targets = nativeTargets(options);
    for (const target of targets) {
      if (target.deepLink || options.native.appId) {
        await eas(["simulator:exec", "npx", "agent-device@latest", "open", target.deepLink ?? options.native.appId, "--platform", platform], options.rootDir, diagnostics);
      }
      findings.push(...await captureNativeState(options, diagnostics, platform, target.name, target.deepLink));
      capturedStates += 1;
      for (const [index, action] of target.actions.entries()) {
        const command = nativeActionCommand(action);
        if (!command) {
          diagnostics.push({ stage: "native", severity: "warning", message: `Skipped invalid native action ${index + 1} for ${target.name}. Configure either press or fill with text.` });
          continue;
        }
        await eas(["simulator:exec", "npx", "agent-device@latest", ...command], options.rootDir, diagnostics);
        findings.push(...await captureNativeState(options, diagnostics, platform, `${target.name}-step-${index + 1}`, target.deepLink));
        capturedStates += 1;
      }
    }
  }
  return { findings, capturedStates };
}

async function captureNativeState(options: ResolvedScanOptions, diagnostics: RuntimeDiagnostic[], platform: "ios" | "android", screen: string, deepLink?: string): Promise<Finding[]> {
  const snapshot = await eas(["simulator:exec", "npx", "agent-device@latest", "snapshot", "-i"], options.rootDir, diagnostics);
  const screenshotPath = path.join(options.rootDir, ".cleardom", `native-${platform}-${safeName(screen)}.png`);
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  await eas(["simulator:exec", "npx", "agent-device@latest", "screenshot", screenshotPath], options.rootDir, diagnostics).catch(() => "");
  return findingsFromSnapshot(snapshot, options, platform, screen, deepLink, screenshotPath);
}

function nativeTargets(options: ResolvedScanOptions): Array<{ name: string; deepLink?: string; actions: NativeScreenAction[] }> {
  const screens = options.native.screens.map((screen) => ({ name: screen.name, deepLink: screen.deepLink, actions: screen.actions ?? [] }));
  const deepLinks = options.native.deepLinks.map((deepLink, index) => ({ name: `deep-link-${index + 1}`, deepLink, actions: [] }));
  if (screens.length > 0 || deepLinks.length > 0) return [...screens, ...deepLinks];
  return [{ name: "app", deepLink: undefined, actions: [] }];
}

export function nativeActionCommand(action: NativeScreenAction): string[] | undefined {
  if (action.press?.trim()) return ["press", action.press.trim()];
  if (action.fill?.trim() && action.text !== undefined) return ["fill", action.fill.trim(), action.text];
  return undefined;
}

function findingsFromSnapshot(snapshot: string, options: ResolvedScanOptions, platform: "ios" | "android", screen: string, deepLink?: string, screenshot?: string): Finding[] {
  const findings: Finding[] = [];
  const lines = snapshot.split(/\r?\n/).filter(Boolean);
  const labels = new Map<string, number>();
  for (const line of lines) {
    const label = extractValue(line, "label");
    const role = extractValue(line, "role") ?? extractValue(line, "accessibilityRole");
    const state = extractValue(line, "state") ?? extractValue(line, "value") ?? extractValue(line, "checked") ?? extractValue(line, "selected");
    if (label) labels.set(label, (labels.get(label) ?? 0) + 1);
    const interactive = /\b(button|link|switch|checkbox|tab|menuitem|textfield|text field)\b/i.test(line) || /pressable|touchable/i.test(line);
    if (interactive && !label) findings.push(nativeFinding("CDOM_NATIVE_RUNTIME_LABEL", "Native control has no accessible label", "Add an accessibilityLabel or visible text so assistive technology can announce this control.", options, platform, screen, deepLink, line, { role }, screenshot));
    if (interactive && !role) findings.push(nativeFinding("CDOM_NATIVE_RUNTIME_ROLE", "Native control has no accessible role", "Add accessibilityRole so assistive technology can announce the control type.", options, platform, screen, deepLink, line, { label }, screenshot));
    if (/\b(switch|checkbox|radio|tab)\b/i.test(role ?? "") && !state) findings.push(nativeFinding("CDOM_NATIVE_RUNTIME_STATE", "Native stateful control exposes no current state", "Expose checked, selected, or value state so assistive technology can announce the control's current state.", options, platform, screen, deepLink, line, { label, role }, screenshot));
  }
  for (const [label, count] of labels) {
    if (count > 1 && /^(edit|delete|remove|close|open|save|submit|next|back)$/i.test(label.trim())) {
      findings.push(nativeFinding("CDOM_NATIVE_RUNTIME_DUPLICATE_LABEL", "Native screen has duplicate ambiguous labels", `Make repeated "${label}" labels specific to their target.`, options, platform, screen, deepLink, snapshot, { label }, screenshot));
    }
  }
  return findings.map((finding) => ({ ...finding, owner: ownerForFinding(finding, options) }));
}

function nativeFinding(ruleId: string, title: string, message: string, options: ResolvedScanOptions, platform: "ios" | "android", screen: string, deepLink: string | undefined, excerpt: string, element: { label?: string; role?: string; state?: string }, screenshot?: string): Finding {
  const file = deepLink ?? (options.native.appId || `native:${screen}`);
  const fingerprint = fingerprintFinding({ ruleId, file, target: excerpt, semanticLocation: `${platform}:${screen}:${element.label ?? element.role ?? "unknown"}` });
  return {
    ruleId,
    title,
    severity: "warning",
    confidence: "medium",
    impact: "moderate",
    confidenceReason: "Native runtime evidence was collected from the simulator accessibility tree.",
    detectionMode: "needs-review",
    source: "native-runtime",
    fixKind: "guided-fix",
    category: "react-native",
    file,
    line: 1,
    column: 1,
    excerpt,
    message,
    wcag: ["4.1.2"],
    standards: [{ version: "wcag22", criterion: "4.1.2", level: "a", title: "Name, Role, Value" }],
    platforms: [platform === "ios" ? "react-native-ios" : "react-native-android"],
    target: excerpt,
    semanticLocation: `${platform}:${screen}`,
    fingerprint,
    baselineStatus: "active",
    native: {
      platform,
      screen,
      deepLink,
      accessibilityTree: excerpt,
      element,
      screenshot
    }
  };
}

async function eas(args: string[], cwd: string, diagnostics: RuntimeDiagnostic[]): Promise<string> {
  try {
    const result = await execFileAsync("npx", ["--yes", "eas-cli@latest", ...args], { cwd, timeout: 120000 });
    return result.stdout;
  } catch (error) {
    diagnostics.push({ stage: "native", severity: "warning", message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

async function waitForEasSimulator(cwd: string, diagnostics: RuntimeDiagnostic[]): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const output = await eas(["simulator:get", "--json"], cwd, diagnostics);
    let status = "";
    try {
      const parsed = JSON.parse(output) as { status?: string };
      status = parsed.status ?? "";
    } catch {
      status = output.match(/\b(?:IN_PROGRESS|FINISHED|FAILED|CANCELED|ERRORED)\b/i)?.[0] ?? "";
    }
    if (status.toUpperCase() === "IN_PROGRESS") return;
    if (/^(?:FINISHED|FAILED|CANCELED|ERRORED)$/i.test(status)) {
      throw new Error(`EAS Simulator stopped before it became ready (${status}).`);
    }
    await delay(2_000);
  }
  throw new Error("Timed out waiting for EAS Simulator to become ready.");
}

async function stopEasSimulator(rootDir: string): Promise<void> {
  await execFileAsync("npx", ["--yes", "eas-cli@latest", "simulator:stop"], { cwd: rootDir, timeout: 30000 }).catch(() => undefined);
  await writeSimulatorEnv(rootDir);
}

async function writeSimulatorEnv(rootDir: string): Promise<void> {
  await fs.writeFile(path.join(rootDir, ".env.eas-simulator"), "# managed by eas-cli\n", "utf8").catch(() => undefined);
}

function extractValue(line: string, name: string): string | undefined {
  return line.match(new RegExp(`${name}=["']([^"']+)["']`, "i"))?.[1] ?? line.match(new RegExp(`${name}:\\s*([^,]+)`, "i"))?.[1]?.trim();
}

function safeName(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "screen";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
