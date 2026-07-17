import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { AgentId } from "./agents.js";
import type { Finding, ResolvedScanOptions, RuleSummary, ScanResult } from "./types.js";

export type FixPromptOptions = {
  target: string;
  agent: AgentId;
  ruleIds: string[];
  file?: string;
  limit: number;
};

export type FixPromptResult = {
  findings: Finding[];
  prompt: string;
};

export function formatAgentFixJson(result: ScanResult, options: ResolvedScanOptions, fixOptions: FixPromptOptions, selected: FixPromptResult): string {
  return JSON.stringify({
    schemaVersion: 1,
    kind: "cleardom-agent-remediation",
    agent: fixOptions.agent,
    target: fixOptions.target,
    standard: result.standard,
    outcome: result.outcome,
    instructions: [
      "Make the smallest code changes that satisfy the accessibility intent of each finding.",
      "Prefer semantic HTML and platform-native accessibility props over rule suppression.",
      "If a finding is a false positive, use the narrowest component mapping or configuration change and explain why.",
      "Run the verification command after editing and report fixed findings plus remaining risk."
    ],
    allowedEditScope: selected.findings
      .filter((finding) => !isUrlLocation(finding.file))
      .map((finding) => sourceLocation(finding.file, options.rootDir))
      .filter((file, index, files) => files.indexOf(file) === index),
    expectedOutcome: {
      selectedFindingsFixed: selected.findings.map((finding) => finding.fingerprint),
      introducedBlockingFindings: 0,
      verificationRequired: true
    },
    verificationCommand: verificationCommand(fixOptions),
    unresolvedManualTests: selected.findings
      .filter((finding) => finding.detectionMode !== "automated")
      .map((finding) => ({ fingerprint: finding.fingerprint, instruction: result.rules.find((rule) => rule.id === finding.ruleId)?.remediation?.manualVerification ?? "Confirm the behavior with assistive technology and keyboard/touch input." })),
    findings: selected.findings.map((finding) => {
      const rule = result.rules.find((candidate) => candidate.id === finding.ruleId);
      return {
        ...finding,
        file: sourceLocation(finding.file, options.rootDir),
        guidance: rule?.guidance,
        remediation: rule?.remediation
      };
    })
  }, null, 2);
}

const contextRadius = 3;

export async function formatAgentFixPrompt(result: ScanResult, options: ResolvedScanOptions, fixOptions: FixPromptOptions): Promise<FixPromptResult> {
  const findings = filterFindings(result.activeFindings, options, fixOptions).slice(0, fixOptions.limit);
  const lines = [
    `ClearDOM agent remediation: ${findings.length === 0 ? "no matching findings" : `${findings.length} ${findings.length === 1 ? "finding" : "findings"}`}`,
    "",
    `Agent: ${fixOptions.agent}`,
    `Target: ${fixOptions.target}`,
    `Checked: ${result.checkedFiles} ${result.checkedFiles === 1 ? "file" : "files"} against ${result.standard.label}${result.standard.status === "draft" ? " (draft)" : ""}`,
    ""
  ];

  if (result.activeFindings.length === 0) {
    lines.push("No active ClearDOM findings need agent remediation.");
    return { findings, prompt: lines.join("\n") };
  }

  if (findings.length === 0) {
    lines.push("No active findings matched the requested fix filters.");
    lines.push(`Active findings available: ${result.activeFindings.length}`);
    return { findings, prompt: lines.join("\n") };
  }

  lines.push("Give this task to the coding agent:");
  lines.push("");
  lines.push("```text");
  lines.push("You are fixing ClearDOM accessibility findings in this repository.");
  lines.push("");
  lines.push("Instructions:");
  lines.push("- Make the smallest code changes that satisfy the accessibility intent of each finding.");
  lines.push("- Prefer semantic HTML and platform-native accessibility props over rule suppression.");
  lines.push("- If a finding is a false positive, add or propose the narrowest component mapping/config change and explain why.");
  lines.push("- Re-run the verification command after editing and report fixed findings plus any remaining risk.");
  lines.push("");
  lines.push("Verification:");
  lines.push(`- ${verificationCommand(fixOptions)}`);
  lines.push("");

  for (const [index, finding] of findings.entries()) {
    const rule = result.rules.find((candidate) => candidate.id === finding.ruleId);
    lines.push(`Finding ${index + 1}: ${finding.ruleId} - ${finding.title}`);
    lines.push(`Location: ${formatLocation(finding, options.rootDir)}`);
    lines.push(`Severity: ${finding.severity}; confidence: ${finding.confidence}`);
    lines.push(`Message: ${finding.message}`);
    if (rule?.guidance) lines.push(`Rule guidance: ${rule.guidance}`);
    lines.push(`WCAG: ${formatRuleWcag(rule, finding)}`);
    lines.push("Current code context:");
    lines.push(await codeContext(finding, options.rootDir));
    lines.push("");
  }

  lines.push("When finished, summarize the edits and paste the ClearDOM verification result.");
  lines.push("```");

  if (result.activeFindings.length > findings.length) {
    lines.push("");
    lines.push(`Showing ${findings.length} of ${result.activeFindings.length} active findings. Use --limit to adjust batch size.`);
  }

  return { findings, prompt: lines.join("\n") };
}

