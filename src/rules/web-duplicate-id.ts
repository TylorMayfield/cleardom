import { staticAttributeValue } from "../rule-utils.js";
import type { RuleDefinition } from "../types.js";

export const duplicateIdRule: RuleDefinition = {
  id: "CDOM_4_1_2_DUPLICATE_ID",
  title: "Duplicate id values can break accessibility references",
  severity: "warning",
  confidence: "high",
  category: "structure",
  wcag: ["4.1.2", "1.3.1"],
  standards: [
    { version: "wcag20", criterion: "4.1.1", level: "a", title: "Parsing" },
    { version: "wcag20", criterion: "4.1.2", level: "a", title: "Name, Role, Value" },
    { version: "wcag21", criterion: "4.1.1", level: "a", title: "Parsing" },
    { version: "wcag21", criterion: "4.1.2", level: "a", title: "Name, Role, Value" },
    { version: "wcag22", criterion: "4.1.2", level: "a", title: "Name, Role, Value" },
    { version: "wcag22", criterion: "1.3.1", level: "a", title: "Info and Relationships" },
    { version: "wcag30", criterion: "unique-identifiers", title: "References resolve predictably" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Duplicate id values make labels, descriptions, and aria-labelledby references resolve unpredictably.",
  guidance: "Give each id a unique value, especially when it is used by labels, aria-labelledby, aria-describedby, or fragment links.",
  examples: [
    { label: "Unique labels", code: '<label htmlFor="billing-email">Email</label><input id="billing-email" />' }
  ],
  check(context) {
    const seen = new Map<string, number>();
    const findings = [];

    for (const element of context.elements) {
      const id = staticAttributeValue(element, context, "id")?.trim();
      if (!id) continue;
      const count = seen.get(id) ?? 0;
      seen.set(id, count + 1);
      if (count > 0) {
        findings.push(context.createFinding(this, element, `Use a unique id value instead of repeating "${id}".`));
      }
    }

    return findings;
  }
};
