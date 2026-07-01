# ClearDOM

ClearDOM finds accessibility, readability, and assistive-tech regressions before they ship.

It is a CLI-first scanner for React, Next.js, React Native, and web apps. The v0.2 scanner is dependency-light: TypeScript for development, Node built-ins at runtime, and a small in-repo JSX reader for static checks.

## Quickstart

```sh
npx cleardom@latest scan .
npx cleardom@latest install --agents
npx cleardom@latest init
npx cleardom@latest scan . --write-baseline cleardom-baseline.json
npx cleardom@latest ci .
```

Use `scan` for local feedback, `install --agents` to teach coding agents the ClearDOM workflow, and `ci` for pull-request regression checks. Existing projects should commit a baseline first so legacy issues remain visible without blocking merges; new issues are reported as regressions.

## Local development

```sh
pnpm install
pnpm build
pnpm start -- scan examples/react-app
pnpm test
```

## WCAG benchmark

The repo includes an intentionally broken benchmark site for comparing ClearDOM, Axe, and pa11y-style browser scanners:

```sh
pnpm benchmark
```

The benchmark starts the fixture site, runs all three tools, measures runtime and peak RSS, and writes `examples/wcag-benchmark/reports/benchmark-report.html`. The report compares total WCAG criterion coverage, finding volume, and false-positive candidates. Set `CHROME_PATH=/path/to/chrome` if Chrome is not installed in a standard location.

To compare the tools against a live site, pass a URL:

```sh
pnpm benchmark -- --url https://example.com/
```

Live-site mode runs Axe and pa11y against the URL and runs ClearDOM's runtime checks against the same page. ClearDOM source-only rules are not available in live mode because source files are not available from a URL.

See `examples/wcag-benchmark/manifest.json` for the WCAG 2.2 A/AA coverage map and expected detection type for each scenario.

## Commands

```sh
cleardom install --agents [--agent codex|claude|cursor] [--yes]
cleardom init [--dry-run]
cleardom scan [path|url] [--format text|json|sarif] [--standard wcag22-aa] [--runtime-url http://localhost:3000] [--component-preset mui] [--config cleardom.config.json] [--baseline cleardom-baseline.json] [--write-baseline cleardom-baseline.json] [--fail-on critical|warning|findings|regression]
cleardom ci [path] [--format text|json|sarif] [--baseline cleardom-baseline.json] [--fail-on critical|warning|findings|regression]
cleardom agents detect|install|uninstall|upgrade [--agent codex|claude|cursor]
cleardom explain CDOM001
cleardom rules
cleardom standards
cleardom fix
```

`fix` is intentionally still a stub. ClearDOM should only auto-edit when a rule has a truly safe static fix.

## Agent install

ClearDOM can install project-level guidance for coding agents so accessibility checks happen while code is being written, not only after CI fails:

```sh
npx cleardom@latest install --agents
```

By default this writes or updates ClearDOM-managed blocks in `AGENTS.md`, `CLAUDE.md`, and `.cursor/rules/cleardom.mdc`. Existing file content is preserved, and rerunning the command refreshes the managed block without duplicating it.

Install one target with `--agent`:

```sh
cleardom agents install --agent cursor
cleardom agents detect
cleardom agents upgrade
cleardom agents uninstall --agent cursor
```

## Config

Create `cleardom.config.json` in the project root:

```json
{
  "include": ["src/**/*.{js,jsx,ts,tsx}"],
  "exclude": ["src/**/*.test.tsx"],
  "standard": "wcag22-aa",
  "failOn": "critical",
  "runtimeUrl": "",
  "componentPresets": ["radix", "mui", "react-aria"],
  "components": {
    "IconButton": { "role": "button", "nameProps": ["aria-label", "label"] },
    "Button": { "role": "button", "nameProps": ["aria-label", "label"] },
    "TextInput": { "role": "textbox", "nameProps": ["aria-label", "label"] }
  },
  "rules": {
    "CDOM003": "info",
    "CDOM008": "off"
  }
}
```

