import type { RuleDefinition, StandardDefinition, StandardId, StandardReference, WcagCriterion, WcagLevel } from "./types.js";

const levelRank: Record<WcagLevel, number> = {
  a: 1,
  aa: 2,
  aaa: 3
};

export const standards: StandardDefinition[] = [
  {
    id: "wcag10",
    label: "WCAG 1.0",
    version: "wcag10",
    status: "recommendation",
    recommended: false,
    note: "Legacy 1999 checkpoint model. Included for older policy mapping."
  },
  {
    id: "wcag20-a",
    label: "WCAG 2.0 Level A",
    version: "wcag20",
    status: "recommendation",
    level: "a",
    recommended: false,
    note: "WCAG 2.0 Level A success criteria."
  },
  {
    id: "wcag20-aa",
    label: "WCAG 2.0 Level AA",
    version: "wcag20",
    status: "recommendation",
    level: "aa",
    recommended: false,
    note: "WCAG 2.0 Level A and AA success criteria."
  },
  {
    id: "wcag20-aaa",
    label: "WCAG 2.0 Level AAA",
    version: "wcag20",
    status: "recommendation",
    level: "aaa",
    recommended: false,
    note: "WCAG 2.0 Level A, AA, and AAA success criteria."
  },
  {
    id: "wcag21-a",
    label: "WCAG 2.1 Level A",
    version: "wcag21",
    status: "recommendation",
    level: "a",
    recommended: false,
    note: "WCAG 2.1 Level A, backwards compatible with WCAG 2.0."
  },
  {
    id: "wcag21-aa",
    label: "WCAG 2.1 Level AA",
    version: "wcag21",
    status: "recommendation",
    level: "aa",
    recommended: false,
    note: "WCAG 2.1 Level A and AA, backwards compatible with WCAG 2.0."
  },
  {
    id: "wcag21-aaa",
    label: "WCAG 2.1 Level AAA",
    version: "wcag21",
    status: "recommendation",
    level: "aaa",
    recommended: false,
    note: "WCAG 2.1 Level A, AA, and AAA success criteria."
  },
  {
    id: "wcag22-a",
    label: "WCAG 2.2 Level A",
    version: "wcag22",
    status: "recommendation",
    level: "a",
    recommended: false,
    note: "WCAG 2.2 Level A, backwards compatible with WCAG 2.0 and 2.1 except obsolete 4.1.1 handling."
  },
  {
    id: "wcag22-aa",
    label: "WCAG 2.2 Level AA",
    version: "wcag22",
    status: "recommendation",
    level: "aa",
    recommended: true,
    note: "Default profile. WCAG 2.2 Level A and AA."
  },
  {
    id: "wcag22-aaa",
    label: "WCAG 2.2 Level AAA",
    version: "wcag22",
    status: "recommendation",
    level: "aaa",
    recommended: false,
    note: "WCAG 2.2 Level A, AA, and AAA success criteria."
  },
  {
    id: "wcag30-draft",
    label: "WCAG 3.0 Working Draft",
    version: "wcag30",
    status: "draft",
    recommended: false,
    note: "Experimental draft profile. Not a current conformance standard."
  }
];

