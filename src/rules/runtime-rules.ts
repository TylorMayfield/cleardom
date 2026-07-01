import type { RuleDefinition } from "../types.js";

const noopCheck: RuleDefinition["check"] = () => [];

export const contrastRuntimeRule: RuleDefinition = {
  id: "CDOM022",
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
  id: "CDOM023",
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
  id: "CDOM024",
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
  id: "CDOM025",
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
  id: "CDOM026",
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
