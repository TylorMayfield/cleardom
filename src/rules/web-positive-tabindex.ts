import { staticAttributeValue } from "../rule-utils.js";
import type { JsxElement, RuleContext, RuleDefinition } from "../types.js";

export const positiveTabIndexRule: RuleDefinition = {
  id: "CDOM_2_4_3_POSITIVE_TABINDEX",
  title: "Positive tabIndex changes the natural focus order",
  severity: "warning",
  confidence: "high",
  category: "keyboard",
  wcag: ["2.4.3", "2.1.1"],
  standards: [
    { version: "wcag20", criterion: "2.4.3", level: "a", title: "Focus Order" },
    { version: "wcag20", criterion: "2.1.1", level: "a", title: "Keyboard" },
    { version: "wcag21", criterion: "2.4.3", level: "a", title: "Focus Order" },
    { version: "wcag21", criterion: "2.1.1", level: "a", title: "Keyboard" },
    { version: "wcag22", criterion: "2.4.3", level: "a", title: "Focus Order" },
    { version: "wcag22", criterion: "2.1.1", level: "a", title: "Keyboard" },
    { version: "wcag30", criterion: "focus-order", title: "Focus order is meaningful" }
  ],
  platforms: ["web"],
  fixable: true,
  summary: "Positive tabIndex values create a custom keyboard order that often diverges from visual and DOM order.",
  guidance: "Use the natural DOM order and tabIndex={0} only when a custom interactive element must enter the tab sequence.",
  examples: [
    { label: "Natural focus order", code: '<button>First</button><button>Second</button>' },
    { label: "Focusable custom control", code: '<div role="button" tabIndex={0}>Open</div>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => positiveTabIndex(element, context) !== undefined)
      .map((element) => context.createFinding(this, element, "Avoid positive tabIndex values; use DOM order or tabIndex={0}."));
  }
};

function positiveTabIndex(element: JsxElement, context: RuleContext): number | undefined {
  const attribute = context.getAttribute(element, "tabIndex") ?? context.getAttribute(element, "tabindex");
  const value = staticAttributeValue(element, context, "tabIndex") ?? staticAttributeValue(element, context, "tabindex")
    ?? (attribute?.kind === "expression" && typeof attribute.value === "string" ? attribute.value : undefined);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
