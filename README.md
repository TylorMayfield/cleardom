# ClearDOM

ClearDOM finds accessibility, readability, and assistive-tech regressions before they ship.

It is a CLI-first scanner for React, Next.js, Electron, React Native, web-container platforms, and web apps. ClearDOM uses compiler-backed analysis where the project exposes a supported compiler, a documented lightweight fallback for template sources, its own rendered web engine, and local simulator evidence for native applications.

ClearDOM 1.x requires Node.js 22.12 or newer. Its explicit per-stack GA boundaries are documented in [the support matrix](docs/SUPPORT_MATRIX.md); automated guidance is never presented as legal certification.

Product decisions are guided by [product.MD](product.MD).

## Quickstart

```sh
npx cleardom@1 check
npx cleardom@1 fix --apply
npx cleardom@1 --diff
npx cleardom@1 install
```

`check` is the primary command. It detects the project, scans source, starts a detected web app when possible, runs rendered browser checks, and shuts the app down. Use `--diff` while you work to scan changed files only, or `--source-only` when you intentionally do not want browser checks.

`fix --apply` applies only safe mechanical changes and automatically rescans the project. It reports fixed, remaining, and newly introduced findings. Without `--apply`, `fix` produces a focused coding-agent remediation prompt.

Existing projects can adopt gradually: commit a baseline once with `npx cleardom@1 scan . --write-baseline cleardom-baseline.json`, then use `npx cleardom@1 ci .` to fail only on regressions.

## PR reviewer in 60 seconds

```sh
npx cleardom@1 install
git add .github/workflows/cleardom.yml
git commit -m "Add ClearDOM PR review"
```

The installed workflow runs `cleardom review . --changed-files-only` on every pull request. It posts one sticky summary, adds capped inline comments on changed lines, and fails the status check only for newly introduced findings in changed files. Legacy accessibility debt can stay visible without blocking unrelated changes.

Preview the same comment locally before opening a PR:

```sh
npx cleardom@1 review . --dry-run
```

## Local development

```sh
pnpm install
pnpm build
pnpm scan:src
pnpm start -- scan examples/react-app
pnpm test:fast
pnpm test:runtime
pnpm test
pnpm docs:check
```

Use `pnpm scan:src` for ClearDOM's own source-health check. The examples include intentionally broken fixtures for rule coverage, and generated WCAG benchmark reports are skipped during ordinary recursive scans unless you target that reports directory directly.

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
cleardom [path|url]
cleardom check [path|url] [--diff] [--source-only]
cleardom fix [path] [--apply] [--rule CDOM_4_1_2_UNNAMED_CONTROL]
cleardom install
cleardom help --all
```

Run `cleardom help --all` for compatibility commands, CI controls, reports, baselines, native scanning, and advanced configuration.

## Product onboarding

Run the complete check, apply verified fixes, then install the PR reviewer when the local signal looks useful.

```sh
npx cleardom@1 check
npx cleardom@1 fix --apply
npx cleardom@1 install
```

ClearDOM detects common app stacks and UI libraries from `package.json` and project files. React, Next.js, Vite React, Solid, Electron renderer, React Native, and Expo projects get JSX/TSX semantic source scanning and component presets automatically. Vue, Svelte, Astro, and Angular projects use template source adapters. Vanilla JavaScript web projects can scan HTML and authored source without a config file.

Validated design-system package ranges and their pinned component examples are documented in [docs/DESIGN_SYSTEM_PRESETS.md](docs/DESIGN_SYSTEM_PRESETS.md).

Use `init` when you want a committed project config, baseline, runtime browser settings, native simulator settings, ownership routing, or suppression policy:

```sh
npx cleardom@1 init
npx cleardom@1 doctor .
```

`doctor` is the setup safety pass, not the first required step. It reports the detected stack and the next useful command for React, Solid, Electron, template frameworks, vanilla web, and Expo/React Native projects. `check` starts detected web apps automatically; use `--runtime-url` only for a server you already manage. For Expo and React Native, local simulator/emulator checks stay opt-in until `native.appIds`, a deep link, and local device tooling are configured.

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
npx cleardom@1 install
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

The installed GitHub Actions workflow runs `cleardom review . --changed-files-only` on pull requests. In Actions, that command uses `GITHUB_TOKEN` to scan the PR head and base commit, create or update one sticky PR summary comment, and add capped inline comments on changed lines for newly introduced findings. Pull requests fail only on new high-confidence automated findings in changed files, so legacy debt and advisory review items stay visible without blocking unrelated work. Outside Actions, use `--dry-run` to preview the same Markdown summary locally:

```sh
cleardom review . --dry-run
```

## Config

Create `cleardom.config.json` in the project root:

```json
{
  "$schema": "https://unpkg.com/cleardom@1/cleardom.schema.json",
  "schemaVersion": 1,
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
    "runner": "local",
    "platforms": ["ios"],
    "appIds": { "ios": "", "android": "" },
    "devices": { "ios": "", "android": "" },
    "deepLinks": [],
    "screens": [
      {
        "name": "settings-form",
        "deepLink": "acme://settings",
        "actions": [
          { "press": "label=\"Edit profile\"" },
          { "fill": "@e2", "text": "Ada Lovelace" }
        ]
      }
    ],
    "maxDurationMinutes": 20
  },
  "telemetry": { "enabled": true },
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

