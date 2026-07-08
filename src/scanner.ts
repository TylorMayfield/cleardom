import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as puppeteer from "puppeteer-core";
import { fingerprintFinding, markBaselineFindings, readBaseline } from "./baseline.js";
import { resolveBrowserExecutable } from "./browser.js";
import { isRuleEnabled, matchesAnyPattern, normalizeSuppressions, ownerForFinding, resolveComponentMappings, resolveScanOptions, severityOverride } from "./config.js";
import { auditRuntimeUrls, prepareRuntimePage, runRuntimeSetupScript } from "./runtime.js";
import { normalizeRuleId, rules, summarizeRule } from "./rules/index.js";
import { createSemanticProject, isSemanticSourceFile, parseSemanticSource } from "./semantic.js";
import { parseSource, supportedExtensions } from "./source-adapters.js";
import { findStandard, referencesForStandard, resolveStandardId, ruleAppliesToStandard } from "./standards.js";
import { applySuppressions } from "./suppressions.js";
import type { DetectionMode, Finding, FindingImpact, FindingSource, FixKind, JsxAttribute, JsxElement, ResolvedScanOptions, RuleDefinition, RuntimeDiagnostic, RuntimePageResult, ScanOptions, ScanResult, ScoreBreakdown, Severity } from "./types.js";

const ignoredDirectories = new Set([".git", ".cleardom", "node_modules", "dist", "build", ".next", "coverage"]);

export async function scanPath(targetPath: string, options: ScanOptions = {}): Promise<ScanResult> {
  const resolvedOptions = await resolveScanOptions(options);
  const root = path.resolve(targetPath);
  const files = await collectFiles(root, resolvedOptions);
  const semanticProject = createSemanticProject(files, resolvedOptions);
  const findings: Finding[] = [];
  const sources = new Map<string, string>();
  const runtimeDiagnostics: RuntimeDiagnostic[] = [];
  let runtimePages: RuntimePageResult[] = [];

  for (const file of files) {
    const source = await fs.readFile(file, "utf8");
    sources.set(file, source);
    findings.push(...scanSourceWithElements(source, file, semanticProject.elementsByFile.get(file) ?? parseSource(source, file), resolvedOptions));
  }

  const runtimeBaseUrl = resolvedOptions.runtime.baseUrl ?? resolvedOptions.runtimeUrl;
  if (runtimeBaseUrl) {
    const discovered = await discoverRuntimeRoutes(root, resolvedOptions);
    runtimeDiagnostics.push(...discovered.diagnostics);
    const initialRoutes = mergeRoutes(resolvedOptions.runtime.routes, discovered.routes);
    const crawled = await discoverCrawledRoutes(runtimeBaseUrl, initialRoutes, resolvedOptions);
    runtimeDiagnostics.push(...crawled.diagnostics);
    const stories = await discoverStoryRoutes(resolvedOptions);
    runtimeDiagnostics.push(...stories.diagnostics);
    const targets = [
      ...runtimeTargets(runtimeBaseUrl, mergeRoutes(initialRoutes, crawled.routes)),
      ...runtimeTargets(resolvedOptions.runtime.stories.baseUrl || runtimeBaseUrl, stories.routes)
    ];
    const runtime = await auditRuntimeUrls(targets, resolvedOptions);
    runtimeDiagnostics.push(...runtime.diagnostics);
    runtimePages = runtime.pages;
    findings.push(...runtime.findings);
  }

  const suppressionResult = applySuppressions(findings, sources, resolvedOptions);
  const baseline = await readBaseline(resolvedOptions.baseline, resolvedOptions.rootDir);
  const marked = withOwners(markBaselineFindings(suppressionResult.findings, baseline), resolvedOptions);
  const scoreBreakdown = buildScoreBreakdown(marked.activeFindings);
  const score = Math.round(Object.values(scoreBreakdown).reduce((total, value) => total + value, 0) / Object.values(scoreBreakdown).length);

  return {
    checkedFiles: files.length,
    findings: marked.findings,
    activeFindings: marked.activeFindings,
    baselineFindings: marked.baselineFindings,
    suppressedFindings: suppressionResult.suppressedFindings,
    regressions: marked.regressions,
    summary: summarizeFindings(marked, suppressionResult.suppressedFindings.length),
    scoreBreakdown,
    score,
    rules: activeRules(resolvedOptions).map(({ rule, severity }) => summarizeRule(rule, severity)),
    standard: findStandard(resolvedOptions.standard),
    semanticAnalysis: semanticProject.analysis,
    semanticDiagnostics: semanticProject.diagnostics,
    runtimeDiagnostics,
    runtimePages,
    baseline
  };
}

