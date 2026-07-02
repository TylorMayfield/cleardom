import * as puppeteer from "puppeteer-core";
import { fingerprintFinding } from "./baseline.js";
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
import type { Finding, ResolvedScanOptions, RuleDefinition, Severity } from "./types.js";

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
  const executablePath = chromePath ?? process.env.CHROME_PATH ?? process.env.PUPPETEER_EXECUTABLE_PATH;
  if (!executablePath) {
    throw new Error("Runtime checks require CHROME_PATH or PUPPETEER_EXECUTABLE_PATH to point to a Chromium/Chrome executable.");
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    await page.evaluate(runtimeCollectorScript());

    const issues: RuntimeIssue[] = [];
    issues.push(...await page.evaluate("collectContrastIssues()") as RuntimeIssue[]);
    issues.push(...await page.evaluate("collectFocusVisibleIssues()") as RuntimeIssue[]);
    issues.push(...await page.evaluate("collectTargetSizeIssues()") as RuntimeIssue[]);
    issues.push(...await page.evaluate("collectSkipLinkIssues()") as RuntimeIssue[]);
    issues.push(...await page.evaluate("collectTextSpacingIssues()") as RuntimeIssue[]);
    issues.push(...await collectHoverFocusContentIssues(page));
    issues.push(...await collectKeyboardTrapIssues(page));
    issues.push(...await page.evaluate("collectFocusObscuredIssues()") as RuntimeIssue[]);

    await page.setViewport({ width: 320, height: 900, deviceScaleFactor: 1 });
    issues.push(...await page.evaluate("collectReflowIssues()") as RuntimeIssue[]);

    return issues.flatMap((issue) => {
      const rule = runtimeRules.find((candidate) => candidate.id === issue.ruleId);
      if (!rule || !ruleAppliesToStandard(rule, options.standard) || !isRuleEnabled(rule.id, options.rules[rule.id])) return [];
      return [runtimeFinding(rule, issue, url, options, severityOverride(options.rules[rule.id]) ?? rule.severity)];
    });
  } finally {
    await browser.close();
  }
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

function runtimeFinding(rule: RuleDefinition, issue: RuntimeIssue, url: string, options: ResolvedScanOptions, severity: Severity): Finding {
  const excerpt = issue.selector;
  return {
    ruleId: rule.id,
    title: rule.title,
    severity,
    confidence: rule.confidence,
    category: rule.category,
    file: url,
    line: 1,
    column: 1,
    excerpt,
    message: issue.message,
    wcag: rule.wcag,
    standards: referencesForStandard(rule, options.standard),
    platforms: rule.platforms,
    fingerprint: fingerprintFinding({
      ruleId: rule.id,
      file: url,
      excerpt,
      message: issue.message
    }),
    baselineStatus: "active"
  };
}
