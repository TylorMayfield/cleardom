import * as assert from "node:assert/strict";
import * as path from "node:path";
import { test } from "node:test";
import { scanPath } from "./scanner.js";

const fixturesRoot = path.resolve("examples/scenario-fixtures");

test("Next.js App Router fixture scans nested routes and honors exclusions", async () => {
  const result = await scanPath(path.join(fixturesRoot, "next-app"), {
    configPath: path.join(fixturesRoot, "next-app", "cleardom.config.json")
  });
  const ruleIds = new Set(result.findings.map((finding) => finding.ruleId));

  assert.equal(result.checkedFiles, 3);
  assert.equal(ruleIds.has("CDOM_4_1_2_UNNAMED_CONTROL"), true);
  assert.equal(ruleIds.has("CDOM_3_3_2_PLACEHOLDER_LABEL"), true);
  assert.equal(ruleIds.has("CDOM_1_1_1_IMAGE_ALT"), true);
  assert.equal(ruleIds.has("CDOM_4_1_2_ANCHOR_HREF"), true);
  assert.equal(ruleIds.has("CDOM_2_1_1_KEYBOARD"), true);
  assert.equal(ruleIds.has("CDOM_1_3_1_HEADING_ORDER"), true);
  assert.equal(ruleIds.has("CDOM_4_1_2_FORM_LABEL"), true);
  assert.equal(ruleIds.has("CDOM_3_1_1_DOCUMENT_METADATA"), true);
  assert.equal(ruleIds.has("CDOM_1_3_1_FIELDSET_LEGEND"), true);
  assert.equal(result.findings.some((finding) => finding.file.endsWith("page.test.tsx")), false);
});

test("React design-system fixture uses component mappings and presets", async () => {
  const result = await scanPath(path.join(fixturesRoot, "react-design-system"), {
    configPath: path.join(fixturesRoot, "react-design-system", "cleardom.config.json")
  });
  const ruleIds = new Set(result.findings.map((finding) => finding.ruleId));

  assert.equal(result.checkedFiles, 1);
  assert.equal(ruleIds.has("CDOM_4_1_2_UNNAMED_CONTROL"), true);
  assert.equal(ruleIds.has("CDOM_3_3_2_PLACEHOLDER_LABEL"), true);
  assert.equal(ruleIds.has("CDOM_2_5_3_LABEL_IN_NAME"), true);
  assert.equal(result.findings.some((finding) => finding.excerpt.includes("IconButton")), false);
});

test("React Native fixture catches native label and role issues", async () => {
  const result = await scanPath(path.join(fixturesRoot, "react-native-app"), {
    configPath: path.join(fixturesRoot, "react-native-app", "cleardom.config.json")
  });
  const ruleIds = new Set(result.findings.map((finding) => finding.ruleId));

  assert.equal(result.checkedFiles, 1);
  assert.equal(ruleIds.has("CDOM_4_1_2_NATIVE_LABEL"), true);
  assert.equal(ruleIds.has("CDOM_3_3_2_PLACEHOLDER_LABEL"), true);
  assert.equal(ruleIds.has("CDOM_4_1_2_NATIVE_ROLE"), true);
  assert.equal(result.findings.some((finding) => finding.excerpt.includes("TouchableOpacity")), false);
});

test("monorepo fixture scans package sources while ignoring specs and build output", async () => {
  const result = await scanPath(path.join(fixturesRoot, "monorepo"), {
    configPath: path.join(fixturesRoot, "monorepo", "cleardom.config.json")
  });
  const files = new Set(result.findings.map((finding) => path.basename(finding.file)));
  const ruleIds = new Set(result.findings.map((finding) => finding.ruleId));

  assert.equal(result.checkedFiles, 2);
  assert.equal(ruleIds.has("CDOM_4_1_2_UNNAMED_CONTROL"), true);
  assert.equal(ruleIds.has("CDOM_4_1_2_NATIVE_LABEL"), true);
  assert.equal(ruleIds.has("CDOM_4_1_2_ANCHOR_HREF"), true);
  assert.equal(ruleIds.has("CDOM_4_1_2_NATIVE_ROLE"), true);
  assert.equal(files.has("Button.spec.tsx"), false);
  assert.equal(files.has("IgnoredBuild.js"), false);
  assert.equal(files.has("IgnoredNextBuild.js"), false);
});

test("framework matrix scans common JavaScript and TypeScript framework files", async () => {
  const result = await scanPath(path.join(fixturesRoot, "framework-matrix"), {
    configPath: path.join(fixturesRoot, "framework-matrix", "cleardom.config.json")
  });
  const ruleIds = new Set(result.findings.map((finding) => finding.ruleId));
  const files = new Set(result.findings.map((finding) => path.basename(finding.file)));

  assert.equal(result.checkedFiles, 7);
  assert.equal(ruleIds.has("CDOM_4_1_2_UNNAMED_CONTROL"), true);
  assert.equal(ruleIds.has("CDOM_1_1_1_IMAGE_ALT"), true);
  assert.equal(ruleIds.has("CDOM_2_1_1_KEYBOARD"), true);
  assert.equal(ruleIds.has("CDOM_1_3_5_AUTOCOMPLETE"), true);
  assert.equal(files.has("Checkout.vue"), true);
  assert.equal(files.has("Checkout.svelte"), true);
  assert.equal(files.has("Checkout.astro"), true);
  assert.equal(files.has("checkout.component.html"), true);
  assert.equal(files.has("Checkout.mdx"), true);
});

