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
  start: number;
  end: number;
  before: string;
  after: string;
  description: string;
};

export type FixRunResult = {
  actions: FixAction[];
  applied: number;
  diff: string;
  error?: string;
};

export type FixEditApplication = {
  applied: number;
  diff: string;
  error?: string;
};

export type FixVerification = {
  fixed: Finding[];
  remaining: Finding[];
  introduced: Finding[];
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
  const byFile = new Map<string, string>();
  for (const finding of findings) {
    if (isRuntimeLocation(finding.file)) continue;
    if (!byFile.has(finding.file)) {
      byFile.set(finding.file, await fs.readFile(finding.file, "utf8"));
    }
  }

  return findings.map((finding) => {
    if (isRuntimeLocation(finding.file)) {
      return skipped(finding, "Runtime and URL findings need guided remediation.");
    }
    const source = byFile.get(finding.file);
    const range = source === undefined ? undefined : sourceLineRange(source, finding.line);
    if (!range) return skipped(finding, "Could not read the source line for this finding.");
    const candidate = safeEditForFinding(finding, range.text);
    if (candidate) {
      return {
        finding,
        outcome: "auto-fixable",
        reason: candidate.description,
        edit: {
          file: finding.file,
          line: finding.line,
          start: range.start,
          end: range.end,
          before: range.text,
          after: candidate.after,
          description: candidate.description
        }
      };
    }
    if (finding.fixKind === "manual-review") return { finding, outcome: "manual-review", reason: "This rule needs human review." };
    return { finding, outcome: "guided", reason: "No safe mechanical transform matched this source shape." };
  });
}

export async function runSafeFixes(findings: Finding[], apply: boolean): Promise<FixRunResult> {
  let actions = await planFixActions(findings);
  const edits = uniqueEdits(actions.flatMap((action) => action.edit ? [action.edit] : []));
  const application = await applyFixEdits(edits, apply);
  const error = application.error;
  if (error) {
    actions = actions.map((action) => action.edit
      ? { ...action, outcome: "skipped", reason: error, edit: undefined }
      : action);
  }
  return { actions, ...application };
}

function uniqueEdits(edits: FixEdit[]): FixEdit[] {
  const unique = new Map<string, FixEdit>();
  for (const edit of edits) {
    unique.set(`${edit.file}\0${edit.start}\0${edit.end}\0${edit.after}`, edit);
  }
  return [...unique.values()];
}

export async function applyFixEdits(edits: FixEdit[], apply: boolean): Promise<FixEditApplication> {
  if (edits.length === 0) return { applied: 0, diff: "" };

  const byFile = new Map<string, FixEdit[]>();
  for (const edit of edits) byFile.set(edit.file, [...(byFile.get(edit.file) ?? []), edit]);

  const originals = new Map<string, string>();
  for (const [file, fileEdits] of byFile) {
    const source = await fs.readFile(file, "utf8");
    originals.set(file, source);
    const overlap = overlappingEdit(fileEdits);
    if (overlap) return { applied: 0, diff: "", error: `Fix batch was not applied because edits overlap in ${file} at line ${overlap.line}.` };
    const stale = fileEdits.find((edit) => source.slice(edit.start, edit.end) !== edit.before);
    if (stale) return { applied: 0, diff: "", error: `Fix batch was not applied because ${file}:${stale.line} changed after the fix plan was created.` };
  }

  const rendered = new Map<string, string>();
  for (const [file, fileEdits] of byFile) {
    let output = originals.get(file) ?? "";
    for (const edit of [...fileEdits].sort((left, right) => right.start - left.start)) {
      output = `${output.slice(0, edit.start)}${edit.after}${output.slice(edit.end)}`;
    }
    rendered.set(file, output);
  }

  if (apply) {
    for (const [file, output] of rendered) {
      await fs.writeFile(file, output, "utf8");
    }
  }

  return { applied: apply ? edits.length : 0, diff: formatUnifiedDiff(edits) };
}

export function formatFixRunResult(result: FixRunResult, apply: boolean): string {
  const autoFixable = result.actions.filter((action) => action.outcome === "auto-fixable").length;
  const guided = result.actions.filter((action) => action.outcome === "guided").length;
  const manual = result.actions.filter((action) => action.outcome === "manual-review").length;
  const skipped = result.actions.filter((action) => action.outcome === "skipped").length;
  const lines = [
    apply ? "ClearDOM automatic fixes" : "ClearDOM fix preview",
    "",
    `Matched findings: ${result.actions.length}`,
    `Auto-fixable: ${autoFixable}`,
    `Applied fixes: ${result.applied}`,
    `Guided fixes: ${guided}`,
    `Manual review: ${manual}`,
    `Skipped: ${skipped}`
  ];
  if (result.error) lines.push(`Batch status: ${result.error}`);
  lines.push("", result.diff || "No safe automatic transforms are available for the matched findings.");
  return lines.join("\n");
}

