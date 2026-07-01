import { elementRole, hasFormLabel, staticAttributeValue } from "../rule-utils.js";
import type { JsxElement, RuleContext, RuleDefinition } from "../types.js";

export const formLabelRule: RuleDefinition = {
  id: "CDOM010",
  title: "Form control has no accessible label",
  severity: "critical",
  confidence: "high",
  category: "forms",
  wcag: ["4.1.2", "1.3.1", "3.3.2"],
  standards: [
    { version: "wcag10", criterion: "12.4", title: "Associate labels explicitly with their controls" },
    { version: "wcag20", criterion: "4.1.2", level: "a", title: "Name, Role, Value" },
    { version: "wcag20", criterion: "1.3.1", level: "a", title: "Info and Relationships" },
    { version: "wcag20", criterion: "3.3.2", level: "a", title: "Labels or Instructions" },
    { version: "wcag21", criterion: "4.1.2", level: "a", title: "Name, Role, Value" },
    { version: "wcag21", criterion: "1.3.1", level: "a", title: "Info and Relationships" },
    { version: "wcag21", criterion: "3.3.2", level: "a", title: "Labels or Instructions" },
    { version: "wcag22", criterion: "4.1.2", level: "a", title: "Name, Role, Value" },
    { version: "wcag22", criterion: "1.3.1", level: "a", title: "Info and Relationships" },
    { version: "wcag22", criterion: "3.3.2", level: "a", title: "Labels or Instructions" },
    { version: "wcag30", criterion: "clear-labels", title: "Clear labels and names" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Inputs, selects, and textareas need labels exposed to assistive technology.",
  guidance: "Use a visible label, aria-label, aria-labelledby, or a mapped design-system label prop.",
  examples: [
    { label: "Explicit label", code: '<label htmlFor="email">Email</label><input id="email" name="email" />' },
    { label: "Select label", code: '<label htmlFor="state">State</label><select id="state" name="state" />' }
  ],
  check(context) {
    return context.elements
      .filter((element) => isLabelableFormControl(element, context))
      .filter((element) => !hasFormLabel(element, context))
      .map((element) => context.createFinding(this, element, "Add a label, aria-label, or aria-labelledby."));
  }
};

function isLabelableFormControl(element: JsxElement, context: RuleContext): boolean {
  const tag = element.tagName.toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (elementRole(element, context) === "textbox") return true;
  if (tag !== "input") return false;

  const type = staticAttributeValue(element, context, "type")?.toLowerCase() ?? "text";
  return !["hidden", "button", "submit", "reset"].includes(type);
}
