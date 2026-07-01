import type { RuleDefinition, StandardDefinition, StandardId, StandardReference, WcagLevel } from "./types.js";

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
