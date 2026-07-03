import { accessibleName, ambiguousLabels, isReactNativeTouchControl, isWebInteractive } from "../rule-utils.js";
import type { RuleDefinition } from "../types.js";

export const ambiguousLabelRule: RuleDefinition = {
  id: "CDOM_2_4_4_AMBIGUOUS_LABEL",
  title: "Interactive label is ambiguous",
  severity: "warning",
  confidence: "medium",
  category: "readability",
  wcag: ["2.4.4", "2.4.9"],
  standards: [
    { version: "wcag10", criterion: "13.1", title: "Clearly identify the target of each link" },
    { version: "wcag20", criterion: "2.4.4", level: "a", title: "Link Purpose (In Context)" },
    { version: "wcag20", criterion: "2.4.9", level: "aaa", title: "Link Purpose (Link Only)" },
    { version: "wcag21", criterion: "2.4.4", level: "a", title: "Link Purpose (In Context)" },
    { version: "wcag21", criterion: "2.4.9", level: "aaa", title: "Link Purpose (Link Only)" },
    { version: "wcag22", criterion: "2.4.4", level: "a", title: "Link Purpose (In Context)" },
    { version: "wcag22", criterion: "2.4.9", level: "aaa", title: "Link Purpose (Link Only)" },
    { version: "wcag30", criterion: "clear-meaning", title: "Clear meaning and purpose" }
  ],
  platforms: ["web", "react-native-ios", "react-native-android"],
  fixable: false,
  summary: "Labels like \"click here\", \"more\", or \"submit\" often lose meaning out of context.",
  guidance: "Use specific action text such as \"View invoice details\" or \"Submit payment\".",
  examples: [
    { label: "Better label", code: "<a href=\"/invoice\">View invoice details</a>" }
  ],
  check(context) {
    return context.elements
      .filter((element) => isWebInteractive(element, context) || isReactNativeTouchControl(element.tagName))
      .filter((element) => ambiguousLabels.has(accessibleName(element, context).toLowerCase()))
      .map((element) => context.createFinding(this, element, "Replace the label with a specific action label."));
  }
};
