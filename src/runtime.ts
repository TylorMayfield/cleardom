import { pathToFileURL } from "node:url";
import * as puppeteer from "puppeteer-core";
import { fingerprintFinding } from "./baseline.js";
import { resolveBrowserExecutable } from "./browser.js";
import { isRuleEnabled, severityOverride } from "./config.js";
import {
  collectContrastIssues,
  collectFocusObscuredIssues,
  collectFocusVisibleIssues,
  collectReflowIssues,
  collectSkipLinkIssues,
  collectTargetSizeIssues,
  collectTextSpacingIssues,
  contrastRatio,
  directText,
  effectiveBackground,
  elementText,
  hoverFocusTriggerElements,
  interactiveElements,
  isInsideModal,
  isVisible,
  nearestNonModalRegion,
  overlapKeys,
  parseColor,
  rectsOverlap,
  relativeLuminance,
  selectorFor,
  visibleElementSnapshots
} from "./runtime-browser.js";
import { collectHoverFocusContentIssues, collectKeyboardTrapIssues } from "./runtime-interactions.js";
import type { RuntimeIssue } from "./runtime-types.js";
import { contrastRuntimeRule, focusObscuredRuntimeRule, focusVisibleRuntimeRule, hoverFocusContentRuntimeRule, keyboardTrapRuntimeRule, reflowRuntimeRule, skipLinkRuntimeRule, targetSizeRuntimeRule, textSpacingRuntimeRule } from "./rules/runtime-rules.js";
import { referencesForStandard, ruleAppliesToStandard } from "./standards.js";
import type { Finding, ResolvedRuntimeScanConfig, ResolvedScanOptions, RuleDefinition, RuntimeDiagnostic, RuntimePageResult, RuntimeViewport, ScanProgress, Severity } from "./types.js";

const runtimeRules = [
  contrastRuntimeRule,
  focusVisibleRuntimeRule,
  targetSizeRuntimeRule,
  reflowRuntimeRule,
  skipLinkRuntimeRule,
  textSpacingRuntimeRule,
  hoverFocusContentRuntimeRule,
  keyboardTrapRuntimeRule,
  focusObscuredRuntimeRule
];

export async function auditRuntimeUrl(url: string, options: ResolvedScanOptions, chromePath?: string): Promise<Finding[]> {
  const result = await auditRuntimeUrls([{ url, route: routeFromUrl(url) }], options, chromePath);
  return result.findings;
}

export async function auditRuntimeUrls(
  pages: Array<{ url: string; route: string }>,
  options: ResolvedScanOptions,
  chromePath?: string,
  browser?: puppeteer.Browser,
  onProgress?: (progress: ScanProgress) => void
): Promise<{ findings: Finding[]; diagnostics: RuntimeDiagnostic[]; pages: RuntimePageResult[] }> {
  const browserResolution = await resolveBrowserExecutable(options, chromePath);
  const executablePath = browserResolution.executablePath;
  if (!browser && !executablePath) {
    throw new Error(browserResolution.message);
  }

  const ownedBrowser = browser ? undefined : await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const activeBrowser = browser ?? ownedBrowser;
  if (!activeBrowser) throw new Error("Runtime checks could not start Chromium.");

  try {
    const diagnostics: RuntimeDiagnostic[] = [];
    const pageResults: RuntimePageResult[] = [];
    const findings: Finding[] = [];

    const total = pages.length * options.runtime.viewports.length;
    let completed = 0;
    for (const target of pages) {
      for (const viewport of options.runtime.viewports) {
        const page = await activeBrowser.newPage();
        try {
          const result = await auditRuntimePage(page, target.url, target.route, viewport, options);
          diagnostics.push(...result.diagnostics);
          pageResults.push({ url: target.url, route: target.route, viewport, status: result.status, findings: result.findings.length });
          findings.push(...result.findings);
          completed += 1;
          onProgress?.({ phase: "runtime-page", completed, total, route: target.route, viewport });
        } finally {
          await page.close().catch(() => undefined);
        }
      }
    }

    return { findings, diagnostics, pages: pageResults };
  } finally {
    if (ownedBrowser) await ownedBrowser.close();
  }
}

export async function prepareRuntimePage(page: puppeteer.Page, config: ResolvedRuntimeScanConfig, url: string): Promise<void> {
  if (Object.keys(config.headers).length > 0) {
    await page.setExtraHTTPHeaders(config.headers);
  }

  if (config.cookies.length > 0) {
    await page.setCookie(...config.cookies.map((cookie) => cookie.url ? cookie : { ...cookie, url }) as Parameters<typeof page.setCookie>);
  }

  if (Object.keys(config.localStorage).length > 0) {
    await page.evaluateOnNewDocument((entries: Array<[string, string]>) => {
      for (const [key, value] of entries) {
        window.localStorage.setItem(key, value);
      }
    }, Object.entries(config.localStorage));
  }
}

