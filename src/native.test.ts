import * as assert from "node:assert/strict";
import { test } from "node:test";
import { nativeActionCommand, runNativeScan } from "./native.js";
import { resolveScanOptions } from "./config.js";
import { scanPath } from "./scanner.js";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

test("native action commands use agent-device press and fill verbs", () => {
  assert.deepEqual(nativeActionCommand({ press: 'label="Open settings"' }), ["press", 'label="Open settings"']);
  assert.deepEqual(nativeActionCommand({ fill: "@e2", text: "hello@example.com" }), ["fill", "@e2", "hello@example.com"]);
  assert.equal(nativeActionCommand({ fill: "@e2" }), undefined);
  assert.equal(nativeActionCommand({}), undefined);
  assert.deepEqual(nativeActionCommand({ swipe: "down" }), ["scroll", "down"]);
  assert.deepEqual(nativeActionCommand({ back: true }), ["back"]);
  assert.deepEqual(nativeActionCommand({ waitFor: 'label="Done"' }), ["wait", 'label="Done"']);
});

test("native structured evidence reports direct failures and review-only target size", async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "cleardom-native-structured-"));
  await fs.writeFile(path.join(root, "App.tsx"), "export const App = () => null;", "utf8");
  const options = await resolveScanOptions({ native: { enabled: true, platforms: ["android"], appIds: { android: "com.example" } } }, root);
  const staticResult = await scanPath(root, { native: { enabled: false } });
  const previous = process.env.CLEARDOM_NATIVE_MOCK_SNAPSHOT;
  process.env.CLEARDOM_NATIVE_MOCK_SNAPSHOT = JSON.stringify({ nodes: [{ index: 0, ref: "e1", type: "button", role: "button", rect: { x: 0, y: 0, width: 20, height: 20 }, visibleToUser: true, hittable: true }] });
  try {
    const result = await runNativeScan(root, options, staticResult);
    const label = result.findings.find((finding) => finding.ruleId === "CDOM_NATIVE_RUNTIME_LABEL");
    const size = result.findings.find((finding) => finding.ruleId === "CDOM_NATIVE_RUNTIME_TARGET_SIZE");
    assert.equal(label?.blocking, true);
    assert.equal(label?.detectionMode, "automated");
    assert.equal(size?.blocking, false);
    assert.deepEqual(size?.native?.element?.bounds, { x: 0, y: 0, width: 20, height: 20 });
  } finally {
    if (previous === undefined) delete process.env.CLEARDOM_NATIVE_MOCK_SNAPSHOT;
    else process.env.CLEARDOM_NATIVE_MOCK_SNAPSHOT = previous;
  }
});

test("native runtime evidence checks stateful control values", async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "cleardom-native-state-"));
  await fs.writeFile(path.join(root, "App.tsx"), "export const App = () => null;", "utf8");
  const options = await resolveScanOptions({ native: { enabled: true, platforms: ["ios"] } }, root);
  const staticResult = await scanPath(root, { native: { enabled: false } });
  const previous = process.env.CLEARDOM_NATIVE_MOCK_SNAPSHOT;
  process.env.CLEARDOM_NATIVE_MOCK_SNAPSHOT = '@e1 label="Notifications" role="switch"\n@e2 label="Dark mode" role="switch" value="on"';
  try {
    const result = await runNativeScan(root, options, staticResult);
    assert.equal(result.findings.some((finding) => finding.ruleId === "CDOM_NATIVE_RUNTIME_STATE" && finding.excerpt.includes("Notifications")), true);
    assert.equal(result.findings.some((finding) => finding.ruleId === "CDOM_NATIVE_RUNTIME_STATE" && finding.excerpt.includes("Dark mode")), false);
  } finally {
    if (previous === undefined) delete process.env.CLEARDOM_NATIVE_MOCK_SNAPSHOT;
    else process.env.CLEARDOM_NATIVE_MOCK_SNAPSHOT = previous;
  }
});

test("native structured evidence checks headings, modal containment, and traversal risks", async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "cleardom-native-semantics-"));
  await fs.writeFile(path.join(root, "App.tsx"), "export const App = () => null;", "utf8");
  const options = await resolveScanOptions({ native: { enabled: true, platforms: ["ios"] } }, root);
  const staticResult = await scanPath(root, { native: { enabled: false } });
  const previous = process.env.CLEARDOM_NATIVE_MOCK_SNAPSHOT;
  process.env.CLEARDOM_NATIVE_MOCK_SNAPSHOT = JSON.stringify({ nodes: [
    { index: 0, ref: "e1", role: "dialog", label: "Settings", presentationHints: ["modal"], visibleToUser: true },
    { index: 1, ref: "e2", parentIndex: 0, role: "heading", visibleToUser: true },
    { index: 2, ref: "e3", parentIndex: 0, role: "button", label: "Close", rect: { x: 0, y: 100, width: 44, height: 44 }, visibleToUser: true, hittable: true },
    { index: 3, ref: "e4", role: "button", label: "Background", rect: { x: 0, y: 0, width: 44, height: 44 }, visibleToUser: true, hittable: true }
  ] });
  try {
    const result = await runNativeScan(root, options, staticResult);
    assert.equal(result.findings.some((finding) => finding.ruleId === "CDOM_NATIVE_RUNTIME_HEADING" && finding.blocking), true);
    assert.equal(result.findings.some((finding) => finding.ruleId === "CDOM_NATIVE_RUNTIME_MODAL_CONTAINMENT" && finding.blocking), true);
    assert.equal(result.findings.some((finding) => finding.ruleId === "CDOM_NATIVE_RUNTIME_TRAVERSAL_ORDER" && !finding.blocking), true);
  } finally {
    if (previous === undefined) delete process.env.CLEARDOM_NATIVE_MOCK_SNAPSHOT;
    else process.env.CLEARDOM_NATIVE_MOCK_SNAPSHOT = previous;
  }
});
