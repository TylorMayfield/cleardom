# WCAG Benchmark Fixture

This directory is an intentionally inaccessible site for comparing ClearDOM, Axe, and pa11y/a11y-style browser scanners.

It targets WCAG 2.2 A/AA success criteria. Some scenarios are deliberately manual because no static or browser rule engine can fully prove them, such as whether prerecorded audio has a transcript or whether copy is written at the right reading level.

## Run It

```sh
pnpm benchmark
```

To run the same comparison against a live page:

```sh
pnpm benchmark -- --url https://example.com/
```

Live-site mode runs Axe and pa11y against the URL and runs ClearDOM's runtime checks against the same page. ClearDOM source-only rules are only available for local source fixtures.

The benchmark starts this fixture site, runs ClearDOM, Axe, and pa11y, then writes:

- `examples/wcag-benchmark/reports/benchmark-report.html`
- `examples/wcag-benchmark/reports/benchmark-report.json`

The report includes finding counts, normalized finding details, elapsed time, peak RSS, expected detection buckets, observed WCAG criterion coverage, and criteria only one tool surfaced. Set `CHROME_PATH=/path/to/chrome` if Chrome is not installed in a standard location.

Use `manifest.json` as the benchmark index. It lists every WCAG 2.2 A/AA criterion covered here, the DOM target, the intentional failure, and whether the issue is expected to be detectable by static analysis, DOM automation, or manual review.

## Files

- `index.html`: rendered benchmark site for Axe and pa11y.
- `styles.css`: visual traps, contrast failures, focus problems, and layout behavior.
- `app.js`: keyboard traps, timeout simulation, and unexpected context changes.
- `Fixture.tsx`: JSX mirror focused on ClearDOM's static rules.
- `manifest.json`: expected benchmark coverage map.
- `reports/`: generated HTML and JSON benchmark reports.