export const wcag22Criteria: WcagCriterion[] = [
  { version: "wcag22", criterion: "1.1.1", level: "a", title: "Non-text Content" },
  { version: "wcag22", criterion: "1.2.1", level: "a", title: "Audio-only and Video-only (Prerecorded)" },
  { version: "wcag22", criterion: "1.2.2", level: "a", title: "Captions (Prerecorded)" },
  { version: "wcag22", criterion: "1.2.3", level: "a", title: "Audio Description or Media Alternative (Prerecorded)" },
  { version: "wcag22", criterion: "1.2.4", level: "aa", title: "Captions (Live)" },
  { version: "wcag22", criterion: "1.2.5", level: "aa", title: "Audio Description (Prerecorded)" },
  { version: "wcag22", criterion: "1.2.6", level: "aaa", title: "Sign Language (Prerecorded)" },
  { version: "wcag22", criterion: "1.2.7", level: "aaa", title: "Extended Audio Description (Prerecorded)" },
  { version: "wcag22", criterion: "1.2.8", level: "aaa", title: "Media Alternative (Prerecorded)" },
  { version: "wcag22", criterion: "1.2.9", level: "aaa", title: "Audio-only (Live)" },
  { version: "wcag22", criterion: "1.3.1", level: "a", title: "Info and Relationships" },
  { version: "wcag22", criterion: "1.3.2", level: "a", title: "Meaningful Sequence" },
  { version: "wcag22", criterion: "1.3.3", level: "a", title: "Sensory Characteristics" },
  { version: "wcag22", criterion: "1.3.4", level: "aa", title: "Orientation" },
  { version: "wcag22", criterion: "1.3.5", level: "aa", title: "Identify Input Purpose" },
  { version: "wcag22", criterion: "1.3.6", level: "aaa", title: "Identify Purpose" },
  { version: "wcag22", criterion: "1.4.1", level: "a", title: "Use of Color" },
  { version: "wcag22", criterion: "1.4.2", level: "a", title: "Audio Control" },
  { version: "wcag22", criterion: "1.4.3", level: "aa", title: "Contrast (Minimum)" },
  { version: "wcag22", criterion: "1.4.4", level: "aa", title: "Resize Text" },
  { version: "wcag22", criterion: "1.4.5", level: "aa", title: "Images of Text" },
  { version: "wcag22", criterion: "1.4.6", level: "aaa", title: "Contrast (Enhanced)" },
  { version: "wcag22", criterion: "1.4.7", level: "aaa", title: "Low or No Background Audio" },
  { version: "wcag22", criterion: "1.4.8", level: "aaa", title: "Visual Presentation" },
  { version: "wcag22", criterion: "1.4.9", level: "aaa", title: "Images of Text (No Exception)" },
  { version: "wcag22", criterion: "1.4.10", level: "aa", title: "Reflow" },
  { version: "wcag22", criterion: "1.4.11", level: "aa", title: "Non-text Contrast" },
  { version: "wcag22", criterion: "1.4.12", level: "aa", title: "Text Spacing" },
  { version: "wcag22", criterion: "1.4.13", level: "aa", title: "Content on Hover or Focus" },
  { version: "wcag22", criterion: "2.1.1", level: "a", title: "Keyboard" },
  { version: "wcag22", criterion: "2.1.2", level: "a", title: "No Keyboard Trap" },
  { version: "wcag22", criterion: "2.1.3", level: "aaa", title: "Keyboard (No Exception)" },
  { version: "wcag22", criterion: "2.1.4", level: "a", title: "Character Key Shortcuts" },
  { version: "wcag22", criterion: "2.2.1", level: "a", title: "Timing Adjustable" },
  { version: "wcag22", criterion: "2.2.2", level: "a", title: "Pause, Stop, Hide" },
  { version: "wcag22", criterion: "2.2.3", level: "aaa", title: "No Timing" },
  { version: "wcag22", criterion: "2.2.4", level: "aaa", title: "Interruptions" },
  { version: "wcag22", criterion: "2.2.5", level: "aaa", title: "Re-authenticating" },
  { version: "wcag22", criterion: "2.2.6", level: "aaa", title: "Timeouts" },
  { version: "wcag22", criterion: "2.3.1", level: "a", title: "Three Flashes or Below Threshold" },
  { version: "wcag22", criterion: "2.3.2", level: "aaa", title: "Three Flashes" },
  { version: "wcag22", criterion: "2.3.3", level: "aaa", title: "Animation from Interactions" },
  { version: "wcag22", criterion: "2.4.1", level: "a", title: "Bypass Blocks" },
  { version: "wcag22", criterion: "2.4.2", level: "a", title: "Page Titled" },
  { version: "wcag22", criterion: "2.4.3", level: "a", title: "Focus Order" },
  { version: "wcag22", criterion: "2.4.4", level: "a", title: "Link Purpose (In Context)" },
  { version: "wcag22", criterion: "2.4.5", level: "aa", title: "Multiple Ways" },
  { version: "wcag22", criterion: "2.4.6", level: "aa", title: "Headings and Labels" },
  { version: "wcag22", criterion: "2.4.7", level: "aa", title: "Focus Visible" },
  { version: "wcag22", criterion: "2.4.8", level: "aaa", title: "Location" },
  { version: "wcag22", criterion: "2.4.9", level: "aaa", title: "Link Purpose (Link Only)" },
  { version: "wcag22", criterion: "2.4.10", level: "aaa", title: "Section Headings" },
  { version: "wcag22", criterion: "2.4.11", level: "aa", title: "Focus Not Obscured (Minimum)" },
  { version: "wcag22", criterion: "2.4.12", level: "aaa", title: "Focus Not Obscured (Enhanced)" },
  { version: "wcag22", criterion: "2.4.13", level: "aaa", title: "Focus Appearance" },
  { version: "wcag22", criterion: "2.5.1", level: "a", title: "Pointer Gestures" },
  { version: "wcag22", criterion: "2.5.2", level: "a", title: "Pointer Cancellation" },
  { version: "wcag22", criterion: "2.5.3", level: "a", title: "Label in Name" },
  { version: "wcag22", criterion: "2.5.4", level: "a", title: "Motion Actuation" },
  { version: "wcag22", criterion: "2.5.5", level: "aaa", title: "Target Size (Enhanced)" },
  { version: "wcag22", criterion: "2.5.6", level: "aaa", title: "Concurrent Input Mechanisms" },
  { version: "wcag22", criterion: "2.5.7", level: "aa", title: "Dragging Movements" },
  { version: "wcag22", criterion: "2.5.8", level: "aa", title: "Target Size (Minimum)" },
  { version: "wcag22", criterion: "3.1.1", level: "a", title: "Language of Page" },
  { version: "wcag22", criterion: "3.1.2", level: "aa", title: "Language of Parts" },
  { version: "wcag22", criterion: "3.1.3", level: "aaa", title: "Unusual Words" },
  { version: "wcag22", criterion: "3.1.4", level: "aaa", title: "Abbreviations" },
  { version: "wcag22", criterion: "3.1.5", level: "aaa", title: "Reading Level" },
  { version: "wcag22", criterion: "3.1.6", level: "aaa", title: "Pronunciation" },
  { version: "wcag22", criterion: "3.2.1", level: "a", title: "On Focus" },
  { version: "wcag22", criterion: "3.2.2", level: "a", title: "On Input" },
  { version: "wcag22", criterion: "3.2.3", level: "aa", title: "Consistent Navigation" },
  { version: "wcag22", criterion: "3.2.4", level: "aa", title: "Consistent Identification" },
  { version: "wcag22", criterion: "3.2.5", level: "aaa", title: "Change on Request" },
  { version: "wcag22", criterion: "3.2.6", level: "a", title: "Consistent Help" },
  { version: "wcag22", criterion: "3.3.1", level: "a", title: "Error Identification" },
  { version: "wcag22", criterion: "3.3.2", level: "a", title: "Labels or Instructions" },
  { version: "wcag22", criterion: "3.3.3", level: "aa", title: "Error Suggestion" },
  { version: "wcag22", criterion: "3.3.4", level: "aa", title: "Error Prevention (Legal, Financial, Data)" },
  { version: "wcag22", criterion: "3.3.5", level: "aaa", title: "Help" },
  { version: "wcag22", criterion: "3.3.6", level: "aaa", title: "Error Prevention (All)" },
  { version: "wcag22", criterion: "3.3.7", level: "a", title: "Redundant Entry" },
  { version: "wcag22", criterion: "3.3.8", level: "aa", title: "Accessible Authentication (Minimum)" },
  { version: "wcag22", criterion: "3.3.9", level: "aaa", title: "Accessible Authentication (Enhanced)" },
  { version: "wcag22", criterion: "4.1.2", level: "a", title: "Name, Role, Value" },
  { version: "wcag22", criterion: "4.1.3", level: "aa", title: "Status Messages" }
];

