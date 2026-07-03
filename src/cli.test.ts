import * as assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const cliPath = path.resolve("dist/cli.js");

test("scan prints text output", async () => {
  const fixture = await createFixture('<button aria-label="Close"><X /></button>');
  const result = await execFileAsync(process.execPath, [cliPath, "scan", fixture]);

  assert.match(result.stdout, /ClearDOM score:/);
  assert.match(result.stdout, /Checked 1 file/);
});

test("default command scans the current project path", async () => {
  const fixture = await createFixture('<button aria-label="Close"><X /></button>');
  const result = await execFileAsync(process.execPath, [cliPath, fixture]);

  assert.match(result.stdout, /ClearDOM score:/);
  assert.match(result.stdout, /Checked 1 file/);
});

test("scan text output leads with fixes and keeps details behind verbose", async () => {
  const fixture = await createFixture("<button />");
  const result = await execFileAsync(process.execPath, [cliPath, "scan", fixture]);

  assert.match(result.stdout, /Fix: Add visible text, aria-label, aria-labelledby/);
  assert.match(result.stdout, /Learn: cleardom explain CDOM_4_1_2_UNNAMED_CONTROL \| https:\/\/github\.com\/cleardom\/cleardom#cdom_4_1_2_unnamed_control/);
  assert.match(result.stdout, /ClearDOM score:/);
  assert.match(result.stdout, /cleardom explain CDOM_4_1_2_UNNAMED_CONTROL/);
  assert.match(result.stdout, /cleardom rules/);
  assert.match(result.stdout, /cleardom scan \. --write-baseline cleardom-baseline\.json/);
  assert.doesNotMatch(result.stdout, /Score breakdown/);
  assert.doesNotMatch(result.stdout, /pnpm start --/);
});

test("scan --verbose includes scan details and score breakdown", async () => {
  const fixture = await createFixture("<button />");
  const result = await execFileAsync(process.execPath, [cliPath, "scan", fixture, "--verbose"]);

  assert.match(result.stdout, /Scan details/);
  assert.match(result.stdout, /Score breakdown/);
});

test("fix prints an agent remediation prompt with finding context", async () => {
  const fixture = await createFixture("<button />\n<a>Receipt</a>");
  const result = await execFileAsync(process.execPath, [cliPath, "fix", fixture, "--agent", "codex", "--rule", "CDOM_4_1_2_UNNAMED_CONTROL"]);

  assert.match(result.stdout, /ClearDOM agent remediation: 1 finding/);
  assert.match(result.stdout, /Agent: codex/);
  assert.match(result.stdout, /You are fixing ClearDOM accessibility findings/);
  assert.match(result.stdout, /Finding 1: CDOM_4_1_2_UNNAMED_CONTROL/);
  assert.match(result.stdout, /Rule guidance: Add visible text, aria-label, aria-labelledby/);
  assert.match(result.stdout, /> 1 \| <button \/>/);
  assert.doesNotMatch(result.stdout, /CDOM_4_1_2_ANCHOR_HREF -/);
  assert.match(result.stdout, /npx cleardom@latest scan .* --fail-on none/);
});

test("scan --json includes score, findings, and rules", async () => {
  const fixture = await createFixture("<button />");
  const result = await execFileAsync(process.execPath, [cliPath, "scan", fixture, "--json"]);
  const json = JSON.parse(result.stdout) as { score: number; checkedFiles: number; findings: unknown[]; activeFindings: unknown[]; scoreBreakdown: { semanticClarity: number }; rules: unknown[]; standard: { id: string }; semanticAnalysis: { adapter: string }; semanticDiagnostics: unknown[] };

  assert.equal(json.checkedFiles, 1);
  assert.equal(json.standard.id, "wcag22-aa");
  assert.equal(json.semanticAnalysis.adapter, "typescript");
  assert.equal(Array.isArray(json.semanticDiagnostics), true);
  assert.equal(typeof json.score, "number");
  assert.equal(typeof json.scoreBreakdown.semanticClarity, "number");
  assert.equal(json.findings.length > 0, true);
  assert.equal(json.activeFindings.length > 0, true);
  assert.equal(json.rules.length > 0, true);
});

test("--semantic required fails when no compiler-backed files are available", async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));
  await fs.writeFile(path.join(directory, "index.html"), "<button />", "utf8");

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, "scan", directory, "--semantic", "required"]),
    /Semantic analysis required/
  );
});

