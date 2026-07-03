import { isAriaHidden, staticAttributeValue } from "../rule-utils.js";
import type { RuleDefinition } from "../types.js";

export const imageAltRule: RuleDefinition = {
  id: "CDOM_1_1_1_IMAGE_ALT",
  title: "Image has no useful alternative text",
  severity: "warning",
  confidence: "high",
  category: "names-and-roles",
  wcag: ["1.1.1"],
  standards: [
    { version: "wcag10", criterion: "1.1", title: "Provide text equivalents for non-text elements" },
    { version: "wcag20", criterion: "1.1.1", level: "a", title: "Non-text Content" },
    { version: "wcag21", criterion: "1.1.1", level: "a", title: "Non-text Content" },
    { version: "wcag22", criterion: "1.1.1", level: "a", title: "Non-text Content" },
    { version: "wcag30", criterion: "text-alternatives", title: "Text alternatives" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Informative images need alt text so screen reader users receive the same information.",
  guidance: "Add meaningful alt text, or mark decorative images with alt=\"\" and aria-hidden=\"true\".",
  examples: [
    { label: "Informative image", code: '<img src="/chart.png" alt="Revenue increased 12 percent in Q2" />' },
    { label: "Decorative image", code: '<img src="/divider.png" alt="" aria-hidden="true" />' }
  ],
  check(context) {
    return context.elements
      .filter((element) => element.tagName.toLowerCase() === "img")
      .filter((element) => !isDecorative(element, context))
      .filter((element) => !staticAttributeValue(element, context, "alt")?.trim())
      .map((element) => context.createFinding(this, element, "Add useful alt text or mark the image decorative."));
  }
};

function isDecorative(element: Parameters<RuleDefinition["check"]>[0]["elements"][number], context: Parameters<RuleDefinition["check"]>[0]): boolean {
  const role = staticAttributeValue(element, context, "role")?.toLowerCase();
  return isAriaHidden(element, context) || role === "presentation" || role === "none";
}
