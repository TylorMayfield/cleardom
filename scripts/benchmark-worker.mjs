import { AxePuppeteer } from "@axe-core/puppeteer";
import pa11y from "pa11y";
import puppeteer from "puppeteer-core";
import { scanPath } from "../dist/scanner.js";

const tool = process.argv[2];
const options = JSON.parse(process.argv[3] ?? "{}");

try {
  const result = await runTool(tool, options);
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stdout.write(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    findings: []
  }));
}

async function runTool(name, options) {
  if (name === "cleardom") return runClearDOM(options);
  if (name === "axe") return runAxe(options);
  if (name === "pa11y") return runPa11y(options);
  throw new Error(`Unknown benchmark tool: ${name}`);
}

async function runClearDOM({ url, sourceDir }) {
  if (!url) throw new Error("ClearDOM benchmark runs require a URL");
  if (!sourceDir) throw new Error("ClearDOM runtime benchmark requires an empty source directory");

  const result = await scanPath(sourceDir, { standard: "wcag22-aa", format: "json", runtimeUrl: url });

  return {
    ok: true,
    rawSummary: result.summary,
    findings: result.findings.map((finding) => ({
      id: finding.ruleId,
      title: finding.title,
      severity: finding.severity,
      message: finding.message,
      target: `${finding.file}:${finding.line}:${finding.column}`,
      wcag: finding.wcag,
      excerpt: finding.excerpt
    }))
  };
}

async function runAxe({ url, chromePath, includeReviewCandidates = false }) {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    await settlePage(page);
    const results = await new AxePuppeteer(page)
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    const violations = results.violations.flatMap((violation) =>
      violation.nodes.map((node) => ({
        id: violation.id,
        title: violation.help,
        severity: violation.impact ?? "unknown",
        message: violation.description,
        target: node.target.join(", "),
        wcag: wcagFromAxeTags(violation.tags),
        excerpt: node.html
      }))
    );
    const reviewCandidates = includeReviewCandidates ? results.incomplete.flatMap((incomplete) =>
      incomplete.nodes.map((node) => ({
        id: incomplete.id,
        title: `${incomplete.help} (needs review)`,
        severity: "incomplete",
        message: incomplete.description,
        target: node.target.join(", "),
        wcag: wcagFromAxeTags(incomplete.tags),
        excerpt: node.html
      }))
    ) : [];

    return {
      ok: true,
      rawSummary: {
        violations: results.violations.length,
        passes: results.passes.length,
        incomplete: results.incomplete.length,
        inapplicable: results.inapplicable.length
      },
      findings: [...violations, ...reviewCandidates]
    };
  } finally {
    await browser.close();
  }
}

async function runPa11y({ url, chromePath }) {
  const result = await pa11y(url, {
    standard: "WCAG2AA",
    includeWarnings: false,
    includeNotices: false,
    timeout: 15000,
    wait: 100,
    chromeLaunchConfig: {
      executablePath: chromePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    }
  });

  return {
    ok: true,
    rawSummary: {
      documentTitle: result.documentTitle,
      pageUrl: result.pageUrl,
      issues: result.issues.length
    },
    findings: result.issues.map((issue) => ({
      id: issue.code,
      title: issue.type,
      severity: issue.type,
      message: issue.message,
      target: issue.selector,
      wcag: wcagFromPa11yCode(issue.code),
      excerpt: issue.context
    }))
  };
}

async function settlePage(page) {
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (typeof page.waitForNetworkIdle !== "function") return;
  await page.waitForNetworkIdle({ idleTime: 100, timeout: 1000 }).catch(() => undefined);
}

function wcagFromAxeTags(tags) {
  return tags
    .map((tag) => tag.match(/^wcag(\d)(\d)(\d)$/)?.slice(1).join("."))
    .filter(Boolean);
}

function wcagFromPa11yCode(code) {
  const matches = [...code.matchAll(/(\d)_(\d)_(\d)/g)];
  return [...new Set(matches.map((match) => `${match[1]}.${match[2]}.${match[3]}`))];
}