test("rules and explain commands print rule metadata", async () => {
  const rules = await execFileAsync(process.execPath, [cliPath, "rules"]);
  const explain = await execFileAsync(process.execPath, [cliPath, "explain", "CDOM_4_1_2_UNNAMED_CONTROL"]);

  assert.match(rules.stdout, /CDOM_4_1_2_UNNAMED_CONTROL/);
  assert.match(rules.stdout, /CDOM_2_4_3_POSITIVE_TABINDEX/);
  assert.match(rules.stdout, /Standards:/);
  assert.match(explain.stdout, /Interactive control has no accessible name/);
  assert.match(explain.stdout, /wcag22 4\.1\.2 A/);
  assert.match(explain.stdout, /Examples:/);

  const legacyExplain = await execFileAsync(process.execPath, [cliPath, "explain", "CDOM001"]);
  assert.match(legacyExplain.stdout, /CDOM_4_1_2_UNNAMED_CONTROL/);
});

test("new static rules are exposed through explain and SARIF metadata", async () => {
  const fixture = await createFixture('<div className="toast">Saved</div><video controls src="/demo.mp4" />');
  const explain = await execFileAsync(process.execPath, [cliPath, "explain", "CDOM_4_1_3_STATUS_LIVE_REGION"]);
  const sarifResult = await execFileAsync(process.execPath, [cliPath, "scan", fixture, "--format", "sarif"]);
  const sarif = JSON.parse(sarifResult.stdout) as { runs: Array<{ tool: { driver: { rules: Array<{ id: string }> } }; results: Array<{ ruleId: string }> }> };

  assert.match(explain.stdout, /Status message is not exposed as a live region/);
  assert.equal(sarif.runs[0].tool.driver.rules.some((rule) => rule.id === "CDOM_4_1_3_STATUS_LIVE_REGION"), true);
  assert.equal(sarif.runs[0].tool.driver.rules.some((rule) => rule.id === "CDOM_1_2_1_MEDIA_ALTERNATIVE"), true);
  assert.equal(sarif.runs[0].results.some((result) => result.ruleId === "CDOM_4_1_3_STATUS_LIVE_REGION"), true);
  assert.equal(sarif.runs[0].results.some((result) => result.ruleId === "CDOM_1_2_1_MEDIA_ALTERNATIVE"), true);
});

test("init --dry-run prints default config", async () => {
  const result = await execFileAsync(process.execPath, [cliPath, "init", "--dry-run"]);
  const json = JSON.parse(result.stdout) as { standard: string; baseline: string; failOn: string };

  assert.equal(json.standard, "wcag22-aa");
  assert.equal(json.baseline, "cleardom-baseline.json");
  assert.equal(json.failOn, "critical");
});

test("init detects the project stack and prints onboarding next steps", async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));
  await fs.writeFile(path.join(directory, "package.json"), JSON.stringify({
    dependencies: {
      next: "15.0.0",
      react: "19.0.0",
      "@mui/material": "7.0.0"
    }
  }), "utf8");

  const result = await execFileAsync(process.execPath, [cliPath, "init"], { cwd: directory });
  const config = JSON.parse(await fs.readFile(path.join(directory, "cleardom.config.json"), "utf8")) as { include: string[]; componentPresets: string[] };

  assert.match(result.stdout, /ClearDOM setup wizard/);
  assert.match(result.stdout, /Detected: Next\.js, React/);
  assert.match(result.stdout, /What changed:/);
  assert.match(result.stdout, /Next steps:/);
  assert.match(result.stdout, /cleardom scan \. --write-baseline cleardom-baseline\.json/);
  assert.equal(config.include.includes("app/**/*.{js,jsx,ts,tsx,mdx}"), true);
  assert.equal(config.componentPresets.includes("mui"), true);
});