export function verifyFixRun(before: Finding[], selected: Finding[], after: Finding[]): FixVerification {
  const beforeIdentities = new Set(before.map(fixVerificationIdentity));
  const afterIdentities = new Set(after.map(fixVerificationIdentity));
  return {
    fixed: selected.filter((finding) => !afterIdentities.has(fixVerificationIdentity(finding))),
    remaining: selected.filter((finding) => afterIdentities.has(fixVerificationIdentity(finding))),
    introduced: after.filter((finding) => !beforeIdentities.has(fixVerificationIdentity(finding)))
  };
}

function fixVerificationIdentity(finding: Finding): string {
  return `${finding.ruleId}\0${finding.file}\0${finding.semanticLocation}`;
}

export function formatFixVerification(verification: FixVerification): string {
  const lines = [
    "ClearDOM verification",
    "",
    `Fixed: ${verification.fixed.length}`,
    `Remaining: ${verification.remaining.length}`,
    `Introduced: ${verification.introduced.length}`
  ];
  if (verification.introduced.length > 0) {
    lines.push("", "New findings:");
    for (const finding of verification.introduced.slice(0, 5)) {
      lines.push(`  ${finding.ruleId} ${finding.file}:${finding.line}:${finding.column}`);
    }
  }
  lines.push("", verification.introduced.length === 0 ? "✓ Applied fixes introduced no new findings." : "Review the new findings before committing these edits.");
  return lines.join("\n");
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
    const relative = isRuntimeLocation(finding.file) ? finding.file : path.relative(options.rootDir, finding.file).replace(/\\/g, "/");
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

type SafeEditCandidate = Pick<FixEdit, "after" | "description">;

function safeEditForFinding(finding: Finding, line: string): SafeEditCandidate | undefined {
  if (finding.ruleId === "CDOM_2_4_3_POSITIVE_TABINDEX") {
    const after = line
      .replace(/\btabIndex=\{[1-9]\d*\}/, "tabIndex={0}")
      .replace(/\btabIndex=["'][1-9]\d*["']/, 'tabIndex="0"')
      .replace(/\btabindex=["'][1-9]\d*["']/, 'tabindex="0"');
    return after === line ? undefined : candidate(after, "Replace positive tab index with 0.");
  }

  if ((finding.ruleId === "CDOM_3_3_2_PLACEHOLDER_LABEL" || finding.ruleId === "CDOM_4_1_2_FORM_LABEL") && !/\baria-label=/.test(line)) {
    const placeholder = line.match(/\bplaceholder=["']([^"']+)["']/)?.[1];
    if (placeholder?.trim()) {
      const after = line.replace(/\bplaceholder=(["'][^"']+["'])/, `placeholder=$1 aria-label="${escapeAttribute(placeholder)}"`);
      return candidate(after, "Add aria-label from a static placeholder. Prefer a visible label when possible.");
    }
  }

  return undefined;
}

function candidate(after: string, description: string): SafeEditCandidate {
  return { after, description };
}

function skipped(finding: Finding, reason: string): FixAction {
  return { finding, outcome: "skipped", reason };
}

function formatUnifiedDiff(edits: FixEdit[]): string {
  return [...edits].sort((left, right) => left.file.localeCompare(right.file) || left.start - right.start).map((edit) => {
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

function overlappingEdit(edits: FixEdit[]): FixEdit | undefined {
  const sorted = [...edits].sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].start < sorted[index - 1].end) return sorted[index];
  }
  return undefined;
}

function sourceLineRange(source: string, line: number): { start: number; end: number; text: string } | undefined {
  if (line < 1) return undefined;
  let start = 0;
  for (let current = 1; current < line; current += 1) {
    const newline = source.indexOf("\n", start);
    if (newline === -1) return undefined;
    start = newline + 1;
  }
  const newline = source.indexOf("\n", start);
  const end = newline === -1 ? source.length : (source[newline - 1] === "\r" ? newline - 1 : newline);
  return { start, end, text: source.slice(start, end) };
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

function isRuntimeLocation(value: string): boolean {
  return /^(?:https?|file):/i.test(value);
}
