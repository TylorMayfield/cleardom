import { accessibleNameEvidence, elementRole, isDisabled, isReactNativeTouchControl } from "../rule-utils.js";
import type { RuleDefinition } from "../types.js";

export const nativeLabelRule: RuleDefinition = {
  id: "CDOM_4_1_2_NATIVE_LABEL",
  title: "React Native touch control has no accessibility label",
  severity: "critical",
  confidence: "high",
  category: "react-native",
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
  platforms: ["react-native-ios", "react-native-android"],
  fixable: false,
  summary: "VoiceOver and TalkBack need a stable label for touchable controls.",
  guidance: "Add accessibilityLabel and, when needed, accessibilityRole or accessibilityHint.",
  examples: [
    { label: "React Native", code: '<Pressable accessibilityRole="button" accessibilityLabel="Close cart"><XIcon /></Pressable>' }
  ],
  check(context) {
    return context.elements.flatMap((element) => {
      if (!isReactNativeControl(element, context) || isDisabled(element, context)) return [];
      const evidence = accessibleNameEvidence(element, context);
      if (evidence === "present") return [];
      return [context.createFinding(this, element, "Add accessibilityLabel so assistive tech can announce this control.", evidence === "unresolved" ? { state: "unresolved" } : undefined)];
    });
  }
};

function isReactNativeControl(element: Parameters<RuleDefinition["check"]>[0]["elements"][number], context: Parameters<RuleDefinition["check"]>[0]): boolean {
  if (isReactNativeTouchControl(element.tagName)) return true;
  if (element.importSource === "react-native") return elementRole(element, context) === "button";
  return context.options.componentPresets.includes("react-native") && elementRole(element, context) === "button";
}
