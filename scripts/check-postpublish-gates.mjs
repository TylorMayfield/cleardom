import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const gates = JSON.parse(await fs.readFile(path.join(root, "release-gates.json"), "utf8"));
const tag = process.env.GITHUB_REF_NAME ?? `v${packageJson.version}`;
if (tag !== `v${packageJson.version}`) throw new Error(`Release tag ${tag} does not match package version v${packageJson.version}.`);

const provenanceUrl = execFileSync("npm", ["view", `${packageJson.name}@${packageJson.version}`, "dist.attestations.url"], { encoding: "utf8" }).trim();
const assets = JSON.parse(execFileSync("gh", ["release", "view", tag, "--json", "assets"], { cwd: root, encoding: "utf8" })).assets ?? [];
const names = new Set(assets.map((asset) => asset.name));
const results = {
  npmProvenanceVerified: /^https:\/\//.test(provenanceUrl),
  sbomPublished: names.has("cleardom-sbom.json"),
  checksumsPublished: names.has("SHA256SUMS")
};
const failures = (gates.requiredEvidencePostpublish ?? []).filter((field) => results[field] !== true);
if (failures.length) throw new Error(`Postpublish release evidence failed: ${failures.join(", ")}.`);
console.log(`ClearDOM ${packageJson.version} postpublish provenance and release-asset gates passed.`);
