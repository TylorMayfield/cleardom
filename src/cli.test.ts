import * as assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { resolveScanOptions } from "./config.js";

const execFileAsync = promisify(execFile);
const cliPath = path.resolve("dist/cli.js");

test("scan prints text output", async () => {
  const fixture = await createFixture('<button aria-label="Close"><X /></button>');
  const result = await execFileAsync(process.execPath, [cliPath, "scan", fixture]);

  assert.match(result.stdout, /ClearDOM v0\.2\.4/);
  assert.match(result.stderr, /Running source checks/);
  assert.doesNotMatch(result.stdout, /Running source checks/);
  assert.match(result.stdout, /✓ Scan complete/);
  assert.match(result.stdout, /Score: 100\/100 \(Excellent\)/);
  assert.match(result.stdout, /0 findings across 1 file/);
});

test("default command scans the current project path", async () => {
  const fixture = await createFixture('<button aria-label="Close"><X /></button>');
  const result = await execFileAsync(process.execPath, [cliPath, fixture]);

  assert.match(result.stdout, /ClearDOM v0\.2\.4/);
  assert.match(result.stdout, /Score: 100\/100 \(Excellent\)/);
  assert.match(result.stdout, /0 findings across 1 file/);
});

test("help flags print usage without scanning", async () => {
  for (const flag of ["help", "--help", "-h"]) {
    const result = await execFileAsync(process.execPath, [cliPath, flag]);

    assert.match(result.stdout, /Usage:/);
    assert.match(result.stdout, /cleardom \[path\|url\]/);
    assert.doesNotMatch(result.stdout, /Score:/);
  }
});

test("version flags print package version without scanning", async () => {
  for (const flag of ["--version", "-v"]) {
    const result = await execFileAsync(process.execPath, [cliPath, flag]);

    assert.equal(result.stdout.trim(), "0.2.4");
    assert.doesNotMatch(result.stdout, /ClearDOM score:/);
  }
});

test("scan text output leads with fixes and keeps details behind verbose", async () => {
  const fixture = await createFixture("<button />");
  const result = await execFileAsync(process.execPath, [cliPath, "scan", fixture]);

  assert.match(result.stdout, /ClearDOM v0\.2\.4/);
  assert.match(result.stdout, /Detected:/);
  assert.match(result.stdout, /✓ Scan complete/);
  assert.match(result.stdout, /Score: 95\/100 \(Excellent\)/);
  assert.match(result.stdout, /Detection: 1 automated, 0 needs review, 0 manual guidance/);
  assert.match(result.stdout, /Top findings/);
  assert.match(result.stdout, /Fix: Add visible text, aria-label, aria-labelledby/);
  assert.doesNotMatch(result.stdout, /Learn: cleardom explain CDOM_4_1_2_UNNAMED_CONTROL/);
  assert.match(result.stdout, /cleardom fix .* --rule CDOM_4_1_2_UNNAMED_CONTROL/);
  assert.match(result.stdout, /cleardom check .* --diff/);
  assert.doesNotMatch(result.stdout, /cleardom install/);
  assert.doesNotMatch(result.stdout, /Score breakdown/);
  assert.doesNotMatch(result.stdout, /pnpm start --/);
});

test("scan --score prints only the numeric score", async () => {
  const fixture = await createFixture("<button />");
  const result = await execFileAsync(process.execPath, [cliPath, "scan", fixture, "--score"]);

  assert.equal(result.stdout.trim(), "95");
});