export async function runRuntimeSetupScript(
  page: puppeteer.Page,
  browser: puppeteer.Browser,
  config: ResolvedRuntimeScanConfig,
  url: string,
  route: string
): Promise<void> {
  const setupScript = config.setupScript ?? config.auth?.setupScript;
  if (!setupScript) return;
  const moduleUrl = pathToFileURL(setupScript).href;
  const imported = await import(moduleUrl) as {
    default?: (context: RuntimeSetupContext) => Promise<void> | void;
    setup?: (context: RuntimeSetupContext) => Promise<void> | void;
  };
  const setup = imported.default ?? imported.setup;
  if (typeof setup !== "function") {
    throw new Error(`Runtime setup script ${setupScript} must export a default function or setup function.`);
  }
  await setup({ page, browser, config, url, route });
}

type RuntimeSetupContext = {
  page: puppeteer.Page;
  browser: puppeteer.Browser;
  config: ResolvedRuntimeScanConfig;
  url: string;
  route: string;
};

async function auditRuntimePage(
  page: puppeteer.Page,
  url: string,
  route: string,
  viewport: RuntimeViewport,
  options: ResolvedScanOptions
): Promise<{ findings: Finding[]; diagnostics: RuntimeDiagnostic[]; status?: number }> {
  const diagnostics: RuntimeDiagnostic[] = [];
  const browser = page.browser();
  await page.setViewport({
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
    isMobile: viewport.isMobile
  });

  try {
    await prepareRuntimePage(page, options.runtime, url);
    await runRuntimeSetupScript(page, browser, options.runtime, url, route);
  } catch (error) {
    diagnostics.push(runtimeDiagnostic("setup", url, route, viewport, error, "error"));
  }

  let status: number | undefined;
  try {
    const response = await page.goto(url, { waitUntil: options.runtime.waitUntil, timeout: options.runtime.timeoutMs });
    status = response?.status();
    if (!response || !response.ok()) {
      diagnostics.push({
        url,
        route,
        viewport: viewport.name,
        stage: "navigation",
        severity: "error",
        message: `Failed to load ${url}: ${status ?? "no response"}`
      });
      return { findings: [], diagnostics, status };
    }
    if (options.runtime.waitForSelector) {
      await page.waitForSelector(options.runtime.waitForSelector, { timeout: options.runtime.timeoutMs });
    }
    if (options.runtime.waitForTimeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, options.runtime.waitForTimeoutMs));
    }
  } catch (error) {
    diagnostics.push(runtimeDiagnostic("navigation", url, route, viewport, error, "error"));
    return { findings: [], diagnostics, status };
  }

  try {
    await page.evaluate(runtimeCollectorScript());
  } catch (error) {
    diagnostics.push(runtimeDiagnostic("collector", url, route, viewport, error, "error"));
    return { findings: [], diagnostics, status };
  }

  const issues: RuntimeIssue[] = [];
  await collectRuntimeIssues(page, issues, diagnostics, url, route, viewport, options);

  const findings: Finding[] = [];
  for (const issue of issues) {
    const rule = runtimeRules.find((candidate) => candidate.id === issue.ruleId);
    if (!rule || !ruleAppliesToStandard(rule, options.standard) || !isRuleEnabled(rule.id, options.rules[rule.id])) continue;
    const evidence = options.runtime.screenshot ? await captureRuntimeEvidence(page, issue.selector, diagnostics, url, route, viewport, issue.interactionStep) : undefined;
    findings.push(runtimeFinding(rule, issue, url, route, viewport, evidence?.elementScreenshot ?? evidence?.pageScreenshot, evidence, options, severityOverride(options.rules[rule.id]) ?? rule.severity));
  }

  return { findings, diagnostics, status };
}

async function collectRuntimeIssues(
  page: puppeteer.Page,
  issues: RuntimeIssue[],
  diagnostics: RuntimeDiagnostic[],
  url: string,
  route: string,
  viewport: RuntimeViewport,
  options: ResolvedScanOptions
): Promise<void> {
  await collectBaseRuntimeIssues(page, issues, diagnostics, url, route, viewport);
  await collectInteractionRuntimeIssues(page, issues, diagnostics, url, route, viewport, options);
}

