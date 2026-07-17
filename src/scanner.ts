import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as puppeteer from "puppeteer-core";
import { fingerprintFinding, markBaselineFindings, readBaseline } from "./baseline.js";
import { parseWithProjectFrameworkCompiler } from "./framework-compilers.js";
import { resolveBrowserExecutable } from "./browser.js";
import { isRuleEnabled, matchesAnyPattern, normalizeSuppressions, ownerForFinding, resolveComponentMappings, resolveScanOptions, severityOverride } from "./config.js";
import { auditRuntimeUrls, prepareRuntimePage, runRuntimeSetupScript } from "./runtime.js";
import { normalizeRuleId, rules, summarizeRule } from "./rules/index.js";
import { createSemanticProject, isSemanticSourceFile, parseSemanticSource } from "./semantic.js";
import { adapterForFile, parseSource, supportedExtensions } from "./source-adapters.js";
import { findStandard, referencesForStandard, resolveStandardId, ruleAppliesToStandard } from "./standards.js";
import { applySuppressions } from "./suppressions.js";
import type { DetectionMode, Finding, FindingEvidenceOverride, FindingImpact, FindingSource, FixKind, JsxAttribute, JsxElement, ResolvedScanOptions, RuleDefinition, RuntimeDiagnostic, RuntimePageResult, ScanOptions, ScanOutcome, ScanProgress, ScanResult, ScoreBreakdown, SemanticAnalysisSummary, Severity, SuppressedFinding } from "./types.js";

const ignoredDirectories = new Set([".git", ".cleardom", "node_modules", "dist", "build", ".next", "coverage"]);

export async function scanPath(targetPath: string, options: ScanOptions = {}, onProgress?: (progress: ScanProgress) => void): Promise<ScanResult> {
  const startedAt = Date.now();
  const resolvedOptions = await resolveScanOptions(options);
  const root = path.resolve(targetPath);
  const files = await collectFiles(root, resolvedOptions);
  const semanticProject = createSemanticProject(files, resolvedOptions);
  const findings: Finding[] = [];
  const sources = new Map<string, string>();
  const runtimeDiagnostics: RuntimeDiagnostic[] = [];
  let runtimePages: RuntimePageResult[] = [];

  onProgress?.({ phase: "source", files: files.length });

  for (const file of files) {
    const source = await fs.readFile(file, "utf8");
    sources.set(file, source);
    const importSourceText = await adjacentTemplateImportSource(file, source);
    let elements = semanticProject.elementsByFile.get(file);
    if (!elements) {
      const parsed = await parseWithProjectFrameworkCompiler(source, file, resolvedOptions.rootDir, importSourceText);
      elements = parsed.elements;
      if (parsed.diagnostic) semanticProject.diagnostics.push({ file, message: parsed.diagnostic, severity: parsed.compiler ? "info" : "warning", adapter: parsed.compiler ? "framework-compiler" : "lightweight" });
      if (parsed.compiler) {
        semanticProject.analysis.frameworkCompilers ??= {};
        semanticProject.analysis.frameworkCompilers[parsed.compiler] = (semanticProject.analysis.frameworkCompilers[parsed.compiler] ?? 0) + 1;
        semanticProject.analysis.filesFallback = Math.max(0, semanticProject.analysis.filesFallback - 1);
        semanticProject.analysis.filesAnalyzed += 1;
      }
    }
    findings.push(...scanSourceWithElements(source, file, elements, resolvedOptions));
  }
  if (semanticProject.analysis.frameworkCompilers && Object.keys(semanticProject.analysis.frameworkCompilers).length > 0) {
    if (semanticProject.analysis.adapter === "lightweight") semanticProject.analysis.adapter = "framework-compiler";
    const genericFallback = semanticProject.diagnostics.findIndex((diagnostic) => diagnostic.message.includes("non-JavaScript/TypeScript source"));
    if (genericFallback >= 0) semanticProject.diagnostics.splice(genericFallback, 1);
    if (semanticProject.analysis.filesFallback > 0) semanticProject.diagnostics.push({
      message: `${semanticProject.analysis.filesFallback} source ${semanticProject.analysis.filesFallback === 1 ? "file used" : "files used"} the lightweight framework fallback.`,
      severity: "info",
      adapter: "lightweight"
    });
  }
  const sourceFinishedAt = Date.now();
  let runtimeMs = 0;

  const runtimeBaseUrl = resolvedOptions.runtime.baseUrl ?? resolvedOptions.runtimeUrl;
  if (runtimeBaseUrl) {
    onProgress?.({ phase: "runtime-discovery" });
    const discovered = await discoverRuntimeRoutes(root, resolvedOptions);
    runtimeDiagnostics.push(...discovered.diagnostics);
    const initialRoutes = mergeRoutes(resolvedOptions.runtime.routes, discovered.routes);
    const crawled = await discoverCrawledRoutes(runtimeBaseUrl, initialRoutes, resolvedOptions);
    runtimeDiagnostics.push(...crawled.diagnostics);
    const stories = await discoverStoryRoutes(resolvedOptions);
    runtimeDiagnostics.push(...stories.diagnostics);
    const targets = uniqueRuntimeTargets([
      ...runtimeTargets(runtimeBaseUrl, mergeRoutes(initialRoutes, crawled.routes)),
      ...(stories.routes.length > 0 ? runtimeTargets(resolvedOptions.runtime.stories.baseUrl || runtimeBaseUrl, stories.routes) : [])
    ]);
    onProgress?.({ phase: "runtime-browser" });
    onProgress?.({ phase: "runtime-start", pages: targets.length, viewports: resolvedOptions.runtime.viewports.length });
    try {
      const runtime = await auditRuntimeUrls(targets, resolvedOptions, undefined, undefined, onProgress);
      runtimeDiagnostics.push(...runtime.diagnostics);
      runtimePages = runtime.pages;
      findings.push(...runtime.findings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const target of targets) {
        for (const viewport of resolvedOptions.runtime.viewports) {
          runtimePages.push({ ...target, viewport, findings: 0 });
          runtimeDiagnostics.push({
            url: target.url,
            route: target.route,
            viewport: viewport.name,
            stage: "browser",
            severity: "error",
            message: `${message} Recovery: run \`cleardom browser install\` or configure runtime.browser.executablePath, then retry \`cleardom check --runtime-url ${runtimeRecoveryOrigin(runtimeBaseUrl)}\`.`
          });
        }
      }
    }
    runtimeMs = Date.now() - sourceFinishedAt;
  }

  const suppressionResult = applySuppressions(consolidateFindings(findings), sources, resolvedOptions);
  const baseline = await readBaseline(resolvedOptions.baseline, resolvedOptions.rootDir);
  const marked = withOwners(markBaselineFindings(suppressionResult.findings, baseline), resolvedOptions);
  const scoreBreakdown = buildScoreBreakdown(marked.activeFindings);
  const score = Math.round(Object.values(scoreBreakdown).reduce((total, value) => total + value, 0) / Object.values(scoreBreakdown).length);

  return {
    schemaVersion: 1,
    kind: "cleardom-scan-result",
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
    outcome: buildScanOutcome(files.length, semanticProject.analysis, marked.activeFindings, marked.baselineFindings, suppressionResult.suppressedFindings, marked.regressions, Boolean(runtimeBaseUrl), runtimePages, runtimeDiagnostics),
    timings: { totalMs: Date.now() - startedAt, sourceMs: sourceFinishedAt - startedAt, runtimeMs },
    baseline
  };
}

