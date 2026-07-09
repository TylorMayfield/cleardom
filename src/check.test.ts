import * as assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";
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
  assert.equal(prepared.options.runtimeUrl, undefined);
  assert.match(prepared.messages[0] ?? "", /Source-only/);
});