test("scan --verbose includes scan details and score breakdown", async () => {
  const fixture = await createFixture("<button />");
  const result = await execFileAsync(process.execPath, [cliPath, "scan", fixture, "--verbose"]);

  assert.match(result.stdout, /Scan details/);
  assert.match(result.stdout, /Framework adapters: JSX\/TSX full/);
  assert.match(result.stdout, /Web runtime checks: available with --runtime-url and Chromium/);
  assert.match(result.stdout, /React Native checks: static source guidance; verify VoiceOver and TalkBack behavior manually/);
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

test("fix --json emits a structured agent remediation contract", async () => {
  const fixture = await createFixture("<button />");
  const result = await execFileAsync(process.execPath, [cliPath, "fix", fixture, "--json"]);
  const task = JSON.parse(result.stdout) as {
    schemaVersion: number;
    kind: string;
    verificationCommand: string;
    findings: Array<{ ruleId: string; file: string; guidance?: string }>;
    outcome: { source: { completedFiles: number } };
  };

  assert.equal(task.schemaVersion, 1);
  assert.equal(task.kind, "cleardom-agent-remediation");
  assert.match(task.verificationCommand, /cleardom@latest scan/);
  assert.equal(task.findings[0]?.ruleId, "CDOM_4_1_2_UNNAMED_CONTROL");
  assert.equal(typeof task.findings[0]?.guidance, "string");
  assert.equal(task.outcome.source.completedFiles, 1);
});

test("fix --apply --json emits structured verification", async () => {
  const fixture = await createFixture('<input placeholder="Email" />');
  const result = await execFileAsync(process.execPath, [cliPath, "fix", fixture, "--apply", "--json", "--rule", "CDOM_3_3_2_PLACEHOLDER_LABEL", "--rule", "CDOM_4_1_2_FORM_LABEL", "--limit", "2", "--source-only"]);
  const verification = JSON.parse(result.stdout) as {
    schemaVersion: number;
    kind: string;
    applied: { edits: number };
    verification: { fixed: string[]; introduced: string[] };
    before: { findings: { safeAutoFix: number } };
    after: { findings: { safeAutoFix: number } };
  };

  assert.equal(verification.schemaVersion, 1);
  assert.equal(verification.kind, "cleardom-fix-verification");
  assert.equal(verification.applied.edits, 1);
  assert.equal(verification.verification.fixed.length, 2);
  assert.equal(verification.verification.introduced.length, 0);
  assert.equal(verification.before.findings.safeAutoFix >= 2, true);
  assert.equal(verification.after.findings.safeAutoFix, 0);
});

test("fix --apply does not rewrite product code without explicit transforms", async () => {
  const fixture = await createFixture("<button />");
  const file = path.join(fixture, "Fixture.tsx");
  const result = await execFileAsync(process.execPath, [cliPath, "fix", fixture, "--apply"]);

  assert.match(result.stdout, /ClearDOM automatic fixes/);
  assert.match(result.stdout, /Applied fixes: 0/);
  assert.equal(await fs.readFile(file, "utf8"), "<button />");
});

test("fix --preview and --apply handle safe mechanical transforms", async () => {
  const fixture = await createFixture('<button tabIndex={3}>Save</button>');
  const file = path.join(fixture, "Fixture.tsx");
  const preview = await execFileAsync(process.execPath, [cliPath, "fix", fixture, "--preview", "--rule", "CDOM_2_4_3_POSITIVE_TABINDEX"]);

  assert.match(preview.stdout, /ClearDOM fix preview/);
  assert.match(preview.stdout, /Auto-fixable: 1/);
  assert.match(preview.stdout, /-<button tabIndex=\{3\}>Save<\/button>/);
  assert.match(preview.stdout, /\+<button tabIndex=\{0\}>Save<\/button>/);
  assert.equal(await fs.readFile(file, "utf8"), '<button tabIndex={3}>Save</button>');

  const applied = await execFileAsync(process.execPath, [cliPath, "fix", fixture, "--apply", "--rule", "CDOM_2_4_3_POSITIVE_TABINDEX"]);
  assert.match(applied.stdout, /Applied fixes: 1/);
  assert.match(applied.stdout, /ClearDOM verification/);
  assert.match(applied.stdout, /Fixed: 1/);
  assert.match(applied.stdout, /Introduced: 0/);
  assert.match(applied.stdout, /introduced no new findings/);
  assert.equal(await fs.readFile(file, "utf8"), '<button tabIndex={0}>Save</button>');
});

test("fix --plan groups findings by owner and rule", async () => {
  const fixture = await createFixture("<button />");
  const configPath = path.join(fixture, "cleardom.config.json");
  await fs.writeFile(configPath, JSON.stringify({
    ownership: [{ files: ["Fixture.tsx"], owner: "@design-systems" }]
  }), "utf8");
  const result = await execFileAsync(process.execPath, [cliPath, "fix", fixture, "--plan", "--format", "json", "--config", configPath]);
  const parsed = JSON.parse(result.stdout) as { plan: Array<{ ruleId: string; owner?: string; verification: string }> };

  assert.equal(parsed.plan.some((group) => group.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL" && group.owner === "@design-systems"), true);
  assert.match(parsed.plan[0].verification, /npx cleardom@latest scan/);
});

test("doctor validates local developer workflow context", async () => {
  const fixture = await createFixture('<button aria-label="Close" />');
  const result = await execFileAsync(process.execPath, [cliPath, "doctor", fixture]);

  assert.match(result.stdout, /ClearDOM doctor/);
  assert.match(result.stdout, /Config:/);
  assert.match(result.stdout, /Project stack:/);
  assert.match(result.stdout, /Browser:/);
  assert.match(result.stdout, /GitHub token:/);
  assert.match(result.stdout, /Runtime URL:/);
});

test("doctor explains the React setup flow from the target project", async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));
  await fs.writeFile(path.join(directory, "package.json"), JSON.stringify({
    dependencies: {
      react: "19.0.0",
      "@mui/material": "7.0.0"
    }
  }), "utf8");

  const result = await execFileAsync(process.execPath, [cliPath, "doctor", directory]);

  assert.match(result.stdout, /Project stack: Detected React/);
  assert.match(result.stdout, /React setup: JSX\/TSX source scans are enabled with semantic auto/);
  assert.match(result.stdout, /Component presets: mui/);
  assert.match(result.stdout, /cleardom scan \. --diff/);
});

test("doctor explains the vanilla web setup flow", async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));
  await fs.writeFile(path.join(directory, "package.json"), JSON.stringify({
    dependencies: { vite: "6.0.0" }
  }), "utf8");
  await fs.writeFile(path.join(directory, "index.html"), "<main><button>Save</button></main>", "utf8");

  const result = await execFileAsync(process.execPath, [cliPath, "doctor", directory]);

  assert.match(result.stdout, /Project stack: Detected Vite/);
  assert.match(result.stdout, /Vanilla web setup: HTML files are in scope/);
  assert.match(result.stdout, /--runtime-url http:\/\/localhost:3000/);
});