See [the ClearDOM 1.x support contract](docs/SUPPORT_MATRIX.md) for the complete React-family, template, web-container, Electron, React Native, and Expo matrix and its honest limitations.

ClearDOM documents framework support in tiers:

| Tier | Adapters | Support |
| --- | --- | --- |
| Full source semantics | JSX/TSX | React, Next.js, Remix, Gatsby, Vite React, Preact, Solid-style JSX, React Native, and Expo get TypeScript Program-backed static resolution when `--semantic auto` can initialize. |
| Template source adapters | HTML, Vue, Svelte, Astro, Angular templates | Static parsing extracts HTML-like markup and common binding/event aliases. Vue, Svelte, and Astro retain component import origins; Angular templates use imports from the adjacent `.component.ts` file. This enables import-scoped design-system mappings outside JSX. Pair with rendered checks for DOM and CSS evidence. |
| Content adapter | MDX | Authored markup is scanned while component import origins are retained and fenced examples are ignored. |

Electron renderers use the web rule engine. `cleardom check` detects Electron dependencies and configuration, then either audits a static renderer discovered from `BrowserWindow.loadFile(...)` or starts the project's renderer development server and attaches to its local URL. Main and preload process source remains in the source scan when it uses a supported extension; accessibility findings apply to renderer UI rather than Electron's Node-side APIs.

Tauri, Capacitor, Ionic, and browser-extension projects are detected as web-container platforms and reuse the same source and rendered rule engine. Conventional dev scripts work with `cleardom check`; packaged-only surfaces such as extension popups/options pages or embedded webviews can be covered through configured runtime routes or built HTML targets. A normal PWA `manifest.json` is not treated as a browser extension unless it declares extension `manifest_version` 2 or 3.

`--semantic auto` is the default. For JavaScript, TypeScript, JSX, and TSX files, ClearDOM builds a TypeScript Program and resolves safe static semantics such as string constants, simple imported constants, object-literal prop spreads, numeric literals, template literals without dynamic holes, and simple intrinsic tag aliases. Use `--semantic off` to force the lightweight adapters, or `--semantic required` when CI should fail if compiler-backed source analysis cannot initialize. JSON output includes `semanticAnalysis` and `semanticDiagnostics`.

JSON output also includes an `outcome` contract for automation and local measurement: completed source files, whether rendered checks were requested, attempted/completed/failed rendered pages, finding detection modes, fix kinds, suppressions, baselined findings, and regressions. ClearDOM does not upload this information. Coding agents can request a structured remediation task with `cleardom fix . --json`.

