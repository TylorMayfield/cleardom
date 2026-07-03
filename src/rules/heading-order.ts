import type { RuleDefinition } from "../types.js";

export const headingOrderRule: RuleDefinition = {
  id: "CDOM_1_3_1_HEADING_ORDER",
  title: "Heading level jumps",
  severity: "warning",
  confidence: "medium",
  category: "structure",
  wcag: ["1.3.1", "2.4.6"],
  standards: [
    { version: "wcag10", criterion: "3.5", title: "Use header elements to convey document structure" },
    { version: "wcag20", criterion: "1.3.1", level: "a", title: "Info and Relationships" },
    { version: "wcag20", criterion: "2.4.6", level: "aa", title: "Headings and Labels" },
    { version: "wcag21", criterion: "1.3.1", level: "a", title: "Info and Relationships" },
    { version: "wcag21", criterion: "2.4.6", level: "aa", title: "Headings and Labels" },
    { version: "wcag22", criterion: "1.3.1", level: "a", title: "Info and Relationships" },
    { version: "wcag22", criterion: "2.4.6", level: "aa", title: "Headings and Labels" },
    { version: "wcag30", criterion: "structured-content", title: "Structured content" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Skipped heading levels make page structure harder to navigate with assistive technology.",
  guidance: "Keep heading levels sequential, such as h2 followed by h3 rather than h4.",
  examples: [
    { label: "Sequential headings", code: "<h2>Billing</h2>\n<h3>Payment method</h3>" }
  ],
  check(context) {
    const findings = [];
    let previousLevel = 0;

    for (const element of context.elements) {
      const match = /^h([1-6])$/i.exec(element.tagName);
      if (!match) continue;

      const level = Number(match[1]);
      if (previousLevel > 0 && level > previousLevel + 1) {
        findings.push(context.createFinding(this, element, `Use h${previousLevel + 1} before jumping to h${level}.`));
      }
      previousLevel = level;
    }

    return findings;
  }
};