test("init can create a baseline during setup", async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));
  await fs.mkdir(path.join(directory, "src"), { recursive: true });
  await fs.writeFile(path.join(directory, "src", "Button.tsx"), "<button />", "utf8");

  const result = await execFileAsync(process.execPath, [cliPath, "init", "--create-baseline"], { cwd: directory });
  const baseline = JSON.parse(await fs.readFile(path.join(directory, "cleardom-baseline.json"), "utf8")) as { findings: unknown[] };

  assert.match(result.stdout, /created\s+cleardom-baseline\.json/);
  assert.equal(baseline.findings.length > 0, true);
});

test("init --ci-dry-run previews the GitHub workflow without writing it", async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));
  const result = await execFileAsync(process.execPath, [cliPath, "init", "--ci-dry-run"], { cwd: directory });

  assert.match(result.stdout, /CI dry-run preview:/);
  assert.match(result.stdout, /npx cleardom@latest review \./);
  await assert.rejects(fs.readFile(path.join(directory, ".github", "workflows", "cleardom.yml"), "utf8"), /ENOENT/);
});

test("install --agents writes idempotent project-level agent guidance", async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));
  await fs.writeFile(path.join(directory, "AGENTS.md"), "# Project Notes\n\nKeep this.\n", "utf8");

  const first = await execFileAsync(process.execPath, [cliPath, "install", "--agents"], { cwd: directory });
  assert.match(first.stdout, /Installed ClearDOM developer workflow/);
  assert.match(first.stdout, /AGENTS\.md/);
  assert.match(first.stdout, /CLAUDE\.md/);
  assert.match(first.stdout, /\.cursor\/rules\/cleardom\.mdc/);

  const agents = await fs.readFile(path.join(directory, "AGENTS.md"), "utf8");
  const claude = await fs.readFile(path.join(directory, "CLAUDE.md"), "utf8");
  const cursor = await fs.readFile(path.join(directory, ".cursor", "rules", "cleardom.mdc"), "utf8");

  assert.match(agents, /# Project Notes/);
  assert.match(agents, /<!-- cleardom:start -->/);
  assert.match(agents, /npx cleardom@latest --fail-on none/);
  assert.match(agents, /npx cleardom@latest --diff --fail-on none/);
  assert.match(claude, /ClearDOM Agent Skill/);
  assert.match(cursor, /ClearDOM Agent Skill/);

  const second = await execFileAsync(process.execPath, [cliPath, "install", "--agents"], { cwd: directory });
  const updated = await fs.readFile(path.join(directory, "AGENTS.md"), "utf8");

  assert.match(second.stdout, /unchanged|updated/);
  assert.equal((updated.match(/<!-- cleardom:start -->/g) ?? []).length, 1);
});

test("install writes a GitHub Actions PR workflow by default", async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));
  const result = await execFileAsync(process.execPath, [cliPath, "install"], { cwd: directory });
  const workflow = await fs.readFile(path.join(directory, ".github", "workflows", "cleardom.yml"), "utf8");

  assert.match(result.stdout, /GitHub Actions PR review/);
  assert.match(workflow, /npx cleardom@latest review \./);
  assert.match(workflow, /pull-requests: write/);
  assert.match(workflow, /issues: write/);
});

test("review --dry-run prints a pull request summary without GitHub credentials", async () => {
  const fixture = await createFixture('<button aria-label="Close"><X /></button>');
  const result = await execFileAsync(process.execPath, [cliPath, "review", fixture, "--dry-run", "--fail-on", "none"]);

  assert.match(result.stdout, /<!-- cleardom:pr-summary -->/);
  assert.match(result.stdout, /# ClearDOM PR review:/);
  assert.match(result.stdout, /Status check: \*\*/);
  assert.match(result.stdout, /Score: \*\*/);
});

test("github-pr remains a backwards-compatible review alias", async () => {
  const fixture = await createFixture('<button aria-label="Close"><X /></button>');
  const result = await execFileAsync(process.execPath, [cliPath, "github-pr", fixture, "--dry-run", "--fail-on", "none"]);

  assert.match(result.stdout, /# ClearDOM PR review:/);
});

test("agents commands detect, target, and uninstall ClearDOM guidance", async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));

  const missing = await execFileAsync(process.execPath, [cliPath, "agents", "detect"], { cwd: directory });
  assert.match(missing.stdout, /missing\s+AGENTS\.md/);

  await execFileAsync(process.execPath, [cliPath, "agents", "install", "--agent", "cursor"], { cwd: directory });
  await assert.rejects(fs.readFile(path.join(directory, "AGENTS.md"), "utf8"), /ENOENT/);

  const detected = await execFileAsync(process.execPath, [cliPath, "agents", "detect", "--agent", "cursor"], { cwd: directory });
  assert.match(detected.stdout, /installed \.cursor\/rules\/cleardom\.mdc/);

  const removed = await execFileAsync(process.execPath, [cliPath, "agents", "uninstall", "--agent", "cursor"], { cwd: directory });
  const cursor = await fs.readFile(path.join(directory, ".cursor", "rules", "cleardom.mdc"), "utf8");
  assert.match(removed.stdout, /removed\s+\.cursor\/rules\/cleardom\.mdc/);
  assert.doesNotMatch(cursor, /cleardom:start/);
});

