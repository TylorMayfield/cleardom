import { accessibleName, isWebInteractive, normalize, visibleLabel } from "../rule-utils.js";
import type { RuleDefinition } from "../types.js";

export const labelInNameRule: RuleDefinition = {
  id: "CDOM_2_5_3_LABEL_IN_NAME",
  title: "Accessible name does not include visible label",
  severity: "warning",
  confidence: "medium",
  category: "names-and-roles",
  wcag: ["2.5.3"],
  standards: [
    { version: "wcag21", criterion: "2.5.3", level: "a", title: "Label in Name" },
    { version: "wcag22", criterion: "2.5.3", level: "a", title: "Label in Name" },
    { version: "wcag30", criterion: "consistent-labels", title: "Visible labels match accessible names" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Speech input users need the accessible name to include the visible control label.",
  guidance: "Keep visible text in the accessible name. Avoid replacing visible button or link text with an unrelated aria-label.",
  examples: [
    { label: "Matching label", code: '<button aria-label="Save changes">Save</button>' },
    { label: "Form label", code: '<label htmlFor="email">Email</label><input id="email" aria-label="Email address" />' }
  ],
  check(context) {
    return context.elements
      .filter((element) => isWebInteractive(element, context) || isFormControl(element.tagName))
      .filter((element) => {
        const visible = visibleLabel(element, context);
        const name = accessibleName(element, context);
        return visible.length > 0 && name.length > 0 && !normalizeForCompare(name).includes(normalizeForCompare(visible));
      })
      .map((element) => context.createFinding(this, element, "Include the visible label text in the accessible name."));
  }
};

function isFormControl(tagName: string): boolean {
  return ["input", "select", "textarea"].includes(tagName.toLowerCase());
}

function normalizeForCompare(value: string): string {
  return normalize(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
