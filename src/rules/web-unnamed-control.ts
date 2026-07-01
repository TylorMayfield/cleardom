import { hasAccessibleName, isWebInteractive } from "../rule-utils.js";
import type { RuleDefinition } from "../types.js";

export const unnamedControlRule: RuleDefinition = {
  id: "CDOM001",
  title: "Interactive control has no accessible name",
  severity: "critical",
  confidence: "high",
  category: "names-and-roles",
  wcag: ["4.1.2", "2.5.3"],
  standards: [
    { version: "wcag10", criterion: "12.4", title: "Associate labels explicitly with their controls" },
    { version: "wcag20", criterion: "4.1.2", level: "a", title: "Name, Role, Value" },
    { version: "wcag21", criterion: "4.1.2", level: "a", title: "Name, Role, Value" },
    { version: "wcag21", criterion: "2.5.3", level: "a", title: "Label in Name" },
    { version: "wcag22", criterion: "4.1.2", level: "a", title: "Name, Role, Value" },
    { version: "wcag22", criterion: "2.5.3", level: "a", title: "Label in Name" },
    { version: "wcag30", criterion: "clear-labels", title: "Clear labels and names" }
  ],
  platforms: ["web"],
  fixable: true,
  summary: "Icon-only or empty controls can be announced as just \"button\" or \"link\".",
  guidance: "Add visible text, aria-label, aria-labelledby, or a component prop that maps to an accessible name.",
  examples: [
    { label: "Web", code: '<button aria-label="Close cart"><XIcon /></button>' },
    { label: "Visible text", code: "<button>Close cart</button>" }
  ],
  check(context) {
    return context.elements
      .filter((element) => isWebInteractive(element, context) && !hasAccessibleName(element, context))
      .map((element) => context.createFinding(this, element, "Add visible text, aria-label, or aria-labelledby."));
  }
};
