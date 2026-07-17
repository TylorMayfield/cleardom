import { promises as fs } from "node:fs";
import * as path from "node:path";
import { createAgentDeviceClient } from "agent-device";
import { fingerprintFinding } from "./baseline.js";
import { ownerForFinding } from "./config.js";
import type { Finding, NativeScreenAction, ResolvedScanOptions, RuntimeDiagnostic, ScanResult } from "./types.js";

type NativePlatform = "ios" | "android";
type AgentClient = ReturnType<typeof createAgentDeviceClient>;
type AgentSnapshot = Awaited<ReturnType<AgentClient["capture"]["snapshot"]>>;
type AgentNode = AgentSnapshot["nodes"][number];

export async function runNativeScan(_target: string, options: ResolvedScanOptions, staticResult: ScanResult): Promise<ScanResult> {
  if (!options.native.enabled) return staticResult;
  const diagnostics: RuntimeDiagnostic[] = [...staticResult.runtimeDiagnostics];
  const findings: Finding[] = [...staticResult.findings];
  let capturedStates = 0;

  try {
    const native = await collectNativeFindings(options, diagnostics);
    findings.push(...native.findings);
    capturedStates = native.capturedStates;
  } catch (error) {
    diagnostics.push({
      stage: "native",
      severity: "error",
      message: `${errorMessage(error)} Recovery: run \`cleardom doctor .\`, boot a configured local simulator/emulator, install the app, and retry.`
    });
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
      native: { requested: true, capturedStates, findings: nativeFindings.length },
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
  const mock = process.env.CLEARDOM_NATIVE_MOCK_SNAPSHOT;
  if (mock) {
    const nodes = parseMockSnapshot(mock);
    return { findings: findingsFromNodes(nodes, options, "ios", "mock"), capturedStates: 1 };
  }

  validateNativeHost(options);
  const findings: Finding[] = [];
  let capturedStates = 0;

  for (const platform of options.native.platforms) {
    const appId = options.native.appIds[platform];
    if (!appId) {
      diagnostics.push({ stage: "native", severity: "error", message: `Native ${platform} scanning needs native.appIds.${platform}. Recovery: add the installed bundle/package identifier to cleardom.config.json and run \`cleardom doctor .\`.` });
      continue;
    }

    const session = `cleardom-${platform}-${process.pid}`;
    const client = createAgentDeviceClient({ cwd: options.rootDir, session, lockPlatform: platform, lockPolicy: "reject", responseLevel: "full" });
    const selection = { platform, device: options.native.devices[platform] };
    try {
      const devices = await client.devices.list(selection);
      if (devices.length === 0) throw new Error(`No local ${platform} simulator/emulator is available.`);
      await client.devices.capabilities(selection);
      const installedApps = await client.apps.list(selection);
      if (!installedApps.some((installed) => installed === appId || installed.includes(appId))) {
        throw new Error(`${appId} is not installed on the selected ${platform} device.`);
      }
      const targets = nativeTargets(options);
      const firstTarget = targets[0];
      await client.apps.open({ ...selection, app: appId, url: firstTarget?.deepLink, relaunch: true });
      const scanDeadline = Date.now() + options.native.maxDurationMinutes * 60_000;
      for (const [targetIndex, target] of targets.entries()) {
        ensureNativeBudget(scanDeadline, platform);
        if (targetIndex > 0) await client.apps.open({ ...selection, app: appId, url: target.deepLink, relaunch: true });
        const initial = await captureNativeState(client, options, platform, target.name, target.deepLink, target.screenshot, undefined, target.timeoutMs);
        findings.push(...initial);
        capturedStates += 1;
        for (const [index, action] of target.actions.entries()) {
          ensureNativeBudget(scanDeadline, platform);
          await runNativeAction(client, selection, action, target.timeoutMs);
          const step = `${target.name}-step-${index + 1}`;
          findings.push(...await captureNativeState(client, options, platform, step, target.deepLink, target.screenshot, describeAction(action), target.timeoutMs));
          capturedStates += 1;
        }
      }
    } finally {
      await client.sessions.close().catch(() => undefined);
    }
  }
  return { findings, capturedStates };
}

function validateNativeHost(options: ResolvedScanOptions): void {
  if (Number(process.versions.node.split(".")[0]) < 22) throw new Error("Local native scanning requires Node.js 22.12 or newer.");
  if (options.native.platforms.includes("ios") && process.platform !== "darwin") throw new Error("Local iOS scanning requires macOS with Xcode.");
}

function ensureNativeBudget(deadline: number, platform: NativePlatform): void {
  if (Date.now() >= deadline) throw new Error(`Native ${platform} scan exceeded native.maxDurationMinutes before the next configured step.`);
}

async function captureNativeState(
  client: AgentClient,
  options: ResolvedScanOptions,
  platform: NativePlatform,
  screen: string,
  deepLink?: string,
  screenshotEnabled = true,
  actionStep?: string,
  timeoutMs = 30_000
): Promise<Finding[]> {
  const snapshot = await client.capture.snapshot({ platform, device: options.native.devices[platform], raw: true, forceFull: true, timeoutMs });
  let screenshot: string | undefined;
  if (screenshotEnabled) {
    const screenshotPath = path.join(options.rootDir, ".cleardom", `native-${platform}-${safeName(screen)}.png`);
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    screenshot = (await client.capture.screenshot({ path: screenshotPath })).path;
  }
  return findingsFromNodes(snapshot.nodes, options, platform, screen, deepLink, screenshot, actionStep);
}

function nativeTargets(options: ResolvedScanOptions): Array<{ name: string; deepLink?: string; actions: NativeScreenAction[]; timeoutMs: number; screenshot: boolean }> {
  const screens = options.native.screens.map((screen) => ({
    name: screen.name,
    deepLink: screen.deepLink,
    actions: screen.actions ?? [],
    timeoutMs: screen.timeoutMs ?? 30_000,
    screenshot: screen.screenshot ?? true
  }));
  const deepLinks = options.native.deepLinks.map((deepLink, index) => ({ name: `deep-link-${index + 1}`, deepLink, actions: [], timeoutMs: 30_000, screenshot: true }));
  if (screens.length > 0 || deepLinks.length > 0) return [...screens, ...deepLinks];
  return [{ name: "app", actions: [], timeoutMs: 30_000, screenshot: true }];
}

async function runNativeAction(client: AgentClient, selection: { platform: NativePlatform; device?: string }, action: NativeScreenAction, defaultTimeout: number): Promise<void> {
  if ("press" in action) {
    await client.interactions.press({ ...selection, ...interactionTarget(action.press), settle: true, timeoutMs: defaultTimeout, verify: true });
  } else if ("fill" in action) {
    await client.interactions.fill({ ...selection, ...interactionTarget(action.fill), text: action.text, settle: true, timeoutMs: defaultTimeout, verify: true });
  } else if ("swipe" in action) {
    await client.interactions.scroll({ ...selection, direction: action.swipe });
  } else if ("back" in action) {
    await client.command.back(selection);
  } else if ("waitFor" in action) {
    await client.command.wait({ ...selection, selector: action.waitFor, timeoutMs: action.timeoutMs ?? defaultTimeout });
  } else if ("assert" in action) {
    await client.interactions.is({ ...selection, predicate: "visible", selector: action.assert });
  }
}

function interactionTarget(target: string): { ref: string } | { selector: string } {
  return target.startsWith("@") ? { ref: target } : { selector: target };
}

export function nativeActionCommand(action: Partial<Record<"press" | "fill" | "text" | "swipe" | "waitFor" | "assert", string>> & { back?: boolean }): string[] | undefined {
  if (action.press?.trim()) return ["press", action.press.trim()];
  if (action.fill?.trim() && action.text !== undefined) return ["fill", action.fill.trim(), action.text];
  if (action.swipe) return ["scroll", action.swipe];
  if (action.back) return ["back"];
  if (action.waitFor) return ["wait", action.waitFor];
  if (action.assert) return ["is", "visible", action.assert];
  return undefined;
}

function findingsFromNodes(nodes: AgentNode[], options: ResolvedScanOptions, platform: NativePlatform, screen: string, deepLink?: string, screenshot?: string, actionStep?: string): Finding[] {
  const findings: Finding[] = [];
  const labels = new Map<string, AgentNode[]>();
  const interactive = nodes.filter(isInteractiveNode);
  for (const node of interactive) {
    const label = clean(node.label);
    const role = clean(node.role ?? node.type);
    const state = nativeState(node);
    if (label) labels.set(label, [...(labels.get(label) ?? []), node]);
    if (!label) findings.push(nativeFinding("CDOM_NATIVE_RUNTIME_LABEL", "Native control has no accessible label", "Add an accessibilityLabel or visible text so assistive technology can announce this control.", options, platform, screen, deepLink, node, { role }, screenshot, actionStep, "critical", "high", "automated"));
    if (!role) findings.push(nativeFinding("CDOM_NATIVE_RUNTIME_ROLE", "Native control has no accessible role", "Add accessibilityRole so assistive technology can announce the control type.", options, platform, screen, deepLink, node, { label }, screenshot, actionStep, "critical", "high", "automated"));
    if (isStatefulRole(role) && !state) findings.push(nativeFinding("CDOM_NATIVE_RUNTIME_STATE", "Native stateful control exposes no current state", "Expose checked, selected, or value state so assistive technology can announce the current state.", options, platform, screen, deepLink, node, { label, role }, screenshot, actionStep, "critical", "high", "automated"));
    if (node.visibleToUser === false || node.interactionBlocked === "covered") findings.push(nativeFinding("CDOM_NATIVE_RUNTIME_HIDDEN_CONTROL", "Native interactive control is unavailable to the user", "Remove the hidden control from accessibility navigation or make it visibly operable.", options, platform, screen, deepLink, node, { label, role, hidden: true }, screenshot, actionStep, "critical", "high", "automated"));
    if (node.rect && isSmallTarget(node.rect, platform)) findings.push(nativeFinding("CDOM_NATIVE_RUNTIME_TARGET_SIZE", "Native touch target may be too small", `Increase the interactive bounds to at least ${platform === "ios" ? "44×44 points" : "48×48 dp"} or provide sufficient spacing.`, options, platform, screen, deepLink, node, { label, role, bounds: node.rect }, screenshot, actionStep, "warning", "medium", "needs-review"));
  }
  for (const node of nodes.filter(isHeadingNode)) {
    if (!clean(node.label)) findings.push(nativeFinding("CDOM_NATIVE_RUNTIME_HEADING", "Native heading has no accessible text", "Give this heading visible text or an accessibility label that describes the section.", options, platform, screen, deepLink, node, { role: "heading" }, screenshot, actionStep, "critical", "high", "automated"));
  }
  for (const modal of nodes.filter(isModalNode)) {
    const exposedOutside = interactive.find((node) => node.visibleToUser !== false && node.index !== modal.index && !isDescendant(node, modal, nodes));
    if (exposedOutside) findings.push(nativeFinding("CDOM_NATIVE_RUNTIME_MODAL_CONTAINMENT", "Native modal does not contain accessibility navigation", "Hide background controls from the accessibility tree while the modal is active and restore them after dismissal.", options, platform, screen, deepLink, exposedOutside, { label: clean(exposedOutside.label), role: clean(exposedOutside.role ?? exposedOutside.type) }, screenshot, actionStep, "critical", "high", "automated"));
  }
  const traversalRisk = findTraversalRisk(interactive);
  if (traversalRisk) findings.push(nativeFinding("CDOM_NATIVE_RUNTIME_TRAVERSAL_ORDER", "Native accessibility traversal may not follow visual order", "Set an explicit accessibility traversal order and verify it with VoiceOver and TalkBack.", options, platform, screen, deepLink, traversalRisk, { label: clean(traversalRisk.label), role: clean(traversalRisk.role ?? traversalRisk.type), bounds: traversalRisk.rect }, screenshot, actionStep, "warning", "medium", "needs-review"));
  for (const [label, repeated] of labels) {
    if (repeated.length > 1 && /^(edit|delete|remove|close|open|save|submit|next|back)$/i.test(label)) {
      findings.push(nativeFinding("CDOM_NATIVE_RUNTIME_DUPLICATE_LABEL", "Native screen has duplicate ambiguous labels", `Make repeated "${label}" labels specific to their targets.`, options, platform, screen, deepLink, repeated[0], { label }, screenshot, actionStep, "warning", "medium", "needs-review"));
    }
  }
  if (interactive.length === 0 && nodes.length > 0) {
    findings.push(nativeFinding("CDOM_NATIVE_RUNTIME_NO_ACTIONS", "Native screen exposes no actionable controls", "Confirm that the screen is intentionally informational and that navigation remains available to assistive technology.", options, platform, screen, deepLink, nodes[0], {}, screenshot, actionStep, "info", "medium", "automated"));
  }
  return findings.map((finding) => ({ ...finding, owner: ownerForFinding(finding, options) }));
}

function nativeFinding(
  ruleId: string,
  title: string,
  message: string,
  options: ResolvedScanOptions,
  platform: NativePlatform,
  screen: string,
  deepLink: string | undefined,
  node: AgentNode,
  element: NonNullable<NonNullable<Finding["native"]>["element"]>,
  screenshot: string | undefined,
  actionStep: string | undefined,
  severity: Finding["severity"],
  confidence: Finding["confidence"],
  detectionMode: Finding["detectionMode"]
): Finding {
  const appId = options.native.appIds[platform];
  const file = deepLink ?? appId ?? `native:${screen}`;
  const excerpt = JSON.stringify({ ref: node.ref, type: node.type, role: node.role, label: node.label, value: node.value, rect: node.rect });
  const semanticLocation = `${platform}:${screen}:${node.identifier ?? node.ref ?? node.index}`;
  return {
    ruleId,
    title,
    severity,
    confidence,
    impact: severity === "critical" ? "serious" : severity === "warning" ? "moderate" : "minor",
    confidenceReason: detectionMode === "automated" ? "Structured local accessibility-tree evidence directly demonstrates this failure." : "Structured local accessibility-tree evidence identifies a risk that requires context review.",
    detectionMode,
    source: "native-runtime",
    fixKind: detectionMode === "manual-guidance" ? "manual-review" : "guided-fix",
    blocking: detectionMode === "automated" && confidence === "high",
    category: "react-native",
    file,
    line: 1,
    column: 1,
    excerpt,
    message,
    wcag: ruleId.includes("TARGET_SIZE") ? ["2.5.8"] : ["4.1.2"],
    standards: [{ version: "wcag22", criterion: ruleId.includes("TARGET_SIZE") ? "2.5.8" : "4.1.2", level: "a", title: ruleId.includes("TARGET_SIZE") ? "Target Size (Minimum)" : "Name, Role, Value" }],
    platforms: [platform === "ios" ? "react-native-ios" : "react-native-android"],
    target: node.identifier ?? node.ref ?? excerpt,
    semanticLocation,
    fingerprint: fingerprintFinding({ ruleId, file, target: node.identifier ?? node.ref ?? excerpt, semanticLocation }),
    baselineStatus: "active",
    native: { platform, screen, deepLink, accessibilityTree: excerpt, element: { ...element, sourceHint: node.identifier }, screenshot, actionStep }
  };
}

function parseMockSnapshot(value: string): AgentNode[] {
  try {
    const parsed = JSON.parse(value) as AgentNode[] | { nodes?: AgentNode[] };
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.nodes)) return parsed.nodes;
  } catch {
    // Preserve the legacy line mock during the 0.2 -> 1.0 migration.
  }
  return value.split(/\r?\n/).filter(Boolean).map((line, index) => ({
    index,
    ref: `e${index + 1}`,
    label: extractLegacyValue(line, "label"),
    role: extractLegacyValue(line, "role") ?? extractLegacyValue(line, "accessibilityRole"),
    value: extractLegacyValue(line, "state") ?? extractLegacyValue(line, "value"),
    type: /pressable|touchable/i.test(line) ? "button" : undefined,
    visibleToUser: true
  }));
}