test("scan --format sarif emits SARIF", async () => {
  const fixture = await createFixture("<button />");
  const result = await execFileAsync(process.execPath, [cliPath, "scan", fixture, "--format", "sarif"]);
  const sarif = JSON.parse(result.stdout) as { version: string; runs: Array<{ results: unknown[] }> };

  assert.equal(sarif.version, "2.1.0");
  assert.equal(sarif.runs[0].results.length > 0, true);
});

test("scan routes URL targets to live URL scanning", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, "scan", "https://example.com", "--json"], {
      env: { ...process.env, CHROME_PATH: "", PUPPETEER_EXECUTABLE_PATH: "" }
    }),
    /Scanning live URLs requires CHROME_PATH/
  );
});

test("standards command lists every supported WCAG profile", async () => {
  const result = await execFileAsync(process.execPath, [cliPath, "standards"]);

  assert.match(result.stdout, /wcag10 WCAG 1\.0/);
  assert.match(result.stdout, /wcag22-aa WCAG 2\.2 Level AA/);
  assert.match(result.stdout, /wcag30-draft WCAG 3\.0 Working Draft/);
});

test("scan --standard selects the requested standard", async () => {
  const fixture = await createFixture("<button />");
  const result = await execFileAsync(process.execPath, [cliPath, "scan", fixture, "--standard", "wcag10", "--json"]);
  const json = JSON.parse(result.stdout) as { standard: { id: string }; findings: Array<{ standards: Array<{ version: string; criterion: string }> }> };

  assert.equal(json.standard.id, "wcag10");
  assert.equal(json.findings.length > 0, true);
  assert.equal(json.findings[0].standards[0].version, "wcag10");
});

test("scan rejects unknown standards", async () => {
  const fixture = await createFixture("<button />");

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, "scan", fixture, "--standard", "wcag19-aa"]),
    /Unknown WCAG standard/
  );
});

test("--fail-on critical exits nonzero only for critical findings", async () => {
  const passing = await createFixture('<button aria-label="Close"><X /></button>');
  await execFileAsync(process.execPath, [cliPath, "scan", passing, "--fail-on", "critical"]);

  const failing = await createFixture("<button />");
  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, "scan", failing, "--fail-on", "critical"]),
    (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === 1
  );
});

test("baseline suppresses regression failure for existing findings", async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));
  await fs.writeFile(path.join(directory, "Fixture.tsx"), "<button />", "utf8");
  const baselinePath = path.join(directory, "cleardom-baseline.json");
  await execFileAsync(process.execPath, [cliPath, "scan", directory, "--write-baseline", baselinePath, "--format", "json"]);

  const baseline = JSON.parse(await fs.readFile(baselinePath, "utf8")) as { findings: unknown[] };
  assert.equal(baseline.findings.length > 0, true);

  const result = await execFileAsync(process.execPath, [cliPath, "scan", directory, "--baseline", baselinePath, "--fail-on", "regression", "--format", "json"]);
  const json = JSON.parse(result.stdout) as { summary: { baselineFindings: number; regressions: number }; activeFindings: unknown[] };
  assert.equal(json.summary.baselineFindings > 0, true);
  assert.equal(json.summary.regressions, 0);
  assert.equal(json.activeFindings.length, 0);
});

