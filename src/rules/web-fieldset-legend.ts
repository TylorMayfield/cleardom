import type { JsxElement, RuleContext, RuleDefinition } from "../types.js";

export const fieldsetLegendRule: RuleDefinition = {
  id: "CDOM019",
  title: "Grouped form controls are missing a legend",
  severity: "warning",
  confidence: "high",
  category: "forms",
  wcag: ["1.3.1", "3.3.2"],
  standards: [
    { version: "wcag20", criterion: "1.3.1", level: "a", title: "Info and Relationships" },
    { version: "wcag20", criterion: "3.3.2", level: "a", title: "Labels or Instructions" },
    { version: "wcag21", criterion: "1.3.1", level: "a", title: "Info and Relationships" },
    { version: "wcag21", criterion: "3.3.2", level: "a", title: "Labels or Instructions" },
    { version: "wcag22", criterion: "1.3.1", level: "a", title: "Info and Relationships" },
    { version: "wcag22", criterion: "3.3.2", level: "a", title: "Labels or Instructions" },
    { version: "wcag30", criterion: "structured-forms", title: "Related form controls have clear groups" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Fieldsets need legends so grouped controls have a programmatic group label.",
  guidance: "Add a visible legend as the first meaningful child of each fieldset, especially for radio and checkbox groups.",
  examples: [
    { label: "Grouped radios", code: '<fieldset><legend>Shipping speed</legend><label><input type="radio" /> Standard</label></fieldset>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => element.tagName.toLowerCase() === "fieldset")
      .filter((element) => !hasLegend(element, context))
      .map((element) => context.createFinding(this, element, "Add a legend that names this form-control group."));
  }
};

function hasLegend(element: JsxElement, context: RuleContext): boolean {
  return element.childIds
    .map((id) => context.elements[id])
    .filter((child): child is JsxElement => Boolean(child))
    .some((child) => child.tagName.toLowerCase() === "legend" && context.elementText(child).trim().length > 0);
}
