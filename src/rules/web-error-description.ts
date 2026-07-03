import { staticAttributeValue } from "../rule-utils.js";
import type { RuleDefinition } from "../types.js";

export const errorDescriptionRule: RuleDefinition = {
  id: "CDOM_3_3_1_ERROR_DESCRIPTION",
  title: "Invalid form control is not connected to error text",
  severity: "warning",
  confidence: "medium",
  category: "forms",
  wcag: ["3.3.1", "3.3.3", "4.1.2"],
  standards: [
    { version: "wcag20", criterion: "3.3.1", level: "a", title: "Error Identification" },
    { version: "wcag20", criterion: "3.3.3", level: "aa", title: "Error Suggestion" },
    { version: "wcag20", criterion: "4.1.2", level: "a", title: "Name, Role, Value" },
    { version: "wcag21", criterion: "3.3.1", level: "a", title: "Error Identification" },
    { version: "wcag21", criterion: "3.3.3", level: "aa", title: "Error Suggestion" },
    { version: "wcag21", criterion: "4.1.2", level: "a", title: "Name, Role, Value" },
    { version: "wcag22", criterion: "3.3.1", level: "a", title: "Error Identification" },
    { version: "wcag22", criterion: "3.3.3", level: "aa", title: "Error Suggestion" },
    { version: "wcag22", criterion: "4.1.2", level: "a", title: "Name, Role, Value" },
    { version: "wcag30", criterion: "clear-errors", title: "Errors are identifiable and actionable" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Controls marked invalid should point to error text so assistive technology users hear the problem.",
  guidance: "When aria-invalid is true, add aria-describedby or aria-errormessage that references specific error or suggestion text.",
  examples: [
    { label: "Connected error", code: '<input aria-invalid="true" aria-describedby="email-error" /><p id="email-error">Enter a valid email.</p>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => staticAttributeValue(element, context, "aria-invalid") === "true")
      .filter((element) => !staticAttributeValue(element, context, "aria-describedby") && !staticAttributeValue(element, context, "aria-errormessage"))
      .map((element) => context.createFinding(this, element, "Connect the invalid control to error text with aria-describedby or aria-errormessage."));
  }
};