async function discoverStoryRoutes(options: ResolvedScanOptions): Promise<{ routes: string[]; diagnostics: RuntimeDiagnostic[] }> {
  if (!options.runtime.stories.enabled) return { routes: [], diagnostics: [] };
  const baseUrl = options.runtime.stories.baseUrl ?? options.runtime.baseUrl;
  if (!baseUrl) return { routes: [], diagnostics: [{ stage: "discover-routes", severity: "warning", message: "Story scanning is enabled but no Storybook base URL is configured." }] };
  try {
    const response = await fetch(new URL("/index.json", ensureTrailingSlash(baseUrl)));
    if (!response.ok) return { routes: [], diagnostics: [{ stage: "discover-routes", severity: "warning", message: `Storybook index returned HTTP ${response.status}.` }] };
    const index = await response.json() as { entries?: Record<string, { type?: string }> };
    const routes = Object.entries(index.entries ?? {})
      .filter(([, entry]) => entry.type === "story")
      .map(([id]) => `/iframe.html?id=${encodeURIComponent(id)}`)
      .filter((route) => !matchesAnyPattern(route, options.runtime.stories.exclude))
      .filter((route) => options.runtime.stories.include.length === 0 || matchesAnyPattern(route, options.runtime.stories.include));
    return { routes, diagnostics: [] };
  } catch (error) {
    return { routes: [], diagnostics: [{ stage: "discover-routes", severity: "warning", message: `Could not discover Storybook stories: ${error instanceof Error ? error.message : String(error)}` }] };
  }
}

