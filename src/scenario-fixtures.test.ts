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