function runtimeRecoveryOrigin(value: string): string {
  try { return new URL(value).origin; } catch { return "http://localhost:3000"; }
}

async function adjacentTemplateImportSource(file: string, source: string): Promise<string> {
  if (!/\.component\.html$/i.test(file)) return source;
  const componentFile = file.replace(/\.html$/i, ".ts");
  try {
    return `${await fs.readFile(componentFile, "utf8")}\n${source}`;
  } catch {
    return source;
  }
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

export async function scanUrl(url: string, options: ScanOptions = {}, chromePath?: string, onProgress?: (progress: ScanProgress) => void): Promise<ScanResult> {
  const startedAt = Date.now();
  const resolvedOptions = await resolveScanOptions(options);
  onProgress?.({ phase: "runtime-browser" });
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

    onProgress?.({ phase: "source", files: targets.length });

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
    const sourceFinishedAt = Date.now();

    onProgress?.({ phase: "runtime-start", pages: targets.length, viewports: resolvedOptions.runtime.viewports.length });
    const runtime = await auditRuntimeUrls(targets, resolvedOptions, executablePath, browser, onProgress);
    runtimeDiagnostics.push(...runtime.diagnostics);
    findings.push(...runtime.findings);
    const runtimeMs = Date.now() - sourceFinishedAt;

    const suppressionResult = applySuppressions(consolidateFindings(findings), sources, resolvedOptions);
    const baseline = await readBaseline(resolvedOptions.baseline, resolvedOptions.rootDir);
    const marked = withOwners(markBaselineFindings(suppressionResult.findings, baseline), resolvedOptions);
    const scoreBreakdown = buildScoreBreakdown(marked.activeFindings);
    const score = Math.round(Object.values(scoreBreakdown).reduce((total, value) => total + value, 0) / Object.values(scoreBreakdown).length);

    return {
      schemaVersion: 1,
      kind: "cleardom-scan-result",
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
      outcome: buildScanOutcome(targets.length, {
        mode: resolvedOptions.semantic,
        adapter: "lightweight",
        filesAnalyzed: 0,
        filesFallback: targets.length
      }, marked.activeFindings, marked.baselineFindings, suppressionResult.suppressedFindings, marked.regressions, true, runtime.pages, runtimeDiagnostics),
      timings: { totalMs: Date.now() - startedAt, sourceMs: sourceFinishedAt - startedAt, runtimeMs },
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

export function consolidateFindings(findings: Finding[]): Finding[] {
  const consolidated: Finding[] = [];
  for (const finding of findings) {
    const exact = consolidated.find((candidate) => candidate.fingerprint === finding.fingerprint);
    if (exact) {
      exact.occurrences = mergeOccurrences(exact, finding);
      continue;
    }
    if (finding.runtime) {
      const correlated = correlatedSourceFinding(consolidated, finding);
      if (correlated) {
        correlated.runtime ??= finding.runtime;
        correlated.blocking = Boolean(correlated.blocking || finding.blocking);
        correlated.occurrences = mergeOccurrences(correlated, finding);
        continue;
      }
    }
    consolidated.push({ ...finding, occurrences: finding.occurrences ?? [findingOccurrence(finding)] });
  }
  return consolidated;
}

function correlatedSourceFinding(candidates: Finding[], runtime: Finding): Finding | undefined {
  const sourceCandidates = candidates.filter((candidate) => candidate.ruleId === runtime.ruleId && candidate.source !== "runtime" && candidate.source !== "native-runtime");
  const dom = runtime.runtime?.evidence?.domSnippet ?? "";
  const selector = runtime.runtime?.selector ?? "";
  const matches = sourceCandidates.filter((candidate) => {
    const id = candidate.target.match(/\[id=([^\]]+)\]/)?.[1];
    if (id && (selector.includes(`#${id}`) || dom.includes(`id=\"${id}\"`) || dom.includes(`id='${id}'`))) return true;
    const label = candidate.target.match(/\[aria-label=([^\]]+)\]/)?.[1];
    return Boolean(label && (dom.includes(`aria-label=\"${label}\"`) || dom.includes(`aria-label='${label}'`)));
  });
  return matches.length === 1 ? matches[0] : undefined;
}

function mergeOccurrences(left: Finding, right: Finding) {
  const occurrences = [...(left.occurrences ?? [findingOccurrence(left)]), ...(right.occurrences ?? [findingOccurrence(right)])];
  return [...new Map(occurrences.map((occurrence) => [`${occurrence.source}\0${occurrence.file}\0${occurrence.line}\0${occurrence.column}\0${occurrence.runtime?.route ?? ""}\0${occurrence.runtime?.viewport.name ?? ""}`, occurrence])).values()];
}

function findingOccurrence(finding: Finding) {
  return { source: finding.source, file: finding.file, line: finding.line, column: finding.column, runtime: finding.runtime, native: finding.native };
}

export function shouldFail(result: ScanResult, failOn: ResolvedScanOptions["failOn"]): boolean {
  if (failOn === "none") return false;
  if (failOn === "findings") return result.findings.some(isBlockingFinding);
  if (failOn === "regression") return result.regressions.some(isBlockingFinding);
  if (failOn === "critical") return result.activeFindings.some((finding) => isBlockingFinding(finding) && finding.severity === "critical");
  return result.activeFindings.some((finding) => isBlockingFinding(finding) && (finding.severity === "critical" || finding.severity === "warning"));
}

export function isBlockingFinding(finding: Finding): boolean {
  return finding.blocking ?? (finding.detectionMode === "automated" && finding.confidence === "high");
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
  if (new URL(baseUrl).protocol === "file:") {
    return [{ url: new URL(baseUrl).toString(), route: "/" }];
  }
  const normalizedRoutes = routes.map(normalizeRoute);
  return normalizedRoutes.map((route) => ({
    route,
    url: new URL(route, ensureTrailingSlash(baseUrl)).toString()
  }));
}

function uniqueRuntimeTargets(targets: Array<{ url: string; route: string }>): Array<{ url: string; route: string }> {
  const unique = new Map<string, { url: string; route: string }>();
  for (const target of targets) {
    const normalized = { url: new URL(target.url).toString(), route: normalizeRoute(target.route) };
    unique.set(`${normalized.url}\n${normalized.route}`, normalized);
  }
  return [...unique.values()];
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
    createFinding(rule: RuleDefinition, element: JsxElement, message: string, evidence?: FindingEvidenceOverride): Finding {
      const target = ruleTarget(element);
      const location = semanticLocation(elements, element);
      return {
        ruleId: rule.id,
        title: rule.title,
        severity: effectiveSeverity,
        confidence: evidence?.confidence ?? (evidence?.state === "unresolved" ? "medium" : rule.confidence),
        impact: ruleImpact(rule),
        confidenceReason: evidence?.confidenceReason ?? (evidence?.state === "unresolved" ? "Static evidence is unresolved; rendered output or human review must confirm whether a violation exists." : confidenceReason(rule)),
        detectionMode: evidence?.detectionMode ?? (evidence?.state === "unresolved" ? "needs-review" : ruleDetectionMode(rule)),
        evidenceState: evidence?.state ?? "proven-violation",
        source: ruleSource(rule, options, file),
        fixKind: evidence?.fixKind ?? (evidence?.state === "unresolved" ? "guided-fix" : ruleFixKind(rule)),
        blocking: evidence?.blocking ?? (evidence?.state === "unresolved" ? false : ruleBlocking(rule, options, file)),
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
          file: fingerprintSourceFile(file, options.rootDir),
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

function fingerprintSourceFile(file: string, rootDir: string): string {
  if (!path.isAbsolute(file)) return file;
  const relative = path.relative(rootDir, file);
  return relative && !relative.startsWith(`..${path.sep}`) && relative !== ".." ? relative : path.basename(file);
}

function ruleBlocking(rule: RuleDefinition, options: ResolvedScanOptions, file: string): boolean {
  const configured = options.rules[rule.id];
  if (configured && typeof configured === "object" && configured.blocking !== undefined) return configured.blocking;
  const adapter = adapterForFile(file);
  if (adapter && adapter.id !== "jsx") return false;
  return ruleDetectionMode(rule) === "automated" && rule.confidence === "high";
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

function ruleSource(rule: RuleDefinition, options: ResolvedScanOptions, file: string): FindingSource {
  if (rule.source === "runtime" || rule.source === "native-runtime") return rule.source;
  const adapter = adapterForFile(file);
  if (adapter && adapter.id !== "jsx") return "static";
  return options.semantic === "off" ? "static" : (rule.source ?? "semantic");
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

function buildScanOutcome(
  checkedFiles: number,
  semantic: SemanticAnalysisSummary,
  activeFindings: Finding[],
  baselineFindings: Finding[],
  suppressedFindings: SuppressedFinding[],
  regressions: Finding[],
  runtimeRequested: boolean,
  runtimePages: RuntimePageResult[],
  runtimeDiagnostics: RuntimeDiagnostic[]
): ScanOutcome {
  const failedPageKeys = new Set(runtimeDiagnostics
    .filter((diagnostic) => diagnostic.severity === "error" && Boolean(diagnostic.url))
    .map((diagnostic) => `${diagnostic.url}\0${diagnostic.route ?? "/"}\0${diagnostic.viewport ?? ""}`));
  const pageFailed = (page: RuntimePageResult): boolean => failedPageKeys.has(`${page.url}\0${page.route}\0${page.viewport.name ?? ""}`)
    || failedPageKeys.has(`${page.url}\0${page.route}\0`);

  return {
    source: {
      requestedFiles: checkedFiles,
      completedFiles: checkedFiles,
      semanticFiles: semantic.filesAnalyzed,
      fallbackFiles: semantic.filesFallback
    },
    runtime: {
      requested: runtimeRequested,
      attemptedPages: runtimePages.length,
      completedPages: runtimePages.filter((page) => !pageFailed(page)).length,
      failedPages: runtimePages.filter(pageFailed).length
    },
    native: {
      requested: false,
      capturedStates: 0,
      findings: 0
    },
    findings: {
      automated: activeFindings.filter((finding) => finding.detectionMode === "automated").length,
      needsReview: activeFindings.filter((finding) => finding.detectionMode === "needs-review").length,
      manualGuidance: activeFindings.filter((finding) => finding.detectionMode === "manual-guidance").length,
      safeAutoFix: activeFindings.filter((finding) => finding.fixKind === "safe-auto-fix").length,
      guidedFix: activeFindings.filter((finding) => finding.fixKind === "guided-fix").length,
      manualReview: activeFindings.filter((finding) => finding.fixKind === "manual-review").length,
      suppressed: suppressedFindings.length,
      baselined: baselineFindings.length,
      regressions: regressions.length
    }
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
      runner: "local",
      appIds: options.native?.appIds ?? (options.native?.appId ? { [options.native.platforms?.[0] ?? "ios"]: options.native.appId } : {}),
      devices: options.native?.devices ?? {},
      deepLinks: options.native?.deepLinks ?? [],
      screens: options.native?.screens ?? [],
      maxDurationMinutes: options.native?.maxDurationMinutes ?? 20
    },
    telemetry: { enabled: options.telemetry?.enabled ?? true },
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