export async function scanUrl(url: string, options: ScanOptions = {}, chromePath?: string): Promise<ScanResult> {
  const resolvedOptions = await resolveScanOptions(options);
  const browserResolution = await resolveBrowserExecutable(resolvedOptions, chromePath);
  const executablePath = browserResolution.executablePath;
  
  if (!executablePath) {
    throw new Error(browserResolution.message);
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const findings: Finding[] = [];
    const sources = new Map<string, string>();
    const runtimeDiagnostics: RuntimeDiagnostic[] = [];
    const targets = runtimeTargets(
      resolvedOptions.runtime.baseUrl ?? url,
      resolvedOptions.runtime.routes.length > 0 ? resolvedOptions.runtime.routes : [runtimeRouteFromUrl(url)]
    );

    for (const target of targets) {
      const page = await browser.newPage();
      try {
        await prepareRuntimePage(page, resolvedOptions.runtime, target.url);
        await runRuntimeSetupScript(page, browser, resolvedOptions.runtime, target.url, target.route);
        const response = await page.goto(target.url, { waitUntil: resolvedOptions.runtime.waitUntil, timeout: resolvedOptions.runtime.timeoutMs });
        if (!response || !response.ok()) {
          runtimeDiagnostics.push({
            url: target.url,
            route: target.route,
            stage: "navigation",
            severity: "error",
            message: `Failed to load ${target.url}: ${response?.status() ?? "no response"}`
          });
          continue;
        }
        const source = await page.content();
        sources.set(target.url, source);
        findings.push(...scanSourceWithElements(source, target.url, parseSource(source, target.url), resolvedOptions));
      } finally {
        await page.close().catch(() => undefined);
      }
    }

    const runtime = await auditRuntimeUrls(targets, resolvedOptions, executablePath, browser);
    runtimeDiagnostics.push(...runtime.diagnostics);
    findings.push(...runtime.findings);

    const suppressionResult = applySuppressions(findings, sources, resolvedOptions);
    const baseline = await readBaseline(resolvedOptions.baseline, resolvedOptions.rootDir);
    const marked = withOwners(markBaselineFindings(suppressionResult.findings, baseline), resolvedOptions);
    const scoreBreakdown = buildScoreBreakdown(marked.activeFindings);
    const score = Math.round(Object.values(scoreBreakdown).reduce((total, value) => total + value, 0) / Object.values(scoreBreakdown).length);

    return {
      checkedFiles: targets.length,
      findings: marked.findings,
      activeFindings: marked.activeFindings,
      baselineFindings: marked.baselineFindings,
      suppressedFindings: suppressionResult.suppressedFindings,
      regressions: marked.regressions,
      summary: summarizeFindings(marked, suppressionResult.suppressedFindings.length),
      scoreBreakdown,
      score,
      rules: activeRules(resolvedOptions).map(({ rule, severity }) => summarizeRule(rule, severity)),
      standard: findStandard(resolvedOptions.standard),
      semanticAnalysis: {
        mode: resolvedOptions.semantic,
        adapter: "lightweight",
        filesAnalyzed: 0,
        filesFallback: 1
      },
      semanticDiagnostics: [{
        file: url,
        message: "Live URL scans use rendered HTML and runtime checks; source semantic analysis is not available.",
        severity: "info",
        adapter: "lightweight"
      }],
      runtimeDiagnostics,
      runtimePages: runtime.pages,
      baseline
    };
  } finally {
    await browser.close();
  }
}

export function scanSource(source: string, file: string, options: ScanOptions | ResolvedScanOptions = {}): Finding[] {
  const resolvedOptions = isResolvedOptions(options) ? options : resolveInlineOptions(options);
  const elements = resolvedOptions.semantic !== "off" && isSemanticSourceFile(file)
    ? parseSemanticSource(source, file)
    : parseSource(source, file);
  const findings = scanSourceWithElements(source, file, elements, resolvedOptions);
  return applySuppressions(findings, new Map([[file, source]]), resolvedOptions).findings;
}

function scanSourceWithElements(source: string, file: string, elements: JsxElement[], resolvedOptions: ResolvedScanOptions): Finding[] {
  const findings: Finding[] = [];

  for (const { rule, severity } of activeRules(resolvedOptions)) {
    const context = createRuleContext(file, source, elements, resolvedOptions, severity);
    findings.push(...rule.check.call(rule, context));
  }

  return findings.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.column - right.column || left.ruleId.localeCompare(right.ruleId));
}

export function shouldFail(result: ScanResult, failOn: ResolvedScanOptions["failOn"]): boolean {
  if (failOn === "none") return false;
  if (failOn === "findings") return result.findings.length > 0;
  if (failOn === "regression") return result.regressions.length > 0;
  if (failOn === "critical") return result.activeFindings.some((finding) => finding.severity === "critical");
  return result.activeFindings.some((finding) => finding.severity === "critical" || finding.severity === "warning");
}

async function collectFiles(targetPath: string, options: ResolvedScanOptions, scanRoot = path.resolve(targetPath)): Promise<string[]> {
  const stat = await fs.stat(targetPath);
  if (stat.isFile()) {
    return shouldScanFile(targetPath, options) ? [targetPath] : [];
  }

  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name) && !isGeneratedOutputDirectory(fullPath, scanRoot) && !isExcluded(fullPath, options)) {
        files.push(...await collectFiles(fullPath, options, scanRoot));
      }
      continue;
    }

    if (entry.isFile() && shouldScanFile(fullPath, options)) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function isGeneratedOutputDirectory(directory: string, scanRoot: string): boolean {
  const resolvedDirectory = path.resolve(directory);
  if (resolvedDirectory === path.resolve(scanRoot)) return false;
  const normalized = resolvedDirectory.replace(/\\/g, "/");
  return normalized.endsWith("/examples/wcag-benchmark/reports") || normalized.includes("/examples/wcag-benchmark/reports/");
}