test("baseline fails on new regressions", async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));
  await fs.writeFile(path.join(directory, "Fixture.tsx"), '<button aria-label="Close" />', "utf8");
  const baselinePath = path.join(directory, "cleardom-baseline.json");
  await execFileAsync(process.execPath, [cliPath, "scan", directory, "--write-baseline", baselinePath, "--format", "json"]);
  await fs.writeFile(path.join(directory, "Fixture.tsx"), "<button />", "utf8");

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, "scan", directory, "--baseline", baselinePath, "--fail-on", "regression"]),
    (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === 1
  );
});

test("ci uses the default baseline and fails only on new regressions", async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));
  await fs.writeFile(path.join(directory, "Fixture.tsx"), "<button />", "utf8");
  await execFileAsync(process.execPath, [cliPath, "scan", directory, "--write-baseline", path.join(directory, "cleardom-baseline.json"), "--format", "json"]);

  const passing = await execFileAsync(process.execPath, [cliPath, "ci", directory, "--format", "json"]);
  const json = JSON.parse(passing.stdout) as { summary: { baselineFindings: number; regressions: number } };
  assert.equal(json.summary.baselineFindings > 0, true);
  assert.equal(json.summary.regressions, 0);

  await fs.writeFile(path.join(directory, "Fixture.tsx"), "<button /><a>Receipt</a>", "utf8");
  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, "ci", directory]),
    (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === 1
  );
});

test("ci lets explicit fail-on override the default regression gate", async () => {
  const fixture = await createFixture("<h2>Billing</h2><h4>Details</h4>");
  await execFileAsync(process.execPath, [cliPath, "ci", fixture, "--fail-on", "critical"]);
});

test("--diff scans changed files only", async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));
  await execFileAsync("git", ["init"], { cwd: directory });
  await fs.writeFile(path.join(directory, "Clean.tsx"), '<button aria-label="Close" />', "utf8");
  await execFileAsync("git", ["add", "Clean.tsx"], { cwd: directory });
  await execFileAsync("git", ["-c", "user.email=cleardom@example.com", "-c", "user.name=ClearDOM", "commit", "-m", "initial"], { cwd: directory });
  await fs.writeFile(path.join(directory, "Changed.tsx"), "<button />", "utf8");

  const result = await execFileAsync(process.execPath, [cliPath, "--diff", "--json"], { cwd: directory });
  const json = JSON.parse(result.stdout) as { checkedFiles: number; findings: Array<{ file: string }> };

  assert.equal(json.checkedFiles, 1);
  assert.equal(json.findings.every((finding) => finding.file.endsWith("Changed.tsx")), true);
});

test("config can exclude files and disable rules", async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));
  await fs.writeFile(path.join(directory, "Button.tsx"), "<button />", "utf8");
  await fs.writeFile(path.join(directory, "cleardom.config.json"), JSON.stringify({ rules: { CDOM_4_1_2_UNNAMED_CONTROL: "off" } }), "utf8");

  const result = await execFileAsync(process.execPath, [cliPath, "scan", directory, "--config", path.join(directory, "cleardom.config.json"), "--json"]);
  const json = JSON.parse(result.stdout) as { findings: Array<{ ruleId: string }> };

  assert.equal(json.findings.some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), false);
});

test("config include globs match direct and nested files", async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));
  await fs.mkdir(path.join(directory, "src", "nested"), { recursive: true });
  await fs.writeFile(path.join(directory, "src", "Button.tsx"), '<button aria-label="Close" />', "utf8");
  await fs.writeFile(path.join(directory, "src", "nested", "Link.tsx"), '<a href="/receipt">Receipt</a>', "utf8");
  await fs.writeFile(path.join(directory, "Outside.tsx"), "<button />", "utf8");
  await fs.writeFile(path.join(directory, "cleardom.config.json"), JSON.stringify({ include: ["src/**/*.{js,jsx,ts,tsx}"] }), "utf8");

  const result = await execFileAsync(process.execPath, [cliPath, "scan", directory, "--config", path.join(directory, "cleardom.config.json"), "--json"]);
  const json = JSON.parse(result.stdout) as { checkedFiles: number; findings: unknown[] };

  assert.equal(json.checkedFiles, 2);
  assert.equal(json.findings.length, 0);
});

async function createFixture(source: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));
  await fs.writeFile(path.join(directory, "Fixture.tsx"), source, "utf8");
  return directory;
}
