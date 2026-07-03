import { execFile } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import http from "node:http";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { rules } from "../dist/rules/index.js";
import { wcag22Criteria } from "../dist/standards.js";

const execFileAsync = promisify(execFile);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const siteDir = resolve(root, "examples/wcag-benchmark");
const fixtureSourcePath = resolve(siteDir, "Fixture.tsx");
const falsePositiveFixturePath = resolve(siteDir, "FalsePositiveFixture.tsx");
const manifestPath = resolve(siteDir, "manifest.json");
const reportDir = resolve(siteDir, "reports");
const emptySourceDir = resolve(reportDir, "empty-source");
const reportPath = resolve(reportDir, "benchmark-report.html");
const jsonPath = resolve(reportDir, "benchmark-report.json");
const markdownPath = resolve(reportDir, "benchmark-report.md");
const trackerPath = resolve(reportDir, "wcag-coverage-tracker.md");
const workerPath = resolve(root, "scripts/benchmark-worker.mjs");
const chromePath = findChromePath();
const cliOptions = parseArgs(process.argv.slice(2).filter((arg) => arg !== "--"));
const workerTimeoutMs = 90_000;

await fs.mkdir(reportDir, { recursive: true });
await fs.mkdir(emptySourceDir, { recursive: true });

const useLocal = cliOptions.local || !cliOptions.url;
const server = useLocal ? await startStaticServer(siteDir) : null;
const localUrl = server ? `http://127.0.0.1:${server.port}` : null;
const url = cliOptions.url ?? localUrl;
if (!url) {
  throw new Error("Benchmark URL could not be resolved. Use --url for live-site mode.");
}
const falsePositiveUrl = cliOptions.falsePositiveUrl ?? (localUrl ? `${localUrl}/false-positive.html` : `${url}/false-positive.html`);
const localFalsePositiveUrl = localUrl ? `${localUrl}/false-positive.html` : falsePositiveUrl;
const liveMode = !useLocal;

try {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const tools = [
    ...(useLocal ? [{
      id: "cleardom-static",
      label: "ClearDOM Static",
      input: fixtureSourcePath,
      sourcePath: fixtureSourcePath,
      falsePositiveSourcePath: falsePositiveFixturePath,
      detectorIds: ["cleardom-static"]
    }] : []),
    { id: "cleardom-runtime", label: "ClearDOM Runtime", input: url, detectorIds: ["cleardom-runtime"] },
    { id: "axe", label: "Axe", input: url, detectorIds: ["axe"] },
    { id: "pa11y", label: "pa11y", input: url, detectorIds: ["pa11y"] }
  ];

  const results = [];
  for (const tool of tools) {
    process.stdout.write(`Running ${tool.label}...\n`);
    results.push(await runMeasured(tool, {
      url,
      sourcePath: tool.sourcePath,
      sourceDir: emptySourceDir,
      chromePath
    }));
  }

  const falsePositiveResults = [];
  for (const tool of tools) {
    process.stdout.write(`Running ${tool.label} false-positive benchmark...\n`);
    falsePositiveResults.push(await runMeasured(tool, {
      url: falsePositiveUrl,
      sourcePath: tool.falsePositiveSourcePath,
      sourceDir: emptySourceDir,
      chromePath,
      includeReviewCandidates: false
    }));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    url,
    mode: liveMode ? "live" : "fixture",
    falsePositiveUrl: liveMode ? localFalsePositiveUrl : falsePositiveUrl,
    fixturePath: useLocal ? fixtureSourcePath : null,
    falsePositiveFixturePath,
    chromePath,
    manifest: {
      standard: manifest.standard,
      criteriaCount: manifest.criteria.length
    },
    results,
    falsePositiveResults
  };

  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await fs.writeFile(reportPath, renderHtml(report, manifest), "utf8");
  await fs.writeFile(markdownPath, renderMarkdown(report, manifest), "utf8");
  await fs.writeFile(trackerPath, renderCoverageTrackerMarkdown(manifest), "utf8");

  process.stdout.write(`\nBenchmark mode: ${report.mode} (${report.url})\n`);
  process.stdout.write(`Benchmark report written to ${reportPath}\n`);
  process.stdout.write(`GitHub Markdown report written to ${markdownPath}\n`);
  process.stdout.write(`WCAG coverage tracker written to ${trackerPath}\n`);
  process.stdout.write(`Raw JSON written to ${jsonPath}\n`);
} finally {
  if (server) {
    await server.close();
  }
}

