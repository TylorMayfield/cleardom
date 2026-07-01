import { hasKeyboardSupport, hasTabStop, isNativeInteractive } from "../rule-utils.js";
import type { RuleDefinition } from "../types.js";

export const keyboardRule: RuleDefinition = {
  id: "CDOM007",
  title: "Clickable non-interactive element lacks keyboard support",
  severity: "critical",
  confidence: "medium",
  category: "keyboard",
  wcag: ["2.1.1", "4.1.2"],
  standards: [
    { version: "wcag10", criterion: "6.4", title: "Device-independent event handlers" },
    { version: "wcag10", criterion: "9.3", title: "Device-independent event handlers" },
    { version: "wcag20", criterion: "2.1.1", level: "a", title: "Keyboard" },
    { version: "wcag20", criterion: "4.1.2", level: "a", title: "Name, Role, Value" },
    { version: "wcag21", criterion: "2.1.1", level: "a", title: "Keyboard" },
    { version: "wcag21", criterion: "4.1.2", level: "a", title: "Name, Role, Value" },
    { version: "wcag22", criterion: "2.1.1", level: "a", title: "Keyboard" },
    { version: "wcag22", criterion: "4.1.2", level: "a", title: "Name, Role, Value" },
    { version: "wcag30", criterion: "keyboard-access", title: "Keyboard and input access" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Mouse-only click handlers can block keyboard and switch-device users.",
  guidance: "Use a native button or link, or add role, tabIndex, and keyboard event handling.",
  examples: [
    { label: "Native control", code: '<button type="button" onClick={openMenu}>Open menu</button>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => context.hasAttribute(element, "onClick"))
      .filter((element) => !isNativeInteractive(element.tagName))
      .filter((element) => !hasKeyboardSupport(element, context) || !hasTabStop(element, context))
      .map((element) => context.createFinding(this, element, "Use a native control or add tabIndex plus keyboard handlers."));
  }
};
