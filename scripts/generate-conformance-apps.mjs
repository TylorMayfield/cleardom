import { promises as fs } from "node:fs";
import * as path from "node:path";

const root = process.cwd();
const appsRoot = path.join(root, "examples", "conformance", "apps");
const webClean = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ClearDOM clean fixture</title></head><body><main><h1>Account</h1><button type="button">Save profile</button></main></body></html>\n`;
const webBroken = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ClearDOM broken fixture</title></head><body><main><h1>Account</h1><button type="button"></button></main></body></html>\n`;

const stacks = [
  jsx("react", "react", "react", "App.tsx"),
  jsx("nextjs", "next", "next", "app/page.tsx"),
  jsx("remix", "@remix-run/react", "@remix-run/react", "app/routes/_index.tsx"),
  jsx("gatsby", "gatsby", "gatsby", "src/pages/index.tsx"),
  jsx("vite-react", "vite", "react", "src/App.tsx"),
  jsx("preact", "preact", "preact", "src/App.tsx"),
  jsx("solid", "solid-js", "solid-js", "src/App.tsx"),
  template("html", "html", "index.html", (clean) => clean ? webClean : webBroken),
  template("vue", "vue", "src/App.vue", (clean) => `<template><main><h1>Account</h1><button type="button">${clean ? "Save profile" : ""}</button></main></template>\n`),
  template("svelte", "svelte", "src/App.svelte", (clean) => `<main><h1>Account</h1><button type="button">${clean ? "Save profile" : ""}</button></main>\n`),
  template("astro", "astro", "src/pages/index.astro", (clean) => `---\nconst title = "Account";\n---\n<main><h1>{title}</h1><button type="button">${clean ? "Save profile" : ""}</button></main>\n`),
  template("angular", "@angular/core", "src/app/app.component.html", (clean) => `<main><h1>Account</h1><button type="button">${clean ? "Save profile" : ""}</button></main>\n`),
  template("mdx", "@mdx-js/mdx", "src/page.mdx", (clean) => `# Account\n\n<button type="button">${clean ? "Save profile" : ""}</button>\n`),
  container("electron", "electron", { "electron/main.js": `const { BrowserWindow } = require("electron");\nnew BrowserWindow().loadFile("index.html");\n` }),
  container("tauri", "@tauri-apps/api", { "src-tauri/tauri.conf.json": `{"build":{"frontendDist":"../"}}\n` }),
  container("capacitor", "@capacitor/core", { "capacitor.config.json": `{"appId":"dev.cleardom.conformance","webDir":"."}\n` }),
  container("ionic", "@ionic/react", { "ionic.config.json": `{"name":"cleardom-conformance","type":"react"}\n` }),
  container("browser-extension", "webextension-polyfill", { "manifest.json": `{"manifest_version":3,"name":"ClearDOM conformance","version":"1.0.0","action":{"default_popup":"index.html"}}\n` }),
  native("react-native", "react-native", "App.tsx"),
  native("expo", "expo", "app/index.tsx")
];

await fs.rm(appsRoot, { recursive: true, force: true });
await fs.mkdir(appsRoot, { recursive: true });
for (const stack of stacks) await writeStack(stack);
await fs.writeFile(path.join(root, "examples", "conformance", "manifest.json"), `${JSON.stringify({
  schemaVersion: 1,
  requiredStacks: stacks.map((stack) => stack.id),
  applications: stacks.map((stack) => ({
    stack: stack.id,
    clean: `examples/conformance/apps/${stack.id}/clean`,
    broken: `examples/conformance/apps/${stack.id}/broken`,
    caseManifest: `examples/conformance/apps/${stack.id}/cases.json`,
    evidence: stack.native ? ["source", "native-ios", "native-android", "fix", "protection"] : ["source", "runtime", "fix", "protection"]
  })),
  caseManifestRequiredFields: ["ruleId", "detectionClass", "routeOrScreen", "expectedEvidence", "allowedPlatformDifferences"]
}, null, 2)}\n`, "utf8");
console.log(`Generated ${stacks.length} stack-owned conformance applications (${stacks.length * 2} clean/broken surfaces).`);

