import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const mode = process.argv[2] ?? "all";
if (!["all", "fast", "runtime"].includes(mode)) {
  console.error("Usage: node scripts/run-tests.mjs all|fast|runtime");
  process.exit(1);
}

const tests = (await collectTests(resolve("dist")))
  .filter((file) => mode === "all" || (mode === "runtime" ? file.endsWith("runtime.test.js") : !file.endsWith("runtime.test.js")))
  .sort();

if (tests.length === 0) {
  console.error(`No ${mode} tests found. Run pnpm build first.`);
  process.exit(1);
}

const child = spawn(process.execPath, ["--test", ...tests], { stdio: "inherit" });
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

async function collectTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTests(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".test.js")) {
      files.push(fullPath);
    }
  }
  return files;
}
