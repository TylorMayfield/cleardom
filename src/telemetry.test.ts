import * as assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { resolveTelemetryPreference, telemetryPreference, trackTelemetry } from "./telemetry.js";

test("telemetry defaults on, persists one identifier, and honors local and environment opt-outs", async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "cleardom-telemetry-state-"));
  const previousConfigHome = process.env.XDG_CONFIG_HOME;
  const previousSecret = process.env.CLEARDOM_GA4_API_SECRET;
  const previousTelemetry = process.env.CLEARDOM_TELEMETRY;
  const previousFetch = globalThis.fetch;
  const clientIds: string[] = [];
  process.env.XDG_CONFIG_HOME = root;
  process.env.CLEARDOM_GA4_API_SECRET = "test_secret_123";
  delete process.env.CLEARDOM_TELEMETRY;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { client_id: string };
    clientIds.push(body.client_id);
    return new Response(null, { status: 204 });
  };
  try {
    await trackTelemetry("scan_complete", true, { version: "1.0.0", command: "scan", completion: "complete" });
    await trackTelemetry("scan_complete", true, { version: "1.0.0", command: "scan", completion: "complete" });
    assert.equal(clientIds.length, 2);
    assert.equal(clientIds[0], clientIds[1]);
    assert.equal(await resolveTelemetryPreference(), true);
    await trackTelemetry("scan_complete", false, { version: "1.0.0", command: "scan", completion: "complete" });
    assert.equal(clientIds.length, 2);

    await telemetryPreference("disable");
    assert.equal(await resolveTelemetryPreference(), false);
    await trackTelemetry("scan_complete", true, { version: "1.0.0", command: "scan", completion: "complete" });
    assert.equal(clientIds.length, 2);

    process.env.CLEARDOM_TELEMETRY = "1";
    assert.equal(await resolveTelemetryPreference(false), true);
    process.env.CLEARDOM_TELEMETRY = "0";
    assert.equal(await resolveTelemetryPreference(true), false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousConfigHome === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = previousConfigHome;
    if (previousSecret === undefined) delete process.env.CLEARDOM_GA4_API_SECRET; else process.env.CLEARDOM_GA4_API_SECRET = previousSecret;
    if (previousTelemetry === undefined) delete process.env.CLEARDOM_TELEMETRY; else process.env.CLEARDOM_TELEMETRY = previousTelemetry;
  }
});
