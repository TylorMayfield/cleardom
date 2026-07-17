import * as assert from "node:assert/strict";
import { test } from "node:test";
import { assembleEvidence, calculateReviewedPrecision, type EvidenceFragment } from "./release-evidence.js";

test("precision uses current detection mode while preserving historical false positives", () => {
  const projects = [{ id: "app", labels: [
    { fingerprint: "tp", ruleId: "RULE", verdict: "true-positive" },
    { fingerprint: "downgraded", ruleId: "RULE", verdict: "false-positive" },
    { fingerprint: "resolved", ruleId: "RULE", verdict: "false-positive" }
  ] }];
  const findings = new Map([["app", [
    { fingerprint: "tp", ruleId: "RULE", detectionMode: "automated" },
    { fingerprint: "downgraded", ruleId: "RULE", detectionMode: "needs-review" }
  ]]]);
  const precision = calculateReviewedPrecision(projects, findings);
  assert.deepEqual(precision.aggregate, { truePositive: 1, falsePositive: 0, sampleSize: 1, precision: 1 });
  assert.equal(precision.reviewedNonAutomated, 1);
  assert.equal(precision.resolvedFalsePositives, 1);
});

test("evidence assembly rejects missing, stale, duplicate, and secret-bearing fragments", () => {
  const fragment = (category: string, values: Record<string, unknown> = {}, commit = "abc"): EvidenceFragment => ({ schemaVersion: 1, kind: "cleardom-release-evidence-fragment", category, commit, values });
  assert.throws(() => assembleEvidence("abc", [fragment("precision")], ["precision", "security"]), /Missing release evidence/);
  assert.throws(() => assembleEvidence("abc", [fragment("precision", {}, "old")], ["precision"]), /bound to old/);
  assert.throws(() => assembleEvidence("abc", [fragment("precision"), fragment("precision")], ["precision"]), /Duplicate/);
  assert.throws(() => assembleEvidence("abc", [fragment("security", { apiSecret: "do-not-store" })], ["security"]), /Secret-like key/);
  assert.throws(() => assembleEvidence("abc", [fragment("one", { metric: 1 }), fragment("two", { metric: 2 })], ["one", "two"]), /Duplicate release evidence value/);
});

test("evidence assembly merges unique same-commit measurements", () => {
  const fragments: EvidenceFragment[] = [
    { schemaVersion: 1, kind: "cleardom-release-evidence-fragment", category: "precision", commit: "abc", values: { aggregateAutomatedPrecision: 1 } },
    { schemaVersion: 1, kind: "cleardom-release-evidence-fragment", category: "security", commit: "abc", values: { securityReviewClear: true } }
  ];
  assert.deepEqual(assembleEvidence("abc", fragments, ["precision", "security"]), { schemaVersion: 1, commit: "abc", aggregateAutomatedPrecision: 1, securityReviewClear: true });
});