function isInteractiveNode(node: AgentNode): boolean {
  return /button|link|switch|checkbox|radio|tab|menuitem|text.?field|input|pressable|touchable/i.test(`${node.role ?? ""} ${node.type ?? ""}`) || node.hittable === true;
}

function isHeadingNode(node: AgentNode): boolean {
  return /heading|header/i.test(`${node.role ?? ""} ${node.subrole ?? ""} ${node.type ?? ""}`);
}

function isModalNode(node: AgentNode): boolean {
  return /dialog|alertdialog/i.test(`${node.role ?? ""} ${node.subrole ?? ""}`)
    && (node.presentationHints?.some((hint) => /modal/i.test(hint)) ?? false);
}

function isDescendant(node: AgentNode, ancestor: AgentNode, nodes: AgentNode[]): boolean {
  const byIndex = new Map(nodes.map((candidate) => [candidate.index, candidate]));
  let parentIndex = node.parentIndex;
  while (parentIndex !== undefined) {
    if (parentIndex === ancestor.index) return true;
    parentIndex = byIndex.get(parentIndex)?.parentIndex;
  }
  return false;
}

function findTraversalRisk(nodes: AgentNode[]): AgentNode | undefined {
  const positioned = nodes.filter((node) => node.rect && node.visibleToUser !== false);
  for (let index = 1; index < positioned.length; index += 1) {
    const previous = positioned[index - 1];
    const current = positioned[index];
    if (!previous?.rect || !current?.rect) continue;
    if (current.rect.y + current.rect.height < previous.rect.y) return current;
  }
  return undefined;
}