Component mappings teach ClearDOM about your design system without adding runtime dependencies. A mapped component can declare the semantic role it represents and which props provide its accessible name.

Component presets provide starter mappings for common UI libraries. Supported presets are `radix`, `mui`, `react-aria`, and `react-native`; explicit `components` entries override preset mappings.

Runtime checks use Chromium through `puppeteer-core` for CSS-dependent issues that static source cannot see. Set `CHROME_PATH=/path/to/chrome` or `PUPPETEER_EXECUTABLE_PATH=/path/to/chrome`, start your app locally, then pass `--runtime-url`.

Rule options can be `"off"`, `"critical"`, `"warning"`, `"info"`, or an object like:

```json
{
  "rules": {
    "CDOM001": { "enabled": true, "severity": "critical" }
  }
}
```

## CI example

`cleardom ci` defaults to `--baseline cleardom-baseline.json --fail-on regression` when the baseline exists. Generate and commit the baseline once, then make the CI check required.

```yaml
name: ClearDOM

on:
  pull_request:
  push:
    branches: [main]

jobs:
  cleardom:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npx cleardom@latest ci . --format sarif > cleardom.sarif
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: cleardom.sarif
```

## Baseline adoption

Legacy projects can adopt ClearDOM without failing existing debt:

```sh
cleardom scan src --write-baseline cleardom-baseline.json
cleardom ci src
```

The baseline stores stable finding fingerprints. Existing findings are still visible in JSON output as `baselineFindings`; new findings are reported as `regressions`.

## SARIF output

```sh
cleardom scan src --format sarif > cleardom.sarif
```

## WCAG standards

ClearDOM supports selectable profiles for every WCAG iteration:

- `wcag10`
- `wcag20-a`, `wcag20-aa`, `wcag20-aaa`
- `wcag21-a`, `wcag21-aa`, `wcag21-aaa`
- `wcag22-a`, `wcag22-aa`, `wcag22-aaa`
- `wcag30-draft`

`latest` and `current` resolve to `wcag22-aa`, the default profile. WCAG 3.0 is exposed as a draft profile because it is not currently a W3C Recommendation/conformance standard.

```sh
cleardom standards
cleardom scan src --standard wcag21-aa
cleardom scan src --standard wcag30-draft
```

## Rules

- `CDOM001`: interactive control has no accessible name
- `CDOM002`: React Native touch control has no accessibility label
- `CDOM003`: interactive label is ambiguous
- `CDOM004`: input relies on placeholder text as its label
- `CDOM005`: image has no useful alternative text
- `CDOM006`: anchor is missing an href
- `CDOM007`: clickable non-interactive element lacks keyboard support
- `CDOM008`: heading level jumps
- `CDOM009`: React Native touch control has no accessibility role
- `CDOM010`: form control has no accessible label
- `CDOM011`: document language or title is missing
- `CDOM012`: personal information input is missing autocomplete
- `CDOM013`: accessible name does not include visible label
- `CDOM014`: status message is not exposed as a live region
- `CDOM015`: media is missing an obvious text alternative
- `CDOM016`: focusable content is hidden from assistive technology
- `CDOM017`: duplicate id values can break accessibility references
- `CDOM018`: positive tabIndex changes the natural focus order
- `CDOM019`: grouped form controls are missing a legend
- `CDOM020`: invalid form control is not connected to error text
- `CDOM021`: pointer action may fire before cancellation is possible
- `CDOM022`: text contrast is below the minimum ratio
- `CDOM023`: focused control has no visible focus indicator
- `CDOM024`: interactive target is smaller than WCAG minimum
- `CDOM025`: page causes horizontal overflow at narrow viewport
- `CDOM026`: skip link is missing or not visible on focus

The score is automated guidance for developer workflow quality. It is not a legal compliance claim and does not replace manual accessibility testing.

## Roadmap

Current focus: high-confidence static checks, honest benchmark coverage, and low-friction developer feedback.

Next likely engine work: deeper runtime interaction checks for hover/focus content, text spacing, keyboard traps, focus obscuring, and CSS-dependent accessibility issues.
