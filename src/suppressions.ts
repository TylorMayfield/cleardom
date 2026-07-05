import * as path from "node:path";
import { isSuppressionExpired, matchesAnyPattern } from "./config.js";
import { normalizeRuleId } from "./rules/index.js";
import type { Finding, ResolvedScanOptions, SuppressedFinding, SuppressionMatch } from "./types.js";

const inlineCommentPattern = /cleardom-ignore-(line|next-line)(?::|\s+)(.*)$/i;

export function applySuppressions(findings: Finding[], sources: Map<string, string>, options: ResolvedScanOptions): {
  findings: Finding[];
  suppressedFindings: SuppressedFinding[];
} {
  const suppressedFindings: SuppressedFinding[] = [];
  const active: Finding[] = [];
  const inlineSuppressions = new Map<string, InlineSuppression[]>();

  for (const [file, source] of sources) {
    inlineSuppressions.set(file, parseInlineSuppressions(source));
  }

  for (const finding of findings) {
    const suppression = findInlineSuppression(finding, inlineSuppressions.get(finding.file) ?? [])
      ?? findConfigSuppression(finding, options);

    if (suppression) {
      suppressedFindings.push({ ...finding, suppression });
      continue;
    }

    active.push(finding);
  }

  return { findings: active, suppressedFindings };
}

type InlineSuppression = {
  line: number;
  rules: string[];
  reason: string;
  kind: "line" | "next-line";
};

function parseInlineSuppressions(source: string): InlineSuppression[] {
  return source.split(/\r?\n/).flatMap((line, index) => {
    const match = inlineCommentPattern.exec(line);
    if (!match) return [];

    const targetLine = match[1] === "next-line" ? index + 2 : index + 1;
    const parsed = parseInlineBody(match[2] ?? "");
    if (!parsed.reason) return [];

    return [{
      line: targetLine,
      rules: parsed.rules,
      reason: parsed.reason,
      kind: match[1] as "line" | "next-line"
    }];
  });
}

function parseInlineBody(body: string): { rules: string[]; reason: string } {
  const cleaned = body.replace(/\s*(?:\*\/\}?|-->)\s*$/, "");
  const [scopePart, ...reasonParts] = cleaned.split(/\s+--\s+/);
  const tokens = scopePart.trim().split(/\s+/).filter(Boolean);
  const rules = tokens.filter((token) => /^CDOM/i.test(token)).map((token) => normalizeRuleId(token));
  const reason = (reasonParts.join(" -- ") || tokens.filter((token) => !/^CDOM/i.test(token)).join(" ")).trim();
  return { rules, reason };
}

function findInlineSuppression(finding: Finding, suppressions: InlineSuppression[]): SuppressionMatch | undefined {
  const match = suppressions.find((suppression) =>
    suppression.line === finding.line
    && (suppression.rules.length === 0 || suppression.rules.includes(finding.ruleId))
  );
  if (!match) return undefined;
  return {
    kind: "inline",
    reason: match.reason,
    scope: `${match.kind}:${match.rules.length > 0 ? match.rules.join(",") : "all-rules"}`
  };
}

function findConfigSuppression(finding: Finding, options: ResolvedScanOptions): SuppressionMatch | undefined {
  const relativeFile = normalizePath(path.relative(options.rootDir, finding.file));
  const normalizedFile = normalizePath(finding.file);

  const suppression = options.suppressions.find((candidate) => {
    if (isSuppressionExpired(candidate.expires)) return false;
    if (!candidate.rules.includes(finding.ruleId)) return false;
    return matchesAnyPattern(relativeFile, candidate.files) || matchesAnyPattern(normalizedFile, candidate.files);
  });

  if (!suppression) return undefined;
  return {
    kind: "config",
    reason: suppression.reason,
    expires: suppression.expires,
    approvedBy: suppression.approvedBy,
    ticket: suppression.ticket,
    owner: suppression.owner,
    scope: `${suppression.rules.join(",")} in ${suppression.files.join(",")}`
  };
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}