Web runtime checks use Chromium through `puppeteer-core` for issues that static source cannot see. In addition to CSS, focus, keyboard, viewport, and interaction checks, the rendered semantic pass catches dynamically generated unnamed controls, unlabeled form controls, focusable content hidden from assistive technology, duplicate IDs, unsupported ARIA roles, broken ARIA references, and missing or invalid widget states. ClearDOM looks for an explicit browser path, `CHROME_PATH`, `PUPPETEER_EXECUTABLE_PATH`, a managed browser installed with `cleardom browser install`, and then common system Chrome locations. When an interactive `cleardom check` cannot find one, it offers to install a project-local managed browser; non-interactive runs complete source checks and explain how to enable rendered checks. Start your web app locally, then pass `--runtime-url` or configure `runtime.baseUrl`.

The `runtime` block supports explicit `routes`, safe route discovery from common framework file layouts, optional same-origin crawl, interaction presets/scripts, Storybook story scanning, multiple `viewports`, auth/setup scripts, custom headers, cookies, localStorage, wait strategy, selectors, timeouts, and screenshot evidence. URL scans and runtime scans reuse a single browser session. JSON and HTML reports include runtime diagnostics plus selector and screenshot evidence for runtime findings.

React Native checks provide compiler-backed source guidance for iOS and Android semantics. For device evidence, configure platform-specific `native.appIds` and run `cleardom native scan .` against a local iOS Simulator or Android Emulator. ClearDOM checks the local tools, selected device, installed application, capabilities, and launch before scanning structured accessibility trees. Typed `press`, `fill`, `swipe`, `back`, `waitFor`, and `assert` actions capture evidence after every transition. Physical devices remain preview-only; VoiceOver, TalkBack, switch control, magnification, and testing with disabled users remain explicit manual procedures.

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
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version: 22.12
      - run: npx cleardom@1 review . --changed-files-only
        if: github.event_name == 'pull_request'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - run: npx cleardom@1 ci . --format sarif > cleardom.sarif
        if: github.event_name != 'pull_request'
      - uses: github/codeql-action/upload-sarif@641a925cfafe92d0fdf8b239ba4053e3f8d99d6d # v3
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
- `CDOM_4_1_2_INVALID_ARIA_ROLE`: rendered element uses an unsupported ARIA role
- `CDOM_4_1_2_ARIA_REFERENCE`: rendered ARIA relationship references a missing element
- `CDOM_4_1_2_ARIA_STATE`: rendered ARIA widget has a missing or invalid state

The score is automated guidance for developer workflow quality. It is not a legal compliance claim and does not replace manual accessibility testing.

## Roadmap

Current focus: passing the evidence gates in [docs/RELEASE_GATES.md](docs/RELEASE_GATES.md), including per-stack conformance, a pinned OSS corpus, local native reliability, verified fixes, security hardening, and measured precision.

Version 1.0 is not released merely when features exist. `pnpm release:gates` remains failing until all required corpus, performance, native, runtime, fix, telemetry-secret, and precision evidence is present on the release commit.

The repository includes generated stack-owned conformance applications and a pinned OSS shadow corpus. Run `pnpm conformance:generate`, `pnpm test:conformance`, `pnpm test:conformance:runtime`, and `pnpm test:corpus` to reproduce those evidence inputs, then `pnpm evidence:assemble` after every required same-commit job has produced its fragment. Scanner output and reviewed corpus ground truth are deliberately stored separately; the final gate recomputes precision rather than trusting supplied decimals.

## Telemetry and privacy

Anonymous product telemetry is on by default, including in non-interactive and CI runs. Set `CLEARDOM_TELEMETRY=0` for the highest-precedence opt-out, set `"telemetry": { "enabled": false }` in project configuration, or run `cleardom telemetry disable` for a local preference. Precedence is environment, local preference, then project/default. Use `cleardom telemetry status|reset` to inspect the effective setting or delete the local installation identifier. ClearDOM never sends source, paths, URLs, repository names, labels, screenshots, configuration, Git data, or authentication values. Telemetry delivery failure never changes scan behavior.

The random local installation identifier remains only on the developer machine until `cleardom telemetry reset` is run. The ClearDOM GA4 property must use the minimum two-month event-data retention before beta; release evidence records that setting. Aggregate, non-user-level reporting may outlive that window under GA4's service behavior. Disabling telemetry stops future events; resetting also deletes the local identifier.
