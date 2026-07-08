import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { helpText } from "../dist/cli-help.js";
import { rules } from "../dist/rules/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readme = await readFile(resolve(repoRoot, "README.md"), "utf8");
const failures = [];

const helpCommands = commandKeys(helpText);
const readmeCommands = commandKeys(readme);
for (const command of helpCommands) {
  if (!readmeCommands.has(command)) {
    failures.push(`README.md is missing command docs for: ${command}`);
  }
}

const readmeRuleIds = new Set([...readme.matchAll(/`(CDOM_[A-Z0-9_]+)`:/g)].map((match) => match[1]));
for (const rule of rules) {
  if (!readmeRuleIds.has(rule.id)) {
    failures.push(`README.md is missing rule docs for: ${rule.id}`);
  }
}

if (failures.length > 0) {
  console.error(["Documentation drift detected:", ...failures.map((failure) => `- ${failure}`)].join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Documentation check passed (${helpCommands.size} commands, ${rules.length} rules).`);
}

function commandKeys(source) {
  return new Set(source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("cleardom "))
    .map(commandKey));
}

function commandKey(line) {
  const parts = line.split(/\s+/);
  if (parts[1]?.startsWith("[") || parts[1]?.startsWith("--")) return "cleardom";
  if (parts[1] === "baseline") return "cleardom baseline";
  if (parts[1] === "native") return "cleardom native";
  return `cleardom ${parts[1]}`;
}
