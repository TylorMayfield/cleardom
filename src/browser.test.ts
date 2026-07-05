import * as assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { resolveBrowserExecutable } from "./browser.js";
import { resolveScanOptions } from "./config.js";

test("browser resolver checks PATH before platform-specific locations", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "cleardom-browser-"));
  const executable = path.join(directory, process.platform === "win32" ? "chrome.exe" : "google-chrome");
  await fs.writeFile(executable, "#!/bin/sh\nexit 0\n", "utf8");
  await fs.chmod(executable, 0o755).catch(() => undefined);

  const previousPath = process.env.PATH;
  try {
    process.env.PATH = previousPath ? `${directory}${path.delimiter}${previousPath}` : directory;
    const options = await resolveScanOptions({ runtime: { browser: { mode: "system" } } });
    const resolution = await resolveBrowserExecutable(options);

    assert.equal(resolution.source, "system");
    assert.equal(path.resolve(resolution.executablePath ?? ""), executable);
  } finally {
    if (previousPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = previousPath;
    }
  }
});
