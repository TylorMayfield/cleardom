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
  assert.equal(ruleIds.has("CDOM001"), true);
  assert.equal(ruleIds.has("CDOM004"), true);
  assert.equal(ruleIds.has("CDOM005"), true);
  assert.equal(ruleIds.has("CDOM006"), true);
  assert.equal(ruleIds.has("CDOM007"), true);
  assert.equal(ruleIds.has("CDOM008"), true);
  assert.equal(ruleIds.has("CDOM010"), true);
  assert.equal(ruleIds.has("CDOM011"), true);
  assert.equal(ruleIds.has("CDOM019"), true);
  assert.equal(result.findings.some((finding) => finding.file.endsWith("page.test.tsx")), false);
});

test("React design-system fixture uses component mappings and presets", async () => {
  const result = await scanPath(path.join(fixturesRoot, "react-design-system"), {
    configPath: path.join(fixturesRoot, "react-design-system", "cleardom.config.json")
  });
  const ruleIds = new Set(result.findings.map((finding) => finding.ruleId));

  assert.equal(result.checkedFiles, 1);
  assert.equal(ruleIds.has("CDOM001"), true);
  assert.equal(ruleIds.has("CDOM004"), true);
  assert.equal(ruleIds.has("CDOM013"), true);
  assert.equal(result.findings.some((finding) => finding.excerpt.includes("IconButton")), false);
});

test("React Native fixture catches native label and role issues", async () => {
  const result = await scanPath(path.join(fixturesRoot, "react-native-app"), {
    configPath: path.join(fixturesRoot, "react-native-app", "cleardom.config.json")
  });
  const ruleIds = new Set(result.findings.map((finding) => finding.ruleId));

  assert.equal(result.checkedFiles, 1);
  assert.equal(ruleIds.has("CDOM002"), true);
  assert.equal(ruleIds.has("CDOM004"), true);
  assert.equal(ruleIds.has("CDOM009"), true);
  assert.equal(result.findings.some((finding) => finding.excerpt.includes("TouchableOpacity")), false);
});

test("monorepo fixture scans package sources while ignoring specs and build output", async () => {
  const result = await scanPath(path.join(fixturesRoot, "monorepo"), {
    configPath: path.join(fixturesRoot, "monorepo", "cleardom.config.json")
  });
  const files = new Set(result.findings.map((finding) => path.basename(finding.file)));
  const ruleIds = new Set(result.findings.map((finding) => finding.ruleId));

  assert.equal(result.checkedFiles, 2);
  assert.equal(ruleIds.has("CDOM001"), true);
  assert.equal(ruleIds.has("CDOM002"), true);
  assert.equal(ruleIds.has("CDOM006"), true);
  assert.equal(ruleIds.has("CDOM009"), true);
  assert.equal(files.has("Button.spec.tsx"), false);
  assert.equal(files.has("IgnoredBuild.js"), false);
  assert.equal(files.has("IgnoredNextBuild.js"), false);
});