async function discoverRuntimeRoutes(root: string, options: ResolvedScanOptions): Promise<{ routes: string[]; diagnostics: RuntimeDiagnostic[] }> {
  if (!options.runtime.discoverRoutes) {
    return { routes: [], diagnostics: [] };
  }

  try {
    const files = await collectFiles(root, { ...options, include: [], exclude: options.exclude });
    const routes = new Set<string>();
    for (const file of files) {
      const frameworkRoute = routeFromFrameworkFile(path.relative(root, file));
      if (frameworkRoute) routes.add(frameworkRoute);
      const source = await fs.readFile(file, "utf8");
      for (const match of source.matchAll(/\b(?:href|to|route|path)=["'](\/[^"'#?]*)["']/g)) {
        routes.add(normalizeRoute(match[1]));
      }
    }
    return { routes: [...routes], diagnostics: [] };
  } catch (error) {
    return {
      routes: [],
      diagnostics: [{
        stage: "discover-routes",
        severity: "warning",
        message: `Could not discover runtime routes: ${error instanceof Error ? error.message : String(error)}`
      }]
    };
  }
}

async function discoverCrawledRoutes(baseUrl: string, seedRoutes: string[], options: ResolvedScanOptions): Promise<{ routes: string[]; diagnostics: RuntimeDiagnostic[] }> {
  if (!options.runtime.crawl.enabled) return { routes: [], diagnostics: [] };
  const browserResolution = await resolveBrowserExecutable(options);
  if (!browserResolution.executablePath) {
    return { routes: [], diagnostics: [{ stage: "discover-routes", severity: "warning", message: browserResolution.message }] };
  }

  const browser = await puppeteer.launch({
    executablePath: browserResolution.executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const origin = new URL(baseUrl).origin;
  const seen = new Set(seedRoutes.map(normalizeRoute));
  const queue = seedRoutes.map(normalizeRoute).slice(0, options.runtime.crawl.maxRoutes);
  const diagnostics: RuntimeDiagnostic[] = [];

  try {
    for (let depth = 0; depth <= options.runtime.crawl.maxDepth && queue.length > 0 && seen.size < options.runtime.crawl.maxRoutes; depth += 1) {
      const batch = queue.splice(0, queue.length);
      for (const route of batch) {
        const url = new URL(route, ensureTrailingSlash(baseUrl)).toString();
        const page = await browser.newPage();
        try {
          await prepareRuntimePage(page, options.runtime, url);
          await runRuntimeSetupScript(page, browser, options.runtime, url, route);
          const response = await page.goto(url, { waitUntil: options.runtime.waitUntil, timeout: options.runtime.timeoutMs });
          if (!response?.ok()) continue;
          const links = await page.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].map((anchor) => anchor.href));
          for (const link of links) {
            const parsed = new URL(link);
            if (parsed.origin !== origin) continue;
            const candidate = normalizeRoute(`${parsed.pathname}${parsed.search}`);
            if (seen.has(candidate) || isRuntimeRouteExcluded(candidate, options)) continue;
            seen.add(candidate);
            queue.push(candidate);
            if (seen.size >= options.runtime.crawl.maxRoutes) break;
          }
        } catch (error) {
          diagnostics.push({ stage: "discover-routes", severity: "warning", route, url, message: `Could not crawl ${route}: ${error instanceof Error ? error.message : String(error)}` });
        } finally {
          await page.close().catch(() => undefined);
        }
      }
    }
  } finally {
    await browser.close();
  }

  return { routes: [...seen], diagnostics };
}

function mergeRoutes(configuredRoutes: string[], discoveredRoutes: string[]): string[] {
  const routes = [...new Set([...configuredRoutes, ...discoveredRoutes].map(normalizeRoute))];
  return routes.length > 0 ? routes : ["/"];
}

