import { elementRole, formLabelEvidence, isIntrinsicElement, isProvenHidden } from "../rule-utils.js";
import type { RuleDefinition } from "../types.js";

export const placeholderLabelRule: RuleDefinition = {
  id: "CDOM_3_3_2_PLACEHOLDER_LABEL",
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
  fixable: true,
  summary: "Placeholders disappear during entry and are not a reliable label.",
  guidance: "Pair the input with a visible label, aria-label, or aria-labelledby.",
  examples: [
    { label: "Visible label", code: '<label>Email<input name="email" placeholder="name@example.com" /></label>' }
  ],
  remediation: {
    before: '<input placeholder="Email" />',
    after: '<input placeholder="Email" aria-label="Email" />',
    safeAutofix: "When the placeholder is a static string, ClearDOM can reuse it as an accessible name without changing input behavior. Add a persistent visible label when the layout permits.",
    manualVerification: "Confirm the accessible name describes the field and add visible instructions when users need them after entering a value."
  },
  check(context) {
    return context.elements.flatMap((element) => {
      if (!(isIntrinsicElement(element, "input", "textarea", "select") || elementRole(element, context) === "textbox")) return [];
      if (!context.hasAttribute(element, "placeholder") || isProvenHidden(element, context)) return [];
      const evidence = formLabelEvidence(element, context);
      if (evidence === "present") return [];
      return [context.createFinding(this, element, "Add a visible label, aria-label, or aria-labelledby.", evidence === "unresolved" ? { state: "unresolved" } : undefined)];
    });
  }
};
