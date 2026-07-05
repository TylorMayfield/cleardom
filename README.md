# ClearDOM

ClearDOM finds accessibility, readability, and assistive-tech regressions before they ship.

It is a CLI-first scanner for React, Next.js, React Native, and web apps. The v0.2 scanner is dependency-light: TypeScript for development, Node built-ins at runtime, and small in-repo source adapters for JSX, HTML, Vue, Svelte, Astro, Angular templates, and MDX.

## Quickstart

```sh
npx cleardom@latest
npx cleardom@latest --diff
npx cleardom@latest install
npx cleardom@latest fix
```

Run ClearDOM from a project root to print a health score and the issues it found. Use `--diff` while you work to scan changed files only. Run `install` to add the GitHub Actions PR reviewer and coding-agent guidance.

Use `fix` to turn the top active finding into a focused coding-agent remediation prompt. ClearDOM does not silently rewrite product code; it gives the agent the finding, rule guidance, code context, and verification command so the agent can edit and re-run the scan.

Existing projects can adopt gradually: commit a baseline once with `npx cleardom@latest scan . --write-baseline cleardom-baseline.json`, then use `npx cleardom@latest ci .` to fail only on regressions.

## PR reviewer in 60 seconds

```sh
npx cleardom@latest install
git add .github/workflows/cleardom.yml
git commit -m "Add ClearDOM PR review"
```

The installed workflow runs `cleardom review . --changed-files-only` on every pull request. It posts one sticky summary, adds capped inline comments on changed lines, and fails the status check only for newly introduced findings in changed files. Legacy accessibility debt can stay visible without blocking unrelated changes.

Preview the same comment locally before opening a PR:

```sh
npx cleardom@latest review . --dry-run
```

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

The benchmark starts the local fixture site, runs all three tools through Chromium, measures runtime and peak RSS, and writes HTML, Markdown, JSON, and a WCAG coverage tracker in `examples/wcag-benchmark/reports/`. The benchmark fixture covers the 55 WCAG 2.2 Level A/AA success criteria. The tracker covers all 86 WCAG 2.2 success criteria, including AAA, and shows which criteria ClearDOM maps to today. Set `CHROME_PATH=/path/to/chrome` if Chrome is not installed in a standard location.

To compare the tools against a live site, pass a URL:

```sh
pnpm benchmark -- --url https://example.com/
```

Live-site mode is a remote smoke test, not the canonical benchmark. It runs Axe and pa11y against the URL and runs ClearDOM's runtime checks against the same page. ClearDOM source-only rules are not included in benchmark timing because source files are not available from a URL and would make the runtime comparison uneven.

See `examples/wcag-benchmark/manifest.json` for the WCAG 2.2 A/AA coverage map and expected detection type for each scenario.

## Commands

```sh
cleardom [path|url] [--diff] [--format text|json|sarif|html] [--standard wcag22-aa] [--semantic auto|off|required] [--runtime-url http://localhost:3000] [--component-preset mui] [--config cleardom.config.json] [--baseline cleardom-baseline.json] [--write-baseline cleardom-baseline.json] [--fail-on critical|warning|findings|regression]
cleardom install [--yes] [--agents] [--github-actions] [--no-github-actions] [--agent codex|claude|cursor]
cleardom init [--dry-run] [--yes] [--target path] [--create-baseline] [--ci-dry-run] [--install-ci]
cleardom scan [path|url] [--diff] [--format text|json|sarif|html] [--standard wcag22-aa] [--semantic auto|off|required] [--runtime-url http://localhost:3000] [--component-preset mui] [--config cleardom.config.json] [--baseline cleardom-baseline.json] [--write-baseline cleardom-baseline.json] [--fail-on critical|warning|findings|regression]
cleardom ci [path] [--format text|json|sarif|html] [--baseline cleardom-baseline.json] [--fail-on critical|warning|findings|regression]
cleardom doctor [path] [--config cleardom.config.json] [--runtime-url http://localhost:3000]
cleardom report [path|url] [--format html|markdown|json] [--output cleardom-report.html]
cleardom review [path] [--dry-run] [--max-comments 20]
cleardom suppress [path] [--rule CDOM_4_1_2_UNNAMED_CONTROL] [--file src/App.tsx] [--limit 1] [--baseline cleardom-baseline.json]
cleardom baseline update|prune [path] [--baseline cleardom-baseline.json]
cleardom browser install
cleardom native scan [path] [--format text|json|sarif|html]
cleardom agents detect|install|uninstall|upgrade [--agent codex|claude|cursor]
cleardom explain CDOM_4_1_2_UNNAMED_CONTROL
cleardom rules
cleardom standards
cleardom fix [path] [--preview] [--apply] [--plan --format text|json|markdown] [--agent codex|claude|cursor] [--rule CDOM_4_1_2_UNNAMED_CONTROL] [--file src/App.tsx] [--limit 1]
```

