import * as assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { promisify } from "node:util";
import { scanSource } from "./scanner.js";

const execFileAsync = promisify(execFile);
const chromePath = process.env.CHROME_PATH
  ?? process.env.PUPPETEER_EXECUTABLE_PATH
  ?? (existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome") ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined);

test("WCAG benchmark fixture exercises every product static ClearDOM rule", async () => {
  const source = await fs.readFile(path.resolve("examples/wcag-benchmark/Fixture.tsx"), "utf8");
  const findings = scanSource(source, "examples/wcag-benchmark/Fixture.tsx");
  const ruleIds = new Set(findings.map((finding) => finding.ruleId));

  const expectedRuleIds = [
    "CDOM_4_1_2_UNNAMED_CONTROL",
    "CDOM_4_1_2_NATIVE_LABEL",
    "CDOM_2_4_4_AMBIGUOUS_LABEL",
    "CDOM_3_3_2_PLACEHOLDER_LABEL",
    "CDOM_1_1_1_IMAGE_ALT",
    "CDOM_4_1_2_ANCHOR_HREF",
    "CDOM_2_1_1_KEYBOARD",
    "CDOM_1_3_1_HEADING_ORDER",
    "CDOM_4_1_2_NATIVE_ROLE",
    "CDOM_4_1_2_FORM_LABEL",
    "CDOM_3_1_1_DOCUMENT_METADATA",
    "CDOM_1_3_5_AUTOCOMPLETE",
    "CDOM_2_5_3_LABEL_IN_NAME",
    "CDOM_4_1_3_STATUS_LIVE_REGION",
    "CDOM_1_2_1_MEDIA_ALTERNATIVE",
    "CDOM_4_1_2_ARIA_HIDDEN_FOCUS",
    "CDOM_4_1_2_DUPLICATE_ID",
    "CDOM_2_4_3_POSITIVE_TABINDEX",
    "CDOM_1_3_1_FIELDSET_LEGEND",
    "CDOM_3_3_1_ERROR_DESCRIPTION",
    "CDOM_2_5_2_POINTER_CANCELLATION",
    "CDOM_1_4_1_USE_OF_COLOR",
    "CDOM_1_3_3_SENSORY_INSTRUCTIONS",
    "CDOM_3_1_2_LANGUAGE_OF_PARTS",
    "CDOM_3_2_1_CONTEXT_CHANGE",
    "CDOM_1_4_2_AUDIO_CONTROL",
    "CDOM_1_3_4_ORIENTATION",
    "CDOM_1_2_4_LIVE_CAPTIONS",
    "CDOM_1_3_2_MEANINGFUL_SEQUENCE",
    "CDOM_1_4_4_RESIZE_TEXT",
    "CDOM_1_4_5_IMAGES_OF_TEXT",
    "CDOM_1_4_11_NON_TEXT_CONTRAST",
    "CDOM_2_1_4_CHARACTER_KEY_SHORTCUTS",
    "CDOM_2_2_1_TIMING_ADJUSTABLE",
    "CDOM_2_2_2_PAUSE_STOP_HIDE",
    "CDOM_2_3_1_FLASHING_CONTENT",
    "CDOM_2_4_5_MULTIPLE_WAYS",
    "CDOM_2_5_1_POINTER_GESTURES",
    "CDOM_2_5_4_MOTION_ACTUATION",
    "CDOM_2_5_7_DRAGGING_MOVEMENTS",
    "CDOM_3_2_3_CONSISTENT_NAVIGATION",
    "CDOM_3_2_4_CONSISTENT_IDENTIFICATION",
    "CDOM_3_2_6_CONSISTENT_HELP",
    "CDOM_3_3_4_ERROR_PREVENTION_LEGAL_FINANCIAL_DATA",
    "CDOM_3_3_7_REDUNDANT_ENTRY",
    "CDOM_3_3_8_ACCESSIBLE_AUTHENTICATION"
  ];

  assert.deepEqual([...ruleIds].sort(), expectedRuleIds.sort());
});

test("WCAG false-positive fixture has no ClearDOM findings", async () => {
  const source = await fs.readFile(path.resolve("examples/wcag-benchmark/FalsePositiveFixture.tsx"), "utf8");
  const findings = scanSource(source, "examples/wcag-benchmark/FalsePositiveFixture.tsx");

  assert.deepEqual(findings, []);
});

test("WCAG benchmark manifest covers every WCAG 2.2 A/AA criterion", async () => {
  const manifest = JSON.parse(await fs.readFile(path.resolve("examples/wcag-benchmark/manifest.json"), "utf8")) as { criteria: Array<{ id: string; detection: string[] }> };
  const ids = manifest.criteria.map((criterion) => criterion.id);

  assert.deepEqual(ids, [
    "1.1.1",
    "1.2.1",
    "1.2.2",
    "1.2.3",
    "1.2.4",
    "1.2.5",
    "1.3.1",
    "1.3.2",
    "1.3.3",
    "1.3.4",
    "1.3.5",
    "1.4.1",
    "1.4.2",
    "1.4.3",
    "1.4.4",
    "1.4.5",
    "1.4.10",
    "1.4.11",
    "1.4.12",
    "1.4.13",
    "2.1.1",
    "2.1.2",
    "2.1.4",
    "2.2.1",
    "2.2.2",
    "2.3.1",
    "2.4.1",
    "2.4.2",
    "2.4.3",
    "2.4.4",
    "2.4.5",
    "2.4.6",
    "2.4.7",
    "2.4.11",
    "2.5.1",
    "2.5.2",
    "2.5.3",
    "2.5.4",
    "2.5.7",
    "2.5.8",
    "3.1.1",
    "3.1.2",
    "3.2.1",
    "3.2.2",
    "3.2.3",
    "3.2.4",
    "3.2.6",
    "3.3.1",
    "3.3.2",
    "3.3.3",
    "3.3.4",
    "3.3.7",
    "3.3.8",
    "4.1.2",
    "4.1.3"
  ]);

  for (const id of ["1.4.12", "1.4.13", "2.1.2", "2.4.11", "4.1.2"]) {
    assert.equal(manifest.criteria.find((criterion) => criterion.id === id)?.detection.includes("cleardom-runtime"), true);
  }

  for (const id of ["1.2.4", "1.3.2", "1.4.4", "1.4.5", "1.4.11", "2.4.5", "3.2.6", "3.3.8"]) {
    assert.equal(manifest.criteria.find((criterion) => criterion.id === id)?.detection.includes("cleardom-static"), true);
  }
});

test("WCAG benchmark fixture renders every manifest case", async () => {
  const manifest = JSON.parse(await fs.readFile(path.resolve("examples/wcag-benchmark/manifest.json"), "utf8")) as { criteria: Array<{ id: string; detection: string[] }> };
  const html = await fs.readFile(path.resolve("examples/wcag-benchmark/index.html"), "utf8");
  const renderedCaseIds = [...html.matchAll(/data-case="([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(renderedCaseIds.sort((left, right) => left.localeCompare(right, undefined, { numeric: true })), manifest.criteria.map((criterion) => criterion.id));

  for (const criterion of manifest.criteria) {
    assert.ok(criterion.detection.length > 0, `${criterion.id} should list at least one detection bucket`);
    assert.ok(
      criterion.detection.every((bucket) => ["cleardom-static", "cleardom-runtime", "axe", "pa11y", "manual"].includes(bucket)),
      `${criterion.id} has an unknown detection bucket`
    );
    assert.equal(criterion.detection.includes("cleardom"), false, `${criterion.id} should use split ClearDOM detector buckets`);
  }
});

test("benchmark runner writes a GitHub Markdown report", async () => {
  const script = await fs.readFile(path.resolve("scripts/benchmark.mjs"), "utf8");
  const worker = await fs.readFile(path.resolve("scripts/benchmark-worker.mjs"), "utf8");

  assert.doesNotMatch(script, /tylor\.nz/);
  assert.match(script, /const useLocal = cliOptions\.local \|\| !cliOptions\.url/);
  assert.match(script, /benchmark-report\.md/);
  assert.match(script, /wcag-coverage-tracker\.md/);
  assert.match(script, /renderMarkdown/);
  assert.match(script, /buildCoverageTracker/);
  assert.match(script, /cleardom-static/);
  assert.match(script, /cleardom-runtime/);
  assert.match(script, /Missed Detector Expectations/);
  assert.match(script, /WCAG Coverage Matrix/);
  assert.match(worker, /auditRuntimeUrl\(url, scanOptions, chromePath\)/);
  assert.doesNotMatch(worker, /scanPath\(sourceDir,[\s\S]*runtimeUrl/);
});

test("benchmark runtime worker audits the exact offensive and clean URLs", { skip: chromePath === undefined }, async () => {
  const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "cleardom-benchmark-worker-"));
  const server = http.createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(benchmarkWorkerPage(request.url !== "/false-positive.html"));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const offensive = await runBenchmarkWorker(baseUrl, sourceDir);
    const clean = await runBenchmarkWorker(`${baseUrl}/false-positive.html`, sourceDir);

    assert.equal(offensive.ok, true);
    assert.equal(offensive.findings.some((finding) => finding.id === "CDOM_4_1_2_ARIA_STATE"), true);
    assert.equal(clean.ok, true);
    assert.deepEqual(clean.findings, []);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(sourceDir, { recursive: true, force: true });
  }
});

async function runBenchmarkWorker(url: string, sourceDir: string): Promise<{ ok: boolean; findings: Array<{ id: string }> }> {
  const { stdout } = await execFileAsync(process.execPath, [
    path.resolve("scripts/benchmark-worker.mjs"),
    "cleardom-runtime",
    JSON.stringify({ url, sourceDir, chromePath })
  ]);
  return JSON.parse(stdout) as { ok: boolean; findings: Array<{ id: string }> };
}

function benchmarkWorkerPage(offensive: boolean): string {
  return `<!doctype html><html lang="en"><head><title>Benchmark worker</title><style>
    body { color: #111; background: #fff; font-family: Arial, sans-serif; }
    a, [role="checkbox"] { display: inline-flex; min-width: 32px; min-height: 32px; align-items: center; }
    a:focus, [role="checkbox"]:focus { outline: 3px solid #111; }
  </style></head><body>
    <a href="#main">Skip to content</a>
    <main id="main"><div role="checkbox" aria-checked="${offensive ? "undefined" : "false"}">Email updates</div></main>
  </body></html>`;
}
