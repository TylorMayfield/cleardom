import type { RuntimeIssue } from "./runtime-types.js";

export function collectContrastIssues(): RuntimeIssue[] {
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
        ruleId: "CDOM_1_4_3_CONTRAST",
        selector: selectorFor(element),
        message: `Increase text contrast from ${ratio.toFixed(2)}:1 to at least ${minimum}:1.`
      }];
    })
    .slice(0, 25);
}

export function collectFocusVisibleIssues(): RuntimeIssue[] {
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
        ruleId: "CDOM_2_4_7_FOCUS_VISIBLE",
        selector: selectorFor(element),
        message: "Add a visible focus indicator for this keyboard-focusable control."
      });
    }
  }

  return issues.slice(0, 25);
}

export function collectTargetSizeIssues(): RuntimeIssue[] {
  return interactiveElements()
    .filter((element) => isVisible(element))
    .flatMap((element) => {
      let rect = element.getBoundingClientRect();
      if (element.tagName.toLowerCase() === "input") {
        const type = (element.getAttribute("type") ?? "").toLowerCase();
        if (type === "checkbox" || type === "radio") {
          const wrappingLabel = element.closest("label");
          if (wrappingLabel instanceof HTMLElement && isVisible(wrappingLabel)) {
            rect = wrappingLabel.getBoundingClientRect();
          } else if (element.id) {
            const escapedId = element.id.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
            const explicitLabel = document.querySelector<HTMLLabelElement>(`label[for="${escapedId}"]`);
            if (explicitLabel && isVisible(explicitLabel)) rect = explicitLabel.getBoundingClientRect();
          }
        }
      }
      if (rect.width >= 24 && rect.height >= 24) return [];
      return [{
        ruleId: "CDOM_2_5_8_TARGET_SIZE",
        selector: selectorFor(element),
        message: `Increase target size from ${Math.round(rect.width)}x${Math.round(rect.height)} CSS pixels to at least 24x24.`
      }];
    })
    .slice(0, 25);
}

export function collectReflowIssues(): RuntimeIssue[] {
  const root = document.documentElement;
  if (root.scrollWidth <= window.innerWidth + 8) return [];
  const overflowing = Array.from(document.body.querySelectorAll<HTMLElement>("body *"))
    .filter((element) => isVisible(element))
    .find((element) => element.getBoundingClientRect().right > window.innerWidth + 8);
  return [{
    ruleId: "CDOM_1_4_10_REFLOW",
    selector: overflowing ? selectorFor(overflowing) : "document",
    message: `Remove horizontal overflow at 320px viewport; document width is ${root.scrollWidth}px.`
  }];
}

export function collectSkipLinkIssues(): RuntimeIssue[] {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href^='#']"));
  const skipLink = links.find((link) => /skip|main|content/i.test(link.textContent ?? "") || /main|content/i.test(link.hash));
  if (!skipLink) {
    return [{
      ruleId: "CDOM_2_4_1_SKIP_LINK",
      selector: "document",
      message: "Add a skip link that bypasses repeated navigation and targets the main content."
    }];
  }

  skipLink.focus();
  const rect = skipLink.getBoundingClientRect();
  const inViewport = rect.right > 0
    && rect.bottom > 0
    && rect.left < window.innerWidth
    && rect.top < window.innerHeight;
  if (!isVisible(skipLink) || !inViewport) {
    return [{
      ruleId: "CDOM_2_4_1_SKIP_LINK",
      selector: selectorFor(skipLink),
      message: "Make the skip link visible when it receives keyboard focus."
    }];
  }

  return [];
}

export function collectTextSpacingIssues(): RuntimeIssue[] {
  const beforeScrollWidth = document.documentElement.scrollWidth;
  const beforeOverlapKeys = overlapKeys(visibleElementSnapshots()
    .filter((snapshot) => snapshot.text.length > 0)
    .slice(0, 120));
  const style = document.createElement("style");
  style.id = "cleardom-text-spacing-check";
  style.textContent = `
    body, body * {
      line-height: 1.5 !important;
      letter-spacing: 0.12em !important;
      word-spacing: 0.16em !important;
    }
    p {
      margin-bottom: 2em !important;
    }
  `;
  document.head.appendChild(style);

  try {
    const issues: RuntimeIssue[] = [];
    if (document.documentElement.scrollWidth > beforeScrollWidth && document.documentElement.scrollWidth > window.innerWidth) {
      const overflowing = Array.from(document.body.querySelectorAll<HTMLElement>("body *"))
        .filter((element) => isVisible(element))
        .find((element) => element.getBoundingClientRect().right > window.innerWidth + 1);
      issues.push({
        ruleId: "CDOM_1_4_12_TEXT_SPACING",
        selector: overflowing ? selectorFor(overflowing) : "document",
        message: "Text spacing creates horizontal overflow that may hide content."
      });
    }

    const textElements = Array.from(document.body.querySelectorAll<HTMLElement>("body *"))
      .filter((element) => isVisible(element) && elementText(element).length > 0);

    for (const element of textElements) {
      const computed = getComputedStyle(element);
      if (!/(hidden|clip)/.test(`${computed.overflow} ${computed.overflowX} ${computed.overflowY}`)) continue;
      if (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1) {
        issues.push({
          ruleId: "CDOM_1_4_12_TEXT_SPACING",
          selector: selectorFor(element),
          message: "Text spacing causes content to be clipped inside this fixed-size container."
        });
      }
    }

    const snapshots = visibleElementSnapshots()
      .filter((snapshot) => snapshot.text.length > 0)
      .slice(0, 120);
    for (let leftIndex = 0; leftIndex < snapshots.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < snapshots.length; rightIndex += 1) {
        const left = snapshots[leftIndex];
        const right = snapshots[rightIndex];
        if (left.element.contains(right.element) || right.element.contains(left.element)) continue;
        if (!rectsOverlap(left.rect, right.rect)) continue;
        const key = [left.selector, right.selector].sort().join("\n");
        if (beforeOverlapKeys.has(key)) continue;
        issues.push({
          ruleId: "CDOM_1_4_12_TEXT_SPACING",
          selector: left.rect.top <= right.rect.top ? left.selector : right.selector,
          message: "Text spacing causes visible text content to overlap nearby content."
        });
        return issues.slice(0, 25);
      }
    }

    return issues.slice(0, 25);
  } finally {
    style.remove();
  }
}

