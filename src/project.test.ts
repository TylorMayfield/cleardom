import * as assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { detectProjectStack } from "./project.js";

test("detects web-container platforms from dependencies and configuration", async () => {
  const cases = [
    { name: "Tauri", dependencies: {}, directory: "src-tauri" },
    { name: "Capacitor", dependencies: { "@capacitor/core": "7.0.0" } },
    { name: "Ionic", dependencies: {}, file: "ionic.config.json" },
    { name: "Browser Extension", dependencies: {}, manifest: { manifest_version: 3, name: "Fixture", version: "1.0.0" } }
  ];

  for (const fixture of cases) {
    const root = await mkdtemp(path.join(os.tmpdir(), "cleardom-platform-"));
    try {
      await writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies: fixture.dependencies }), "utf8");
      if (fixture.directory) await mkdir(path.join(root, fixture.directory));
      if (fixture.file) await writeFile(path.join(root, fixture.file), "{}", "utf8");
      if (fixture.manifest) await writeFile(path.join(root, "manifest.json"), JSON.stringify(fixture.manifest), "utf8");

      const detection = await detectProjectStack(root);
      assert.equal(detection.frameworks.includes(fixture.name), true, fixture.name);
      assert.equal(detection.webContainers.includes(fixture.name), true, fixture.name);
      assert.equal(detection.hasRuntimeApp, true, fixture.name);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("does not misclassify an ordinary PWA manifest as a browser extension", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cleardom-platform-"));
  try {
    await writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies: { vite: "7.0.0" } }), "utf8");
    await writeFile(path.join(root, "manifest.json"), JSON.stringify({ name: "PWA", start_url: "/", display: "standalone" }), "utf8");

    const detection = await detectProjectStack(root);
    assert.equal(detection.frameworks.includes("Vite"), true);
    assert.equal(detection.frameworks.includes("Browser Extension"), false);
    assert.deepEqual(detection.webContainers, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