test("doctor explains shared web checks for container platforms", async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));
  await fs.writeFile(path.join(directory, "package.json"), JSON.stringify({
    dependencies: {
      react: "19.0.0",
      "@capacitor/core": "7.0.0",
      "@ionic/react": "8.0.0"
    }
  }), "utf8");
  await fs.writeFile(path.join(directory, "capacitor.config.ts"), "export default {};", "utf8");

  const result = await execFileAsync(process.execPath, [cliPath, "doctor", directory]);

  assert.match(result.stdout, /Project stack: Detected React, Capacitor, Ionic/);
  assert.match(result.stdout, /Web container setup: Capacitor, Ionic UI uses the shared web source and rendered rule engine/);
  assert.match(result.stdout, /runtime routes or built HTML/);
  assert.doesNotMatch(result.stdout, /Vanilla web setup/);
});

test("doctor explains template framework setup flows", async () => {
  const cases = [
    { name: "Vue", dependencies: { vite: "6.0.0", vue: "3.5.0" }, expectedStack: /Detected Vite Vue, Vue/, expectedConfigPattern: "src/**/*.vue" },
    { name: "Svelte", dependencies: { "@sveltejs/kit": "2.0.0", svelte: "5.0.0" }, expectedStack: /Detected Svelte/, expectedConfigPattern: "src/**/*.svelte" },
    { name: "Astro", dependencies: { astro: "5.0.0" }, expectedStack: /Detected Astro/, expectedConfigPattern: "src/**/*.astro" },
    { name: "Angular", dependencies: { "@angular/core": "20.0.0" }, topLevelFile: "angular.json", expectedStack: /Detected Angular/, expectedConfigPattern: "src/**/*.component.html" }
  ];

  for (const fixture of cases) {
    const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));
    await fs.writeFile(path.join(directory, "package.json"), JSON.stringify({ dependencies: fixture.dependencies }), "utf8");
    if (fixture.topLevelFile) {
      await fs.writeFile(path.join(directory, fixture.topLevelFile), "{}", "utf8");
    }

    const doctor = await execFileAsync(process.execPath, [cliPath, "doctor", directory]);
    const init = await execFileAsync(process.execPath, [cliPath, "init", "--dry-run"], { cwd: directory });
    const config = JSON.parse(init.stdout) as { include: string[] };

    assert.match(doctor.stdout, fixture.expectedStack, fixture.name);
    assert.match(doctor.stdout, /Template setup: .*source adapters are in scope/, fixture.name);
    assert.match(doctor.stdout, /--runtime-url/, fixture.name);
    assert.equal(config.include.includes(fixture.expectedConfigPattern), true, fixture.name);
  }
});

