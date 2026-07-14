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
