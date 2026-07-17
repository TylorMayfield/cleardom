import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { embeddedApiSecret } from "./telemetry-secret.generated.js";

const measurementId = "G-5FM2WE6DZT";
const allowedEvents = new Set(["scan_complete", "fix_complete", "install_complete", "command_failure"]);
const allowedParameters = new Set([
  "version", "command", "duration_bucket", "completion", "diagnostic_code", "automated", "needs_review", "manual_guidance",
  "blocking", "fixed", "remaining", "introduced", "suppressed", "baselined", "runtime_requested", "runtime_failed", "native_requested",
  "native_states", "pr_installed"
]);
const stringValues: Record<string, RegExp> = {
  version: /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/,
  command: /^(check|scan|ci|fix|install|review|doctor|report|native)$/,
  duration_bucket: /^(lt_1s|1_10s|10_60s|1_3m|gte_3m)$/,
  completion: /^(complete|blocking_findings|verified|rolled_back|failed|degraded)$/,
  diagnostic_code: /^[A-Z0-9_:-]{1,64}$/
};

type Consent = { enabled: boolean; clientId: string; asked: boolean };

export async function resolveTelemetryPreference(configured = true): Promise<boolean> {
  const current = await readConsent();
  return effectiveEnabled(configured, current);
}

export async function telemetryPreference(action: "enable" | "disable" | "status" | "reset"): Promise<string> {
  if (action === "reset") {
    await fs.rm(consentPath(), { force: true });
    return "ClearDOM telemetry preference and local installation identifier were deleted.";
  }
  const current = await readConsent();
  if (action === "status") return `ClearDOM telemetry is ${effectiveEnabled(true, current) ? "enabled" : "disabled"}.`;
  const enabled = action === "enable";
  await writeConsent({ enabled, clientId: current?.clientId ?? randomUUID(), asked: true });
  return `ClearDOM telemetry is ${enabled ? "enabled" : "disabled"}.`;
}

export async function trackTelemetry(event: string, configEnabled: boolean, parameters: Record<string, string | number | boolean | undefined>): Promise<void> {
  const consent = await readConsent();
  if (!effectiveEnabled(configEnabled, consent)) return;
  if (!allowedEvents.has(event)) return;
  const apiSecret = process.env.CLEARDOM_GA4_API_SECRET ?? embeddedApiSecret;
  if (!apiSecret) return;
  const params = Object.fromEntries(Object.entries(parameters).filter(([key, value]) => safeParameter(key, value)));
  const clientId = consent?.clientId ?? randomUUID();
  if (!consent) await writeConsent({ enabled: configEnabled, clientId, asked: false }).catch(() => undefined);
  try {
    await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${encodeURIComponent(apiSecret)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: clientId, non_personalized_ads: true, events: [{ name: event, params }] }),
      signal: AbortSignal.timeout(750)
    });
  } catch {
    // Measurement must never affect the product workflow.
  }
}

function safeParameter(key: string, value: string | number | boolean | undefined): boolean {
  if (!allowedParameters.has(key) || value === undefined) return false;
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0;
  if (typeof value === "boolean") return true;
  return stringValues[key]?.test(value) ?? false;
}

export function durationBucket(durationMs: number): string {
  if (durationMs < 1_000) return "lt_1s";
  if (durationMs < 10_000) return "1_10s";
  if (durationMs < 60_000) return "10_60s";
  if (durationMs < 180_000) return "1_3m";
  return "gte_3m";
}

function effectiveEnabled(configured: boolean, consent?: Consent): boolean {
  if (process.env.CLEARDOM_TELEMETRY === "0") return false;
  if (process.env.CLEARDOM_TELEMETRY === "1") return true;
  if (consent?.asked) return consent.enabled;
  return configured;
}

async function readConsent(): Promise<Consent | undefined> {
  try {
    const parsed = JSON.parse(await fs.readFile(consentPath(), "utf8")) as Partial<Consent>;
    if (typeof parsed.enabled !== "boolean" || typeof parsed.clientId !== "string") return undefined;
    return { enabled: parsed.enabled, clientId: parsed.clientId, asked: parsed.asked ?? true };
  } catch {
    return undefined;
  }
}

async function writeConsent(consent: Consent): Promise<void> {
  const file = consentPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(consent, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function consentPath(): string {
  const base = process.env.XDG_CONFIG_HOME || (process.platform === "win32" ? process.env.APPDATA : path.join(os.homedir(), ".config"));
  return path.join(base || os.homedir(), "cleardom", "telemetry.json");
}
