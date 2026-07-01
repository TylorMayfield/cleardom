import { elementRole, hasFormLabel } from "../rule-utils.js";
import type { RuleDefinition } from "../types.js";

export const placeholderLabelRule: RuleDefinition = {
  id: "CDOM004",
  title: "Input relies on placeholder text as its label",
  severity: "warning",
  confidence: "high",
  category: "forms",
  wcag: ["3.3.2", "1.3.1"],
  standards: [
    { version: "wcag10", criterion: "12.4", title: "Associate labels explicitly with their controls" },
    { version: "wcag20", criterion: "3.3.2", level: "a", title: "Labels or Instructions" },
    { version: "wcag20", criterion: "1.3.1", level: "a", title: "Info and Relationships" },
    { version: "wcag21", criterion: "3.3.2", level: "a", title: "Labels or Instructions" },
    { version: "wcag21", criterion: "1.3.1", level: "a", title: "Info and Relationships" },
    { version: "wcag22", criterion: "3.3.2", level: "a", title: "Labels or Instructions" },
    { version: "wcag22", criterion: "1.3.1", level: "a", title: "Info and Relationships" },
    { version: "wcag30", criterion: "clear-labels", title: "Clear labels and instructions" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Placeholders disappear during entry and are not a reliable label.",
  guidance: "Pair the input with a visible label, aria-label, or aria-labelledby.",
  examples: [
    { label: "Visible label", code: '<label>Email<input name="email" placeholder="name@example.com" /></label>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => ["input", "textarea", "select"].includes(element.tagName.toLowerCase()) || elementRole(element, context) === "textbox")
      .filter((element) => context.hasAttribute(element, "placeholder"))
      .filter((element) => !hasFormLabel(element, context))
      .map((element) => context.createFinding(this, element, "Add a visible label, aria-label, or aria-labelledby."));
  }
};
