import { elementRole, hasTabStop, isNativeInteractive, staticAttributeValue } from "../rule-utils.js";
import type { JsxElement, RuleContext, RuleDefinition } from "../types.js";

export const ariaHiddenFocusRule: RuleDefinition = {
  id: "CDOM016",
  title: "Focusable content is hidden from assistive technology",
  severity: "critical",
  confidence: "high",
  category: "names-and-roles",
  wcag: ["4.1.2", "1.3.1"],
  standards: [
    { version: "wcag20", criterion: "4.1.2", level: "a", title: "Name, Role, Value" },
    { version: "wcag20", criterion: "1.3.1", level: "a", title: "Info and Relationships" },
    { version: "wcag21", criterion: "4.1.2", level: "a", title: "Name, Role, Value" },
    { version: "wcag21", criterion: "1.3.1", level: "a", title: "Info and Relationships" },
    { version: "wcag22", criterion: "4.1.2", level: "a", title: "Name, Role, Value" },
    { version: "wcag22", criterion: "1.3.1", level: "a", title: "Info and Relationships" },
    { version: "wcag30", criterion: "hidden-focus", title: "Hidden content does not receive focus" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Focusable controls inside aria-hidden content can be reached by keyboard but ignored by assistive technology.",
  guidance: "Remove aria-hidden from focusable content, move focusable controls outside the hidden subtree, or make hidden controls unfocusable.",
  examples: [
    { label: "Visible button", code: '<div><button type="button">Close</button></div>' },
    { label: "Hidden decorative icon", code: '<span aria-hidden="true"><Icon /></span>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => isFocusable(element, context))
      .filter((element) => isInsideAriaHidden(element, context))
      .map((element) => context.createFinding(this, element, "Do not place focusable controls inside aria-hidden content."));
  }
};

function isFocusable(element: JsxElement, context: RuleContext): boolean {
  if (context.hasAttribute(element, "disabled")) return false;

  const tag = element.tagName.toLowerCase();
  const tabIndex = staticAttributeValue(element, context, "tabIndex") ?? staticAttributeValue(element, context, "tabindex");
  if (tabIndex === "-1") return false;
  if (hasTabStop(element, context)) return true;
  if (tag === "a") return Boolean(staticAttributeValue(element, context, "href"));
  if (isNativeInteractive(element.tagName) && tag !== "a") return true;
  return ["button", "link", "menuitem", "tab", "switch", "checkbox", "radio"].includes(elementRole(element, context) ?? "");
}

function isInsideAriaHidden(element: JsxElement, context: RuleContext): boolean {
  let current: JsxElement | undefined = element;
  while (current) {
    if (staticAttributeValue(current, context, "aria-hidden") === "true") return true;
    current = context.parentOf(current);
  }
  return false;
}