export function collectFocusObscuredIssues(): RuntimeIssue[] {
  const issues: RuntimeIssue[] = [];
  for (const element of interactiveElements().filter((candidate) => isVisible(candidate)).slice(0, 80)) {
    element.focus();
    if (document.activeElement !== element) continue;
    const rect = element.getBoundingClientRect();
    const insetX = Math.min(4, rect.width / 4);
    const insetY = Math.min(4, rect.height / 4);
    const points = [
      { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      { x: rect.left + insetX, y: rect.top + insetY },
      { x: rect.right - insetX, y: rect.top + insetY },
      { x: rect.left + insetX, y: rect.bottom - insetY },
      { x: rect.right - insetX, y: rect.bottom - insetY }
    ].filter((point) => point.x >= 0 && point.y >= 0 && point.x <= window.innerWidth && point.y <= window.innerHeight);

    if (points.length === 0) continue;
    const hasVisiblePoint = points.some((point) => {
      const hit = document.elementFromPoint(point.x, point.y);
      return hit === element || (hit instanceof Node && element.contains(hit));
    });
    if (hasVisiblePoint) continue;

    issues.push({
      ruleId: "CDOM_2_4_11_FOCUS_OBSCURED",
      selector: selectorFor(element),
      message: "Move overlaying content so this focused control remains at least partially visible."
    });
  }

  return issues.slice(0, 25);
}

export function interactiveElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex='-1']), [role='button'], [role='link'], [role='checkbox'], [role='radio'], [role='switch'], [role='tab']"));
}

export function hoverFocusTriggerElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex='-1']), [aria-haspopup], [aria-describedby], [data-tooltip], [role='button'], [role='link'], [role='menuitem']"))
    .filter((element) => isVisible(element) && !isInsideModal(element));
}

export function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0
    && rect.height > 0
    && style.visibility !== "hidden"
    && style.display !== "none"
    && Number.parseFloat(style.opacity || "1") > 0;
}

export function directText(element: HTMLElement): string {
  return Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function elementText(element: HTMLElement): string {
  return (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
}

export function visibleElementSnapshots(): Array<{ element: HTMLElement; selector: string; text: string; rect: { left: number; top: number; right: number; bottom: number; width: number; height: number } }> {
  return Array.from(document.body.querySelectorAll<HTMLElement>("body *"))
    .filter((element) => isVisible(element))
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        element,
        selector: selectorFor(element),
        text: elementText(element),
        rect: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height
        }
      };
    });
}

export function overlapKeys(snapshots: Array<{ element: HTMLElement; selector: string; rect: { left: number; top: number; right: number; bottom: number } }>): Set<string> {
  const keys = new Set<string>();
  for (let leftIndex = 0; leftIndex < snapshots.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < snapshots.length; rightIndex += 1) {
      const left = snapshots[leftIndex];
      const right = snapshots[rightIndex];
      if (left.element.contains(right.element) || right.element.contains(left.element)) continue;
      if (rectsOverlap(left.rect, right.rect)) {
        keys.add([left.selector, right.selector].sort().join("\n"));
      }
    }
  }
  return keys;
}

export function rectsOverlap(left: { left: number; right: number; top: number; bottom: number }, right: { left: number; right: number; top: number; bottom: number }): boolean {
  return left.left < right.right
    && left.right > right.left
    && left.top < right.bottom
    && left.bottom > right.top;
}

export function nearestNonModalRegion(element: HTMLElement): HTMLElement | undefined {
  let current: HTMLElement | null = element;
  while (current && current !== document.body) {
    if (isInsideModal(current)) return undefined;
    if (current.matches("section, article, aside, nav, main, [role='region'], [role='group'], [data-case]")) return current;
    current = current.parentElement;
  }
  return undefined;
}

export function isInsideModal(element: HTMLElement): boolean {
  return element.closest("[aria-modal='true'], dialog[open], [role='dialog'][aria-modal='true']") !== null;
}

export function effectiveBackground(element: HTMLElement): [number, number, number] | undefined {
  let current: HTMLElement | null = element;
  while (current) {
    const parsed = parseColor(getComputedStyle(current).backgroundColor);
    if (parsed) return parsed;
    current = current.parentElement;
  }
  return [255, 255, 255];
}

export function parseColor(value: string): [number, number, number] | undefined {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([.\d]+))?\)/);
  if (!match) return undefined;
  const alpha = match[4] === undefined ? 1 : Number.parseFloat(match[4]);
  if (alpha === 0) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function contrastRatio(left: [number, number, number], right: [number, number, number]): number {
  const first = relativeLuminance(left);
  const second = relativeLuminance(right);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

export function relativeLuminance([red, green, blue]: [number, number, number]): number {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function selectorFor(element: Element): string {
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
