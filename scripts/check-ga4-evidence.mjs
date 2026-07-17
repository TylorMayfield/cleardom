import { resolveReleaseStage, writeEvidenceFragment } from "./evidence-fragment.mjs";

const root = process.cwd();
const stageFlag = process.argv.indexOf("--stage");
const stage = resolveReleaseStage(stageFlag >= 0 ? process.argv[stageFlag + 1] : undefined);
if (stage === "alpha") throw new Error("GA4 configuration evidence is not required for alpha.");
const secret = process.env.CLEARDOM_GA4_API_SECRET;
if (!secret || !/^[A-Za-z0-9_-]{8,128}$/.test(secret)) throw new Error("A valid CLEARDOM_GA4_API_SECRET is required to produce GA4 configuration evidence.");
await writeEvidenceFragment(root, "ga4.json", "ga4", { ga4Configured: true }, stage);
console.log(`Validated ${stage} GA4 release configuration without storing the secret.`);