`doctor` checks browser availability, ClearDOM config, GitHub token context, include/exclude patterns, baseline setup, semantic mode, runtime URL readiness, and native simulator readiness when enabled. `browser install` adds a managed Chrome for runtime scans when the system has no usable browser. `report` writes shareable local scan reports outside benchmark mode. `fix` is an agent-assisted remediation workflow; `fix --preview` shows safe mechanical diffs, `fix --apply` applies only safe transforms, and `fix --plan` groups work by rule/file/owner. Use `suppress` to baseline selected accepted findings, then `baseline update` and `baseline prune` to refresh or remove stale adoption debt.

## Product onboarding

Start like React Doctor: run ClearDOM from the project root, fix changed-file findings while you work, then install the PR reviewer when the local signal looks useful.

```sh
npx cleardom@latest
npx cleardom@latest --diff
npx cleardom@latest install
```

ClearDOM detects common app stacks and UI libraries from `package.json` and project files. React, Next.js, Vite React, Solid, React Native, and Expo projects get JSX/TSX semantic source scanning and component presets automatically. Vue, Svelte, Astro, and Angular projects use template source adapters. Vanilla JavaScript web projects can scan HTML and authored source without a config file.

Use `init` when you want a committed project config, baseline, runtime browser settings, native simulator settings, ownership routing, or suppression policy:

```sh
npx cleardom@latest init
npx cleardom@latest doctor .
```

`doctor` is the setup safety pass, not the first required step. It reports the detected stack and the next useful command for React, Solid, template frameworks, vanilla web, and Expo/React Native projects. For rendered DOM, CSS, and keyboard checks in web apps, start the local app and add `--runtime-url`. For Expo and React Native, simulator-backed checks stay opt-in until `native.appId` or `native.deepLinks` are configured.

Useful setup variants:

```sh
cleardom init --dry-run
cleardom init --create-baseline
cleardom init --ci-dry-run
cleardom init --install-ci
cleardom init --target packages/web
```

`--dry-run` prints the recommended config as JSON without writing files. `--create-baseline` scans the project once and writes `cleardom-baseline.json` so CI can fail only on new regressions. `--ci-dry-run` previews the GitHub Actions workflow, while `--install-ci` writes it.

## Developer workflow install

ClearDOM can install the project-level workflow pieces that make it behave like a PR reviewer:

```sh
npx cleardom@latest install
```

By default this writes `.github/workflows/cleardom.yml` so pull requests get a sticky summary, capped inline comments on changed lines, and a ClearDOM status check. Existing workflow content is refreshed idempotently when rerunning the command.

Install agent guidance separately with `--agents` and target one agent with `--agent`:

```sh
cleardom install --agents
cleardom agents install --agent cursor
cleardom agents detect
cleardom agents upgrade
cleardom agents uninstall --agent cursor
```