function filterFindings(findings: Finding[], options: ResolvedScanOptions, fixOptions: FixPromptOptions): Finding[] {
  const ruleIds = new Set(fixOptions.ruleIds.map((ruleId) => ruleId.toLowerCase()));
  const requestedFile = fixOptions.file ? path.resolve(options.rootDir, fixOptions.file) : undefined;

  return findings.filter((finding) => {
    if (ruleIds.size > 0 && !ruleIds.has(finding.ruleId.toLowerCase())) return false;
    if (!requestedFile) return true;
    if (/^https?:\/\//i.test(finding.file)) return finding.file === fixOptions.file;
    return path.resolve(finding.file) === requestedFile || normalizePath(path.relative(options.rootDir, finding.file)) === normalizePath(fixOptions.file ?? "");
  });
}

function verificationCommand(options: FixPromptOptions): string {
  const parts = ["npx cleardom@1", "scan", shellQuote(options.target), "--fail-on", "none"];
  return parts.join(" ");
}

function formatLocation(finding: Finding, rootDir: string): string {
  if (isUrlLocation(finding.file)) {
    return `${finding.file}:${finding.line}:${finding.column}`;
  }
  return `${normalizePath(path.relative(rootDir, finding.file))}:${finding.line}:${finding.column}`;
}

function formatRuleWcag(rule: RuleSummary | undefined, finding: Finding): string {
  const wcag = rule?.wcag ?? finding.wcag;
  return wcag.length > 0 ? wcag.join(", ") : "not mapped";
}

async function codeContext(finding: Finding, rootDir: string): Promise<string> {
  if (isUrlLocation(finding.file)) {
    return finding.excerpt;
  }

  try {
    const source = await fs.readFile(finding.file, "utf8");
    const lines = source.split(/\r?\n/);
    const start = Math.max(1, finding.line - contextRadius);
    const end = Math.min(lines.length, finding.line + contextRadius);
    const width = String(end).length;
    return [
      `File: ${normalizePath(path.relative(rootDir, finding.file))}`,
      ...lines.slice(start - 1, end).map((line, offset) => {
        const lineNumber = start + offset;
        const marker = lineNumber === finding.line ? ">" : " ";
        return `${marker} ${String(lineNumber).padStart(width, " ")} | ${line}`;
      })
    ].join("\n");
  } catch {
    return finding.excerpt;
  }
}

function sourceLocation(file: string, rootDir: string): string {
  return isUrlLocation(file) ? file : normalizePath(path.relative(rootDir, file));
}

function isUrlLocation(value: string): boolean {
  return /^(?:https?|file):/i.test(value);
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}
