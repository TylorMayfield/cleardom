import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { scanUrl } from "../dist/scanner.js";
import { writeEvidenceFragment } from "./evidence-fragment.mjs";

const root = process.cwd();
const manifest = JSON.parse(await fs.readFile(path.join(root, "examples", "conformance", "manifest.json"), "utf8"));
const serverScript = path.join(root, "examples", "conformance", "serve-conformance.mjs");
const failures = [];
let surfaces = 0;
const stackEvidence = {};

for (const application of (manifest.applications ?? []).filter((application) => !["react-native", "expo"].includes(application.stack))) {
  const current = stackEvidence[application.stack] = { runtimeCompleted: true };
  for (const mode of ["clean", "broken"]) {
    const directory = path.join(root, application[mode]);
    const server = spawn(process.execPath, [serverScript, "."], { cwd: directory, env: { ...process.env, PORT: "4173" }, stdio: "ignore" });
    try {
      await waitForUrl("http://127.0.0.1:4173", server);
      const result = await scanUrl("http://127.0.0.1:4173", {
        runtime: { enabled: true, baseUrl: "http://127.0.0.1:4173", routes: ["/"], screenshot: false, timeoutMs: 10_000, viewports: [{ name: "desktop", width: 1280, height: 800 }] },
        failOn: "none"
      });
      const blocking = result.activeFindings.filter((finding) => finding.blocking);
      if (mode === "clean" && blocking.length) failures.push(`${application.stack} clean runtime has blocking findings: ${blocking.map((finding) => finding.ruleId).join(", ")}.`);
      if (mode === "broken" && !result.activeFindings.some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL")) failures.push(`${application.stack} broken runtime did not detect CDOM_4_1_2_UNNAMED_CONTROL.`);
      if (result.runtimeDiagnostics.some((diagnostic) => diagnostic.severity === "error")) failures.push(`${application.stack} ${mode} runtime emitted an error diagnostic.`);
      surfaces += 1;
    } finally {
      server.kill("SIGTERM");
      await new Promise((resolve) => server.once("exit", resolve));
    }
  }
}

if (failures.length) {
  console.error(`Conformance runtime validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
await writeEvidenceFragment(root, "conformance-runtime.json", "conformance-runtime", { conformanceStacks: stackEvidence });
console.log(`Validated ${surfaces} rendered conformance surfaces across ${surfaces / 2} web stacks.`);

async function waitForUrl(url, server) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Conformance server exited with ${server.exitCode}.`);
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}.`);
}