The installed GitHub Actions workflow runs `cleardom review . --changed-files-only` on pull requests. In Actions, that command uses `GITHUB_TOKEN` to scan the PR head and base commit, create or update one sticky PR summary comment, and add capped inline comments on changed lines for newly introduced findings. Pull requests fail only on new findings in changed files, so legacy debt stays visible without blocking unrelated work. Outside Actions, use `--dry-run` to preview the same Markdown summary locally:

```sh
cleardom review . --dry-run
```

## Config

Create `cleardom.config.json` in the project root:

```json
{
  "include": ["src/**/*.{js,jsx,ts,tsx,html,vue,svelte,astro,mdx}", "src/**/*.component.html"],
  "exclude": ["src/**/*.test.tsx"],
  "standard": "wcag22-aa",
  "failOn": "critical",
  "semantic": "auto",
  "runtimeUrl": "",
  "runtime": {
    "baseUrl": "http://localhost:3000",
    "routes": ["/", "/settings"],
    "discoverRoutes": true,
    "viewports": [
      { "name": "desktop", "width": 1280, "height": 900 },
      { "name": "mobile", "width": 390, "height": 844, "isMobile": true }
    ],
    "auth": { "setupScript": "./scripts/cleardom-auth.mjs" },
    "waitUntil": "networkidle0",
    "waitForSelector": "main",
    "timeoutMs": 30000,
    "headers": { "x-cleardom-scan": "true" },
    "cookies": [],
    "localStorage": {},
    "screenshot": true,
    "browser": { "mode": "auto" },
    "crawl": {
      "enabled": false,
      "maxDepth": 1,
      "maxRoutes": 25,
      "include": [],
      "exclude": ["/logout", "/sign-out", "/signout", "/delete", "/destroy", "/remove"]
    },
    "interactions": { "presets": [], "scripts": [] },
    "stories": { "enabled": false, "baseUrl": "", "include": [], "exclude": [] }
  },
  "native": {
    "enabled": false,
    "provider": "eas",
    "platforms": ["ios"],
    "appId": "",
    "deepLinks": [],
    "screens": [],
    "maxDurationMinutes": 20
  },
  "ownership": [],
  "suppressionPolicy": {
    "requireReason": true,
    "requireExpires": true,
    "requireApprovedBy": false
  },
  "componentPresets": ["radix", "mui", "react-aria"],
  "components": {
    "IconButton": {
      "importSource": "@acme/ui",
      "role": "button",
      "nameProps": ["aria-label", "label"],
      "disabledProps": ["disabled", "isDisabled"]
    },
    "Button": {
      "importSource": "@acme/ui",
      "role": "button",
      "asProp": "component",
      "childLabelProps": ["children"]
    },
    "TextInput": {
      "importSource": "@acme/ui",
      "role": "textbox",
      "nameProps": ["aria-label", "label"],
      "valueProps": ["value", "defaultValue"]
    },
    "Field": {
      "importSource": "@acme/ui",
      "wrapper": true,
      "labelProps": ["label"]
    }
  },
  "rules": {
    "CDOM_2_4_4_AMBIGUOUS_LABEL": "info",
    "CDOM_1_3_1_HEADING_ORDER": "off"
  }
}
```

Component mappings teach ClearDOM about your design system without adding runtime dependencies. A mapped component can declare the import source it should apply to, the semantic role it represents, the polymorphic prop that changes the rendered element, role/value/name/visible-label props, child-label props such as `children`, disabled aliases, and wrapper components that provide labels to descendant controls.

Component presets provide starter mappings for common UI libraries. Supported presets are `radix`, `mui`, `react-aria`, `react-native`, `chakra`, `ant-design`, `headless-ui`, `mantine`, and `react-bootstrap`; explicit `components` entries override preset mappings.

## Framework coverage

ClearDOM documents framework support in tiers:

