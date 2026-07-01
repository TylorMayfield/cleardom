import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as puppeteer from "puppeteer-core";
import { fingerprintFinding, markBaselineFindings, readBaseline } from "./baseline.js";
import { isRuleEnabled, matchesAnyPattern, resolveComponentMappings, resolveScanOptions, severityOverride } from "./config.js";
import { parseJsx } from "./jsx-parser.js";
import { auditRuntimeUrl } from "./runtime.js";
import { rules, summarizeRule } from "./rules/index.js";
import { findStandard, referencesForStandard, resolveStandardId, ruleAppliesToStandard } from "./standards.js";
import type { Finding, JsxAttribute, JsxElement, ResolvedScanOptions, RuleDefinition, ScanOptions, ScanResult, ScoreBreakdown, Severity } from "./types.js";

const scanExtensions = new Set([".jsx", ".tsx", ".js", ".ts", ".html"]);
const ignoredDirectories = new Set([".git", "node_modules", "dist", "build", ".next", "coverage"]);

export async function scanPath(targetPath: string, options: ScanOptions = {}): Promise<ScanResult> {
  const resolvedOptions = await resolveScanOptions(options);
  const root = path.resolve(targetPath);
  const files = await collectFiles(root, resolvedOptions);
  const findings: Finding[] = [];

  for (const file of files) {
    const source = await fs.readFile(file, "utf8");
    findings.push(...scanSource(source, file, resolvedOptions));
  }

  if (resolvedOptions.runtimeUrl) {
    findings.push(...await auditRuntimeUrl(resolvedOptions.runtimeUrl, resolvedOptions));
  }

  const baseline = await readBaseline(resolvedOptions.baseline, resolvedOptions.rootDir);
  const marked = markBaselineFindings(findings, baseline);
  const scoreBreakdown = buildScoreBreakdown(marked.activeFindings);
  const score = Math.round(Object.values(scoreBreakdown).reduce((total, value) => total + value, 0) / Object.values(scoreBreakdown).length);

  return {
    checkedFiles: files.length,
    findings: marked.findings,
    activeFindings: marked.activeFindings,
    baselineFindings: marked.baselineFindings,
    regressions: marked.regressions,
    summary: summarizeFindings(marked),
    scoreBreakdown,
    score,
    rules: activeRules(resolvedOptions).map(({ rule, severity }) => summarizeRule(rule, severity)),
    standard: findStandard(resolvedOptions.standard),
    baseline
  };
}

export async function scanUrl(url: string, options: ScanOptions = {}, chromePath?: string): Promise<ScanResult> {
  const resolvedOptions = await resolveScanOptions(options);
  const executablePath = chromePath ?? process.env.CHROME_PATH ?? process.env.PUPPETEER_EXECUTABLE_PATH;
  
  if (!executablePath) {
    throw new Error("Scanning live URLs requires CHROME_PATH or PUPPETEER_EXECUTABLE_PATH to point to a Chromium/Chrome executable.");
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    const response = await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    
    if (!response || !response.ok()) {
      throw new Error(`Failed to load ${url}: ${response?.status()}`);
    }

    const source = await page.content();
    const findings: Finding[] = [];
    
    // Scan the static HTML source
    findings.push(...scanSource(source, url, resolvedOptions));

    const baseline = await readBaseline(resolvedOptions.baseline, resolvedOptions.rootDir);
    const marked = markBaselineFindings(findings, baseline);
    const scoreBreakdown = buildScoreBreakdown(marked.activeFindings);
    const score = Math.round(Object.values(scoreBreakdown).reduce((total, value) => total + value, 0) / Object.values(scoreBreakdown).length);

    return {
      checkedFiles: 1,
      findings: marked.findings,
      activeFindings: marked.activeFindings,
      baselineFindings: marked.baselineFindings,
      regressions: marked.regressions,
      summary: summarizeFindings(marked),
      scoreBreakdown,
      score,
      rules: activeRules(resolvedOptions).map(({ rule, severity }) => summarizeRule(rule, severity)),
      standard: findStandard(resolvedOptions.standard),
      baseline
    };
  } finally {
    await browser.close();
  }
}

export function scanSource(source: string, file: string, options: ScanOptions | ResolvedScanOptions = {}): Finding[] {
  const resolvedOptions = isResolvedOptions(options) ? options : resolveInlineOptions(options);
  const elements = parseJsx(source);
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

async function collectFiles(targetPath: string, options: ResolvedScanOptions): Promise<string[]> {
  const stat = await fs.stat(targetPath);
  if (stat.isFile()) {
    return shouldScanFile(targetPath, options) ? [targetPath] : [];
  }

  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name) && !isExcluded(fullPath, options)) {
        files.push(...await collectFiles(fullPath, options));
      }
      continue;
    }

    if (entry.isFile() && shouldScanFile(fullPath, options)) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function shouldScanFile(filePath: string, options: ResolvedScanOptions): boolean {
  if (!scanExtensions.has(path.extname(filePath))) return false;
  const relative = path.relative(options.rootDir, filePath);
  if (options.include.length > 0 && !matchesAnyPattern(relative, options.include)) return false;
  return !isExcluded(filePath, options);
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
      return {
        ruleId: rule.id,
        title: rule.title,
        severity: effectiveSeverity,
        confidence: rule.confidence,
        category: rule.category,
        file,
        line: element.line,
        column: element.column,
        excerpt: element.excerpt,
        message,
        wcag: rule.wcag,
        standards: referencesForStandard(rule, options.standard),
        platforms: rule.platforms,
        fingerprint: fingerprintFinding({
          ruleId: rule.id,
          file,
          excerpt: element.excerpt,
          message
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
      return elements.filter((candidate) => candidate.tagName.toLowerCase() === "label" && this.getAttribute(candidate, "htmlFor")?.value === id);
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

function summarizeFindings(marked: ReturnType<typeof markBaselineFindings>) {
  return {
    totalFindings: marked.findings.length,
    activeFindings: marked.activeFindings.length,
    baselineFindings: marked.baselineFindings.length,
    regressions: marked.regressions.length,
    critical: marked.activeFindings.filter((finding) => finding.severity === "critical").length,
    warning: marked.activeFindings.filter((finding) => finding.severity === "warning").length,
    info: marked.activeFindings.filter((finding) => finding.severity === "info").length
  };
}

function isResolvedOptions(options: ScanOptions | ResolvedScanOptions): options is ResolvedScanOptions {
  return "failOn" in options && "rules" in options && "include" in options && "exclude" in options && "standard" in options;
}

function resolveInlineOptions(options: ScanOptions): ResolvedScanOptions {
  return {
    include: options.include ?? [],
    exclude: options.exclude ?? [],
    rules: options.rules ?? {},
    standard: resolveStandardId(options.standard ?? "wcag22-aa"),
    failOn: options.failOn ?? "none",
    format: options.format ?? "text",
    baseline: options.baseline,
    verbose: options.verbose ?? false,
    runtimeUrl: options.runtimeUrl,
    componentPresets: options.componentPresets ?? [],
    components: resolveComponentMappings(options.componentPresets ?? [], {}, options.components),
    configPath: options.configPath,
    rootDir: process.cwd()
  };
}
