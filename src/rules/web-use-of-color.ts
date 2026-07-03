import { normalize, staticAttributeValue } from "../rule-utils.js";
import type { JsxElement, RuleContext, RuleDefinition } from "../types.js";

export const useOfColorRule: RuleDefinition = {
  id: "CDOM_1_4_1_USE_OF_COLOR",
  title: "Instruction or state change may rely on color alone",
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
  summary: "Instructions and state changes that depend only on color can exclude users who cannot perceive that color.",
  guidance: "Pair color with text, icons, patterns, or programmatic state so the information is available without color perception.",
  examples: [
    { label: "Text and color", code: '<p><span aria-hidden="true">*</span> Required fields are marked with an asterisk and red border.</p>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => looksColorOnly(element, context))
      .map((element) => context.createFinding(this, element, "Do not communicate required state, errors, status, or choices by color alone. Add text, borders, icons, or patterns."));
  }
};

const colorOnlyPattern = /\b(red|green|blue|yellow|color|colour)\b.*\b(required|error|invalid|success|selected|available|unavailable|warning)\b|\b(required|error|invalid|success|selected|available|unavailable|warning)\b.*\b(red|green|blue|yellow|color|colour)\b/;
const nonColorCuePattern = /\b(asterisk|icon|label|pattern|symbol|underline|bold|text|border|outline|badge)\b/;

function looksColorOnly(element: JsxElement, context: RuleContext): boolean {
  const text = normalize(context.elementText(element)).toLowerCase();
  
  // Check text pattern (instructions mentioning color)
  if (colorOnlyPattern.test(text) && !nonColorCuePattern.test(text)) {
    return true;
  }
  
  // Check for color-only form state in CSS
  if (isColorOnlyFormState(element, context)) {
    return true;
  }
  
  return false;
}

function isColorOnlyFormState(element: JsxElement, context: RuleContext): boolean {
  const tag = element.tagName.toLowerCase();
  if (!["input", "select", "textarea", "button"].includes(tag)) {
    return false;
  }
  
  const style = staticAttributeValue(element, context, "style") ?? "";
  if (!style) return false;
  
  // Check if style has color property
  const hasColorChange = /\bcolor\s*:\s*#[0-9a-f]{3,6}|rgb|hsl/i.test(style);
  if (!hasColorChange) return false;
  
  // Check if there are NO other visual indicators
  const hasOtherIndicators = /\b(border|outline|background|text-decoration|box-shadow|::after|::before)\b/i.test(style);
  
  // Check class for state names without visual alternatives
  const className = staticAttributeValue(element, context, "className") ?? "";
  const hasStateClass = /\b(error|success|invalid|valid|disabled|readonly)\b/i.test(className);
  
  // It's color-only if: has color change AND no other visual indicators
  return hasColorChange && !hasOtherIndicators && !hasStateClass;
}
