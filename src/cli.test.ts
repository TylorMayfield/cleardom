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

  assert.match(result.stdout, /ClearDOM checked 1 file/);
  assert.match(result.stdout, /Score:/);
});

test("scan --json includes score, findings, and rules", async () => {
  const fixture = await createFixture("<button />");
  const result = await execFileAsync(process.execPath, [cliPath, "scan", fixture, "--json"]);
  const json = JSON.parse(result.stdout) as { score: number; checkedFiles: number; findings: unknown[]; activeFindings: unknown[]; scoreBreakdown: { semanticClarity: number }; rules: unknown[]; standard: { id: string } };

  assert.equal(json.checkedFiles, 1);
  assert.equal(json.standard.id, "wcag22-aa");
  assert.equal(typeof json.score, "number");
  assert.equal(typeof json.scoreBreakdown.semanticClarity, "number");
  assert.equal(json.findings.length > 0, true);
  assert.equal(json.activeFindings.length > 0, true);
  assert.equal(json.rules.length > 0, true);
});

test("rules and explain commands print rule metadata", async () => {
  const rules = await execFileAsync(process.execPath, [cliPath, "rules"]);
  const explain = await execFileAsync(process.execPath, [cliPath, "explain", "CDOM001"]);

  assert.match(rules.stdout, /CDOM001/);
  assert.match(rules.stdout, /CDOM018/);
  assert.match(rules.stdout, /Standards:/);
  assert.match(explain.stdout, /Interactive control has no accessible name/);
  assert.match(explain.stdout, /wcag22 4\.1\.2 A/);
  assert.match(explain.stdout, /Examples:/);
});

test("new static rules are exposed through explain and SARIF metadata", async () => {
  const fixture = await createFixture('<div className="toast">Saved</div><video controls src="/demo.mp4" />');
  const explain = await execFileAsync(process.execPath, [cliPath, "explain", "CDOM014"]);
  const sarifResult = await execFileAsync(process.execPath, [cliPath, "scan", fixture, "--format", "sarif"]);
  const sarif = JSON.parse(sarifResult.stdout) as { runs: Array<{ tool: { driver: { rules: Array<{ id: string }> } }; results: Array<{ ruleId: string }> }> };

  assert.match(explain.stdout, /Status message is not exposed as a live region/);
  assert.equal(sarif.runs[0].tool.driver.rules.some((rule) => rule.id === "CDOM014"), true);
  assert.equal(sarif.runs[0].tool.driver.rules.some((rule) => rule.id === "CDOM015"), true);
  assert.equal(sarif.runs[0].results.some((result) => result.ruleId === "CDOM014"), true);
  assert.equal(sarif.runs[0].results.some((result) => result.ruleId === "CDOM015"), true);
});

test("init --dry-run prints default config", async () => {
  const result = await execFileAsync(process.execPath, [cliPath, "init", "--dry-run"]);
  const json = JSON.parse(result.stdout) as { standard: string; baseline: string; failOn: string };

  assert.equal(json.standard, "wcag22-aa");
  assert.equal(json.baseline, "cleardom-baseline.json");
  assert.equal(json.failOn, "critical");
});

test("scan --format sarif emits SARIF", async () => {
  const fixture = await createFixture("<button />");
  const result = await execFileAsync(process.execPath, [cliPath, "scan", fixture, "--format", "sarif"]);
  const sarif = JSON.parse(result.stdout) as { version: string; runs: Array<{ results: unknown[] }> };

  assert.equal(sarif.version, "2.1.0");
  assert.equal(sarif.runs[0].results.length > 0, true);
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

test("config can exclude files and disable rules", async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));
  await fs.writeFile(path.join(directory, "Button.tsx"), "<button />", "utf8");
  await fs.writeFile(path.join(directory, "cleardom.config.json"), JSON.stringify({ rules: { CDOM001: "off" } }), "utf8");

  const result = await execFileAsync(process.execPath, [cliPath, "scan", directory, "--config", path.join(directory, "cleardom.config.json"), "--json"]);
  const json = JSON.parse(result.stdout) as { findings: Array<{ ruleId: string }> };

  assert.equal(json.findings.some((finding) => finding.ruleId === "CDOM001"), false);
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
