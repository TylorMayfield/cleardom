import { normalize } from "../rule-utils.js";
import type { RuleDefinition } from "../types.js";

export const useOfColorRule: RuleDefinition = {
  id: "CDOM027",
  title: "Instruction may rely on color alone",
  severity: "warning",
  confidence: "medium",
  category: "readability",
  wcag: ["1.4.1"],
  standards: [
    { version: "wcag20", criterion: "1.4.1", level: "a", title: "Use of Color" },
    { version: "wcag21", criterion: "1.4.1", level: "a", title: "Use of Color" },
    { version: "wcag22", criterion: "1.4.1", level: "a", title: "Use of Color" },
    { version: "wcag30", criterion: "clear-purpose", title: "Clear purpose and context" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Instructions that identify state by color alone can exclude users who cannot perceive that color.",
  guidance: "Pair color with text, icons, patterns, or programmatic state so the information is available without color perception.",
  examples: [
    { label: "Text and color", code: '<p><span aria-hidden="true">*</span> Required fields are marked with an asterisk and red border.</p>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => looksColorOnly(normalize(context.elementText(element)).toLowerCase()))
      .map((element) => context.createFinding(this, element, "Do not communicate required state, errors, status, or choices by color alone."));
  }
};

const colorOnlyPattern = /\b(red|green|blue|yellow|color|colour)\b.*\b(required|error|invalid|success|selected|available|unavailable|warning)\b|\b(required|error|invalid|success|selected|available|unavailable|warning)\b.*\b(red|green|blue|yellow|color|colour)\b/;
const nonColorCuePattern = /\b(asterisk|icon|label|pattern|symbol|underline|bold|text)\b/;

function looksColorOnly(text: string): boolean {
  return colorOnlyPattern.test(text) && !nonColorCuePattern.test(text);
}