function nativeState(node: AgentNode): string | undefined {
  if (node.value !== undefined && String(node.value).trim()) return String(node.value);
  if (node.selected !== undefined) return String(node.selected);
  return undefined;
}

function isStatefulRole(role: string | undefined): boolean {
  return /switch|checkbox|radio|tab/i.test(role ?? "");
}

function isSmallTarget(rect: { width: number; height: number }, platform: NativePlatform): boolean {
  const minimum = platform === "ios" ? 44 : 48;
  return rect.width > 0 && rect.height > 0 && (rect.width < minimum || rect.height < minimum);
}

function clean(value: unknown): string | undefined {
  const normalized = value === undefined || value === null ? "" : String(value).trim();
  return normalized || undefined;
}

function extractLegacyValue(line: string, name: string): string | undefined {
  return line.match(new RegExp(`${name}=["']([^"']+)["']`, "i"))?.[1] ?? line.match(new RegExp(`${name}:\\s*([^,]+)`, "i"))?.[1]?.trim();
}

function describeAction(action: NativeScreenAction): string {
  if ("press" in action) return `press ${action.press}`;
  if ("fill" in action) return `fill ${action.fill}`;
  if ("swipe" in action) return `swipe ${action.swipe}`;
  if ("back" in action) return "back";
  if ("waitFor" in action) return `waitFor ${action.waitFor}`;
  return `assert ${action.assert}`;
}

function safeName(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "screen";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