test("doctor explains Solid setup as JSX source scanning", async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));
  await fs.writeFile(path.join(directory, "package.json"), JSON.stringify({
    dependencies: {
      vite: "6.0.0",
      "solid-js": "1.9.0"
    }
  }), "utf8");

  const result = await execFileAsync(process.execPath, [cliPath, "doctor", directory]);

  assert.match(result.stdout, /Project stack: Detected Vite, Solid/);
  assert.match(result.stdout, /Solid setup: JSX\/TSX source scans are enabled with semantic auto/);
  assert.match(result.stdout, /cleardom scan \. --diff/);
  assert.doesNotMatch(result.stdout, /Vanilla web setup/);
});

test("doctor explains the Expo setup flow", async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));
  await fs.writeFile(path.join(directory, "package.json"), JSON.stringify({
    dependencies: {
      expo: "54.0.0",
      react: "19.0.0",
      "react-native": "0.81.0"
    }
  }), "utf8");

  const result = await execFileAsync(process.execPath, [cliPath, "doctor", directory]);

  assert.match(result.stdout, /Project stack: Detected React, React Native, Expo/);
  assert.match(result.stdout, /React setup:/);
  assert.match(result.stdout, /Expo setup: React Native component mappings are enabled/);
  assert.match(result.stdout, /cleardom native scan \./);
});

test("report writes shareable markdown, html, and json scan reports", async () => {
  const fixture = await createFixture("<button />");
  const markdownPath = path.join(fixture, "report.md");
  const htmlPath = path.join(fixture, "report.html");

  const markdown = await execFileAsync(process.execPath, [cliPath, "report", fixture, "--format", "markdown", "--output", markdownPath]);
  const html = await execFileAsync(process.execPath, [cliPath, "report", fixture, "--format", "html", "--output", htmlPath]);
  const json = await execFileAsync(process.execPath, [cliPath, "report", fixture, "--format", "json"]);

  assert.match(markdown.stdout, /Wrote ClearDOM markdown report/);
  assert.match(await fs.readFile(markdownPath, "utf8"), /# ClearDOM Scan Report/);
  assert.match(html.stdout, /Wrote ClearDOM html report/);
  const htmlReport = await fs.readFile(htmlPath, "utf8");
  assert.match(htmlReport, /<!doctype html>/);
  assert.match(htmlReport, /id="finding-search"/);
  assert.match(htmlReport, /id="severity-filter"/);
  assert.equal(JSON.parse(json.stdout).activeFindings.length > 0, true);
});

test("scan --json includes score and findings without the rule catalog by default", async () => {
  const fixture = await createFixture("<button />");
  const result = await execFileAsync(process.execPath, [cliPath, "scan", fixture, "--json"]);
  const json = JSON.parse(result.stdout) as { score: number; checkedFiles: number; findings: unknown[]; activeFindings: unknown[]; scoreBreakdown: { semanticClarity: number }; rules?: unknown[]; standard: { id: string }; semanticAnalysis: { adapter: string }; semanticDiagnostics: unknown[]; outcome: { source: { completedFiles: number }; runtime: { requested: boolean }; findings: { automated: number } } };

  assert.equal(json.checkedFiles, 1);
  assert.equal(json.standard.id, "wcag22-aa");
  assert.equal(json.semanticAnalysis.adapter, "typescript");
  assert.equal(Array.isArray(json.semanticDiagnostics), true);
  assert.equal(typeof json.score, "number");
  assert.equal(typeof json.scoreBreakdown.semanticClarity, "number");
  assert.equal(json.findings.length > 0, true);
  assert.equal(json.activeFindings.length > 0, true);
  assert.equal(json.outcome.source.completedFiles, 1);
  assert.equal(json.outcome.runtime.requested, false);
  assert.equal(json.outcome.findings.automated > 0, true);
  assert.equal("rules" in json, false);
});

test("scan --json --include-rules includes the rule catalog", async () => {
  const fixture = await createFixture("<button />");
  const result = await execFileAsync(process.execPath, [cliPath, "scan", fixture, "--json", "--include-rules"]);
  const json = JSON.parse(result.stdout) as { rules: unknown[] };

  assert.equal(json.rules.length > 0, true);
});

test("scan detects common component presets from package metadata", async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));
  await fs.mkdir(path.join(directory, "src"), { recursive: true });
  await fs.writeFile(path.join(directory, "package.json"), JSON.stringify({
    dependencies: {
      react: "19.0.0",
      "@mui/material": "7.0.0"
    }
  }), "utf8");
  await fs.writeFile(path.join(directory, "src", "App.tsx"), 'import { IconButton } from "@mui/material";\nexport function App() { return <IconButton><span aria-hidden="true">x</span></IconButton>; }', "utf8");

  const result = await execFileAsync(process.execPath, [cliPath, "scan", ".", "--json"], { cwd: directory });
  const json = JSON.parse(result.stdout) as { activeFindings: Array<{ ruleId: string; file: string }> };

  assert.equal(json.activeFindings.some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), true);
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
  const json = JSON.parse(result.stdout) as {
    standard: string;
    baseline: string;
    failOn: string;
    runtime: { browser?: unknown; crawl?: unknown; interactions?: unknown; stories?: unknown };
    native?: { enabled?: boolean };
    ownership?: unknown[];
    suppressionPolicy?: { requireApprovedBy?: boolean };
  };

  assert.equal(json.standard, "wcag22-aa");
  assert.equal(json.baseline, "cleardom-baseline.json");
  assert.equal(json.failOn, "critical");
  assert.equal(typeof json.runtime.browser, "object");
  assert.equal(typeof json.runtime.crawl, "object");
  assert.equal(typeof json.runtime.interactions, "object");
  assert.equal(typeof json.runtime.stories, "object");
  assert.equal(json.native?.enabled, false);
  assert.equal(Array.isArray(json.ownership), true);
  assert.equal(json.suppressionPolicy?.requireApprovedBy, false);
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
  const config = JSON.parse(await fs.readFile(path.join(directory, "cleardom.config.json"), "utf8")) as {
    include: string[];
    componentPresets: string[];
    native?: { enabled?: boolean };
    ownership?: unknown[];
    suppressionPolicy?: { requireApprovedBy?: boolean };
  };

  assert.match(result.stdout, /ClearDOM setup wizard/);
  assert.match(result.stdout, /Detected: Next\.js, React/);
  assert.match(result.stdout, /What changed:/);
  assert.match(result.stdout, /Next steps:/);
  assert.match(result.stdout, /Scaffolded paths:/);
  assert.match(result.stdout, /Run the complete check: cleardom check/);
  assert.match(result.stdout, /Apply safe fixes and verify: cleardom fix .* --apply/);
  assert.match(result.stdout, /Install pull-request protection: cleardom install/);
  assert.equal(config.include.includes("app/**/*.{js,jsx,ts,tsx,mdx}"), true);
  assert.equal(config.componentPresets.includes("mui"), true);
  assert.equal(config.native?.enabled, false);
  assert.equal(Array.isArray(config.ownership), true);
  assert.equal(config.suppressionPolicy?.requireApprovedBy, false);
});

