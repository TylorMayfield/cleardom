import { promises as fs } from "node:fs";
import * as path from "node:path";

const secret = process.env.CLEARDOM_GA4_API_SECRET;
if (!secret) throw new Error("CLEARDOM_GA4_API_SECRET is required for a release build.");
if (!/^[A-Za-z0-9_-]{8,128}$/.test(secret)) throw new Error("CLEARDOM_GA4_API_SECRET has an unexpected format.");

await fs.writeFile(
  path.join(process.cwd(), "src", "telemetry-secret.generated.ts"),
  `// Generated only in an ephemeral release checkout.\nexport const embeddedApiSecret = ${JSON.stringify(secret)};\n`,
  { encoding: "utf8", mode: 0o600 }
);