async function collectBaseRuntimeIssues(
  page: puppeteer.Page,
  issues: RuntimeIssue[],
  diagnostics: RuntimeDiagnostic[],
  url: string,
  route: string,
  viewport: RuntimeViewport,
  interactionStep?: string
): Promise<void> {
  const collectors: Array<() => Promise<RuntimeIssue[]>> = [
    async () => page.evaluate("collectContrastIssues()") as Promise<RuntimeIssue[]>,
    async () => page.evaluate("collectFocusVisibleIssues()") as Promise<RuntimeIssue[]>,
    async () => page.evaluate("collectTargetSizeIssues()") as Promise<RuntimeIssue[]>,
    async () => page.evaluate("collectSkipLinkIssues()") as Promise<RuntimeIssue[]>,
    async () => page.evaluate("collectTextSpacingIssues()") as Promise<RuntimeIssue[]>,
    async () => collectHoverFocusContentIssues(page),
    async () => collectKeyboardTrapIssues(page),
    async () => page.evaluate("collectFocusObscuredIssues()") as Promise<RuntimeIssue[]>,
    async () => page.evaluate("collectReflowIssues()") as Promise<RuntimeIssue[]>
  ];

  for (const collector of collectors) {
    try {
      const collected = await collector();
      issues.push(...collected.map((issue) => ({ ...issue, interactionStep: interactionStep ?? issue.interactionStep })));
      if (collected.length === 25) {
        diagnostics.push({
          url,
          route,
          viewport: viewport.name,
          stage: "collector",
          severity: "warning",
          message: `${collected[0]?.ruleId ?? "Runtime collector"} reached the 25-finding limit; additional issues may exist.`
        });
      }
    } catch (error) {
      diagnostics.push(runtimeDiagnostic("collector", url, route, viewport, error, "warning"));
    }
  }
}

async function collectInteractionRuntimeIssues(
  page: puppeteer.Page,
  issues: RuntimeIssue[],
  diagnostics: RuntimeDiagnostic[],
  url: string,
  route: string,
  viewport: RuntimeViewport,
  options: ResolvedScanOptions
): Promise<void> {
  for (const preset of options.runtime.interactions.presets) {
    try {
      const steps = await runInteractionPreset(page, preset);
      for (const step of steps) {
        await collectBaseRuntimeIssues(page, issues, diagnostics, url, route, viewport, step);
      }
    } catch (error) {
      diagnostics.push(runtimeDiagnostic("interaction", url, route, viewport, error, "warning"));
    }
  }

  for (const script of options.runtime.interactions.scripts) {
    try {
      const moduleUrl = pathToFileURL(script).href;
      const imported = await import(moduleUrl) as {
        default?: (context: RuntimeSetupContext) => Promise<string[] | void> | string[] | void;
        interactions?: (context: RuntimeSetupContext) => Promise<string[] | void> | string[] | void;
      };
      const run = imported.default ?? imported.interactions;
      if (typeof run !== "function") throw new Error(`Interaction script ${script} must export default or interactions.`);
      const steps = await run({ page, browser: page.browser(), config: options.runtime, url, route }) ?? [`script:${script}`];
      for (const step of steps) {
        await collectBaseRuntimeIssues(page, issues, diagnostics, url, route, viewport, step);
      }
    } catch (error) {
      diagnostics.push(runtimeDiagnostic("interaction", url, route, viewport, error, "warning"));
    }
  }
}

async function runInteractionPreset(page: puppeteer.Page, preset: string): Promise<string[]> {
  if (preset === "menus" || preset === "dialogs" || preset === "drawers") {
    const selector = await page.evaluate(() => {
      const candidates = [...document.querySelectorAll<HTMLElement>("[aria-haspopup], [aria-controls], button")];
      return candidates.map((element) => selectorFor(element)).find(Boolean);
    }) as string | undefined;
    if (!selector) return [];
    await page.click(selector).catch(() => undefined);
    await waitForInteraction();
    return [`preset:${preset}:${selector}`];
  }

  if (preset === "accordions") {
    const selector = await page.evaluate(() => {
      const candidates = [...document.querySelectorAll<HTMLElement>("[aria-expanded], summary")];
      return candidates.map((element) => selectorFor(element)).find(Boolean);
    }) as string | undefined;
    if (!selector) return [];
    await page.click(selector).catch(() => undefined);
    await waitForInteraction();
    return [`preset:${preset}:${selector}`];
  }

  if (preset === "forms") {
    const selector = await page.evaluate(() => {
      const candidate = document.querySelector<HTMLElement>("input:not([type=hidden]), textarea");
      return candidate ? selectorFor(candidate) : undefined;
    }) as string | undefined;
    if (!selector) return [];
    await page.focus(selector).catch(() => undefined);
    await page.keyboard.type("ClearDOM test").catch(() => undefined);
    await waitForInteraction();
    return [`preset:${preset}:${selector}`];
  }

  return [];
}