function isRuntimeRouteExcluded(route: string, options: ResolvedScanOptions): boolean {
  const include = options.runtime.crawl.include;
  if (include.length > 0 && !matchesAnyPattern(route, include)) return true;
  return matchesAnyPattern(route, options.runtime.crawl.exclude);
}

function runtimeTargets(baseUrl: string, routes: string[]): Array<{ url: string; route: string }> {
  const normalizedRoutes = routes.length > 0 ? routes.map(normalizeRoute) : ["/"];
  return normalizedRoutes.map((route) => ({
    route,
    url: new URL(route, ensureTrailingSlash(baseUrl)).toString()
  }));
}

function runtimeRouteFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return normalizeRoute(`${parsed.pathname}${parsed.search}`);
  } catch {
    return "/";
  }
}

function routeFromUrl(url: string): string {
  return runtimeRouteFromUrl(url);
}

function routeFromFrameworkFile(relativeFile: string): string | undefined {
  const normalized = relativeFile.split(path.sep).join("/");
  if (hasDynamicRouteSegment(normalized)) return undefined;

  if (/^(?:src\/)?app\/page\.(?:js|jsx|ts|tsx|mdx)$/.test(normalized)) return "/";
  const appMatch = normalized.match(/^(?:src\/)?app\/(.+)\/page\.(?:js|jsx|ts|tsx|mdx)$/);
  if (appMatch) return routeFromSegments(appMatch[1]);

  const pagesMatch = normalized.match(/^(?:src\/)?pages\/(.+)\.(?:js|jsx|ts|tsx|vue|svelte|astro|mdx)$/);
  if (pagesMatch) return routeFromSegments(pagesMatch[1]);

  const remixMatch = normalized.match(/^app\/routes\/(.+)\.(?:js|jsx|ts|tsx|mdx)$/);
  if (remixMatch) return routeFromSegments(remixMatch[1].replaceAll(".", "/"));

  if (/^src\/routes\/\+page\.(?:js|ts|svelte)$/.test(normalized)) return "/";
  const svelteKitMatch = normalized.match(/^src\/routes\/(.+)\/\+page\.(?:js|ts|svelte)$/);
  if (svelteKitMatch) return routeFromSegments(svelteKitMatch[1]);

  return undefined;
}