test("framework demos detect common accessibility issues in each supported framework", async () => {
  const fixtureRoot = path.join(fixturesRoot, "framework-demos");
  const result = await scanPath(fixtureRoot, {
    configPath: path.join(fixtureRoot, "cleardom.config.json")
  });
  const findingsByFile = findingsGroupedByFixturePath(result.findings, "framework-demos");
  const expected: Record<string, string[]> = {
    "src/angular/checkout.component.html": [
      "CDOM_1_1_1_IMAGE_ALT",
      "CDOM_1_3_5_AUTOCOMPLETE",
      "CDOM_2_1_1_KEYBOARD",
      "CDOM_4_1_2_UNNAMED_CONTROL"
    ],
    "src/astro/Checkout.astro": [
      "CDOM_1_1_1_IMAGE_ALT",
      "CDOM_1_3_1_HEADING_ORDER",
      "CDOM_1_3_5_AUTOCOMPLETE",
      "CDOM_4_1_2_UNNAMED_CONTROL"
    ],
    "src/expo/ProfileScreen.tsx": [
      "CDOM_3_3_2_PLACEHOLDER_LABEL",
      "CDOM_4_1_2_FORM_LABEL",
      "CDOM_4_1_2_NATIVE_LABEL",
      "CDOM_4_1_2_NATIVE_ROLE"
    ],
    "src/html/index.html": [
      "CDOM_1_1_1_IMAGE_ALT",
      "CDOM_1_3_5_AUTOCOMPLETE",
      "CDOM_2_1_1_KEYBOARD",
      "CDOM_3_1_1_DOCUMENT_METADATA",
      "CDOM_4_1_2_UNNAMED_CONTROL"
    ],
    "src/mdx/Checkout.mdx": [
      "CDOM_1_1_1_IMAGE_ALT",
      "CDOM_4_1_2_ANCHOR_HREF",
      "CDOM_4_1_2_UNNAMED_CONTROL"
    ],
    "src/next/app/page.tsx": [
      "CDOM_1_3_1_HEADING_ORDER",
      "CDOM_1_3_5_AUTOCOMPLETE",
      "CDOM_3_3_2_PLACEHOLDER_LABEL",
      "CDOM_4_1_2_ANCHOR_HREF",
      "CDOM_4_1_2_FORM_LABEL"
    ],
    "src/react/App.tsx": [
      "CDOM_1_1_1_IMAGE_ALT",
      "CDOM_1_3_5_AUTOCOMPLETE",
      "CDOM_2_1_1_KEYBOARD",
      "CDOM_4_1_2_UNNAMED_CONTROL"
    ],
    "src/solid/App.tsx": [
      "CDOM_1_3_5_AUTOCOMPLETE",
      "CDOM_2_1_1_KEYBOARD",
      "CDOM_4_1_2_FORM_LABEL",
      "CDOM_4_1_2_UNNAMED_CONTROL"
    ],
    "src/svelte/Checkout.svelte": [
      "CDOM_2_1_1_KEYBOARD",
      "CDOM_4_1_2_ANCHOR_HREF",
      "CDOM_4_1_2_UNNAMED_CONTROL"
    ],
    "src/vue/Checkout.vue": [
      "CDOM_1_1_1_IMAGE_ALT",
      "CDOM_1_3_5_AUTOCOMPLETE",
      "CDOM_2_1_1_KEYBOARD",
      "CDOM_3_3_2_PLACEHOLDER_LABEL",
      "CDOM_4_1_2_FORM_LABEL",
      "CDOM_4_1_2_UNNAMED_CONTROL"
    ]
  };

  assert.equal(result.checkedFiles, Object.keys(expected).length);
  for (const [file, ruleIds] of Object.entries(expected)) {
    const actual = findingsByFile.get(file) ?? new Set<string>();
    for (const ruleId of ruleIds) {
      assert.equal(actual.has(ruleId), true, `${file} should report ${ruleId}`);
    }
  }
});

function findingsGroupedByFixturePath(findings: Array<{ file: string; ruleId: string }>, fixtureName: string): Map<string, Set<string>> {
  const grouped = new Map<string, Set<string>>();
  for (const finding of findings) {
    const marker = `${fixtureName}${path.sep}`;
    const markerIndex = finding.file.indexOf(marker);
    const key = markerIndex === -1
      ? path.basename(finding.file)
      : finding.file.slice(markerIndex + marker.length).replace(/\\/g, "/");
    const rules = grouped.get(key) ?? new Set<string>();
    rules.add(finding.ruleId);
    grouped.set(key, rules);
  }
  return grouped;
}
