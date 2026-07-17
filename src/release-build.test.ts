import * as assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

function runWriter(stage: string, secret?: string) {
  const directory = mkdtempSync(path.join(tmpdir(), "cleardom-release-"));
  const output = path.join(directory, "secret.ts");
  const env = { ...process.env };
  delete env.CLEARDOM_GA4_API_SECRET;
  if (secret !== undefined) env.CLEARDOM_GA4_API_SECRET = secret;
  const result = spawnSync(process.execPath, ["scripts/write-telemetry-secret.mjs", "--stage", stage, "--output", output], {
    cwd: process.cwd(),
    env,
    encoding: "utf8"
  });
  const contents = result.status === 0 ? readFileSync(output, "utf8") : "";
  rmSync(directory, { recursive: true, force: true });
  return { ...result, contents };
}

test("alpha release builds explicitly embed no GA4 secret when none is provisioned", () => {
  const result = runWriter("alpha");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.contents, /embeddedApiSecret = "";/);
  assert.doesNotMatch(result.contents, /placeholder/i);
});

test("beta and later release builds fail closed without a GA4 secret", () => {
  for (const stage of ["beta", "rc", "final"]) {
    const result = runWriter(stage);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /required for beta, RC, and final/);
  }
});

test("release secret validation rejects malformed values", () => {
  const result = runWriter("beta", "not valid");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unexpected format/);
});

test("a provisioned release secret is validated but never written into package source", () => {
  const secret = "valid_secret_123";
  const result = runWriter("beta", secret);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.contents, /embeddedApiSecret = "";/);
  assert.equal(result.contents.includes(secret), false);
});

test("release stage is derived consistently from tags and package lifecycle versions", () => {
  for (const [value, expected, source] of [
    ["v1.0.0-alpha.1", "alpha", "GITHUB_REF_NAME"],
    ["v1.0.0-beta.2", "beta", "GITHUB_REF_NAME"],
    ["v1.0.0-rc.3", "rc", "GITHUB_REF_NAME"],
    ["v1.0.0", "final", "GITHUB_REF_NAME"],
    ["1.0.0-alpha.1", "alpha", "npm_package_version"]
  ] as const) {
    const env = { ...process.env, CLEARDOM_RELEASE_STAGE: "", GITHUB_REF_NAME: "", npm_package_version: "", [source]: value };
    const result = spawnSync(process.execPath, ["scripts/print-release-stage.mjs"], { cwd: process.cwd(), env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), expected);
  }
});
