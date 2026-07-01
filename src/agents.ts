import { promises as fs } from "node:fs";
import * as path from "node:path";

export type AgentId = "codex" | "claude" | "cursor";
export type AgentInstallAction = "install" | "uninstall";

export type AgentTarget = {
  id: AgentId;
  label: string;
  filePath: string;
};

export type AgentInstallResult = AgentTarget & {
  status: "created" | "updated" | "removed" | "unchanged" | "missing";
};

export type AgentDetectionResult = AgentTarget & {
  installed: boolean;
};

const blockStart = "<!-- cleardom:start -->";
const blockEnd = "<!-- cleardom:end -->";

export const supportedAgents: AgentTarget[] = [
  {
    id: "codex",
    label: "Codex and general coding agents",
    filePath: "AGENTS.md"
  },
  {
    id: "claude",
    label: "Claude Code",
    filePath: "CLAUDE.md"
  },
  {
    id: "cursor",
    label: "Cursor",
    filePath: path.join(".cursor", "rules", "cleardom.mdc")
  }
];

export function parseAgentId(value: string): AgentId {
  if (value === "codex" || value === "claude" || value === "cursor") return value;
  throw new Error("--agent must be one of: codex, claude, cursor");
}

export async function detectAgents(rootDir = process.cwd(), requested: AgentId[] = []): Promise<AgentDetectionResult[]> {
  const targets = selectTargets(requested);
  return Promise.all(targets.map(async (target) => ({
    ...target,
    installed: await hasClearDomBlock(path.join(rootDir, target.filePath))
  })));
}

export async function installAgents(rootDir = process.cwd(), requested: AgentId[] = [], action: AgentInstallAction = "install"): Promise<AgentInstallResult[]> {
  const targets = selectTargets(requested);
  const results: AgentInstallResult[] = [];

  for (const target of targets) {
    const resolved = path.join(rootDir, target.filePath);
    results.push(action === "install"
      ? await upsertAgentFile(target, resolved)
      : await removeAgentBlock(target, resolved));
  }

  return results;
}

function selectTargets(requested: AgentId[]): AgentTarget[] {
  if (requested.length === 0) return supportedAgents;
  const ids = new Set(requested);
  return supportedAgents.filter((target) => ids.has(target.id));
}

async function upsertAgentFile(target: AgentTarget, resolved: string): Promise<AgentInstallResult> {
  const existing = await readOptional(resolved);
  const block = agentBlock(target.id);
  const next = existing === undefined
    ? `${block}\n`
    : replaceOrAppendBlock(existing, block);

  if (existing === next) {
    return { ...target, status: "unchanged" };
  }

  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, next, "utf8");
  return { ...target, status: existing === undefined ? "created" : "updated" };
}

async function removeAgentBlock(target: AgentTarget, resolved: string): Promise<AgentInstallResult> {
  const existing = await readOptional(resolved);
  if (existing === undefined) {
    return { ...target, status: "missing" };
  }

  const next = removeBlock(existing);
  if (next === existing) {
    return { ...target, status: "unchanged" };
  }

  await fs.writeFile(resolved, next, "utf8");
  return { ...target, status: "removed" };
}

async function hasClearDomBlock(resolved: string): Promise<boolean> {
  const existing = await readOptional(resolved);
  return existing !== undefined && existing.includes(blockStart) && existing.includes(blockEnd);
}

async function readOptional(resolved: string): Promise<string | undefined> {
  try {
    return await fs.readFile(resolved, "utf8");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function replaceOrAppendBlock(existing: string, block: string): string {
  if (hasBlock(existing)) return replaceBlock(existing, block);
  const separator = existing.endsWith("\n") ? "\n" : "\n\n";
  return `${existing}${separator}${block}\n`;
}

function hasBlock(existing: string): boolean {
  return existing.includes(blockStart) && existing.includes(blockEnd);
}

function replaceBlock(existing: string, block: string): string {
  const pattern = new RegExp(`${escapeRegExp(blockStart)}[\\s\\S]*?${escapeRegExp(blockEnd)}`);
  return existing.replace(pattern, block);
}

function removeBlock(existing: string): string {
  const pattern = new RegExp(`\\n?${escapeRegExp(blockStart)}[\\s\\S]*?${escapeRegExp(blockEnd)}\\n?`);
  return existing.replace(pattern, "\n").replace(/\n{3,}/g, "\n\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function agentBlock(agent: AgentId): string {
  return `${blockStart}
# ClearDOM Agent Skill

Use ClearDOM as the accessibility and assistive-technology guardrail for this codebase.

## When to Run

- After changing React, Next.js, React Native, form, media, keyboard, navigation, or design-system UI code.
- Before finishing a task that touches accessibility labels, roles, focus, headings, inputs, images, links, or touch targets.
- When the user asks for accessibility review, WCAG review, app quality review, or ClearDOM triage.

## Commands

- Local check: \`npx cleardom@latest scan . --fail-on none\`
- Explain a finding: \`npx cleardom@latest explain CDOM001\`
- Regression gate: \`npx cleardom@latest ci .\`
- Baseline existing issues once: \`npx cleardom@latest scan . --write-baseline cleardom-baseline.json\`

## Workflow

1. Run a local scan after relevant UI changes.
2. Fix critical findings first, then warnings.
3. Use \`cleardom explain <rule-id>\` before guessing at a fix.
4. Prefer semantic HTML and platform-native accessibility props over suppressing rules.
5. Do not disable or downgrade a rule unless the user explicitly accepts that tradeoff.
6. Re-run ClearDOM after fixes and report the score, active findings, and any remaining risk.

## Common Fix Patterns

- Unnamed controls: add visible text, \`aria-label\`, \`aria-labelledby\`, or the mapped design-system label prop.
- React Native touchables: add \`accessibilityLabel\` and an accurate \`accessibilityRole\`.
- Placeholder-only fields: add a real label, \`aria-label\`, or \`aria-labelledby\`.
- Clickable non-interactive elements: use a native button/link, or add role, tabIndex, and keyboard handlers.
- Images and media: add useful alt text, captions, transcripts, or mark decorative content intentionally.
- Focus and keyboard issues: keep visible focus indicators and preserve natural keyboard navigation.

## Agent Notes

- Treat ClearDOM findings as deterministic project feedback, not stylistic suggestions.
- Keep fixes small and local unless the user asks for broader cleanup.
- If a finding appears false-positive, explain why and propose a narrow component mapping or rule configuration.
- For ${agent}, keep this instruction block intact; rerun \`npx cleardom@latest install --agents\` to refresh it.
${blockEnd}`;
}
