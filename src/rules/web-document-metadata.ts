import { staticAttributeValue } from "../rule-utils.js";
import type { RuleDefinition } from "../types.js";

export const documentMetadataRule: RuleDefinition = {
  id: "CDOM011",
  title: "Document language or title is missing",
  severity: "warning",
  confidence: "high",
  category: "structure",
  wcag: ["3.1.1", "2.4.2"],
  standards: [
    { version: "wcag20", criterion: "3.1.1", level: "a", title: "Language of Page" },
    { version: "wcag20", criterion: "2.4.2", level: "a", title: "Page Titled" },
    { version: "wcag21", criterion: "3.1.1", level: "a", title: "Language of Page" },
    { version: "wcag21", criterion: "2.4.2", level: "a", title: "Page Titled" },
    { version: "wcag22", criterion: "3.1.1", level: "a", title: "Language of Page" },
    { version: "wcag22", criterion: "2.4.2", level: "a", title: "Page Titled" },
    { version: "wcag30", criterion: "clear-purpose", title: "Clear purpose and context" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Full HTML documents need a page language and non-empty title.",
  guidance: "Add lang to the html element and include a non-empty title element.",
  examples: [
    { label: "Document metadata", code: '<html lang="en"><head><title>Checkout - ClearDOM</title></head></html>' }
  ],
  check(context) {
    const findings = [];
    const htmlElements = context.elements.filter((element) => element.tagName.toLowerCase() === "html");
    const titleElements = context.elements.filter((element) => element.tagName.toLowerCase() === "title");

    for (const html of htmlElements) {
      if (!staticAttributeValue(html, context, "lang")?.trim() && !staticAttributeValue(html, context, "xml:lang")?.trim()) {
        findings.push(context.createFinding(this, html, "Add a lang attribute to the html element."));
      }
    }

    if (htmlElements.length > 0 && titleElements.length === 0) {
      findings.push(context.createFinding(this, htmlElements[0], "Add a descriptive title element."));
    }

    for (const title of titleElements) {
      if (!context.elementText(title).trim()) {
        findings.push(context.createFinding(this, title, "Add text to the title element."));
      }
    }

    return findings;
  }
};
