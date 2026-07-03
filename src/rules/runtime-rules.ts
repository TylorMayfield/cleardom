import type { RuleDefinition } from "../types.js";

const noopCheck: RuleDefinition["check"] = () => [];

export const contrastRuntimeRule: RuleDefinition = {
  id: "CDOM_1_4_3_CONTRAST",
  title: "Text contrast is below the minimum ratio",
  severity: "critical",
  confidence: "medium",
  category: "readability",
  wcag: ["1.4.3"],
  standards: [
    { version: "wcag20", criterion: "1.4.3", level: "aa", title: "Contrast (Minimum)" },
    { version: "wcag21", criterion: "1.4.3", level: "aa", title: "Contrast (Minimum)" },
    { version: "wcag22", criterion: "1.4.3", level: "aa", title: "Contrast (Minimum)" },
    { version: "wcag30", criterion: "visual-contrast", title: "Visual contrast supports reading" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Rendered text needs enough contrast against its actual background.",
  guidance: "Increase foreground/background contrast, using at least 4.5:1 for normal text and 3:1 for large text.",
  examples: [],
  check: noopCheck
};

export const focusVisibleRuntimeRule: RuleDefinition = {
  id: "CDOM_2_4_7_FOCUS_VISIBLE",
  title: "Focused control has no visible focus indicator",
  severity: "critical",
  confidence: "medium",
  category: "keyboard",
  wcag: ["2.4.7"],
  standards: [
    { version: "wcag20", criterion: "2.4.7", level: "aa", title: "Focus Visible" },
    { version: "wcag21", criterion: "2.4.7", level: "aa", title: "Focus Visible" },
    { version: "wcag22", criterion: "2.4.7", level: "aa", title: "Focus Visible" },
    { version: "wcag30", criterion: "focus-appearance", title: "Focus appearance is perceivable" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Keyboard users need a visible indication of which control currently has focus.",
  guidance: "Keep a visible outline or add a custom focus style with sufficient contrast and size.",
  examples: [],
  check: noopCheck
};

export const targetSizeRuntimeRule: RuleDefinition = {
  id: "CDOM_2_5_8_TARGET_SIZE",
  title: "Interactive target is smaller than WCAG minimum",
  severity: "warning",
  confidence: "medium",
  category: "keyboard",
  wcag: ["2.5.8"],
  standards: [
    { version: "wcag22", criterion: "2.5.8", level: "aa", title: "Target Size (Minimum)" },
    { version: "wcag30", criterion: "target-size", title: "Targets are large enough to activate" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Small rendered targets are hard to activate accurately.",
  guidance: "Make pointer targets at least 24 by 24 CSS pixels, or provide enough spacing and an equivalent larger target.",
  examples: [],
  check: noopCheck
};

export const reflowRuntimeRule: RuleDefinition = {
  id: "CDOM_1_4_10_REFLOW",
  title: "Page causes horizontal overflow at narrow viewport",
  severity: "warning",
  confidence: "medium",
  category: "readability",
  wcag: ["1.4.10"],
  standards: [
    { version: "wcag21", criterion: "1.4.10", level: "aa", title: "Reflow" },
    { version: "wcag22", criterion: "1.4.10", level: "aa", title: "Reflow" },
    { version: "wcag30", criterion: "responsive-layout", title: "Content adapts without two-dimensional scrolling" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Content should reflow at narrow widths without requiring horizontal scrolling.",
  guidance: "Remove fixed-width layout constraints or add responsive wrapping so content fits within the viewport.",
  examples: [],
  check: noopCheck
};

export const skipLinkRuntimeRule: RuleDefinition = {
  id: "CDOM_2_4_1_SKIP_LINK",
  title: "Skip link is missing or not visible on focus",
  severity: "warning",
  confidence: "medium",
  category: "keyboard",
  wcag: ["2.4.1"],
  standards: [
    { version: "wcag20", criterion: "2.4.1", level: "a", title: "Bypass Blocks" },
    { version: "wcag21", criterion: "2.4.1", level: "a", title: "Bypass Blocks" },
    { version: "wcag22", criterion: "2.4.1", level: "a", title: "Bypass Blocks" },
    { version: "wcag30", criterion: "bypass-blocks", title: "Repeated content can be bypassed" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Keyboard users need a visible way to bypass repeated navigation.",
  guidance: "Add a skip link that targets main content and becomes visible when focused.",
  examples: [],
  check: noopCheck
};

export const textSpacingRuntimeRule: RuleDefinition = {
  id: "CDOM_1_4_12_TEXT_SPACING",
  title: "Text spacing causes content loss or overlap",
  severity: "warning",
  confidence: "medium",
  category: "readability",
  wcag: ["1.4.12"],
  standards: [
    { version: "wcag21", criterion: "1.4.12", level: "aa", title: "Text Spacing" },
    { version: "wcag22", criterion: "1.4.12", level: "aa", title: "Text Spacing" },
    { version: "wcag30", criterion: "adaptable-text", title: "Text can be adapted without losing content" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Content should remain readable when users increase text spacing.",
  guidance: "Allow text containers to grow or wrap when line, paragraph, letter, and word spacing are increased.",
  examples: [],
  check: noopCheck
};

export const hoverFocusContentRuntimeRule: RuleDefinition = {
  id: "CDOM_1_4_13_HOVER_FOCUS_CONTENT",
  title: "Hover or focus content is not dismissible or hoverable",
  severity: "warning",
  confidence: "medium",
  category: "keyboard",
  wcag: ["1.4.13"],
  standards: [
    { version: "wcag21", criterion: "1.4.13", level: "aa", title: "Content on Hover or Focus" },
    { version: "wcag22", criterion: "1.4.13", level: "aa", title: "Content on Hover or Focus" },
    { version: "wcag30", criterion: "predictable-help", title: "Transient content is predictable and controllable" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Additional content triggered by hover or focus should be dismissible, hoverable, and persistent.",
  guidance: "Make hover or focus content dismissible with Escape and keep it available while the pointer moves over it.",
  examples: [],
  check: noopCheck
};

export const keyboardTrapRuntimeRule: RuleDefinition = {
  id: "CDOM_2_1_2_KEYBOARD_TRAP",
  title: "Keyboard focus appears trapped",
  severity: "critical",
  confidence: "medium",
  category: "keyboard",
  wcag: ["2.1.2"],
  standards: [
    { version: "wcag20", criterion: "2.1.2", level: "a", title: "No Keyboard Trap" },
    { version: "wcag21", criterion: "2.1.2", level: "a", title: "No Keyboard Trap" },
    { version: "wcag22", criterion: "2.1.2", level: "a", title: "No Keyboard Trap" },
    { version: "wcag30", criterion: "keyboard-trap", title: "Keyboard focus can leave components" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Keyboard users must be able to move focus away from every component.",
  guidance: "Let Tab and Shift+Tab move focus out of custom widgets, or clearly document and implement a standard escape method.",
  examples: [],
  check: noopCheck
};

export const focusObscuredRuntimeRule: RuleDefinition = {
  id: "CDOM_2_4_11_FOCUS_OBSCURED",
  title: "Focused control is fully obscured by author content",
  severity: "critical",
  confidence: "medium",
  category: "keyboard",
  wcag: ["2.4.11"],
  standards: [
    { version: "wcag22", criterion: "2.4.11", level: "aa", title: "Focus Not Obscured (Minimum)" },
    { version: "wcag30", criterion: "focus-visible", title: "Focused content remains visible" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "The focused component should remain at least partially visible.",
  guidance: "Move sticky or overlay content so it does not fully cover the focused control.",
  examples: [],
  check: noopCheck
};
