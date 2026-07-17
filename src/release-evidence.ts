export type PrecisionCount = {
  truePositive: number;
  falsePositive: number;
  sampleSize: number;
  precision: number | null;
};

export type ReviewedPrecision = {
  aggregate: PrecisionCount;
  byRule: Record<string, PrecisionCount>;
  resolvedFalsePositives: number;
  reviewedNonAutomated: number;
};

type ReviewedLabel = { fingerprint: string; ruleId: string; verdict: string };
type ReviewedProject = { id: string; labels?: ReviewedLabel[] };
type CurrentFinding = { fingerprint: string; ruleId: string; detectionMode: string };

export function calculateReviewedPrecision(projects: ReviewedProject[], findingsByProject: Map<string, CurrentFinding[]>): ReviewedPrecision {
  const aggregate = emptyCount();
  const byRule = new Map<string, PrecisionCount>();
  let resolvedFalsePositives = 0;
  let reviewedNonAutomated = 0;

  for (const project of projects) {
    const findings = new Map((findingsByProject.get(project.id) ?? []).map((finding) => [finding.fingerprint, finding]));
    for (const label of project.labels ?? []) {
      const finding = findings.get(label.fingerprint);
      if (!finding) {
        if (label.verdict === "false-positive") resolvedFalsePositives += 1;
        continue;
      }
      if (finding.detectionMode !== "automated") {
        reviewedNonAutomated += 1;
        continue;
      }
      const count = byRule.get(label.ruleId) ?? emptyCount();
      if (label.verdict === "true-positive") {
        aggregate.truePositive += 1;
        count.truePositive += 1;
      } else if (label.verdict === "false-positive") {
        aggregate.falsePositive += 1;
        count.falsePositive += 1;
      } else {
        continue;
      }
      byRule.set(label.ruleId, count);
    }
  }

  finalizeCount(aggregate);
  for (const count of byRule.values()) finalizeCount(count);
  return { aggregate, byRule: Object.fromEntries([...byRule.entries()].sort(([left], [right]) => left.localeCompare(right))), resolvedFalsePositives, reviewedNonAutomated };
}

export type EvidenceFragment = {
  schemaVersion: 1;
  kind: "cleardom-release-evidence-fragment";
  category: string;
  commit: string;
  values: Record<string, unknown>;
};

export function assembleEvidence(commit: string, fragments: EvidenceFragment[], requiredCategories: string[]): Record<string, unknown> {
  const categories = new Set<string>();
  const values: Record<string, unknown> = { schemaVersion: 1, commit };
  for (const fragment of fragments) {
    if (fragment.schemaVersion !== 1 || fragment.kind !== "cleardom-release-evidence-fragment") throw new Error("Release evidence fragment has an unsupported contract.");
    if (fragment.commit !== commit) throw new Error(`Release evidence fragment ${fragment.category} is bound to ${fragment.commit}, not ${commit}.`);
    if (!fragment.category || categories.has(fragment.category)) throw new Error(`Duplicate or empty release evidence category: ${fragment.category || "<empty>"}.`);
    categories.add(fragment.category);
    rejectSecrets(fragment.values);
    mergeUnique(values, fragment.values, "");
  }
  const missing = requiredCategories.filter((category) => !categories.has(category));
  if (missing.length) throw new Error(`Missing release evidence fragments: ${missing.join(", ")}.`);
  return values;
}

function emptyCount(): PrecisionCount {
  return { truePositive: 0, falsePositive: 0, sampleSize: 0, precision: null };
}

function finalizeCount(count: PrecisionCount): void {
  count.sampleSize = count.truePositive + count.falsePositive;
  count.precision = count.sampleSize === 0 ? null : count.truePositive / count.sampleSize;
}

function mergeUnique(target: Record<string, unknown>, source: Record<string, unknown>, path: string): void {
  for (const [key, value] of Object.entries(source)) {
    const qualified = path ? `${path}.${key}` : key;
    if (!(key in target)) {
      target[key] = value;
      continue;
    }
    const left = target[key];
    if (isRecord(left) && isRecord(value)) {
      mergeUnique(left, value, qualified);
      continue;
    }
    throw new Error(`Duplicate release evidence value: ${qualified}.`);
  }
}

function rejectSecrets(value: unknown, path = ""): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSecrets(item, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    const qualified = path ? `${path}.${key}` : key;
    if (/(?:secret|password|token|api[_-]?key)/i.test(key)) throw new Error(`Secret-like key is forbidden in release evidence: ${qualified}.`);
    rejectSecrets(item, qualified);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
