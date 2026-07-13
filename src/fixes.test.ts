import * as assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { applyFixEdits, type FixEdit } from "./fixes.js";

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
