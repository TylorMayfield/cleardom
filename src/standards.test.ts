import * as assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { test } from "node:test";
import { resolveStandardId, ruleAppliesToStandard, standards, wcag22Criteria } from "./standards.js";
import { findRule } from "./rules/index.js";

test("supports every WCAG iteration profile", () => {
  assert.deepEqual(standards.map((standard) => standard.id), [
    "wcag10",
    "wcag20-a",
    "wcag20-aa",
    "wcag20-aaa",
    "wcag21-a",
    "wcag21-aa",
    "wcag21-aaa",
    "wcag22-a",
    "wcag22-aa",
    "wcag22-aaa",
    "wcag30-draft"
  ]);
});

test("resolves current and latest to WCAG 2.2 AA", () => {
  assert.equal(resolveStandardId("current"), "wcag22-aa");
  assert.equal(resolveStandardId("latest"), "wcag22-aa");
  assert.equal(resolveStandardId(undefined), "wcag22-aa");
});

test("tracks the full WCAG 2.2 success criteria catalog", () => {
  assert.equal(wcag22Criteria.length, 86);
  assert.equal(wcag22Criteria.filter((criterion) => criterion.level === "a" || criterion.level === "aa").length, 55);
  assert.equal(wcag22Criteria.filter((criterion) => criterion.level === "aaa").length, 31);
  assert.equal(wcag22Criteria.some((criterion) => criterion.criterion === "4.1.1"), false);
  assert.equal(wcag22Criteria.at(0)?.criterion, "1.1.1");
  assert.equal(wcag22Criteria.at(-1)?.criterion, "4.1.3");
});

test("WCAG 2.2 AA benchmark manifest matches the A/AA catalog", async () => {
  const manifest = JSON.parse(await fs.readFile("examples/wcag-benchmark/manifest.json", "utf8")) as { criteria: Array<{ id: string }> };
  const catalogIds = wcag22Criteria
    .filter((criterion) => criterion.level === "a" || criterion.level === "aa")
    .map((criterion) => criterion.criterion);

  assert.deepEqual(manifest.criteria.map((criterion) => criterion.id), catalogIds);
});

test("WCAG documentation includes every WCAG 2.2 criterion", async () => {
  const documentation = await fs.readFile("WCAG_rules_documentation.md", "utf8");

  assert.match(documentation, /WCAG 2\.2 total success criteria \\| 86/);
  assert.match(documentation, /WCAG 2\.2 Level A \\+ AA criteria \\| 55/);
  assert.match(documentation, /WCAG 2\.2 Level AAA criteria \\| 31/);

  for (const criterion of wcag22Criteria) {
    assert.match(documentation, new RegExp(`\\\\| ${criterion.criterion.replaceAll(".", "\\\\.")} \\\\|`), `${criterion.criterion} should be documented`);
  }
});

test("filters rules by selected standard", () => {
  const rule = findRule("CDOM_4_1_2_UNNAMED_CONTROL");
  const autocompleteRule = findRule("CDOM_1_3_5_AUTOCOMPLETE");

  assert.ok(rule);
  assert.ok(autocompleteRule);
  assert.equal(ruleAppliesToStandard(rule, "wcag10"), true);
  assert.equal(ruleAppliesToStandard(rule, "wcag20-a"), true);
  assert.equal(ruleAppliesToStandard(rule, "wcag22-aa"), true);
  assert.equal(ruleAppliesToStandard(rule, "wcag30-draft"), true);
  assert.equal(ruleAppliesToStandard(autocompleteRule, "wcag20-aa"), false);
  assert.equal(ruleAppliesToStandard(autocompleteRule, "wcag22-aa"), true);
});

test("rejects unknown standards", () => {
  assert.throws(() => resolveStandardId("wcag19-aa"), /Unknown WCAG standard/);
});