async function writeStack(stack) {
  const stackRoot = path.join(appsRoot, stack.id);
  for (const mode of ["clean", "broken"]) {
    const clean = mode === "clean";
    const directory = path.join(stackRoot, mode);
    await fs.mkdir(directory, { recursive: true });
    const packageJson = {
      name: `@cleardom/conformance-${stack.id}-${mode}`,
      private: true,
      version: "1.0.0",
      scripts: stack.native ? nativeScripts(stack.id) : { start: "node ../../../serve-conformance.mjs ." },
      dependencies: stack.dependency === "html" ? {} : { [stack.dependency]: "*" }
    };
    await write(directory, "package.json", `${JSON.stringify(packageJson, null, 2)}\n`);
    await write(directory, "cleardom.config.json", `${JSON.stringify({
      schemaVersion: 1,
      include: ["**/*.{html,js,jsx,ts,tsx,vue,svelte,astro,mdx}"],
      runtime: stack.native ? { enabled: false } : { enabled: true, baseUrl: "http://127.0.0.1:4173" },
      native: stack.native ? { enabled: true, runner: "local", platforms: ["ios", "android"], appIds: { ios: `dev.cleardom.${safeId(stack.id)}`, android: `dev.cleardom.${safeId(stack.id)}` }, screens: [{ name: "account", actions: [{ assert: clean ? "label=Save profile" : "role=button" }] }] } : { enabled: false }
    }, null, 2)}\n`);
    if (!stack.native) await write(directory, "index.html", clean ? webClean : webBroken);
    await write(directory, stack.sourceFile, stack.source(clean));
    for (const [file, contents] of Object.entries(stack.extraFiles ?? {})) await write(directory, file, contents);
    if (stack.id === "expo") await write(directory, "app.json", `${JSON.stringify({ expo: { name: `ClearDOM ${mode}`, slug: `cleardom-expo-${mode}`, ios: { bundleIdentifier: "dev.cleardom.expo" }, android: { package: "dev.cleardom.expo" } } }, null, 2)}\n`);
  }
  const ruleId = stack.native ? "CDOM_4_1_2_NATIVE_LABEL" : "CDOM_4_1_2_UNNAMED_CONTROL";
  await write(stackRoot, "cases.json", `${JSON.stringify({ schemaVersion: 1, stack: stack.id, cases: [
    { id: "clean-named-control", fixture: "clean", ruleId, detectionClass: "automated", routeOrScreen: stack.native ? "account" : "/", expectedEvidence: "no blocking finding", allowedPlatformDifferences: stack.native ? ["bounds and traversal metadata vary by platform"] : [] },
    { id: "broken-unnamed-control", fixture: "broken", ruleId, detectionClass: "automated", routeOrScreen: stack.native ? "account" : "/", expectedEvidence: stack.native ? "source location plus iOS and Android accessibility nodes" : "source location plus rendered selector and route", allowedPlatformDifferences: stack.native ? ["iOS and Android role vocabulary may differ"] : [] }
  ] }, null, 2)}\n`);
}

async function write(base, relative, contents) {
  const file = path.join(base, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, contents, "utf8");
}

function jsx(id, dependency, importSource, sourceFile) {
  return { id, dependency, sourceFile, source: (clean) => `import * as UI from "${importSource}";\nexport default function App() { return <main><h1>Account</h1><button type="button">${clean ? "Save profile" : ""}</button></main>; }\nvoid UI;\n` };
}

function template(id, dependency, sourceFile, source) { return { id, dependency, sourceFile, source }; }
function container(id, dependency, extraFiles) { return { id, dependency, sourceFile: "src/surface.html", source: (clean) => clean ? webClean : webBroken, extraFiles }; }
function native(id, dependency, sourceFile) {
  return { id, dependency, sourceFile, native: true, source: (clean) => `import { Pressable, Text, View } from "react-native";\nexport default function App() { return <View><Text accessibilityRole="header">Account</Text><Pressable${clean ? ' accessibilityRole="button" accessibilityLabel="Save profile"' : ""}><Text>${clean ? "Save profile" : ""}</Text></Pressable></View>; }\n` };
}
function nativeScripts(id) { return id === "expo" ? { start: "expo start", ios: "expo run:ios", android: "expo run:android" } : { start: "react-native start", ios: "react-native run-ios", android: "react-native run-android" }; }
function safeId(value) { return value.replace(/[^a-z0-9]/g, ""); }
