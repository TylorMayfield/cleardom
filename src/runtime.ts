import * as puppeteer from "puppeteer-core";
import { fingerprintFinding } from "./baseline.js";
import { isRuleEnabled, severityOverride } from "./config.js";
import { referencesForStandard, ruleAppliesToStandard } from "./standards.js";
import type { Finding, ResolvedScanOptions, RuleDefinition, Severity } from "./types.js";
import { contrastRuntimeRule, focusVisibleRuntimeRule, reflowRuntimeRule, skipLinkRuntimeRule, targetSizeRuntimeRule } from "./rules/runtime-rules.js";

type RuntimeIssue = {
  ruleId: string;
  selector: string;
  message: string;
};

const runtimeRules = [
  contrastRuntimeRule,
  focusVisibleRuntimeRule,
  targetSizeRuntimeRule,
  reflowRuntimeRule,
  skipLinkRuntimeRule
];

export async function auditRuntimeUrl(url: string, options: ResolvedScanOptions): Promise<Finding[]> {
  const executablePath = process.env.CHROME_PATH ?? process.env.PUPPETEER_EXECUTABLE_PATH;
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
    interactiveElements,
    isVisible,
    directText,
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

function collectContrastIssues(): RuntimeIssue[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>("body *"))
    .filter((element) => isVisible(element) && directText(element).length > 0)
    .flatMap((element) => {
      const style = getComputedStyle(element);
      const foreground = parseColor(style.color);
      const background = effectiveBackground(element);
      if (!foreground || !background) return [];
      const ratio = contrastRatio(foreground, background);
      const fontSize = Number.parseFloat(style.fontSize) || 16;
      const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
      const largeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
      const minimum = largeText ? 3 : 4.5;
      if (ratio >= minimum) return [];
      return [{
        ruleId: "CDOM022",
        selector: selectorFor(element),
        message: `Increase text contrast from ${ratio.toFixed(2)}:1 to at least ${minimum}:1.`
      }];
    })
    .slice(0, 25);
}

function collectFocusVisibleIssues(): RuntimeIssue[] {
  const elements = interactiveElements().filter((element) => isVisible(element));
  const issues: RuntimeIssue[] = [];

  for (const element of elements.slice(0, 60)) {
    element.focus();
    if (document.activeElement !== element) continue;

    const style = getComputedStyle(element);
    const outlineMissing = style.outlineStyle === "none" || style.outlineWidth === "0px";
    const boxShadowMissing = style.boxShadow === "none";
    if (outlineMissing && boxShadowMissing) {
      issues.push({
        ruleId: "CDOM023",
        selector: selectorFor(element),
        message: "Add a visible focus indicator for this keyboard-focusable control."
      });
    }
  }

  return issues.slice(0, 25);
}

function collectTargetSizeIssues(): RuntimeIssue[] {
  return interactiveElements()
    .filter((element) => isVisible(element))
    .flatMap((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width >= 24 && rect.height >= 24) return [];
      return [{
        ruleId: "CDOM024",
        selector: selectorFor(element),
        message: `Increase target size from ${Math.round(rect.width)}x${Math.round(rect.height)} CSS pixels to at least 24x24.`
      }];
    })
    .slice(0, 25);
}

function collectReflowIssues(): RuntimeIssue[] {
  const root = document.documentElement;
  if (root.scrollWidth <= window.innerWidth) return [];
  const overflowing = Array.from(document.body.querySelectorAll<HTMLElement>("body *"))
    .filter((element) => isVisible(element))
    .find((element) => element.getBoundingClientRect().right > window.innerWidth + 1);
  return [{
    ruleId: "CDOM025",
    selector: overflowing ? selectorFor(overflowing) : "document",
    message: `Remove horizontal overflow at 320px viewport; document width is ${root.scrollWidth}px.`
  }];
}

function collectSkipLinkIssues(): RuntimeIssue[] {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href^='#']"));
  const skipLink = links.find((link) => /skip|main|content/i.test(link.textContent ?? "") || /main|content/i.test(link.hash));
  if (!skipLink) {
    return [{
      ruleId: "CDOM026",
      selector: "document",
      message: "Add a skip link that bypasses repeated navigation and targets the main content."
    }];
  }

  skipLink.focus();
  if (!isVisible(skipLink)) {
    return [{
      ruleId: "CDOM026",
      selector: selectorFor(skipLink),
      message: "Make the skip link visible when it receives keyboard focus."
    }];
  }

  return [];
}

function interactiveElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex='-1']), [role='button'], [role='link'], [role='checkbox'], [role='radio'], [role='switch'], [role='tab']"));
}

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0
    && rect.height > 0
    && style.visibility !== "hidden"
    && style.display !== "none"
    && Number.parseFloat(style.opacity || "1") > 0;
}

function directText(element: HTMLElement): string {
  return Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function effectiveBackground(element: HTMLElement): [number, number, number] | undefined {
  let current: HTMLElement | null = element;
  while (current) {
    const parsed = parseColor(getComputedStyle(current).backgroundColor);
    if (parsed) return parsed;
    current = current.parentElement;
  }
  return [255, 255, 255];
}

function parseColor(value: string): [number, number, number] | undefined {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([.\d]+))?\)/);
  if (!match) return undefined;
  const alpha = match[4] === undefined ? 1 : Number.parseFloat(match[4]);
  if (alpha === 0) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function contrastRatio(left: [number, number, number], right: [number, number, number]): number {
  const first = relativeLuminance(left);
  const second = relativeLuminance(right);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance([red, green, blue]: [number, number, number]): number {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function selectorFor(element: Element): string {
  if (element.id) return `#${element.id}`;
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body && parts.length < 4) {
    const tag = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const currentTag = current.tagName;
    const siblings = Array.from(parent.children) as Element[];
    const sameTagSiblings = siblings.filter((sibling) => sibling.tagName === currentTag);
    const index = sameTagSiblings.indexOf(current) + 1;
    parts.unshift(sameTagSiblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
    current = parent;
  }
  return parts.join(" > ") || element.tagName.toLowerCase();
}
