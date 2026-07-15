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
  const elements = focusableElements().filter((element) => isVisible(element));
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
  for (const element of focusableElements().filter((candidate) => isVisible(candidate)).slice(0, 80)) {
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

export function collectRenderedSemanticIssues(): RuntimeIssue[] {
  const issues: RuntimeIssue[] = [];
  const focusable = new Set(focusableElements());
  const visibleControls = interactiveElements()
    .filter((element) => isVisible(element))
    .filter((element) => !element.matches(":disabled") && !element.closest("[inert]"));

  for (const element of visibleControls) {
    if (focusable.has(element) && element.closest("[aria-hidden='true']")) {
      issues.push({
        ruleId: "CDOM_4_1_2_ARIA_HIDDEN_FOCUS",
        selector: selectorFor(element),
        message: "Remove this control from the tab order or stop hiding it from assistive technology."
      });
      continue;
    }

    if (!renderedAccessibleName(element)) {
      issues.push({
        ruleId: renderedFormControl(element) ? "CDOM_4_1_2_FORM_LABEL" : "CDOM_4_1_2_UNNAMED_CONTROL",
        selector: selectorFor(element),
        message: renderedFormControl(element)
          ? "Add a rendered label, aria-label, or valid aria-labelledby reference for this form control."
          : "Add visible text, aria-label, or a valid aria-labelledby reference for this rendered control."
      });
    }
  }

  const ids = new Map<string, HTMLElement[]>();
  for (const element of document.querySelectorAll<HTMLElement>("[id]")) {
    const id = element.id.trim();
    if (!id) continue;
    ids.set(id, [...(ids.get(id) ?? []), element]);
  }
  for (const duplicates of ids.values()) {
    if (duplicates.length < 2) continue;
    for (const element of duplicates) {
      issues.push({
        ruleId: "CDOM_4_1_2_DUPLICATE_ID",
        selector: selectorFor(element),
        message: `Make the rendered id "${element.id}" unique so accessibility references resolve predictably.`
      });
    }
  }

  return issues.slice(0, 25);
}

export function collectRenderedAriaIssues(): RuntimeIssue[] {
  const issues: RuntimeIssue[] = [];
  const referenceAttributes = ["aria-activedescendant", "aria-controls", "aria-describedby", "aria-details", "aria-errormessage", "aria-flowto", "aria-labelledby", "aria-owns"];
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("[role], [aria-activedescendant], [aria-controls], [aria-describedby], [aria-details], [aria-errormessage], [aria-flowto], [aria-labelledby], [aria-owns], [aria-checked], [aria-expanded], [aria-pressed], [aria-selected], [aria-current], [aria-haspopup], [aria-invalid], [aria-live], [aria-orientation], [aria-sort], [aria-autocomplete]"))
    .filter((element) => isVisible(element) && !element.closest("[inert]"));

  for (const element of candidates) {
    const roleTokens = (element.getAttribute("role") ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    const resolvedRole = roleTokens.find((role) => validAriaRole(role));
    if (roleTokens.length > 0 && !resolvedRole) {
      issues.push({
        ruleId: "CDOM_4_1_2_INVALID_ARIA_ROLE",
        selector: selectorFor(element),
        message: `Replace unsupported role value "${roleTokens.join(" ")}" with a valid semantic role or native HTML element.`
      });
    }

    for (const attribute of referenceAttributes) {
      const value = element.getAttribute(attribute)?.trim();
      if (!value || skipDeferredAriaReference(element, attribute)) continue;
      const missing = value.split(/\s+/).filter((id) => !document.getElementById(id));
      if (missing.length === 0) continue;
      issues.push({
        ruleId: "CDOM_4_1_2_ARIA_REFERENCE",
        selector: selectorFor(element),
        message: `${attribute} references missing id${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`
      });
    }

    const stateProblem = invalidAriaState(element, resolvedRole);
    if (stateProblem) {
      issues.push({
        ruleId: "CDOM_4_1_2_ARIA_STATE",
        selector: selectorFor(element),
        message: stateProblem
      });
    }
  }

  return issues.slice(0, 25);
}

export function validAriaRole(role: string): boolean {
  const roles = new Set([
    "alert", "alertdialog", "application", "article", "banner", "blockquote", "button", "caption", "cell", "checkbox", "code", "columnheader", "combobox", "complementary", "contentinfo", "definition", "deletion", "dialog", "directory", "document", "emphasis", "feed", "figure", "form", "generic", "grid", "gridcell", "group", "heading", "img", "insertion", "link", "list", "listbox", "listitem", "log", "main", "marquee", "math", "menu", "menubar", "menuitem", "menuitemcheckbox", "menuitemradio", "meter", "navigation", "none", "note", "option", "paragraph", "presentation", "progressbar", "radio", "radiogroup", "region", "row", "rowgroup", "rowheader", "scrollbar", "search", "searchbox", "separator", "slider", "spinbutton", "status", "strong", "subscript", "suggestion", "superscript", "switch", "tab", "table", "tablist", "tabpanel", "term", "textbox", "time", "timer", "toolbar", "tooltip", "tree", "treegrid", "treeitem"
  ]);
  return roles.has(role) || role.startsWith("doc-") || role.startsWith("graphics-");
}

export function skipDeferredAriaReference(element: HTMLElement, attribute: string): boolean {
  if (attribute === "aria-controls" && element.getAttribute("aria-expanded") === "false") return true;
  if (attribute === "aria-errormessage" && element.getAttribute("aria-invalid") !== "true") return true;
  return false;
}

export function invalidAriaState(element: HTMLElement, role: string | undefined): string | undefined {
  const allowedValues: Record<string, string[]> = {
    "aria-expanded": ["true", "false", "undefined"],
    "aria-pressed": ["true", "false", "mixed", "undefined"],
    "aria-selected": ["true", "false", "undefined"],
    "aria-current": ["page", "step", "location", "date", "time", "true", "false"],
    "aria-haspopup": ["false", "true", "menu", "listbox", "tree", "grid", "dialog"],
    "aria-invalid": ["false", "true", "grammar", "spelling"],
    "aria-live": ["off", "polite", "assertive"],
    "aria-orientation": ["horizontal", "vertical"],
    "aria-sort": ["none", "ascending", "descending", "other"],
    "aria-autocomplete": ["none", "inline", "list", "both"]
  };
  for (const [attribute, allowed] of Object.entries(allowedValues)) {
    const value = element.getAttribute(attribute)?.trim().toLowerCase();
    if (value !== undefined && !allowed.includes(value)) return `${attribute} has invalid value "${value}"; use ${allowed.join(", ")}.`;
  }

  const checked = element.getAttribute("aria-checked")?.trim().toLowerCase();
  if (checked !== undefined && !["true", "false", "mixed", "undefined"].includes(checked)) {
    return `aria-checked has invalid value "${checked}"; use true, false, mixed, or undefined.`;
  }
  if (role === "switch" && checked === "mixed") return "A switch cannot use aria-checked=\"mixed\"; use true or false.";

  const requiredState: Record<string, string> = {
    checkbox: "aria-checked",
    combobox: "aria-expanded",
    menuitemcheckbox: "aria-checked",
    menuitemradio: "aria-checked",
    radio: "aria-checked",
    slider: "aria-valuenow",
    spinbutton: "aria-valuenow",
    switch: "aria-checked"
  };
  const required = role ? requiredState[role] : undefined;
  if (required) {
    const value = element.getAttribute(required)?.trim().toLowerCase();
    if (!value || value === "undefined") return `Role "${role}" requires ${required} to expose its current state.`;
    if (required === "aria-valuenow" && !Number.isFinite(Number(value))) return `${required} must be numeric for role "${role}".`;
  }
  if (role === "heading") {
    const level = Number(element.getAttribute("aria-level"));
    if (!Number.isInteger(level) || level < 1) return "Role \"heading\" requires aria-level with a positive integer value.";
  }
  return undefined;
}

export function renderedAccessibleName(element: HTMLElement): string {
  const labelledBy = element.getAttribute("aria-labelledby")?.trim();
  if (labelledBy) {
    const referencedText = labelledBy.split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (referencedText) return referencedText;
  }

  const ariaLabel = element.getAttribute("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;

  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    const labelText = Array.from(element.labels ?? [])
      .map((label) => label.textContent ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (labelText) return labelText;
  }

  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    if (type === "image" && element.alt.trim()) return element.alt.trim();
    if (["button", "submit", "reset"].includes(type) && element.value.trim()) return element.value.trim();
  }

  if (renderedFormControl(element)) return element.getAttribute("title")?.trim() ?? "";

  const visibleText = renderedTextAlternative(element).replace(/\s+/g, " ").trim();
  if (visibleText) return visibleText;

  const svgTitle = element.querySelector("svg title")?.textContent?.trim();
  if (svgTitle) return svgTitle;
  return element.getAttribute("title")?.trim() ?? "";
}

export function renderedTextAlternative(element: Element): string {
  return Array.from(element.childNodes).map((node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof Element) || node.getAttribute("aria-hidden") === "true") return "";
    if (node instanceof HTMLImageElement && node.alt.trim()) return node.alt;
    if (node.tagName.toLowerCase() === "svg") return node.querySelector("title")?.textContent ?? "";
    return renderedTextAlternative(node);
  }).join(" ");
}

export function renderedFormControl(element: HTMLElement): boolean {
  if (element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) return true;
  if (!(element instanceof HTMLInputElement)) return false;
  return !["button", "submit", "reset", "image", "hidden"].includes(element.type.toLowerCase());
}

export function interactiveElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex='-1']), [role='button'], [role='link'], [role='checkbox'], [role='radio'], [role='switch'], [role='tab']"));
}

export function focusableElements(): HTMLElement[] {
  return interactiveElements().filter((element) => {
    if (element.matches(":disabled") || element.closest("[inert]")) return false;
    if (element instanceof HTMLInputElement && element.type.toLowerCase() === "hidden") return false;
    if (element.tabIndex < 0) return false;
    if (element.matches("a[href], button, input, select, textarea, summary")) return true;
    return element.tabIndex >= 0 || element.getAttribute("contenteditable") === "true";
  });
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
  if (element.id) {
    const idSelector = `#${CSS.escape(element.id)}`;
    if (document.querySelectorAll(idSelector).length === 1) return idSelector;
  }
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
