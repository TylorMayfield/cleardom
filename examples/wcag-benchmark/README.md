# WCAG Benchmark Fixture

This directory is an intentionally inaccessible site for comparing ClearDOM, Axe, and pa11y/a11y-style browser scanners.

It targets WCAG 2.2 A/AA success criteria. Some scenarios are deliberately manual because no static or browser rule engine can fully prove them, such as whether prerecorded audio has a transcript or whether copy is written at the right reading level.

## Run It

```sh
pnpm benchmark
```

To run a remote smoke test against a live page:

```sh
pnpm benchmark -- --url https://example.com/
```

The benchmark command runs against this local fixture by default. Remote URL mode is useful for ad hoc testing, but it is not the canonical benchmark because the WCAG fixture manifest describes the cases in this directory. Both modes run Axe, pa11y, and ClearDOM runtime checks through Chromium. ClearDOM source-only rules are intentionally excluded from benchmark timing so the report does not compare static parsing against browser automation.

The benchmark starts this fixture site, runs ClearDOM, Axe, and pa11y, then writes:

- `examples/wcag-benchmark/reports/benchmark-report.html`
- `examples/wcag-benchmark/reports/benchmark-report.md`
- `examples/wcag-benchmark/reports/wcag-coverage-tracker.md`
- `examples/wcag-benchmark/reports/benchmark-report.json`

The HTML report is optimized for visual review. The Markdown report is optimized for GitHub PRs, issues, and release notes. Both include finding counts, normalized finding details, elapsed time, peak RSS, expected detection buckets, total WCAG criterion coverage, missed detector expectations, false-positive candidates, and criteria only one tool surfaced. The tracker uses the full 86-criterion WCAG 2.2 catalog, while the benchmark fixture uses the 55 Level A/AA criteria. False-positive counts include violations only, not informational notices or manual review candidates. Set `CHROME_PATH=/path/to/chrome` if Chrome is not installed in a standard location.

Use `manifest.json` as the benchmark index. It lists every WCAG 2.2 A/AA criterion covered here, the DOM target, the intentional failure, and whether the issue is expected to be detectable by ClearDOM's runtime checks, other DOM automation, or manual review.

## Files

- `index.html`: rendered benchmark site for Axe and pa11y.
- `styles.css`: visual traps, contrast failures, focus problems, and layout behavior.
- `app.js`: keyboard traps, timeout simulation, and unexpected context changes.
- `Fixture.tsx`: JSX mirror for testing ClearDOM's source-static rules outside the runtime benchmark.
- `manifest.json`: expected benchmark coverage map.
- `reports/`: generated HTML, Markdown, JSON, and WCAG tracker reports.
