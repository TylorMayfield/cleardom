import * as assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { applyFixEdits, runSafeFixes, verifyFixRun, type FixEdit } from "./fixes.js";
import { rules } from "./rules/index.js";
import { scanSource } from "./scanner.js";

test("source-range edits preview and apply the exact same multi-edit result", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "cleardom-fixes-"));
  const file = path.join(directory, "Fixture.tsx");
  await writeFile(file, "first\nsecond\nthird\n", "utf8");
  const edits: FixEdit[] = [
    { file, line: 1, start: 0, end: 5, before: "first", after: "FIRST", description: "first edit" },
    { file, line: 3, start: 13, end: 18, before: "third", after: "THIRD", description: "third edit" }
  ];

  const preview = await applyFixEdits(edits, false);
  assert.equal(preview.applied, 0);
  assert.match(preview.diff, /-first\n\+FIRST/);
  assert.match(preview.diff, /-third\n\+THIRD/);
  assert.equal(await readFile(file, "utf8"), "first\nsecond\nthird\n");

  const applied = await applyFixEdits(edits, true);
  assert.equal(applied.applied, 2);
  assert.equal(applied.diff, preview.diff);
  assert.equal(await readFile(file, "utf8"), "FIRST\nsecond\nTHIRD\n");
});

test("stale or overlapping edits reject the entire batch before writing", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "cleardom-fixes-"));
  const first = path.join(directory, "First.tsx");
  const second = path.join(directory, "Second.tsx");
  await writeFile(first, "first", "utf8");
  await writeFile(second, "second", "utf8");

  const stale = await applyFixEdits([
    { file: first, line: 1, start: 0, end: 5, before: "first", after: "FIRST", description: "valid" },
    { file: second, line: 1, start: 0, end: 6, before: "stale!", after: "SECOND", description: "stale" }
  ], true);
  assert.match(stale.error ?? "", /changed after the fix plan/);
  assert.equal(await readFile(first, "utf8"), "first");
  assert.equal(await readFile(second, "utf8"), "second");

  const overlap = await applyFixEdits([
    { file: first, line: 1, start: 0, end: 4, before: "firs", after: "FIRS", description: "left" },
    { file: first, line: 1, start: 3, end: 5, before: "st", after: "ST", description: "right" }
  ], true);
  assert.match(overlap.error ?? "", /edits overlap/);
  assert.equal(await readFile(first, "utf8"), "first");
});

test("one placeholder autofix resolves duplicate label findings without overlapping edits", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "cleardom-fixes-"));
  const file = path.join(directory, "Form.tsx");
  const source = 'export const Form = () => <input placeholder="Email" />;';
  await writeFile(file, source, "utf8");
  const findings = scanSource(source, file).filter((finding) => finding.ruleId === "CDOM_3_3_2_PLACEHOLDER_LABEL" || finding.ruleId === "CDOM_4_1_2_FORM_LABEL");

  assert.equal(findings.length, 2);
  const applied = await runSafeFixes(findings, true);
  assert.equal(applied.error, undefined);
  assert.equal(applied.applied, 1);
  assert.match(await readFile(file, "utf8"), /placeholder="Email" aria-label="Email"/);
});

test("verification keeps an unchanged rule stable when another fix changes its target attributes", () => {
  const before = scanSource('<input placeholder="Email" />', "/tmp/Form.tsx");
  const after = scanSource('<input placeholder="Email" aria-label="Email" />', "/tmp/Form.tsx");
  const autocompleteBefore = before.find((finding) => finding.ruleId === "CDOM_1_3_5_AUTOCOMPLETE");
  const autocompleteAfter = after.find((finding) => finding.ruleId === "CDOM_1_3_5_AUTOCOMPLETE");
  assert.ok(autocompleteBefore);
  assert.ok(autocompleteAfter);
  assert.notEqual(autocompleteBefore.fingerprint, autocompleteAfter.fingerprint);

  const verification = verifyFixRun(before, before.filter((finding) => finding.ruleId !== "CDOM_1_3_5_AUTOCOMPLETE"), after);
  assert.equal(verification.introduced.some((finding) => finding.ruleId === "CDOM_1_3_5_AUTOCOMPLETE"), false);
});

test("safe fix metadata matches implemented non-speculative transforms", () => {
  assert.deepEqual(rules.filter((rule) => rule.fixable).map((rule) => rule.id).sort(), [
    "CDOM_2_4_3_POSITIVE_TABINDEX",
    "CDOM_3_3_2_PLACEHOLDER_LABEL",
    "CDOM_4_1_2_FORM_LABEL"
  ]);
});

test("positive tabindex autofix removes the offensive focus order", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "cleardom-fixes-"));
  const file = path.join(directory, "FocusOrder.tsx");
  const source = 'export const FocusOrder = () => <button tabIndex={3}>Save</button>;';
  await writeFile(file, source, "utf8");
  const findings = scanSource(source, file).filter((finding) => finding.ruleId === "CDOM_2_4_3_POSITIVE_TABINDEX");

  const applied = await runSafeFixes(findings, true);
  const updated = await readFile(file, "utf8");
  assert.equal(applied.applied, 1);
  assert.match(updated, /tabIndex=\{0\}/);
  assert.equal(scanSource(updated, file).some((finding) => finding.ruleId === "CDOM_2_4_3_POSITIVE_TABINDEX"), false);
});

test("safe fixes do not guess a React Native touchable role or label", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "cleardom-fixes-"));
  const file = path.join(directory, "Native.tsx");
  const source = 'export const Close = () => <Pressable onPress={close}><Icon /></Pressable>;';
  await writeFile(file, source, "utf8");
  const findings = scanSource(source, file);

  assert.equal(findings.some((finding) => finding.ruleId === "CDOM_4_1_2_NATIVE_ROLE"), true);
  assert.equal(findings.some((finding) => finding.ruleId === "CDOM_4_1_2_NATIVE_LABEL"), true);

  const applied = await runSafeFixes(findings, true);
  assert.equal(applied.applied, 0);
  assert.equal(await readFile(file, "utf8"), source);
  assert.equal(applied.actions.some((action) => action.finding.ruleId === "CDOM_4_1_2_NATIVE_ROLE" && action.outcome === "auto-fixable"), false);
  assert.equal(applied.actions.some((action) => action.finding.ruleId === "CDOM_4_1_2_NATIVE_LABEL" && action.outcome === "auto-fixable"), false);
});
