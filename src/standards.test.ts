import * as assert from "node:assert/strict";
import { test } from "node:test";
import { resolveStandardId, ruleAppliesToStandard, standards } from "./standards.js";
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

test("filters rules by selected standard", () => {
  const rule = findRule("CDOM001");
  const autocompleteRule = findRule("CDOM012");

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
