import type { RuleDefinition } from "../types.js";

export const anchorHrefRule: RuleDefinition = {
  id: "CDOM006",
  title: "Anchor is missing an href",
  severity: "warning",
  confidence: "high",
  category: "names-and-roles",
  wcag: ["4.1.2", "2.1.1"],
  standards: [
    { version: "wcag10", criterion: "13.1", title: "Clearly identify the target of each link" },
    { version: "wcag20", criterion: "4.1.2", level: "a", title: "Name, Role, Value" },
    { version: "wcag20", criterion: "2.1.1", level: "a", title: "Keyboard" },
    { version: "wcag21", criterion: "4.1.2", level: "a", title: "Name, Role, Value" },
    { version: "wcag21", criterion: "2.1.1", level: "a", title: "Keyboard" },
    { version: "wcag22", criterion: "4.1.2", level: "a", title: "Name, Role, Value" },
    { version: "wcag22", criterion: "2.1.1", level: "a", title: "Keyboard" },
    { version: "wcag30", criterion: "clear-purpose", title: "Clear purpose and role" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Anchors without href are not consistently exposed as links and can be awkward for keyboard users.",
  guidance: "Use href for navigation, or use a button for in-place actions.",
  examples: [
    { label: "Navigation", code: '<a href="/receipt">View receipt</a>' },
    { label: "Action", code: '<button type="button" onClick={openReceipt}>View receipt</button>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => element.tagName.toLowerCase() === "a")
      .filter((element) => !context.hasAttribute(element, "href"))
      .map((element) => context.createFinding(this, element, "Use href for navigation, or replace this with a button."));
  }
};