export function resolveStandardId(value: string | undefined): StandardId {
  const normalized = (value ?? "wcag22-aa").toLowerCase();
  if (normalized === "latest" || normalized === "current") return "wcag22-aa";
  const standard = standards.find((candidate) => candidate.id === normalized);
  if (!standard) {
    throw new Error(`Unknown WCAG standard "${value}". Supported standards: ${standards.map((candidate) => candidate.id).join(", ")}`);
  }
  return standard.id;
}

export function findStandard(id: StandardId): StandardDefinition {
  const standard = standards.find((candidate) => candidate.id === id);
  if (!standard) {
    throw new Error(`Unknown WCAG standard "${id}"`);
  }
  return standard;
}

export function ruleAppliesToStandard(rule: RuleDefinition, standardId: StandardId): boolean {
  const standard = findStandard(standardId);
  return rule.standards.some((reference) => referenceMatchesStandard(reference, standard));
}

export function referencesForStandard(rule: RuleDefinition, standardId: StandardId): StandardReference[] {
  const standard = findStandard(standardId);
  return rule.standards.filter((reference) => referenceMatchesStandard(reference, standard));
}

function referenceMatchesStandard(reference: StandardReference, standard: StandardDefinition): boolean {
  if (standard.id === "wcag30-draft") {
    return reference.version === "wcag30";
  }

  if (standard.id === "wcag10") {
    return reference.version === "wcag10";
  }

  if (reference.version !== standard.version) return false;
  if (!standard.level || !reference.level) return true;
  return levelRank[reference.level] <= levelRank[standard.level];
}
