import { execFile } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import http from "node:http";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const siteDir = resolve(root, "examples/wcag-benchmark");
const falsePositiveFixturePath = resolve(siteDir, "FalsePositiveFixture.tsx");
const manifestPath = resolve(siteDir, "manifest.json");
const reportDir = resolve(siteDir, "reports");
const emptySourceDir = resolve(reportDir, "empty-source");
const reportPath = resolve(reportDir, "benchmark-report.html");
const jsonPath = resolve(reportDir, "benchmark-report.json");
const workerPath = resolve(root, "scripts/benchmark-worker.mjs");
const chromePath = findChromePath();
const cliOptions = parseArgs(process.argv.slice(2).filter((arg) => arg !== "--"));

await fs.mkdir(reportDir, { recursive: true });
await fs.mkdir(emptySourceDir, { recursive: true });

const useLocal = cliOptions.local || process.env.USE_LOCAL_BENCHMARK === "true";
const server = useLocal ? await startStaticServer(siteDir) : null;
const localUrl = server ? `http://127.0.0.1:${server.port}` : null;
const url = cliOptions.url ?? (localUrl ?? "https://tylor.nz");
const falsePositiveUrl = cliOptions.falsePositiveUrl ?? (localUrl ? `${localUrl}/false-positive.html` : `${url}/false-positive.html`);
const localFalsePositiveUrl = localUrl ? `${localUrl}/false-positive.html` : falsePositiveUrl;
const liveMode = !useLocal;

try {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const tools = [
    { id: "cleardom", label: "ClearDOM Runtime", input: url },
    { id: "axe", label: "Axe", input: url },
    { id: "pa11y", label: "pa11y", input: url }
  ];

  const results = [];
  for (const tool of tools) {
    process.stdout.write(`Running ${tool.label}...\n`);
    results.push(await runMeasured(tool, {
      url,
      sourceDir: emptySourceDir,
      chromePath
    }));
  }

  const falsePositiveResults = [];
  for (const tool of tools) {
    process.stdout.write(`Running ${tool.label} false-positive benchmark...\n`);
    falsePositiveResults.push(await runMeasured(tool, {
      url: falsePositiveUrl,
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
    fixturePath: null,
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

  process.stdout.write(`\nBenchmark report written to ${reportPath}\n`);
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
  const sampler = setInterval(async () => {
    peakRssKb = Math.max(peakRssKb, await processTreeRssKb(child.pid));
  }, 50);

  try {
    const { stdout, stderr } = await childResult(child);
    peakRssKb = Math.max(peakRssKb, await processTreeRssKb(child.pid));
    const durationMs = performance.now() - startedAt;
    const parsed = parseWorkerJson(stdout);

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
    const { stdout } = await execFileAsync("ps", ["-axo", "pid=,ppid=,rss="]);
    const rows = stdout.trim().split("\n").map((line) => {
      const [pid, ppid, rss] = line.trim().split(/\s+/).map(Number);
      return { pid, ppid, rss };
    });
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
  const manualOnly = (manifest.criteria ?? []).filter((criterion) => criterion.detection?.length === 1 && criterion.detection.includes("manual")).length;

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
      <p class="lede muted">${report.mode === "live" ? `Live-site ${escapeHtml(manifest.standard)} scanner comparison.` : `A deliberately broken ${escapeHtml(manifest.standard)} fixture served over HTTP for a browser-runtime comparison.`}</p>
      <p class="muted small">Generated ${escapeHtml(new Date(report.generatedAt).toLocaleString())} against <code>${escapeHtml(report.url)}</code>. ${manifest.criteria.length} WCAG benchmark criteria.</p>

      <section class="takeaways">
        <article class="callout">
          <h2>At A Glance</h2>
          <p>The benchmark covers <strong>${manifest.criteria.length}</strong> WCAG A/AA criteria. The headline comparison is total criteria reported, not whether a tool matched our expected-detection labels.</p>
        </article>
        <article class="callout">
          <h2>How To Read It</h2>
          <p>WCAG coverage shows how much of the total benchmark surface each tool reported. Finding count is only volume.</p>
        </article>
        <article class="callout">
          <h2>Important Caveat</h2>
          <p>More findings does not mean better coverage. This benchmark counts reported violations and excludes informational notices from false-positive totals.</p>
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
            <p class="muted small">${summary.observedManifestCriteria} of ${summary.manifestCriteriaTotal} WCAG benchmark criteria reported. Peak memory: ${formatMb(summary.peakRssMb)}.</p>
          </article>
        `).join("")}
      </section>

      <section class="panel">
        <h2>Detection Buckets</h2>
        <p class="muted">The manifest labels each scenario by the kind of review expected to catch it.</p>
        <div class="chips">
          <span class="chip static">ClearDOM automated: ${detectionSummary.cleardom}</span>
          <span class="chip runtime">Browser runtime: ${detectionSummary.runtime}</span>
          <span class="chip manual">Manual review: ${detectionSummary.manual}</span>
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
                <th>Manifest Criteria Seen</th>
                <th>Total WCAG Coverage</th>
                <th>Time</th>
                <th>Peak Memory</th>
              </tr>
            </thead>
            <tbody>
              ${toolSummaries.map((summary) => `
                <tr>
                  <td>${escapeHtml(summary.label)}</td>
                  <td><div>${summary.findings}</div><div class="bar"><span style="width:${Math.round((summary.findings / maxFindings) * 100)}%"></span></div></td>
                  <td>${summary.observedManifestCriteria}</td>
                  <td>${summary.coverageLabel}</td>
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
        <p class="muted">Rows show manifest expectations and whether each tool produced at least one finding mapped to that criterion.</p>
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

function buildToolSummaries(results, manifest) {
  const manifestIds = new Set((manifest.criteria ?? []).map((criterion) => criterion.id));
  const manifestCriteriaTotal = manifestIds.size;
  return results.map((result) => {
    const observedManifest = result.criteria.filter((criterion) => manifestIds.has(criterion));
    const coveragePercent = manifestCriteriaTotal === 0 ? 0 : Math.round((observedManifest.length / manifestCriteriaTotal) * 100);

    return {
      ...result,
      findings: result.findings.length,
      observedManifestCriteria: observedManifest.length,
      manifestCriteriaTotal,
      coverageLabel: `${observedManifest.length}/${manifestCriteriaTotal}`,
      coveragePercent
    };
  });
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
    cleardom: criteria.filter((criterion) => criterion.detection?.includes("cleardom")).length,
    runtime: criteria.filter((criterion) => criterion.detection?.includes("axe") || criterion.detection?.includes("pa11y")).length,
    manual: criteria.filter((criterion) => criterion.detection?.includes("manual")).length
  };
}

function bucketClass(value) {
  if (value === "cleardom") return "static";
  if (value === "axe" || value === "pa11y") return "runtime";
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