function hasDynamicRouteSegment(value: string): boolean {
  return /(?:^|\/)(?:\[|\$|_)/.test(value);
}

function routeFromSegments(value: string): string {
  const route = value
    .replace(/\/?index$/, "")
    .replace(/\/?page$/, "")
    .split("/")
    .filter((segment) => segment && segment !== "route")
    .join("/");
  return normalizeRoute(route);
}

function normalizeRoute(route: string): string {
  const trimmed = route.trim();
  if (!trimmed || trimmed === "*") return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function shouldScanFile(filePath: string, options: ResolvedScanOptions): boolean {
  if (!isSupportedSourceFile(filePath)) return false;
  const relative = path.relative(options.rootDir, filePath);
  if (options.include.length > 0 && !matchesAnyPattern(relative, options.include)) return false;
  return !isExcluded(filePath, options);
}

function isSupportedSourceFile(filePath: string): boolean {
  const normalized = filePath.split(path.sep).join("/");
  return [...supportedExtensions].some((extension) => normalized.endsWith(extension));
}

function isExcluded(filePath: string, options: ResolvedScanOptions): boolean {
  const relative = path.relative(options.rootDir, filePath);
  return options.exclude.length > 0 && matchesAnyPattern(relative, options.exclude);
}

function activeRules(options: ResolvedScanOptions): Array<{ rule: RuleDefinition; severity: Severity }> {
  return rules
    .filter((rule) => ruleAppliesToStandard(rule, options.standard))
    .filter((rule) => isRuleEnabled(rule.id, options.rules[rule.id]))
    .map((rule) => ({ rule, severity: severityOverride(options.rules[rule.id]) ?? rule.severity }));
}

function createRuleContext(
  file: string,
  source: string,
  elements: JsxElement[],
  options: ResolvedScanOptions,
  effectiveSeverity: Severity
) {
  return {
    file,
    source,
    elements,
    options,
    createFinding(rule: RuleDefinition, element: JsxElement, message: string): Finding {
      const target = ruleTarget(element);
      const location = semanticLocation(elements, element);
      return {
        ruleId: rule.id,
        title: rule.title,
        severity: effectiveSeverity,
        confidence: rule.confidence,
        impact: ruleImpact(rule),
        confidenceReason: confidenceReason(rule),
        detectionMode: ruleDetectionMode(rule),
        source: ruleSource(rule, options),
        fixKind: ruleFixKind(rule),
        category: rule.category,
        file,
        line: element.line,
        column: element.column,
        excerpt: element.excerpt,
        message,
        wcag: rule.wcag,
        standards: referencesForStandard(rule, options.standard),
        platforms: rule.platforms,
        target,
        semanticLocation: location,
        fingerprint: fingerprintFinding({
          ruleId: rule.id,
          file,
          target,
          semanticLocation: location
        }),
        baselineStatus: "active"
      };
    },
    getAttribute(element: JsxElement, name: string): JsxAttribute | undefined {
      return element.attributes.find((attribute) => attribute.name.toLowerCase() === name.toLowerCase());
    },
    hasAttribute(element: JsxElement, name: string): boolean {
      return this.getAttribute(element, name) !== undefined;
    },
    elementText(element: JsxElement): string {
      const ariaHidden = this.getAttribute(element, "aria-hidden");
      if (ariaHidden?.value === "true") return "";
      const childText = element.childIds.map((childId) => this.elementText(elements[childId])).join(" ");
      return `${element.ownText} ${childText}`.replace(/\s+/g, " ").trim();
    },
    parentOf(element: JsxElement): JsxElement | undefined {
      return element.parentId === undefined ? undefined : elements[element.parentId];
    },
    findById(id: string): JsxElement | undefined {
      return elements.find((element) => this.getAttribute(element, "id")?.value === id);
    },
    labelsFor(element: JsxElement): JsxElement[] {
      const id = this.getAttribute(element, "id")?.value;
      if (typeof id !== "string") return [];
      return elements.filter((candidate) => {
        if (candidate.tagName.toLowerCase() !== "label") return false;
        return this.getAttribute(candidate, "htmlFor")?.value === id || this.getAttribute(candidate, "for")?.value === id;
      });
    }
  };
}

function scoreCategory(findings: Finding[]): number {
  const penalty = findings.reduce((total, finding) => {
    if (finding.severity === "critical") return total + 12;
    if (finding.severity === "warning") return total + 5;
    return total + 2;
  }, 0);
  return Math.max(0, 100 - penalty);
}

function buildScoreBreakdown(findings: Finding[]): ScoreBreakdown {
  return {
    semanticClarity: scoreCategory(findings.filter((finding) => finding.category === "names-and-roles" || finding.category === "forms" || finding.category === "structure")),
    keyboardFocus: scoreCategory(findings.filter((finding) => finding.category === "keyboard")),
    readability: scoreCategory(findings.filter((finding) => finding.category === "readability")),
    touchAccessibility: scoreCategory(findings.filter((finding) => finding.category === "react-native")),
    standardsCoverage: scoreCategory(findings)
  };
}

function ruleImpact(rule: RuleDefinition): FindingImpact {
  if (rule.impact) return rule.impact;
  if (rule.severity === "critical") return "serious";
  if (rule.severity === "warning") return "moderate";
  return "minor";
}

function ruleDetectionMode(rule: RuleDefinition): DetectionMode {
  if (rule.detectionMode) return rule.detectionMode;
  if (rule.confidence === "high") return "automated";
  if (rule.confidence === "medium") return "needs-review";
  return "manual-guidance";
}

function confidenceReason(rule: RuleDefinition): string {
  if (rule.confidenceReason) return rule.confidenceReason;
  if (ruleDetectionMode(rule) === "automated") return "Static evidence is specific enough to report as an automated finding.";
  if (ruleDetectionMode(rule) === "needs-review") return "Static evidence suggests a likely accessibility risk, but human review should confirm user impact and context.";
  return "This rule maps to WCAG guidance that usually requires human judgment, user context, or runtime evidence.";
}

function ruleSource(rule: RuleDefinition, options: ResolvedScanOptions): FindingSource {
  if (rule.source) return rule.source;
  return options.semantic === "off" ? "static" : "semantic";
}

function ruleFixKind(rule: RuleDefinition): FixKind {
  if (rule.fixKind) return rule.fixKind;
  if (rule.fixable && ruleDetectionMode(rule) === "automated") return "safe-auto-fix";
  if (ruleDetectionMode(rule) === "manual-guidance") return "manual-review";
  return "guided-fix";
}

function ruleTarget(element: JsxElement): string {
  const importantAttributes = ["id", "name", "type", "role", "href", "src", "alt", "aria-label", "aria-labelledby", "for", "htmlFor"];
  const attributes = importantAttributes.flatMap((name) => {
    const attribute = element.attributes.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
    if (!attribute || attribute.value === true) return [];
    return `[${attribute.name}=${normalizeTargetValue(attribute.value)}]`;
  });
  return `${element.tagName.toLowerCase()}${attributes.join("")}`;
}

function semanticLocation(elements: JsxElement[], element: JsxElement): string {
  const parts: string[] = [];
  let current: JsxElement | undefined = element;

  while (current) {
    const siblings = current.parentId === undefined
      ? elements.filter((candidate) => candidate.parentId === undefined)
      : elements[current.parentId]?.childIds.map((childId) => elements[childId]).filter(Boolean) ?? [];
    const sameTagBefore = siblings
      .filter((sibling) => sibling.tagName.toLowerCase() === current?.tagName.toLowerCase() && sibling.id <= (current?.id ?? -1))
      .length;
    parts.unshift(`${current.tagName.toLowerCase()}:nth-${sameTagBefore}`);
    current = current.parentId === undefined ? undefined : elements[current.parentId];
  }

  return parts.join(">");
}

function normalizeTargetValue(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 80);
}

function summarizeFindings(marked: ReturnType<typeof markBaselineFindings>, suppressedFindings: number) {
  return {
    totalFindings: marked.findings.length,
    activeFindings: marked.activeFindings.length,
    baselineFindings: marked.baselineFindings.length,
    suppressedFindings,
    regressions: marked.regressions.length,
    critical: marked.activeFindings.filter((finding) => finding.severity === "critical").length,
    warning: marked.activeFindings.filter((finding) => finding.severity === "warning").length,
    info: marked.activeFindings.filter((finding) => finding.severity === "info").length
  };
}

function withOwners(marked: ReturnType<typeof markBaselineFindings>, options: ResolvedScanOptions): ReturnType<typeof markBaselineFindings> {
  const assign = (finding: Finding): Finding => ({ ...finding, owner: finding.owner ?? ownerForFinding(finding, options) });
  return {
    findings: marked.findings.map(assign),
    activeFindings: marked.activeFindings.map(assign),
    baselineFindings: marked.baselineFindings.map(assign),
    regressions: marked.regressions.map(assign)
  };
}

function isResolvedOptions(options: ScanOptions | ResolvedScanOptions): options is ResolvedScanOptions {
  return "failOn" in options && "rules" in options && "include" in options && "exclude" in options && "standard" in options;
}

function resolveInlineOptions(options: ScanOptions): ResolvedScanOptions {
  return {
    include: options.include ?? [],
    exclude: options.exclude ?? [],
    rules: normalizeInlineRuleOptions(options.rules),
    standard: resolveStandardId(options.standard ?? "wcag22-aa"),
    failOn: options.failOn ?? "none",
    format: options.format ?? "text",
    baseline: options.baseline,
    verbose: options.verbose ?? false,
    runtimeUrl: options.runtimeUrl,
    runtime: {
      baseUrl: options.runtime?.baseUrl ?? options.runtimeUrl,
      routes: options.runtime?.routes ?? [],
      discoverRoutes: options.runtime?.discoverRoutes ?? true,
      viewports: options.runtime?.viewports ?? [{ name: "desktop", width: 1280, height: 900, deviceScaleFactor: 1 }],
      auth: options.runtime?.auth,
      setupScript: options.runtime?.setupScript,
      waitUntil: options.runtime?.waitUntil ?? "networkidle0",
      waitForSelector: options.runtime?.waitForSelector,
      waitForTimeoutMs: options.runtime?.waitForTimeoutMs,
      timeoutMs: options.runtime?.timeoutMs ?? 30000,
      cookies: options.runtime?.cookies ?? [],
      localStorage: options.runtime?.localStorage ?? {},
      headers: options.runtime?.headers ?? {},
      screenshot: options.runtime?.screenshot ?? true,
      browser: {
        mode: options.runtime?.browser?.mode ?? "auto",
        executablePath: options.runtime?.browser?.executablePath ?? ""
      },
      crawl: {
        enabled: options.runtime?.crawl?.enabled ?? false,
        maxDepth: options.runtime?.crawl?.maxDepth ?? 1,
        maxRoutes: options.runtime?.crawl?.maxRoutes ?? 25,
        include: options.runtime?.crawl?.include ?? [],
        exclude: options.runtime?.crawl?.exclude ?? ["/logout", "/sign-out", "/signout", "/delete", "/destroy", "/remove"]
      },
      interactions: {
        presets: options.runtime?.interactions?.presets ?? [],
        scripts: options.runtime?.interactions?.scripts ?? []
      },
      stories: {
        enabled: options.runtime?.stories?.enabled ?? false,
        baseUrl: options.runtime?.stories?.baseUrl ?? "",
        include: options.runtime?.stories?.include ?? [],
        exclude: options.runtime?.stories?.exclude ?? []
      }
    },
    semantic: options.semantic ?? "auto",
    componentPresets: options.componentPresets ?? [],
    components: resolveComponentMappings(options.componentPresets ?? [], {}, options.components),
    suppressions: normalizeSuppressions(options.suppressions, "inline options"),
    suppressionPolicy: {
      requireReason: options.suppressionPolicy?.requireReason ?? true,
      requireExpires: options.suppressionPolicy?.requireExpires ?? true,
      requireApprovedBy: options.suppressionPolicy?.requireApprovedBy ?? true
    },
    ownership: (options.ownership ?? []).map((entry) => ({
      files: entry.files,
      owner: entry.owner,
      reviewers: entry.reviewers ?? [],
      rules: entry.rules ?? []
    })),
    native: {
      enabled: options.native?.enabled ?? false,
      platforms: options.native?.platforms ?? ["ios"],
      provider: options.native?.provider ?? "eas",
      appId: options.native?.appId ?? "",
      deepLinks: options.native?.deepLinks ?? [],
      screens: options.native?.screens ?? [],
      maxDurationMinutes: options.native?.maxDurationMinutes ?? 20
    },
    pr: {
      maxComments: 20,
      severityThreshold: "info",
      commentMode: "both",
      changedFilesOnly: false,
      baselinePolicy: "new",
      statusCheckName: "ClearDOM PR review",
      uploadSarif: false
    },
    packages: [],
    configPath: options.configPath,
    rootDir: process.cwd()
  };
}

function normalizeInlineRuleOptions(rules: ScanOptions["rules"]): ResolvedScanOptions["rules"] {
  return Object.fromEntries(Object.entries(rules ?? {}).map(([ruleId, option]) => [normalizeRuleId(ruleId), option]));
}
