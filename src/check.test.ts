import * as assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { prepareCheck } from "./check.js";

test("check starts a detected dev server, discovers its URL, and stops it", async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "cleardom-check-"));
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({
    scripts: { dev: "node server.mjs" },
    dependencies: { vite: "latest", react: "latest" }
  }), "utf8");
  await fs.writeFile(path.join(root, "server.mjs"), [
    'import http from "node:http";',
    'const server = http.createServer((_request, response) => response.end("ok"));',
    'server.listen(0, "127.0.0.1", () => console.log(`http://localhost:${server.address().port}`));'
  ].join("\n"), "utf8");
  await fs.writeFile(path.join(root, "App.tsx"), "export const App = () => <button>Save</button>;", "utf8");

  const previousChrome = process.env.CHROME_PATH;
  process.env.CHROME_PATH = process.execPath;
  let prepared: Awaited<ReturnType<typeof prepareCheck>> | undefined;
  try {
    prepared = await prepareCheck(root, {});
    const url = prepared.options.runtimeUrl;
    assert.ok(url);
    assert.match(prepared.messages.join("\n"), /Started npm run dev/);
    assert.equal(await (await fetch(url)).text(), "ok");
  } finally {
    await prepared?.close();
    if (previousChrome === undefined) delete process.env.CHROME_PATH;
    else process.env.CHROME_PATH = previousChrome;
  }
});

test("source-only check does not start a runtime", async () => {
  const prepared = await prepareCheck(".", {}, true);
  assert.equal(prepared.options.runtimeUrl, "");
  assert.equal(prepared.options.runtime?.baseUrl, "");
  assert.match(prepared.messages[0] ?? "", /Source-only/);
});

test("check discovers a static Electron renderer from BrowserWindow.loadFile", async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "cleardom-electron-check-"));
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({
    main: "electron/main.js",
    dependencies: { electron: "latest", react: "latest" }
  }), "utf8");
  await fs.mkdir(path.join(root, "electron"), { recursive: true });
  await fs.writeFile(path.join(root, "electron", "main.js"), 'window.loadFile("renderer/index.html");', "utf8");
  await fs.mkdir(path.join(root, "renderer"), { recursive: true });
  await fs.writeFile(path.join(root, "renderer", "index.html"), "<main><button>Save</button></main>", "utf8");

  const prepared = await prepareCheck(root, {}, false, {
    resolveBrowserExecutable: async () => ({ executablePath: process.execPath, source: "system", message: "system" })
  });

  assert.ok(prepared.options.runtimeUrl?.startsWith("file:"));
  assert.equal(fileURLToPath(prepared.options.runtimeUrl ?? ""), path.join(root, "renderer", "index.html"));
  assert.deepEqual(prepared.options.runtime?.routes, ["/"]);
  assert.match(prepared.messages.join("\n"), /Electron renderer/);
});

test("check falls back to an Electron renderer dev server when no static renderer is available", async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "cleardom-electron-dev-check-"));
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({
    scripts: { dev: "node server.mjs" },
    dependencies: { electron: "latest", vite: "latest" }
  }), "utf8");
  await fs.writeFile(path.join(root, "server.mjs"), [
    'import http from "node:http";',
    'const server = http.createServer((_request, response) => response.end("renderer"));',
    'server.listen(0, "127.0.0.1", () => console.log(`http://localhost:${server.address().port}`));'
  ].join("\n"), "utf8");

  const prepared = await prepareCheck(root, {}, false, {
    resolveBrowserExecutable: async () => ({ executablePath: process.execPath, source: "system", message: "system" })
  });
  try {
    assert.match(prepared.messages.join("\n"), /Started npm run dev/);
    assert.equal(await (await fetch(prepared.options.runtimeUrl ?? "")).text(), "renderer");
  } finally {
    await prepared.close();
  }
});

test("check installs a managed browser after interactive approval", async () => {
  const root = await runtimeFixture();
  let browserLookups = 0;
  let installedAt = "";
  const prepared = await prepareCheck(root, {}, false, {
    isInteractive: () => true,
    confirmBrowserInstall: async () => true,
    installManagedBrowser: async (directory) => {
      installedAt = directory;
      return `${directory}/.cleardom/browser/chrome`;
    },
    resolveBrowserExecutable: async () => {
      browserLookups += 1;
      return browserLookups === 1
        ? { source: "missing", message: "missing" }
        : { executablePath: process.execPath, source: "managed", message: "managed" };
    }
  });

  try {
    assert.equal(installedAt, root);
    assert.equal(browserLookups, 2);
    assert.match(prepared.messages.join("\n"), /Installed managed Chromium/);
    assert.match(prepared.messages.join("\n"), /Running source and rendered checks/);
  } finally {
    await prepared.close();
  }
});

test("check keeps source-only fallback when browser installation is declined, unavailable, or fails", async () => {
  const root = await runtimeFixture();
  const missingBrowser = async () => ({ source: "missing" as const, message: "missing" });

  const declined = await prepareCheck(root, {}, false, {
    isInteractive: () => true,
    confirmBrowserInstall: async () => false,
    resolveBrowserExecutable: missingBrowser
  });
  assert.match(declined.messages.join("\n"), /installation was declined/);

  const nonInteractive = await prepareCheck(root, {}, false, {
    isInteractive: () => false,
    resolveBrowserExecutable: missingBrowser
  });
  assert.match(nonInteractive.messages.join("\n"), /Non-interactive runs do not download browsers/);

  const failed = await prepareCheck(root, {}, false, {
    isInteractive: () => true,
    confirmBrowserInstall: async () => true,
    installManagedBrowser: async () => { throw new Error("network unavailable"); },
    resolveBrowserExecutable: missingBrowser
  });
  assert.match(failed.messages.join("\n"), /installation failed: network unavailable/);
});

async function runtimeFixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(tmpdir(), "cleardom-check-"));
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({
    scripts: { dev: "node server.mjs" },
    dependencies: { vite: "latest", react: "latest" }
  }), "utf8");
  await fs.writeFile(path.join(root, "server.mjs"), [
    'import http from "node:http";',
    'const server = http.createServer((_request, response) => response.end("ok"));',
    'server.listen(0, "127.0.0.1", () => console.log(`http://localhost:${server.address().port}`));'
  ].join("\n"), "utf8");
  await fs.writeFile(path.join(root, "App.tsx"), "export const App = () => <button>Save</button>;", "utf8");
  return root;
}