test("init detects Next App Router projects without package metadata", async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));
  await fs.mkdir(path.join(directory, "app"), { recursive: true });
  await fs.writeFile(path.join(directory, "app", "layout.tsx"), "export default function Layout({ children }) { return <html><body>{children}</body></html>; }", "utf8");
  await fs.writeFile(path.join(directory, "app", "page.tsx"), "export default function Page() { return <main />; }", "utf8");

  const doctor = await execFileAsync(process.execPath, [cliPath, "doctor", directory]);
  const init = await execFileAsync(process.execPath, [cliPath, "init", "--dry-run", "--target", directory]);
  const config = JSON.parse(init.stdout) as { include: string[] };

  assert.match(doctor.stdout, /Project stack: Detected Next\.js, React/);
  assert.match(doctor.stdout, /Detected from: .*app\/layout\.tsx/);
  assert.equal(config.include.includes("app/**/*.{js,jsx,ts,tsx,mdx}"), true);
});

test("init keeps root HTML files in scope for vanilla web projects", async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));
  await fs.writeFile(path.join(directory, "package.json"), JSON.stringify({
    dependencies: { vite: "6.0.0" }
  }), "utf8");
  await fs.writeFile(path.join(directory, "index.html"), "<button></button>", "utf8");

  await execFileAsync(process.execPath, [cliPath, "init"], { cwd: directory });
  const config = JSON.parse(await fs.readFile(path.join(directory, "cleardom.config.json"), "utf8")) as { include: string[] };
  const result = await execFileAsync(process.execPath, [cliPath, "scan", directory, "--config", path.join(directory, "cleardom.config.json"), "--fail-on", "none", "--json"]);
  const json = JSON.parse(result.stdout) as { checkedFiles: number; activeFindings: Array<{ ruleId: string }> };

  assert.equal(config.include.includes("*.html"), true);
  assert.equal(json.checkedFiles, 1);
  assert.equal(json.activeFindings.some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), true);
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
  assert.match(result.stdout, /npx cleardom@latest review \. --changed-files-only/);
  await assert.rejects(fs.readFile(path.join(directory, ".github", "workflows", "cleardom.yml"), "utf8"), /ENOENT/);
});

