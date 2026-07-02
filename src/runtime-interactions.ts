import * as puppeteer from "puppeteer-core";
import type { RuntimeIssue } from "./runtime-types.js";

declare function selectorFor(element: Element): string;
declare function visibleElementSnapshots(): Array<{ element: HTMLElement; selector: string; text: string; rect: { left: number; top: number; right: number; bottom: number; width: number; height: number } }>;
declare function rectsOverlap(left: { left: number; right: number; top: number; bottom: number }, right: { left: number; right: number; top: number; bottom: number }): boolean;
declare function isVisible(element: HTMLElement): boolean;
declare function nearestNonModalRegion(element: HTMLElement): HTMLElement | undefined;
declare function interactiveElements(): HTMLElement[];
declare function isInsideModal(element: HTMLElement): boolean;

export async function collectHoverFocusContentIssues(page: puppeteer.Page): Promise<RuntimeIssue[]> {
  const triggers = await page.evaluate("hoverFocusTriggerElements().map((element) => selectorFor(element)).slice(0, 40)") as string[];
  const issues: RuntimeIssue[] = [];

  for (const selector of triggers) {
    const before = await page.evaluate("visibleElementSnapshots().map((snapshot) => snapshot.selector)") as string[];
    try {
      await page.hover(selector);
    } catch {
      continue;
    }
    await waitForInteraction();
    await page.evaluate((value) => {
      const element = document.querySelector<HTMLElement>(value);
      element?.focus();
    }, selector);
    await waitForInteraction();

    const additions = await page.evaluate((knownSelectors) => {
      const known = new Set(knownSelectors);
      const trigger = document.querySelector<HTMLElement>(document.activeElement ? selectorFor(document.activeElement) : "");
      return visibleElementSnapshots()
        .filter((snapshot) => !known.has(snapshot.selector))
        .filter((snapshot) => snapshot.rect.width > 0 && snapshot.rect.height > 0)
        .filter((snapshot) => !trigger || !trigger.contains(snapshot.element))
        .filter((snapshot) => {
          if (!trigger) return true;
          const triggerRect = trigger.getBoundingClientRect();
          return rectsOverlap(snapshot.rect, {
            left: triggerRect.left - 40,
            top: triggerRect.top - 40,
            right: triggerRect.right + 40,
            bottom: triggerRect.bottom + 160
          });
        })
        .map((snapshot) => ({ selector: snapshot.selector, rect: snapshot.rect, text: snapshot.text }))
        .slice(0, 5);
    }, before) as Array<{ selector: string; rect: { left: number; top: number; width: number; height: number }; text: string }>;

    for (const addition of additions) {
      await page.keyboard.press("Escape");
      await waitForInteraction();
      const stillVisibleAfterEscape = await page.evaluate((value) => {
        const element = document.querySelector<HTMLElement>(value);
        return element ? isVisible(element) : false;
      }, addition.selector) as boolean;

      if (stillVisibleAfterEscape) {
        issues.push({
          ruleId: "CDOM032",
          selector,
          message: "Make hover or focus content dismissible without moving pointer hover or keyboard focus."
        });
        break;
      }

      try {
        await page.hover(selector);
      } catch {
        continue;
      }
      await waitForInteraction();
      await page.mouse.move(addition.rect.left + addition.rect.width / 2, addition.rect.top + addition.rect.height / 2);
      await waitForInteraction();
      const remainsHoverable = await page.evaluate((value) => {
        const element = document.querySelector<HTMLElement>(value);
        return element ? isVisible(element) : false;
      }, addition.selector) as boolean;

      if (!remainsHoverable) {
        issues.push({
          ruleId: "CDOM032",
          selector,
          message: "Keep hover-triggered content visible when the pointer moves over the additional content."
        });
        break;
      }
    }

    await page.mouse.move(0, 0);
    if (issues.length >= 25) break;
  }

  return issues.slice(0, 25);
}

export async function collectKeyboardTrapIssues(page: puppeteer.Page): Promise<RuntimeIssue[]> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    document.body.focus();
  });

  const seen = new Map<string, number>();
  const sequence: string[] = [];
  for (let step = 0; step < 80; step += 1) {
    await page.keyboard.press("Tab");
    await waitForInteraction();
    const active = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement) || element === document.body) return undefined;
      const region = nearestNonModalRegion(element);
      const allFocusable = interactiveElements().filter((candidate) => isVisible(candidate));
      const index = allFocusable.indexOf(element);
      const hasFocusableAfter = index >= 0 && allFocusable.slice(index + 1).some((candidate) => !region || !region.contains(candidate));
      const regionFocusableCount = region ? allFocusable.filter((candidate) => region.contains(candidate)).length : 1;
      return {
        selector: selectorFor(element),
        regionSelector: region ? selectorFor(region) : selectorFor(element),
        modal: isInsideModal(element),
        hasFocusableAfter,
        regionFocusableCount
      };
    }) as { selector: string; regionSelector: string; modal: boolean; hasFocusableAfter: boolean; regionFocusableCount: number } | undefined;

    if (!active || active.modal) continue;
    sequence.push(active.selector);
    const count = (seen.get(active.selector) ?? 0) + 1;
    seen.set(active.selector, count);
    const regionSequence = sequence.slice(-Math.max(6, active.regionFocusableCount + 3));
    const stuckOnOneElement = count >= 3 && sequence.slice(-3).every((selector) => selector === active.selector);
    const stuckInsideRegion = active.hasFocusableAfter
      && regionSequence.length >= Math.max(6, active.regionFocusableCount + 3)
      && regionSequence.every((selector) => selector.startsWith(active.regionSelector));
    if (active.hasFocusableAfter && (stuckOnOneElement || stuckInsideRegion)) {
      return [{
        ruleId: "CDOM033",
        selector: active.regionSelector,
        message: "Allow keyboard focus to move out of this component with Tab or Shift+Tab."
      }];
    }
  }

  return [];
}

function waitForInteraction(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}
