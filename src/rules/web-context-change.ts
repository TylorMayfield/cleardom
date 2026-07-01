import type { JsxAttribute, RuleDefinition } from "../types.js";

export const contextChangeRule: RuleDefinition = {
  id: "CDOM030",
  title: "Focus or input handler may change context unexpectedly",
  severity: "warning",
  confidence: "medium",
  category: "forms",
  wcag: ["3.2.1", "3.2.2"],
  standards: [
    { version: "wcag20", criterion: "3.2.1", level: "a", title: "On Focus" },
    { version: "wcag20", criterion: "3.2.2", level: "a", title: "On Input" },
    { version: "wcag21", criterion: "3.2.1", level: "a", title: "On Focus" },
    { version: "wcag21", criterion: "3.2.2", level: "a", title: "On Input" },
    { version: "wcag22", criterion: "3.2.1", level: "a", title: "On Focus" },
    { version: "wcag22", criterion: "3.2.2", level: "a", title: "On Input" },
    { version: "wcag30", criterion: "predictable-behavior", title: "Changes are predictable" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Focus and input events should not unexpectedly navigate, submit, open new windows, or otherwise change context.",
  guidance: "Move navigation or submission to an explicit button, or warn users before a focus/input change will change context.",
  examples: [
    { label: "Explicit action", code: '<select name="country" /><button type="submit">Apply country</button>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => contextChangeAttributes.some((name) => riskyHandler(context.getAttribute(element, name))))
      .map((element) => context.createFinding(this, element, "Avoid changing context from focus, blur, input, or change handlers without prior warning."));
  }
};

const contextChangeAttributes = ["onFocus", "onBlur", "onChange", "onInput"];
const riskyContextChangePattern = /\b(window\.)?location\b|location\.(assign|replace)|\bnavigate\s*\(|\brouter\.(push|replace)\s*\(|\bhistory\.(push|replace)State\s*\(|\bsubmit\s*\(|\bopen\s*\(/;

function riskyHandler(attribute: JsxAttribute | undefined): boolean {
  return attribute?.kind === "expression"
    && typeof attribute.value === "string"
    && riskyContextChangePattern.test(attribute.value);
}
