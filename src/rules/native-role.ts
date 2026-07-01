import { isReactNativeTouchControl } from "../rule-utils.js";
import type { RuleDefinition } from "../types.js";

export const nativeRoleRule: RuleDefinition = {
  id: "CDOM009",
  title: "React Native touch control has no accessibility role",
  severity: "warning",
  confidence: "medium",
  category: "react-native",
  wcag: ["4.1.2"],
  standards: [
    { version: "wcag10", criterion: "12.4", title: "Associate labels explicitly with their controls" },
    { version: "wcag20", criterion: "4.1.2", level: "a", title: "Name, Role, Value" },
    { version: "wcag21", criterion: "4.1.2", level: "a", title: "Name, Role, Value" },
    { version: "wcag22", criterion: "4.1.2", level: "a", title: "Name, Role, Value" },
    { version: "wcag30", criterion: "clear-role", title: "Clear role and purpose" }
  ],
  platforms: ["react-native-ios", "react-native-android"],
  fixable: true,
  summary: "Touch controls need a role so assistive technology can announce the control type.",
  guidance: "Add accessibilityRole=\"button\" or a more specific role when appropriate.",
  examples: [
    { label: "React Native", code: '<Pressable accessibilityRole="button" accessibilityLabel="Close cart"><XIcon /></Pressable>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => isReactNativeTouchControl(element.tagName))
      .filter((element) => !context.hasAttribute(element, "accessibilityRole"))
      .map((element) => context.createFinding(this, element, "Add accessibilityRole so the control type is announced."));
  }
};
