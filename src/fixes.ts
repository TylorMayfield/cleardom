import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { Finding, FixKind, ResolvedScanOptions, RuleSummary } from "./types.js";

export type FixAction = {
  finding: Finding;
  outcome: "auto-fixable" | "guided" | "manual-review" | "skipped";
  reason: string;
  edit?: FixEdit;
};

export type FixEdit = {
  file: string;
  line: number;
  before: string;
  after: string;
  description: string;
};

export type FixRunResult = {
  actions: FixAction[];
  applied: number;
  diff: string;
};

export type FixPlanGroup = {
  ruleId: string;
  title: string;
  owner?: string;
  fixKind: FixKind;
  estimatedRisk: "low" | "medium" | "high";
  count: number;
  files: string[];
  verification: string;
};

export async function planFixActions(findings: Finding[]): Promise<FixAction[]> {
  const byFile = new Map<string, string[]>();
  for (const finding of findings) {
    if (/^https?:\/\//i.test(finding.file)) continue;
    if (!byFile.has(finding.file)) {
      byFile.set(finding.file, (await fs.readFile(finding.file, "utf8")).split(/\r?\n/));
    }
  }

  return findings.map((finding) => {
    if (/^https?:\/\//i.test(finding.file)) {
      return skipped(finding, "Runtime and URL findings need guided remediation.");
    }
    const lines = byFile.get(finding.file);
    const line = lines?.[finding.line - 1];
    if (line === undefined) return skipped(finding, "Could not read the source line for this finding.");
    const edit = safeEditForFinding(finding, line);
    if (edit) return { finding, outcome: "auto-fixable", reason: edit.description, edit };
    if (finding.fixKind === "manual-review") return { finding, outcome: "manual-review", reason: "This rule needs human review." };
    return { finding, outcome: "guided", reason: "No safe mechanical transform matched this source shape." };
  });
}

export async function runSafeFixes(findings: Finding[], apply: boolean): Promise<FixRunResult> {
  const actions = await planFixActions(findings);
  const edits = actions.flatMap((action) => action.edit ? [action.edit] : []);
  const diff = formatUnifiedDiff(edits);
  if (apply) await applyEdits(edits);
  return { actions, applied: apply ? edits.length : 0, diff };
}

export function formatFixRunResult(result: FixRunResult, apply: boolean): string {
  const autoFixable = result.actions.filter((action) => action.outcome === "auto-fixable").length;
  const guided = result.actions.filter((action) => action.outcome === "guided").length;
  const manual = result.actions.filter((action) => action.outcome === "manual-review").length;
  const skipped = result.actions.filter((action) => action.outcome === "skipped").length;
  return [
    apply ? "ClearDOM automatic fixes" : "ClearDOM fix preview",
    "",
    `Matched findings: ${result.actions.length}`,
    `Auto-fixable: ${autoFixable}`,
    `Applied fixes: ${result.applied}`,
    `Guided fixes: ${guided}`,
    `Manual review: ${manual}`,
    `Skipped: ${skipped}`,
    "",
    result.diff || "No safe automatic transforms are available for the matched findings."
  ].join("\n");
}

export function buildFixPlan(findings: Finding[], rules: RuleSummary[], options: ResolvedScanOptions, target: string): FixPlanGroup[] {
  const groups = new Map<string, FixPlanGroup>();
  for (const finding of findings) {
    const rule = rules.find((candidate) => candidate.id === finding.ruleId);
    const owner = finding.owner;
    const key = `${finding.ruleId}\0${owner ?? ""}\0${finding.fixKind}`;
    const group = groups.get(key) ?? {
      ruleId: finding.ruleId,
      title: finding.title,
      owner,
      fixKind: finding.fixKind,
      estimatedRisk: estimatedRisk(finding.fixKind),
      count: 0,
      files: [],
      verification: `npx cleardom@latest scan ${shellQuote(target)} --fail-on none`
    };
    group.count += 1;
    const relative = /^https?:\/\//i.test(finding.file) ? finding.file : path.relative(options.rootDir, finding.file).replace(/\\/g, "/");
    if (!group.files.includes(relative)) group.files.push(relative);
    if (rule?.title) group.title = rule.title;
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => left.ruleId.localeCompare(right.ruleId) || (left.owner ?? "").localeCompare(right.owner ?? ""));
}

export function formatFixPlan(plan: FixPlanGroup[], format: "text" | "json" | "markdown"): string {
  if (format === "json") return JSON.stringify({ plan }, null, 2);
  if (format === "markdown") {
    const lines = ["# ClearDOM Fix Plan", ""];
    if (plan.length === 0) return `${lines.join("\n")}No matching findings.`;
    for (const group of plan) {
      lines.push(`## ${group.ruleId}: ${group.title}`);
      lines.push("");
      lines.push(`- Owner: ${group.owner ?? "unassigned"}`);
      lines.push(`- Fix kind: ${group.fixKind}`);
      lines.push(`- Estimated risk: ${group.estimatedRisk}`);
      lines.push(`- Findings: ${group.count}`);
      lines.push(`- Files: ${group.files.join(", ")}`);
      lines.push(`- Verify: \`${group.verification}\``);
      lines.push("");
    }
    return lines.join("\n").trimEnd();
  }

  const lines = ["ClearDOM fix plan", ""];
  for (const group of plan) {
    lines.push(`${group.ruleId} ${group.title}`);
    lines.push(`  Owner: ${group.owner ?? "unassigned"}`);
    lines.push(`  Fix kind: ${group.fixKind}; risk ${group.estimatedRisk}; findings ${group.count}`);
    lines.push(`  Files: ${group.files.join(", ")}`);
    lines.push(`  Verify: ${group.verification}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd() || "ClearDOM fix plan\n\nNo matching findings.";
}

function safeEditForFinding(finding: Finding, line: string): FixEdit | undefined {
  if (finding.ruleId === "CDOM_2_4_3_POSITIVE_TABINDEX") {
    const after = line
      .replace(/\btabIndex=\{[1-9]\d*\}/, "tabIndex={0}")
      .replace(/\btabIndex=["'][1-9]\d*["']/, 'tabIndex="0"')
      .replace(/\btabindex=["'][1-9]\d*["']/, 'tabindex="0"');
    return after === line ? undefined : edit(finding, line, after, "Replace positive tab index with 0.");
  }

  if (finding.ruleId === "CDOM_4_1_2_NATIVE_ROLE" && /\<(Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback)\b/.test(line) && !/\baccessibilityRole=/.test(line)) {
    const after = line.replace(/\<(Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback)\b/, '<$1 accessibilityRole="button"');
    return edit(finding, line, after, "Add button role to React Native touch control.");
  }

  if (finding.ruleId === "CDOM_1_1_1_IMAGE_ALT" && /\<img\b/i.test(line) && !/\balt=/.test(line) && (/\baria-hidden=["']true["']/.test(line) || /\brole=["'](?:presentation|none)["']/.test(line))) {
    const after = line.replace(/\<img\b/i, '<img alt=""');
    return edit(finding, line, after, "Mark decorative image with empty alt text.");
  }

  if ((finding.ruleId === "CDOM_3_3_2_PLACEHOLDER_LABEL" || finding.ruleId === "CDOM_4_1_2_FORM_LABEL") && !/\baria-label=/.test(line)) {
    const placeholder = line.match(/\bplaceholder=["']([^"']+)["']/)?.[1];
    if (placeholder?.trim()) {
      const after = line.replace(/\bplaceholder=(["'][^"']+["'])/, `placeholder=$1 aria-label="${escapeAttribute(placeholder)}"`);
      return edit(finding, line, after, "Add aria-label from a static placeholder. Prefer a visible label when possible.");
    }
  }

  return undefined;
}

function edit(finding: Finding, before: string, after: string, description: string): FixEdit {
  return { file: finding.file, line: finding.line, before, after, description };
}

function skipped(finding: Finding, reason: string): FixAction {
  return { finding, outcome: "skipped", reason };
}

function formatUnifiedDiff(edits: FixEdit[]): string {
  return edits.map((edit) => {
    const file = edit.file.replace(/\\/g, "/");
    return [
      `--- ${file}`,
      `+++ ${file}`,
      `@@ -${edit.line},1 +${edit.line},1 @@`,
      `-${edit.before}`,
      `+${edit.after}`
    ].join("\n");
  }).join("\n");
}

async function applyEdits(edits: FixEdit[]): Promise<void> {
  const byFile = new Map<string, FixEdit[]>();
  for (const edit of edits) byFile.set(edit.file, [...(byFile.get(edit.file) ?? []), edit]);
  for (const [file, fileEdits] of byFile) {
    const lines = (await fs.readFile(file, "utf8")).split(/\r?\n/);
    for (const edit of fileEdits.sort((left, right) => left.line - right.line)) {
      if (lines[edit.line - 1] === edit.before) lines[edit.line - 1] = edit.after;
    }
    await fs.writeFile(file, lines.join("\n"), "utf8");
  }
}

function estimatedRisk(fixKind: FixKind): "low" | "medium" | "high" {
  if (fixKind === "safe-auto-fix") return "low";
  if (fixKind === "guided-fix") return "medium";
  return "high";
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
