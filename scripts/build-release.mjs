import { promises as fs } from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { resolveReleaseStage } from "./evidence-fragment.mjs";
import { writeTelemetrySecret } from "./write-telemetry-secret.mjs";

const root = process.cwd();
const stageFlag = process.argv.indexOf("--stage");
const stage = resolveReleaseStage(stageFlag >= 0 ? process.argv[stageFlag + 1] : undefined);
const generatedModule = path.join(root, "src", "telemetry-secret.generated.ts");
const original = await fs.readFile(generatedModule);

try {
  await writeTelemetrySecret({ root, stage });
  execFileSync("pnpm", ["build"], { cwd: root, stdio: "inherit" });
} finally {
  await fs.writeFile(generatedModule, original, { mode: 0o600 });
}