async function runMeasured(tool, options) {
  const startedAt = performance.now();
  const child = execFile(process.execPath, [workerPath, tool.id, JSON.stringify(options)], {
    cwd: root,
    env: {
      ...process.env,
      ...(options.chromePath ? { CHROME_PATH: options.chromePath } : {})
    },
    maxBuffer: 1024 * 1024 * 20
  });

  let peakRssKb = 0;
  let timedOut = false;
  const timeout = setTimeout(async () => {
    timedOut = true;
    await killProcessTree(child.pid);
  }, workerTimeoutMs);
  const sampler = setInterval(async () => {
    peakRssKb = Math.max(peakRssKb, await processTreeRssKb(child.pid));
  }, 250);

  try {
    const { stdout, stderr } = await childResult(child);
    peakRssKb = Math.max(peakRssKb, await processTreeRssKb(child.pid));
    const durationMs = performance.now() - startedAt;
    const parsed = timedOut
      ? { ok: false, error: `${tool.label} exceeded ${formatMs(workerTimeoutMs)} timeout`, findings: [] }
      : parseWorkerJson(stdout);

    return {
      ...tool,
      ok: parsed.ok === true,
      durationMs,
      peakRssMb: peakRssKb > 0 ? peakRssKb / 1024 : null,
      findings: parsed.findings ?? [],
      rawSummary: parsed.rawSummary ?? {},
      error: parsed.error,
      stderr: stderr.trim()
    };
  } catch (error) {
    const durationMs = performance.now() - startedAt;
    return {
      ...tool,
      ok: false,
      durationMs,
      peakRssMb: peakRssKb > 0 ? peakRssKb / 1024 : null,
      findings: [],
      rawSummary: {},
      error: error instanceof Error ? error.message : String(error),
      stderr: ""
    };
  } finally {
    clearTimeout(timeout);
    clearInterval(sampler);
  }
}

function childResult(child) {
  return new Promise((resolvePromise, rejectPromise) => {
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", rejectPromise);
    child.on("close", () => {
      resolvePromise({ stdout, stderr });
    });
  });
}

function parseWorkerJson(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return { ok: false, error: "Worker produced no JSON output", findings: [] };
  try {
    return JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "Worker produced invalid JSON output", findings: [], rawOutput: trimmed };
  }
}

async function processTreeRssKb(rootPid) {
  if (!rootPid) return 0;
  try {
    const rows = await processRows();
    const children = new Map();
    for (const row of rows) {
      if (!children.has(row.ppid)) children.set(row.ppid, []);
      children.get(row.ppid).push(row);
    }

    let total = 0;
    const stack = [rootPid];
    while (stack.length > 0) {
      const pid = stack.pop();
      const row = rows.find((candidate) => candidate.pid === pid);
      if (row) total += row.rss;
      for (const child of children.get(pid) ?? []) stack.push(child.pid);
    }
    return total;
  } catch {
    return 0;
  }
}

async function killProcessTree(rootPid) {
  if (!rootPid) return;
  try {
    const rows = await processRows();
    const children = new Map();
    for (const row of rows) {
      if (!children.has(row.ppid)) children.set(row.ppid, []);
      children.get(row.ppid).push(row);
    }
    const pids = [];
    const stack = [rootPid];
    while (stack.length > 0) {
      const pid = stack.pop();
      pids.push(pid);
      for (const child of children.get(pid) ?? []) stack.push(child.pid);
    }
    for (const pid of pids.reverse()) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // Process already exited.
      }
    }
  } catch {
    try {
      process.kill(rootPid, "SIGTERM");
    } catch {
      // Process already exited.
    }
  }
}

async function processRows() {
  const { stdout } = await execFileAsync("ps", ["-axo", "pid=,ppid=,rss="]);
  return stdout.trim().split("\n").map((line) => {
    const [pid, ppid, rss] = line.trim().split(/\s+/).map(Number);
    return { pid, ppid, rss };
  });
}

async function startStaticServer(directory) {
  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
    const filePath = resolve(directory, `.${decodeURIComponent(pathname)}`);

    if (!filePath.startsWith(directory)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    try {
      const body = await fs.readFile(filePath);
      response.writeHead(200, { "content-type": contentType(filePath) });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });

  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  return {
    port: server.address().port,
    close: () => new Promise((resolvePromise) => server.close(resolvePromise))
  };
}

function contentType(filePath) {
  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4"
  }[extname(filePath)] ?? "application/octet-stream";
}

function findChromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ];
  return candidates.find((candidate) => fileExists(candidate));
}

function fileExists(path) {
  return existsSync(path);
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--local") {
      options.local = true;
      continue;
    }
    if (value === "--url") {
      const url = args[index + 1];
      if (!url || url.startsWith("--")) {
        throw new Error("--url requires an http:// or https:// URL");
      }
      options.url = normalizeLiveUrl(url);
      index += 1;
      continue;
    }
    if (value.startsWith("--url=")) {
      options.url = normalizeLiveUrl(value.slice("--url=".length));
      continue;
    }
    throw new Error(`Unknown benchmark option: ${value}`);
  }
  return options;
}

function normalizeLiveUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Live benchmark URLs must use http:// or https://");
    }
    return url.toString();
  } catch (error) {
    if (error instanceof Error && error.message.includes("http")) throw error;
    throw new Error(`Invalid --url value: ${value}`);
  }
}

function renderHtml(report, manifest) {
  const totals = report.results.map((result) => ({
    ...result,
    reportedCriteria: criteriaCovered(result.findings),
    criteria: criteriaCovered(result.findings)
  }));
  const falsePositiveTotals = (report.falsePositiveResults ?? []).map((result) => ({
    ...result,
    criteria: criteriaCovered(result.findings)
  }));
  const maxFindings = Math.max(1, ...totals.map((result) => result.findings.length));
  const maxFalsePositives = Math.max(1, ...falsePositiveTotals.map((result) => result.findings.length));
  const detectionSummary = summarizeDetection(manifest);
  const coverageRows = buildCoverageRows(totals, manifest);
  const wcagCoverageCharts = buildWcagCoverageCharts(totals, manifest);
  const uniqueRows = buildUniqueCoverage(totals);
  const toolSummaries = buildToolSummaries(totals, manifest);
  const tracker = buildCoverageTracker(manifest);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Accessibility Benchmark Report</title>
    <style>
      :root { font-family: Inter, system-ui, sans-serif; color: #202124; background: #f6f6f3; }
      body { margin: 0; }
      main { max-width: 1180px; margin: 0 auto; padding: 32px 20px 56px; }
      h1, h2, h3 { line-height: 1.1; }
      h1 { margin-bottom: 8px; }
      h2 { margin: 0 0 12px; }
      h3 { margin: 0; }
      .lede { max-width: 820px; font-size: 1.04rem; }
      .summary, .takeaways { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: 24px 0; }
      .card, table, .panel, .callout { background: #fff; border: 1px solid #d6d6d0; border-radius: 6px; }
      .card, .callout { padding: 16px; }
      .card header { display: flex; justify-content: space-between; gap: 12px; align-items: start; margin-bottom: 12px; }
      .metric { font-size: 32px; font-weight: 750; margin: 4px 0; }
      .metric-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 14px 0; }
      .mini { border-top: 1px solid #ecece8; padding-top: 8px; }
      .mini strong { display: block; font-size: 1.1rem; }
      .muted { color: #62625f; }
      .small { font-size: 0.9rem; }
      .status { display: inline-block; padding: 3px 8px; border-radius: 999px; background: #e7f3ec; }
      table { width: 100%; border-collapse: collapse; overflow: hidden; }
      th, td { padding: 10px 12px; border-bottom: 1px solid #e4e4df; text-align: left; vertical-align: top; }
      th { background: #eeeeea; font-size: 0.9rem; }
      .bar { height: 10px; background: #d8d8d2; border-radius: 999px; overflow: hidden; }
      .bar span { display: block; height: 100%; background: #28666e; }
      .wcag-charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
      .wcag-chart { border: 1px solid #e0e0da; border-radius: 6px; padding: 14px; background: #fbfbf9; }
      .wcag-chart h3 { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; margin-bottom: 12px; }
      .coverage-bar { display: grid; grid-template-columns: minmax(72px, 0.8fr) minmax(120px, 1.8fr) auto; gap: 10px; align-items: center; margin: 10px 0; }
      .coverage-bar .bar { height: 14px; }
      .coverage-bar .bar span { background: #28666e; }
      .coverage-count { color: #62625f; font-size: 0.88rem; white-space: nowrap; }
      .fp-zero { color: #17613a; font-weight: 700; }
      .fp-count { color: #a30018; font-weight: 700; }
      .ok { color: #17613a; font-weight: 700; }
      .fail { color: #a30018; font-weight: 700; }
      .partial { color: #7a4b00; font-weight: 700; }
      .panel { padding: 16px; margin-top: 20px; }
      .table-wrap { overflow-x: auto; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em; }
      details { margin: 8px 0; }
      summary { cursor: pointer; font-weight: 700; }
      .finding { padding: 10px 0; border-top: 1px solid #ecece8; }
      .chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .chip { display: inline-block; padding: 3px 8px; border-radius: 999px; background: #ecece8; font-size: 0.85em; }
      .chip.static { background: #dff0ef; }
      .chip.runtime { background: #f4e7c4; }
      .chip.manual { background: #eadfec; }
      .coverage { white-space: nowrap; }
      .finding-group { border-top: 1px solid #ecece8; padding: 10px 0; }
      .finding-list { margin: 8px 0 0; padding-left: 18px; }
      .finding-list li { margin: 5px 0; }
    </style>
  </head>
  <body>
    <main>
      <h1>Accessibility Benchmark Report</h1>
          <p class="lede muted">${report.mode === "live" ? `Live-site ${escapeHtml(manifest.standard)} scanner comparison.` : `A deliberately broken ${escapeHtml(manifest.standard)} fixture served over HTTP, with ClearDOM static checks run against the benchmark source file.`}</p>
      <p class="muted small">Generated ${escapeHtml(new Date(report.generatedAt).toLocaleString())} against <code>${escapeHtml(report.url)}</code>. ${report.fixturePath ? `Static fixture: <code>${escapeHtml(report.fixturePath)}</code>. ` : ""}${manifest.criteria.length} WCAG benchmark criteria.</p>

      <section class="takeaways">
        <article class="callout">
          <h2>At A Glance</h2>
          <p>The benchmark covers <strong>${manifest.criteria.length}</strong> WCAG A/AA criteria. The headline comparison is total WCAG fixture coverage: a criterion is covered when the tool reports at least one mapped finding for it.</p>
        </article>
        <article class="callout">
          <h2>How To Read It</h2>
          <p>WCAG coverage shows how much of the total benchmark surface each tool gets credit for. Finding count is only volume.</p>
        </article>
        <article class="callout">
          <h2>Important Caveat</h2>
          <p>More findings does not mean better coverage. Manual-only scenarios remain in the denominator because they are part of WCAG coverage.</p>
        </article>
      </section>

      <section class="summary">
        ${toolSummaries.map((summary) => `
          <article class="card">
            <header>
              <h2>${escapeHtml(summary.label)}</h2>
              <span class="status ${summary.ok ? "ok" : "fail"}">${summary.ok ? "Completed" : "Failed"}</span>
            </header>
            <p class="metric">${summary.coverageLabel}</p>
            <p class="muted">WCAG criteria covered across the benchmark</p>
            <div class="metric-row">
              <div class="mini"><strong>${summary.coveragePercent}%</strong><span class="muted small">total coverage</span></div>
              <div class="mini"><strong>${summary.findings}</strong><span class="muted small">findings</span></div>
              <div class="mini"><strong>${formatMs(summary.durationMs)}</strong><span class="muted small">runtime</span></div>
            </div>
            <div class="bar"><span style="width:${summary.coveragePercent}%"></span></div>
            <p class="muted small">${summary.expectedDetectorLabel} criteria matched the detector expectations in the manifest. Peak memory: ${formatMb(summary.peakRssMb)}.</p>
          </article>
        `).join("")}
      </section>

      <section class="panel">
        <h2>Detection Buckets</h2>
        <p class="muted">The manifest labels each scenario by the kind of review expected to catch it.</p>
        <div class="chips">
          <span class="chip static">ClearDOM static: ${detectionSummary.cleardomStatic}</span>
          <span class="chip runtime">ClearDOM runtime: ${detectionSummary.cleardomRuntime}</span>
          <span class="chip runtime">Browser runtime: ${detectionSummary.runtime}</span>
          <span class="chip manual">Manual review: ${detectionSummary.manual}</span>
        </div>
      </section>

      <section class="panel">
        <h2>WCAG Tracker</h2>
        <p class="muted">WCAG 2.2 has ${tracker.totalCriteria} success criteria across A, AA, and AAA. The benchmark fixture currently covers ${tracker.benchmarkCriteria} criteria; ClearDOM rules map to ${tracker.cleardomCriteria} criteria.</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Criterion</th>
                <th>Level</th>
                <th>Title</th>
                <th>Benchmark</th>
                <th>ClearDOM Rules</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${tracker.rows.map((row) => `
                <tr>
                  <td><strong>${escapeHtml(row.criterion)}</strong></td>
                  <td>${row.level.toUpperCase()}</td>
                  <td>${escapeHtml(row.title)}</td>
                  <td>${row.benchmark ? escapeHtml(row.detectors.join(", ")) : "-"}</td>
                  <td>${row.ruleIds.length === 0 ? "-" : row.ruleIds.map(escapeHtml).join(", ")}</td>
                  <td class="${row.status === "missing" ? "fail" : row.status === "manual-only" ? "partial" : "ok"}">${escapeHtml(row.statusLabel)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <h2>Tool Comparison</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tool</th>
                <th>Findings</th>
                <th>WCAG Coverage</th>
                <th>Expected Detector Hits</th>
                <th>Time</th>
                <th>Peak Memory</th>
              </tr>
            </thead>
            <tbody>
              ${toolSummaries.map((summary) => `
                <tr>
                  <td>${escapeHtml(summary.label)}</td>
                  <td><div>${summary.findings}</div><div class="bar"><span style="width:${Math.round((summary.findings / maxFindings) * 100)}%"></span></div></td>
                  <td>${summary.coverageLabel}</td>
                  <td>${summary.expectedDetectorLabel}</td>
                  <td>${formatMs(summary.durationMs)}</td>
                  <td>${formatMb(summary.peakRssMb)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <h2>WCAG Standard Coverage</h2>
        <p class="muted">Each bar uses the same denominator: total benchmark criteria in that WCAG principle. The filled portion shows how many criteria the tool reported.</p>
        <div class="wcag-charts">
          ${wcagCoverageCharts.map((group) => `
            <article class="wcag-chart">
              <h3>
                <span>${escapeHtml(group.label)}</span>
                <span class="muted small">${group.criteriaTotal} criteria</span>
              </h3>
              ${group.tools.map((tool) => `
                <div class="coverage-bar">
                  <strong>${escapeHtml(tool.label)}</strong>
                  <div class="bar" aria-label="${escapeHtml(`${tool.label} reported ${tool.caught} of ${group.criteriaTotal} ${group.label} criteria`)}"><span style="width:${tool.percent}%"></span></div>
                  <span class="coverage-count">${tool.caught}/${group.criteriaTotal}</span>
                </div>
              `).join("")}
            </article>
          `).join("")}
        </div>
      </section>

      <section class="panel">
        <h2>False Positive Benchmark</h2>
        <p class="muted">Each tool also runs against a clean accessible fixture. Only reported violations are counted as false positive candidates; informational notices and review-only candidates are excluded.</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tool</th>
                <th>False Positive Candidates</th>
                <th>Clean Criteria Reported</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${falsePositiveTotals.map((result) => `
                <tr>
                  <td>${escapeHtml(result.label)}</td>
                  <td>
                    <div class="${result.findings.length === 0 ? "fp-zero" : "fp-count"}">${result.findings.length}</div>
                    <div class="bar"><span style="width:${Math.round((result.findings.length / maxFalsePositives) * 100)}%"></span></div>
                  </td>
                  <td>${result.criteria.length === 0 ? "None" : result.criteria.map(escapeHtml).join(", ")}</td>
                  <td>${result.findings.length === 0 ? `<span class="ok">Clean</span>` : `<span class="fail">Review</span>`}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        <p class="muted small">Clean fixture: <code>${escapeHtml(report.falsePositiveUrl ?? "")}</code></p>
      </section>

      <section class="panel">
        <h2>Observed WCAG Coverage</h2>
        <p class="muted">Rows show manifest expectations and whether each tool produced at least one credited finding mapped to that criterion. Manual-only criteria do not count as automated coverage.</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Criterion</th>
                <th>Expected</th>
                ${totals.map((result) => `<th>${escapeHtml(result.label)}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${coverageRows.map((row) => `
                <tr>
                  <td><strong>${escapeHtml(row.id)}</strong><div class="muted small">${escapeHtml(row.title)}</div></td>
                  <td><div class="chips">${row.expected.map((value) => `<span class="chip ${bucketClass(value)}">${escapeHtml(value)}</span>`).join("")}</div></td>
                  ${totals.map((result) => `<td class="coverage ${row.observed[result.id] ? "ok" : "muted"}">${row.observed[result.id] ? "Seen" : "-"}</td>`).join("")}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <h2>Unique Criteria Seen</h2>
        <table>
          <thead>
            <tr>
              <th>Tool</th>
              <th>Criteria only this tool reported</th>
            </tr>
          </thead>
          <tbody>
            ${uniqueRows.map((row) => `
              <tr>
                <td>${escapeHtml(row.label)}</td>
                <td>${row.criteria.length === 0 ? "None" : row.criteria.map(escapeHtml).join(", ")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>

      <section class="panel">
        <h2>Finding Details</h2>
        <p class="muted">Collapsed by default so the report stays scannable. Open a tool to inspect normalized findings.</p>
        ${totals.map((result) => `
          <details class="finding-group">
            <summary>${escapeHtml(result.label)} findings (${result.findings.length})</summary>
            ${result.stderr ? `<p class="muted"><code>${escapeHtml(result.stderr)}</code></p>` : ""}
            ${result.findings.length === 0 ? `<p class="muted">${result.ok ? "No findings reported." : "No findings available because the runner failed."}</p>` : ""}
            ${renderFindingGroups(result.findings)}
          </details>
        `).join("")}
      </section>
    </main>
  </body>
</html>`;
}

function renderMarkdown(report, manifest) {
  const totals = report.results.map((result) => ({
    ...result,
    reportedCriteria: criteriaCovered(result.findings),
    criteria: criteriaCovered(result.findings)
  }));
  const falsePositiveTotals = (report.falsePositiveResults ?? []).map((result) => ({
    ...result,
    criteria: criteriaCovered(result.findings)
  }));
  const toolSummaries = buildToolSummaries(totals, manifest);
  const detectionSummary = summarizeDetection(manifest);
  const coverageRows = buildCoverageRows(totals, manifest);
  const uniqueRows = buildUniqueCoverage(totals);
  const missedRows = buildMissedExpectedRows(totals, manifest);
  const tracker = buildCoverageTracker(manifest);
  const generatedAt = new Date(report.generatedAt).toISOString();

  return [
    "# Accessibility Benchmark Report",
    "",
    `Generated: ${generatedAt}`,
    `Mode: ${report.mode}`,
    `Target: ${report.url}`,
    report.fixturePath ? `Static fixture: ${report.fixturePath}` : null,
    `Standard: ${manifest.standard}`,
    `Criteria covered by fixture: ${manifest.criteria.length}`,
    "",
    "## Summary",
    "",
    "WCAG coverage uses the full fixture denominator. A criterion is covered when the tool reports at least one mapped finding for it. Manual-only cases stay in the denominator because they are part of WCAG.",
    "",
    markdownTable(
        ["Tool", "Status", "Findings", "WCAG Coverage", "Expected Detector Hits", "Time", "Peak RSS"],
      toolSummaries.map((summary) => [
        summary.label,
        summary.ok ? "Completed" : "Failed",
        summary.findings,
        summary.coverageLabel,
        summary.expectedDetectorLabel,
        formatMs(summary.durationMs),
        formatMb(summary.peakRssMb)
      ])
    ),
    "",
    "## Detection Buckets",
    "",
    markdownTable(
      ["Bucket", "Criteria"],
      [
        ["ClearDOM static", detectionSummary.cleardomStatic],
        ["ClearDOM runtime", detectionSummary.cleardomRuntime],
        ["Browser runtime", detectionSummary.runtime],
        ["Manual review", detectionSummary.manual]
      ]
    ),
    "",
    "## WCAG Tracker Summary",
    "",
    `WCAG 2.2 has ${tracker.totalCriteria} success criteria across A, AA, and AAA. WCAG 2.2 A/AA has ${tracker.aAndAaCriteria}; AAA adds ${tracker.aaaCriteria}.`,
    "",
    markdownTable(
      ["Tracked Surface", "Criteria"],
      [
        ["Benchmark fixture cases", tracker.benchmarkCriteria],
        ["Criteria mapped by ClearDOM rules", tracker.cleardomCriteria],
        ["Criteria with no ClearDOM rule", tracker.missingCleardomCriteria],
        ["AAA criteria in tracker", tracker.aaaCriteria]
      ]
    ),
    "",
    "Full tracker: `examples/wcag-benchmark/reports/wcag-coverage-tracker.md`.",
    "",
    "## False Positive Benchmark",
    "",
    `Clean fixture: ${report.falsePositiveUrl ?? "n/a"}`,
    "",
    markdownTable(
      ["Tool", "False Positive Candidates", "Clean Criteria Reported", "Status"],
      falsePositiveTotals.map((result) => [
        result.label,
        result.findings.length,
        result.criteria.length === 0 ? "None" : result.criteria.join(", "),
        result.findings.length === 0 ? "Clean" : "Review"
      ])
    ),
    "",
    "## WCAG Coverage Matrix",
    "",
    markdownTable(
      ["Criterion", "Title", "Expected", ...totals.map((result) => result.label)],
      coverageRows.map((row) => [
        row.id,
        row.title,
        row.expected.join(", "),
        ...totals.map((result) => row.observed[result.id] ? "Seen" : "-")
      ])
    ),
    "",
    "## Missed Detector Expectations",
    "",
    missedRows.length === 0
      ? "Every automated tool reported every criterion it was expected to detect."
      : markdownTable(
        ["Criterion", "Title", "Tool", "Expected Detectors"],
        missedRows.map((row) => [row.id, row.title, row.toolLabel, row.expected.join(", ")])
      ),
    "",
    "## Unique Criteria Seen",
    "",
    markdownTable(
      ["Tool", "Criteria only this tool reported"],
      uniqueRows.map((row) => [row.label, row.criteria.length === 0 ? "None" : row.criteria.join(", ")])
    ),
    "",
    "## Finding Details",
    "",
    ...totals.flatMap((result) => renderMarkdownFindingSection(result)),
    ""
  ].join("\n");
}

function renderCoverageTrackerMarkdown(manifest) {
  const tracker = buildCoverageTracker(manifest);

  return [
    "# WCAG 2.2 Coverage Tracker",
    "",
    "This tracker separates the full WCAG 2.2 success-criteria universe from the benchmark fixture and ClearDOM's implemented rule mappings.",
    "",
    markdownTable(
      ["Metric", "Count"],
      [
        ["WCAG 2.2 total success criteria", tracker.totalCriteria],
        ["WCAG 2.2 Level A + AA criteria", tracker.aAndAaCriteria],
        ["WCAG 2.2 Level AAA criteria", tracker.aaaCriteria],
        ["Benchmark fixture cases", tracker.benchmarkCriteria],
        ["Criteria mapped by ClearDOM rules", tracker.cleardomCriteria],
        ["Criteria with no ClearDOM rule", tracker.missingCleardomCriteria]
      ]
    ),
    "",
    "## Tracker",
    "",
    markdownTable(
      ["Criterion", "Level", "Title", "Benchmark", "Detectors", "ClearDOM Rules", "Status"],
      tracker.rows.map((row) => [
        row.criterion,
        row.level.toUpperCase(),
        row.title,
        row.benchmark ? "Yes" : "No",
        row.detectors.length === 0 ? "-" : row.detectors.join(", "),
        row.ruleIds.length === 0 ? "-" : row.ruleIds.join(", "),
        row.statusLabel
      ])
    ),
    ""
  ].join("\n");
}

function buildToolSummaries(results, manifest) {
  const manifestIds = new Set((manifest.criteria ?? []).map((criterion) => criterion.id));
  const manifestCriteriaTotal = manifestIds.size;
  return results.map((result) => {
    const observedManifest = result.criteria.filter((criterion) => manifestIds.has(criterion));
    const detectorIds = result.detectorIds ?? [result.id];
    const expectedCriteria = (manifest.criteria ?? [])
      .filter((criterion) => (criterion.detection ?? []).some((detector) => detectorIds.includes(detector)))
      .map((criterion) => criterion.id);
    const observedExpected = observedManifest.filter((criterion) => expectedCriteria.includes(criterion));

    return {
      ...result,
      findings: result.findings.length,
      observedManifestCriteria: observedManifest.length,
      observedExpectedCriteria: observedExpected.length,
      expectedCriteriaTotal: expectedCriteria.length,
      manifestCriteriaTotal,
      coverageLabel: `${observedManifest.length}/${manifestCriteriaTotal}`,
      expectedDetectorLabel: `${observedExpected.length}/${expectedCriteria.length}`,
      coveragePercent: manifestCriteriaTotal === 0 ? 0 : Math.round((observedManifest.length / manifestCriteriaTotal) * 100)
    };
  });
}

function buildCoverageTracker(manifest) {
  const manifestByCriterion = new Map((manifest.criteria ?? []).map((criterion) => [criterion.id, criterion]));
  const ruleIdsByCriterion = new Map();
  for (const rule of rules) {
    const criteria = new Set(rule.standards
      .filter((reference) => reference.version === "wcag22")
      .map((reference) => reference.criterion));
    for (const criterion of criteria) {
      if (!ruleIdsByCriterion.has(criterion)) ruleIdsByCriterion.set(criterion, []);
      ruleIdsByCriterion.get(criterion).push(rule.id);
    }
  }

  const rows = wcag22Criteria.map((criterion) => {
    const manifestEntry = manifestByCriterion.get(criterion.criterion);
    const ruleIds = [...new Set(ruleIdsByCriterion.get(criterion.criterion) ?? [])].sort();
    const detectors = manifestEntry?.detection ?? [];
    const status = ruleIds.length > 0
      ? "cleardom"
      : detectors.includes("manual")
        ? "manual-only"
        : "missing";

    return {
      criterion: criterion.criterion,
      level: criterion.level,
      title: criterion.title,
      benchmark: Boolean(manifestEntry),
      detectors,
      ruleIds,
      status,
      statusLabel: status === "cleardom"
        ? "ClearDOM mapped"
        : status === "manual-only"
          ? "Manual / benchmark only"
          : "Missing ClearDOM rule"
    };
  });

  return {
    rows,
    totalCriteria: rows.length,
    aAndAaCriteria: rows.filter((row) => row.level === "a" || row.level === "aa").length,
    aaaCriteria: rows.filter((row) => row.level === "aaa").length,
    benchmarkCriteria: rows.filter((row) => row.benchmark).length,
    cleardomCriteria: rows.filter((row) => row.ruleIds.length > 0).length,
    missingCleardomCriteria: rows.filter((row) => row.ruleIds.length === 0).length
  };
}

function buildWcagCoverageCharts(results, manifest) {
  const groups = [
    { prefix: "1.", label: "1 Perceivable" },
    { prefix: "2.", label: "2 Operable" },
    { prefix: "3.", label: "3 Understandable" },
    { prefix: "4.", label: "4 Robust" }
  ];

  const criteria = manifest.criteria ?? [];
  return groups.map((group) => {
    const groupCriteria = criteria.filter((criterion) => criterion.id.startsWith(group.prefix));

    return {
      ...group,
      criteriaTotal: groupCriteria.length,
      tools: results.map((result) => {
        const caught = groupCriteria.filter((criterion) => result.criteria.includes(criterion.id));
        const percent = groupCriteria.length === 0 ? 0 : Math.round((caught.length / groupCriteria.length) * 100);

        return {
          id: result.id,
          label: result.label,
          caught: caught.length,
          percent
        };
      })
    };
  });
}

function summarizeDetection(manifest) {
  const criteria = manifest.criteria ?? [];
  return {
    cleardomStatic: criteria.filter((criterion) => criterion.detection?.includes("cleardom-static")).length,
    cleardomRuntime: criteria.filter((criterion) => criterion.detection?.includes("cleardom-runtime")).length,
    runtime: criteria.filter((criterion) => criterion.detection?.includes("cleardom-runtime") || criterion.detection?.includes("axe") || criterion.detection?.includes("pa11y")).length,
    manual: criteria.filter((criterion) => criterion.detection?.includes("manual")).length
  };
}

function bucketClass(value) {
  if (value === "cleardom-static") return "static";
  if (value === "cleardom-runtime" || value === "axe" || value === "pa11y") return "runtime";
  if (value === "manual") return "manual";
  return "";
}

function renderFindingGroups(findings) {
  if (findings.length === 0) return "";
  const groups = new Map();
  for (const finding of findings) {
    const key = finding.wcag?.length ? finding.wcag.join(", ") : "Unmapped";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(finding);
  }

  return [...groups.entries()].map(([wcag, group]) => `
    <div class="finding-group">
      <strong>WCAG ${escapeHtml(wcag)} (${group.length})</strong>
      <ul class="finding-list">
        ${group.slice(0, 12).map((finding) => `
          <li>
            <strong>${escapeHtml(finding.id ?? "unknown")}</strong>
            ${escapeHtml(finding.title ?? finding.severity ?? "Finding")}
            <div class="muted small">${escapeHtml(finding.target ?? "")}</div>
          </li>
        `).join("")}
      </ul>
      ${group.length > 12 ? `<p class="muted small">${group.length - 12} more findings in this group.</p>` : ""}
    </div>
  `).join("");
}

function buildCoverageRows(results, manifest) {
  return (manifest.criteria ?? []).map((criterion) => ({
    id: criterion.id,
    title: criterion.title,
    expected: criterion.detection ?? [],
    observed: Object.fromEntries(results.map((result) => [result.id, result.criteria.includes(criterion.id)]))
  }));
}

function buildUniqueCoverage(results) {
  return results.map((result) => {
    const others = new Set(results.filter((candidate) => candidate.id !== result.id).flatMap((candidate) => candidate.criteria));
    return {
      id: result.id,
      label: result.label,
      criteria: result.criteria.filter((criterion) => !others.has(criterion))
    };
  });
}

function buildMissedExpectedRows(results, manifest) {
  const automatedTools = new Map(results.flatMap((result) => (result.detectorIds ?? [result.id]).map((detectorId) => [detectorId, result])));
  return (manifest.criteria ?? []).flatMap((criterion) =>
    (criterion.detection ?? [])
      .filter((toolId) => automatedTools.has(toolId))
      .filter((toolId) => !automatedTools.get(toolId)?.criteria.includes(criterion.id))
      .map((toolId) => ({
        id: criterion.id,
        title: criterion.title,
        expected: criterion.detection ?? [],
        toolId,
        toolLabel: automatedTools.get(toolId)?.label
      }))
  );
}

function criteriaCovered(findings) {
  return [...new Set(findings.flatMap((finding) => finding.wcag ?? []))].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function formatMs(ms) {
  return `${Math.round(ms).toLocaleString()} ms`;
}

function formatMb(value) {
  return value === null ? "n/a" : `${value.toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function renderMarkdownFindingSection(result) {
  const lines = [
    `### ${result.label}`,
    "",
    `Findings: ${result.findings.length}`,
    ""
  ];

  if (result.stderr) {
    lines.push(`Runner stderr: \`${markdownInline(result.stderr)}\``, "");
  }

  if (result.findings.length === 0) {
    lines.push(result.ok ? "No findings reported." : "No findings available because the runner failed.", "");
    return lines;
  }

  const groups = new Map();
  for (const finding of result.findings) {
    const key = finding.wcag?.length ? finding.wcag.join(", ") : "Unmapped";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(finding);
  }

  for (const [wcag, group] of groups) {
    lines.push(`#### WCAG ${wcag} (${group.length})`, "");
    lines.push(markdownTable(
      ["Rule", "Title", "Target"],
      group.slice(0, 12).map((finding) => [
        finding.id ?? "unknown",
        finding.title ?? finding.severity ?? "Finding",
        finding.target ?? ""
      ])
    ));
    if (group.length > 12) lines.push("", `${group.length - 12} more findings in this group.`);
    lines.push("");
  }

  return lines;
}

function markdownTable(headers, rows) {
  const escapedHeaders = headers.map(markdownCell);
  const escapedRows = rows.map((row) => row.map(markdownCell));
  return [
    `| ${escapedHeaders.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...escapedRows.map((row) => `| ${row.join(" | ")} |`)
  ].join("\n");
}

function markdownCell(value) {
  return markdownInline(value).replaceAll("\n", "<br>");
}

function markdownInline(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("`", "\\`");
}
