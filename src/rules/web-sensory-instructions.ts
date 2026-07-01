import { normalize } from "../rule-utils.js";
import type { RuleDefinition } from "../types.js";

export const sensoryInstructionsRule: RuleDefinition = {
  id: "CDOM028",
  title: "Instruction may rely on sensory characteristics",
  severity: "warning",
  confidence: "medium",
  category: "readability",
  wcag: ["1.3.3"],
  standards: [
    { version: "wcag20", criterion: "1.3.3", level: "a", title: "Sensory Characteristics" },
    { version: "wcag21", criterion: "1.3.3", level: "a", title: "Sensory Characteristics" },
    { version: "wcag22", criterion: "1.3.3", level: "a", title: "Sensory Characteristics" },
    { version: "wcag30", criterion: "clear-purpose", title: "Clear purpose and context" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Instructions should not depend only on shape, size, position, orientation, or sound.",
  guidance: "Name the target control or content directly, and use sensory characteristics only as supporting information.",
  examples: [
    { label: "Named target", code: '<p>Select Continue, the round button on the right.</p>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => looksSensoryOnly(normalize(context.elementText(element)).toLowerCase()))
      .map((element) => context.createFinding(this, element, "Do not identify controls or content only by shape, position, size, orientation, or sound."));
  }
};

const sensoryInstructionPattern = /\b(click|tap|press|choose|select|use|open)\b.*\b(left|right|above|below|round|square|circle|circular|large|small|top|bottom|loud|quiet)\b|\b(left|right|above|below|round|square|circle|circular|large|small|top|bottom|loud|quiet)\b.*\b(click|tap|press|choose|select|use|open)\b/;
const namedTargetPattern = /\b(continue|submit|cancel|save|next|back|close|menu|checkout|search|help)\b/;

function looksSensoryOnly(text: string): boolean {
  return sensoryInstructionPattern.test(text) && !namedTargetPattern.test(text);
}