| Tier | Adapters | Support |
| --- | --- | --- |
| Full source semantics | JSX/TSX | React, Next.js, Remix, Gatsby, Vite React, Preact, Solid-style JSX, React Native, and Expo get TypeScript Program-backed static resolution when `--semantic auto` can initialize. |
| Template source adapters | HTML, Vue, Svelte, Astro, Angular templates | Static parsing extracts HTML-like markup and common binding/event aliases. Pair with `--runtime-url` for rendered DOM and CSS checks. |
| Content adapter | MDX | Authored markup is scanned while imports and fenced examples are ignored. |

`--semantic auto` is the default. For JavaScript, TypeScript, JSX, and TSX files, ClearDOM builds a TypeScript Program and resolves safe static semantics such as string constants, simple imported constants, object-literal prop spreads, numeric literals, template literals without dynamic holes, and simple intrinsic tag aliases. Use `--semantic off` to force the lightweight adapters, or `--semantic required` when CI should fail if compiler-backed source analysis cannot initialize. JSON output includes `semanticAnalysis` and `semanticDiagnostics`.

Web runtime checks use Chromium through `puppeteer-core` for CSS-dependent issues that static source cannot see. ClearDOM looks for an explicit browser path, `CHROME_PATH`, `PUPPETEER_EXECUTABLE_PATH`, a managed browser installed with `cleardom browser install`, and then common system Chrome locations. Start your web app locally, then pass `--runtime-url` or configure `runtime.baseUrl`.

The `runtime` block supports explicit `routes`, safe route discovery from common framework file layouts, optional same-origin crawl, interaction presets/scripts, Storybook story scanning, multiple `viewports`, auth/setup scripts, custom headers, cookies, localStorage, wait strategy, selectors, timeouts, and screenshot evidence. URL scans and runtime scans reuse a single browser session. JSON and HTML reports include runtime diagnostics plus selector and screenshot evidence for runtime findings.

React Native checks are static guidance for iOS and Android semantics. They flag missing labels and roles in source, including mapped design-system components. To collect simulator-backed evidence, fill in the scaffolded `native` block and run `cleardom native scan .`; rendered VoiceOver and TalkBack behavior still needs manual verification on a device or simulator.

Rule options can be `"off"`, `"critical"`, `"warning"`, `"info"`, or an object like:

