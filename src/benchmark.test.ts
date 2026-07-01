import * as assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { scanSource } from "./scanner.js";

test("WCAG benchmark fixture exercises every product static ClearDOM rule", async () => {
  const source = await fs.readFile(path.resolve("examples/wcag-benchmark/Fixture.tsx"), "utf8");
  const findings = scanSource(source, "examples/wcag-benchmark/Fixture.tsx");
  const ruleIds = new Set(findings.map((finding) => finding.ruleId));

  assert.deepEqual([...ruleIds].sort(), [
    "CDOM001",
    "CDOM002",
    "CDOM003",
    "CDOM004",
    "CDOM005",
    "CDOM006",
    "CDOM007",
    "CDOM008",
    "CDOM009",
    "CDOM010",
    "CDOM011",
    "CDOM012",
    "CDOM013",
    "CDOM014",
    "CDOM015",
    "CDOM016",
    "CDOM017",
    "CDOM018",
    "CDOM019",
    "CDOM020",
    "CDOM021",
    "CDOM027",
    "CDOM028",
    "CDOM029",
    "CDOM030"
  ]);
});

test("WCAG false-positive fixture has no ClearDOM findings", async () => {
  const source = await fs.readFile(path.resolve("examples/wcag-benchmark/FalsePositiveFixture.tsx"), "utf8");
  const findings = scanSource(source, "examples/wcag-benchmark/FalsePositiveFixture.tsx");

  assert.deepEqual(findings, []);
});

test("WCAG benchmark manifest covers every WCAG 2.2 A/AA criterion", async () => {
  const manifest = JSON.parse(await fs.readFile(path.resolve("examples/wcag-benchmark/manifest.json"), "utf8")) as { criteria: Array<{ id: string }> };
  const ids = manifest.criteria.map((criterion) => criterion.id);

  assert.deepEqual(ids, [
    "1.1.1",
    "1.2.1",
    "1.2.2",
    "1.2.3",
    "1.2.4",
    "1.2.5",
    "1.3.1",
    "1.3.2",
    "1.3.3",
    "1.3.4",
    "1.3.5",
    "1.4.1",
    "1.4.2",
    "1.4.3",
    "1.4.4",
    "1.4.5",
    "1.4.10",
    "1.4.11",
    "1.4.12",
    "1.4.13",
    "2.1.1",
    "2.1.2",
    "2.1.4",
    "2.2.1",
    "2.2.2",
    "2.3.1",
    "2.4.1",
    "2.4.2",
    "2.4.3",
    "2.4.4",
    "2.4.5",
    "2.4.6",
    "2.4.7",
    "2.4.11",
    "2.5.1",
    "2.5.2",
    "2.5.3",
    "2.5.4",
    "2.5.7",
    "2.5.8",
    "3.1.1",
    "3.1.2",
    "3.2.1",
    "3.2.2",
    "3.2.3",
    "3.2.4",
    "3.2.6",
    "3.3.1",
    "3.3.2",
    "3.3.3",
    "3.3.4",
    "3.3.7",
    "3.3.8",
    "4.1.2",
    "4.1.3"
  ]);
});