test("PR review scans changed files by default", async () => {
  const options = await resolveScanOptions();

  assert.equal(options.pr.changedFilesOnly, true);
  assert.equal(options.pr.baselinePolicy, "new");
  assert.equal(options.pr.commentMode, "both");
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
  assert.doesNotMatch(result.stdout, /AGENTS\.md/);
  assert.match(workflow, /npx cleardom@latest review \. --changed-files-only/);
  assert.match(workflow, /types: \[opened, synchronize, reopened, ready_for_review\]/);
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /concurrency:/);
  assert.match(workflow, /pull-requests: write/);
  assert.match(workflow, /issues: write/);
  await assert.rejects(fs.readFile(path.join(directory, "AGENTS.md"), "utf8"), /ENOENT/);
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
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-url-"));
  const configPath = path.join(directory, "cleardom.config.json");
  await fs.writeFile(configPath, JSON.stringify({ runtime: { browser: { mode: "managed" } } }), "utf8");

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, "scan", "https://example.com", "--json", "--config", configPath], {
      env: { ...process.env, CHROME_PATH: "", PUPPETEER_EXECUTABLE_PATH: "" }
    }),
    /No Chrome executable found/
  );
});

test("native scan maps simulator snapshot evidence", async () => {
  const fixture = await createFixture("import { Pressable } from 'react-native';\n<Pressable accessibilityRole=\"button\" accessibilityLabel=\"Save\" />");
  const result = await execFileAsync(process.execPath, [cliPath, "native", "scan", fixture, "--format", "json"], {
    env: {
      ...process.env,
      CLEARDOM_NATIVE_MOCK_SNAPSHOT: '@e1 role="button"\n@e2 label="Delete" role="button"\n@e3 label="Delete" role="button"'
    }
  });
  const json = JSON.parse(result.stdout) as { activeFindings: Array<{ source: string; native?: { platform: string } }> };

  assert.equal(json.activeFindings.some((finding) => finding.source === "native-runtime" && finding.native?.platform === "ios"), true);
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

test("suppress adds selected findings to the baseline", async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));
  await fs.writeFile(path.join(directory, "Fixture.tsx"), "<button />\n<a>Receipt</a>", "utf8");
  const baselinePath = path.join(directory, "cleardom-baseline.json");

  const suppressed = await execFileAsync(process.execPath, [cliPath, "suppress", directory, "--rule", "CDOM_4_1_2_UNNAMED_CONTROL", "--baseline", baselinePath]);
  const baseline = JSON.parse(await fs.readFile(baselinePath, "utf8")) as { findings: Array<{ ruleId: string }> };

  assert.match(suppressed.stdout, /Suppressed 1 finding/);
  assert.equal(baseline.findings.length, 1);
  assert.equal(baseline.findings[0].ruleId, "CDOM_4_1_2_UNNAMED_CONTROL");
});

test("baseline update refreshes current findings and prune removes stale ones", async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cleardom-"));
  await fs.writeFile(path.join(directory, "Fixture.tsx"), "<button />", "utf8");
  const baselinePath = path.join(directory, "cleardom-baseline.json");

  const updated = await execFileAsync(process.execPath, [cliPath, "baseline", "update", directory, "--baseline", baselinePath]);
  assert.match(updated.stdout, /Updated .* with 1 current finding/);

  await fs.writeFile(path.join(directory, "Fixture.tsx"), '<button aria-label="Close" />', "utf8");
  const pruned = await execFileAsync(process.execPath, [cliPath, "baseline", "prune", directory, "--baseline", baselinePath]);
  const baseline = JSON.parse(await fs.readFile(baselinePath, "utf8")) as { findings: unknown[] };

  assert.match(pruned.stdout, /Pruned 1 stale finding/);
  assert.equal(baseline.findings.length, 0);
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
