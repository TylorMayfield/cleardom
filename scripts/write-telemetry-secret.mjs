import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveReleaseStage } from "./evidence-fragment.mjs";

export async function writeTelemetrySecret({ root = process.cwd(), stage = resolveReleaseStage(), output, secret = process.env.CLEARDOM_GA4_API_SECRET } = {}) {
  if (!secret && stage !== "alpha") throw new Error("CLEARDOM_GA4_API_SECRET is required for beta, RC, and final release builds.");
  if (secret && !/^[A-Za-z0-9_-]{8,128}$/.test(secret)) throw new Error("CLEARDOM_GA4_API_SECRET has an unexpected format.");

  const target = output ?? path.join(root, "src", "telemetry-secret.generated.ts");
  await fs.writeFile(
    target,
    "// Release secrets are server-side configuration and are never embedded in the package.\nexport const embeddedApiSecret = \"\";\n",
    { encoding: "utf8", mode: 0o600 }
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const stageFlag = process.argv.indexOf("--stage");
  const outputFlag = process.argv.indexOf("--output");
  await writeTelemetrySecret({
    stage: resolveReleaseStage(stageFlag >= 0 ? process.argv[stageFlag + 1] : undefined),
    output: outputFlag >= 0 ? path.resolve(process.argv[outputFlag + 1]) : undefined
  });
}
