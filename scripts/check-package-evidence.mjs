import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveReleaseStage, writeEvidenceFragment } from "./evidence-fragment.mjs";

const root = process.cwd();
const stageFlag = process.argv.indexOf("--stage");
const stage = resolveReleaseStage(stageFlag >= 0 ? process.argv[stageFlag + 1] : undefined);
const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "cleardom-package-evidence-"));
const first = path.join(workspace, "first");
const second = path.join(workspace, "second");
const extracted = path.join(workspace, "extracted");
await Promise.all([fs.mkdir(first), fs.mkdir(second), fs.mkdir(extracted)]);

try {
  execFileSync("pnpm", ["pack", "--pack-destination", first], { cwd: root, stdio: "pipe" });
  execFileSync("pnpm", ["pack", "--pack-destination", second], { cwd: root, stdio: "pipe" });
  const firstTarball = await onlyTarball(first);
  const secondTarball = await onlyTarball(second);
  const firstBytes = await fs.readFile(firstTarball);
  const secondBytes = await fs.readFile(secondTarball);
  const firstHash = sha256(firstBytes);
  const secondHash = sha256(secondBytes);
  if (firstHash !== secondHash) throw new Error(`Package dry runs are not reproducible: ${firstHash} != ${secondHash}.`);

  execFileSync("tar", ["-xzf", firstTarball, "-C", extracted], { cwd: root, stdio: "pipe" });
  const secret = process.env.CLEARDOM_GA4_API_SECRET;
  if (secret && await directoryContains(extracted, secret)) throw new Error("The release package contains CLEARDOM_GA4_API_SECRET.");

  const finalTarball = path.join(root, path.basename(firstTarball));
  await fs.copyFile(firstTarball, finalTarball);
  const sbom = execFileSync("pnpm", ["sbom", "--prod", "--sbom-format", "cyclonedx", "--sbom-spec-version", "1.6"], { cwd: root });
  await fs.writeFile(path.join(root, "cleardom-sbom.json"), sbom);
  await fs.writeFile(path.join(root, "SHA256SUMS"), `${firstHash}  ${path.basename(finalTarball)}\n`, "utf8");
  await writeEvidenceFragment(root, "supply-chain.json", "supply-chain", {
    packageContentsReproducible: true,
    sbomGenerated: true,
    checksumsGenerated: true
  }, stage);
  console.log(`Verified reproducible ${stage} package, generated SBOM/checksum, and found no release-secret leakage.`);
} finally {
  await fs.rm(workspace, { recursive: true, force: true });
}

async function onlyTarball(directory) {
  const files = (await fs.readdir(directory)).filter((file) => file.endsWith(".tgz"));
  if (files.length !== 1) throw new Error(`Expected one package tarball in ${directory}; found ${files.length}.`);
  return path.join(directory, files[0]);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function directoryContains(directory, needle) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (await directoryContains(target, needle)) return true;
    } else if (entry.isFile() && (await fs.readFile(target)).includes(Buffer.from(needle))) {
      return true;
    }
  }
  return false;
}