function waitForInteraction(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

async function captureRuntimeScreenshot(
  page: puppeteer.Page,
  selector: string,
  diagnostics: RuntimeDiagnostic[],
  url: string,
  route: string,
  viewport: RuntimeViewport
): Promise<string | undefined> {
  try {
    if (selector !== "document") {
      const element = await page.$(selector);
      if (element) {
        const base64 = await element.screenshot({ encoding: "base64" });
        return `data:image/png;base64,${base64}`;
      }
    }
    const base64 = await page.screenshot({ encoding: "base64", fullPage: false });
    return `data:image/png;base64,${base64}`;
  } catch (error) {
    diagnostics.push(runtimeDiagnostic("screenshot", url, route, viewport, error, "warning"));
    return undefined;
  }
}

async function captureRuntimeEvidence(
  page: puppeteer.Page,
  selector: string,
  diagnostics: RuntimeDiagnostic[],
  url: string,
  route: string,
  viewport: RuntimeViewport,
  interactionStep?: string
): Promise<NonNullable<Finding["runtime"]>["evidence"] | undefined> {
  const pageScreenshot = await captureRuntimeScreenshot(page, "document", diagnostics, url, route, viewport);
  const elementScreenshot = await captureRuntimeScreenshot(page, selector, diagnostics, url, route, viewport);
  const domSnippet = await page.evaluate((value) => document.querySelector(value)?.outerHTML.slice(0, 1000), selector).catch(() => undefined) as string | undefined;
  return {
    pageScreenshot,
    elementScreenshot,
    highlightedScreenshot: elementScreenshot,
    domSnippet,
    route,
    viewport,
    interactionStep,
    timestamp: new Date().toISOString()
  };
}

function runtimeDiagnostic(
  stage: RuntimeDiagnostic["stage"],
  url: string,
  route: string,
  viewport: RuntimeViewport,
  error: unknown,
  severity: RuntimeDiagnostic["severity"]
): RuntimeDiagnostic {
  return {
    url,
    route,
    viewport: viewport.name,
    stage,
    severity,
    message: error instanceof Error ? error.message : String(error)
  };
}

function runtimeCollectorScript(): string {
  return [
    collectContrastIssues,
    collectFocusVisibleIssues,
    collectTargetSizeIssues,
    collectReflowIssues,
    collectSkipLinkIssues,
    collectTextSpacingIssues,
    collectFocusObscuredIssues,
    interactiveElements,
    hoverFocusTriggerElements,
    isVisible,
    directText,
    elementText,
    visibleElementSnapshots,
    overlapKeys,
    rectsOverlap,
    nearestNonModalRegion,
    isInsideModal,
    effectiveBackground,
    parseColor,
    contrastRatio,
    relativeLuminance,
    selectorFor
  ].map((collector) => collector.toString()).join("\n");
}

function runtimeFinding(
  rule: RuleDefinition,
  issue: RuntimeIssue,
  url: string,
  route: string,
  viewport: RuntimeViewport,
  screenshot: string | undefined,
  evidence: NonNullable<Finding["runtime"]>["evidence"] | undefined,
  options: ResolvedScanOptions,
  severity: Severity
): Finding {
  const excerpt = issue.selector;
  return {
    ruleId: rule.id,
    title: rule.title,
    severity,
    confidence: rule.confidence,
    impact: rule.impact ?? (severity === "critical" ? "serious" : severity === "warning" ? "moderate" : "minor"),
    confidenceReason: rule.confidenceReason ?? "Rendered-page evidence was collected from the browser runtime.",
    detectionMode: rule.detectionMode ?? (rule.confidence === "high" ? "automated" : rule.confidence === "medium" ? "needs-review" : "manual-guidance"),
    source: "runtime",
    fixKind: rule.fixKind ?? (rule.fixable && rule.confidence === "high" ? "safe-auto-fix" : "guided-fix"),
    category: rule.category,
    file: url,
    line: 1,
    column: 1,
    excerpt,
    message: issue.message,
    wcag: rule.wcag,
    standards: referencesForStandard(rule, options.standard),
    platforms: rule.platforms,
    target: excerpt,
    semanticLocation: excerpt,
    fingerprint: fingerprintFinding({
      ruleId: rule.id,
      file: url,
      target: excerpt,
      semanticLocation: excerpt
    }),
    baselineStatus: "active",
    runtime: {
      url,
      route,
      viewport,
      selector: issue.selector,
      screenshot,
      evidence
    }
  };
}

export function routeFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
  } catch {
    return url;
  }
}