```json
{
  "rules": {
    "CDOM_4_1_2_UNNAMED_CONTROL": { "enabled": true, "severity": "critical" }
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
      contents: read
      pull-requests: write
      issues: write
      security-events: write
      statuses: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npx cleardom@latest review . --changed-files-only
        if: github.event_name == 'pull_request'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - run: npx cleardom@latest ci . --format sarif > cleardom.sarif
        if: github.event_name != 'pull_request'
      - uses: github/codeql-action/upload-sarif@v3
        if: always() && github.event_name != 'pull_request'
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

- `CDOM_4_1_2_UNNAMED_CONTROL`: interactive control has no accessible name
- `CDOM_4_1_2_NATIVE_LABEL`: react Native touch control has no accessibility label
- `CDOM_2_4_4_AMBIGUOUS_LABEL`: interactive label is ambiguous
- `CDOM_3_3_2_PLACEHOLDER_LABEL`: input relies on placeholder text as its label
- `CDOM_1_1_1_IMAGE_ALT`: image has no useful alternative text
- `CDOM_4_1_2_ANCHOR_HREF`: anchor is missing an href
- `CDOM_2_1_1_KEYBOARD`: clickable non-interactive element lacks keyboard support
- `CDOM_1_3_1_HEADING_ORDER`: heading level jumps
- `CDOM_4_1_2_NATIVE_ROLE`: react Native touch control has no accessibility role
- `CDOM_4_1_2_FORM_LABEL`: form control has no accessible label
- `CDOM_3_1_1_DOCUMENT_METADATA`: document language or title is missing
- `CDOM_1_3_5_AUTOCOMPLETE`: personal information input is missing autocomplete
- `CDOM_2_5_3_LABEL_IN_NAME`: accessible name does not include visible label
- `CDOM_4_1_3_STATUS_LIVE_REGION`: status message is not exposed as a live region
- `CDOM_1_2_1_MEDIA_ALTERNATIVE`: media is missing an obvious text alternative
- `CDOM_4_1_2_ARIA_HIDDEN_FOCUS`: focusable content is hidden from assistive technology
- `CDOM_4_1_2_DUPLICATE_ID`: duplicate id values can break accessibility references
- `CDOM_2_4_3_POSITIVE_TABINDEX`: positive tabIndex changes the natural focus order
- `CDOM_1_3_1_FIELDSET_LEGEND`: grouped form controls are missing a legend
- `CDOM_3_3_1_ERROR_DESCRIPTION`: invalid form control is not connected to error text
- `CDOM_2_5_2_POINTER_CANCELLATION`: pointer action may fire before cancellation is possible
- `CDOM_1_4_1_USE_OF_COLOR`: instruction or state change may rely on color alone
- `CDOM_1_3_3_SENSORY_INSTRUCTIONS`: instruction may rely on sensory characteristics
- `CDOM_3_1_2_LANGUAGE_OF_PARTS`: foreign-language text is not marked with lang
- `CDOM_3_2_1_CONTEXT_CHANGE`: focus or input handler may change context unexpectedly
- `CDOM_1_4_2_AUDIO_CONTROL`: autoplaying audio may lack a pause or stop control
- `CDOM_1_3_4_ORIENTATION`: content appears to require one device orientation
- `CDOM_1_2_4_LIVE_CAPTIONS`: live video may lack captions
- `CDOM_1_2_6_SIGN_LANGUAGE`: prerecorded media may lack sign language interpretation
- `CDOM_1_2_7_EXTENDED_AUDIO_DESCRIPTION`: prerecorded video may lack extended audio description
- `CDOM_1_2_8_FULL_MEDIA_ALTERNATIVE`: prerecorded media may lack a full media alternative
- `CDOM_1_2_9_LIVE_AUDIO_TRANSCRIPT`: live audio may lack a text alternative
- `CDOM_1_3_2_MEANINGFUL_SEQUENCE`: meaningful sequence may be incorrect
- `CDOM_1_3_6_IDENTIFY_PURPOSE`: component purpose may not be programmatically identifiable
- `CDOM_1_4_4_RESIZE_TEXT`: text may not resize cleanly
- `CDOM_1_4_5_IMAGES_OF_TEXT`: image-like text may not be real text
- `CDOM_1_4_6_ENHANCED_CONTRAST`: text may not meet enhanced contrast
- `CDOM_1_4_11_NON_TEXT_CONTRAST`: non-text UI contrast may be too low
- `CDOM_1_4_7_BACKGROUND_AUDIO`: background audio may interfere with speech
- `CDOM_1_4_8_VISUAL_PRESENTATION`: text presentation may not be adaptable
- `CDOM_1_4_9_IMAGES_OF_TEXT_NO_EXCEPTION`: image text may not have an AAA exception
- `CDOM_2_1_4_CHARACTER_KEY_SHORTCUTS`: single-character keyboard shortcut may not be adjustable
- `CDOM_2_1_3_KEYBOARD_NO_EXCEPTION`: functionality may not be keyboard operable without exception
- `CDOM_2_2_1_TIMING_ADJUSTABLE`: time limit may not be adjustable
- `CDOM_2_2_2_PAUSE_STOP_HIDE`: moving or auto-updating content may lack pause controls
- `CDOM_2_2_3_NO_TIMING`: task may depend on timing
- `CDOM_2_2_4_INTERRUPTION_CONTROL`: interruptions may not be postponable
- `CDOM_2_2_5_REAUTHENTICATING_DATA`: re-authentication may lose user data
- `CDOM_2_2_6_TIMEOUT_WARNING`: timeout may not warn about data loss
- `CDOM_2_3_1_FLASHING_CONTENT`: flashing content may exceed seizure thresholds
- `CDOM_2_3_2_THREE_FLASHES`: flashing content may violate AAA no-flash guidance
- `CDOM_2_3_3_ANIMATION_FROM_INTERACTIONS`: interaction-triggered animation may lack reduction controls
- `CDOM_2_4_5_MULTIPLE_WAYS`: content may only be reachable one way
- `CDOM_2_4_8_LOCATION_INDICATOR`: current location may not be indicated
- `CDOM_2_4_10_SECTION_HEADINGS`: long content may need section headings
- `CDOM_2_5_1_POINTER_GESTURES`: path or multipoint gesture may lack a simple pointer alternative
- `CDOM_2_5_4_MOTION_ACTUATION`: device motion may be required without an alternative
- `CDOM_2_5_7_DRAGGING_MOVEMENTS`: dragging movement may lack a non-drag alternative
- `CDOM_2_4_12_FOCUS_OBSCURED_ENHANCED`: focused control may be partially obscured
- `CDOM_2_4_13_FOCUS_APPEARANCE`: focus indicator may not meet appearance requirements
- `CDOM_2_5_5_TARGET_SIZE_ENHANCED`: interactive target may be smaller than enhanced target size
- `CDOM_2_5_6_CONCURRENT_INPUT`: input may restrict available modalities
- `CDOM_3_2_3_CONSISTENT_NAVIGATION`: navigation order may be inconsistent
- `CDOM_3_2_4_CONSISTENT_IDENTIFICATION`: repeated components may not be identified consistently
- `CDOM_3_2_6_CONSISTENT_HELP`: help location may be inconsistent
- `CDOM_3_1_3_UNUSUAL_WORDS`: unusual words or jargon may be unexplained
- `CDOM_3_1_4_ABBREVIATIONS`: abbreviations may be unexplained
- `CDOM_3_1_5_READING_LEVEL`: text may exceed lower secondary reading level
- `CDOM_3_1_6_PRONUNCIATION`: pronunciation-dependent words may be unexplained
- `CDOM_3_2_5_CHANGE_ON_REQUEST`: context change may occur without explicit request
- `CDOM_3_3_4_ERROR_PREVENTION_LEGAL_FINANCIAL_DATA`: high-impact submission may lack review or reversal
- `CDOM_3_3_5_HELP_AVAILABLE`: form help may be unavailable
- `CDOM_3_3_6_ERROR_PREVENTION_ALL`: submission may lack general error prevention
- `CDOM_3_3_7_REDUNDANT_ENTRY`: previously entered information may be requested again
- `CDOM_3_3_8_ACCESSIBLE_AUTHENTICATION`: authentication may require a cognitive function test
- `CDOM_3_3_9_ACCESSIBLE_AUTHENTICATION_ENHANCED`: authentication may require object recognition or personal content
- `CDOM_1_4_3_CONTRAST`: text contrast is below the minimum ratio
- `CDOM_2_4_7_FOCUS_VISIBLE`: focused control has no visible focus indicator
- `CDOM_2_5_8_TARGET_SIZE`: interactive target is smaller than WCAG minimum
- `CDOM_1_4_10_REFLOW`: page causes horizontal overflow at narrow viewport
- `CDOM_2_4_1_SKIP_LINK`: skip link is missing or not visible on focus
- `CDOM_1_4_12_TEXT_SPACING`: text spacing causes content loss or overlap
- `CDOM_1_4_13_HOVER_FOCUS_CONTENT`: hover or focus content is not dismissible or hoverable
- `CDOM_2_1_2_KEYBOARD_TRAP`: keyboard focus appears trapped
- `CDOM_2_4_11_FOCUS_OBSCURED`: focused control is fully obscured by author content

The score is automated guidance for developer workflow quality. It is not a legal compliance claim and does not replace manual accessibility testing.

## Roadmap

Current focus: high-confidence static checks, honest benchmark coverage, and low-friction developer feedback.

Next likely engine work: broaden high-confidence runtime coverage for additional CSS-dependent accessibility issues while keeping noisy detections out of the default rules.
