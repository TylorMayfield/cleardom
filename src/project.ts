import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { ComponentPreset, ScanConfig } from "./types.js";

export type StackDetection = {
  frameworks: string[];
  uiLibraries: ComponentPreset[];
  packageManagers: string[];
  hasTests: boolean;
  hasStorybook: boolean;
  hasRuntimeApp: boolean;
  summary: string;
};

export async function detectProjectStack(rootDir: string): Promise<StackDetection> {
  const packageJson = await readPackageJson(rootDir);
  const dependencies = new Set(Object.keys({
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {}),
    ...(packageJson?.peerDependencies ?? {})
  }));
  const files = await topLevelEntries(rootDir);
  const frameworks = new Set<string>();

  if (dependencies.has("next") || files.has("next.config.js") || files.has("next.config.mjs") || files.has("next.config.ts")) frameworks.add("Next.js");
  if (dependencies.has("@remix-run/react")) frameworks.add("Remix");
  if (dependencies.has("gatsby")) frameworks.add("Gatsby");
  if (dependencies.has("vite") || files.has("vite.config.js") || files.has("vite.config.ts")) frameworks.add(dependencies.has("vue") ? "Vite Vue" : "Vite");
  if (dependencies.has("react") || dependencies.has("preact")) frameworks.add("React");
  if (dependencies.has("vue")) frameworks.add("Vue");
  if (dependencies.has("svelte") || dependencies.has("@sveltejs/kit")) frameworks.add("Svelte");
  if (dependencies.has("astro")) frameworks.add("Astro");
  if (dependencies.has("@angular/core") || files.has("angular.json")) frameworks.add("Angular");
  if (dependencies.has("solid-js")) frameworks.add("Solid");
  if (dependencies.has("react-native")) frameworks.add("React Native");
  if (dependencies.has("expo")) frameworks.add("Expo");
  if (frameworks.size === 0 && (files.has("src") || files.has("app") || files.has("components"))) frameworks.add("JavaScript/TypeScript");

  const uiLibraries: ComponentPreset[] = [];
  if (hasAnyDependency(dependencies, ["@radix-ui/react-dialog", "@radix-ui/react-slot", "@radix-ui/themes"])) uiLibraries.push("radix");
  if (hasAnyDependency(dependencies, ["@mui/material", "@material-ui/core"])) uiLibraries.push("mui");
  if (hasAnyDependency(dependencies, ["react-aria", "react-aria-components", "@react-aria/button"])) uiLibraries.push("react-aria");
  if (hasAnyDependency(dependencies, ["react-native", "expo"])) uiLibraries.push("react-native");
  if (dependencies.has("@chakra-ui/react")) uiLibraries.push("chakra");
  if (dependencies.has("antd")) uiLibraries.push("ant-design");
  if (dependencies.has("@headlessui/react")) uiLibraries.push("headless-ui");
  if (dependencies.has("@mantine/core")) uiLibraries.push("mantine");
  if (dependencies.has("react-bootstrap")) uiLibraries.push("react-bootstrap");

  const packageManagers = [
    files.has("pnpm-lock.yaml") ? "pnpm" : "",
    files.has("yarn.lock") ? "yarn" : "",
    files.has("package-lock.json") ? "npm" : "",
    files.has("bun.lockb") ? "bun" : ""
  ].filter(Boolean);
  const hasTests = await containsMatchingFile(rootDir, /\.(test|spec)\.(js|jsx|ts|tsx|vue|svelte)$/);
  const hasStorybook = files.has(".storybook") || dependencies.has("@storybook/react") || dependencies.has("@storybook/vue3") || dependencies.has("@storybook/svelte");
  const hasRuntimeApp = frameworks.size > 0 && !frameworks.has("JavaScript/TypeScript");

  return {
    frameworks: [...frameworks],
    uiLibraries: unique(uiLibraries),
    packageManagers,
    hasTests,
    hasStorybook,
    hasRuntimeApp,
    summary: [...frameworks].join(", ") || "generic source project"
  };
}

export function recommendedConfig(detection: StackDetection): ScanConfig {
  const include = new Set<string>();
  const exclude = new Set(["**/*.test.{js,jsx,ts,tsx}", "**/*.spec.{js,jsx,ts,tsx}", "**/*.stories.{js,jsx,ts,tsx,mdx}", "**/node_modules/**", "**/dist/**", "**/build/**", "**/.next/**"]);
  const frameworks = new Set(detection.frameworks);

  if (frameworks.has("Next.js")) {
    include.add("app/**/*.{js,jsx,ts,tsx,mdx}");
    include.add("pages/**/*.{js,jsx,ts,tsx,mdx}");
    include.add("components/**/*.{js,jsx,ts,tsx,mdx}");
  }
  if (frameworks.has("React Native") || frameworks.has("Expo")) {
    include.add("app/**/*.{js,jsx,ts,tsx}");
    include.add("src/**/*.{js,jsx,ts,tsx}");
  }
  if (frameworks.has("Vue")) include.add("src/**/*.vue");
  if (frameworks.has("Svelte")) include.add("src/**/*.svelte");
  if (frameworks.has("Astro")) include.add("src/**/*.astro");
  if (frameworks.has("Angular")) include.add("src/**/*.component.html");
  include.add("*.html");
  include.add("*.htm");
  include.add("src/**/*.{js,jsx,ts,tsx,html,vue,svelte,astro,mdx}");
  include.add("components/**/*.{js,jsx,ts,tsx,html,vue,svelte,astro,mdx}");

  return {
    include: [...include],
    exclude: [...exclude],
    standard: "wcag22-aa",
    failOn: "critical",
    format: "text",
    baseline: "cleardom-baseline.json",
    verbose: false,
    runtimeUrl: "",
    runtime: {
      baseUrl: "",
      routes: [],
      discoverRoutes: true,
      viewports: [
        { name: "desktop", width: 1280, height: 900 },
        { name: "mobile", width: 390, height: 844, isMobile: true }
      ],
      browser: { mode: "auto" },
      crawl: {
        enabled: false,
        maxDepth: 1,
        maxRoutes: 25,
        include: [],
        exclude: ["/logout", "/sign-out", "/signout", "/delete", "/destroy", "/remove"]
      },
      interactions: { presets: [], scripts: [] },
      stories: { enabled: detection.hasStorybook, baseUrl: "", include: [], exclude: [] },
      waitUntil: "networkidle0",
      timeoutMs: 30000,
      headers: {},
      cookies: [],
      localStorage: {},
      screenshot: true
    },
    native: {
      enabled: false,
      provider: "eas",
      platforms: frameworks.has("React Native") || frameworks.has("Expo") ? ["ios"] : [],
      appId: "",
      deepLinks: [],
      screens: [],
      maxDurationMinutes: 20
    },
    ownership: [],
    suppressionPolicy: {
      requireReason: true,
      requireExpires: true,
      requireApprovedBy: false
    },
    semantic: "auto",
    componentPresets: detection.uiLibraries.length > 0 ? detection.uiLibraries : ["radix", "mui", "react-aria"],
    components: {
      IconButton: { role: "button", nameProps: ["aria-label", "label", "title"], disabledProps: ["disabled", "isDisabled"] },
      Button: { role: "button", asProp: "as", nameProps: ["aria-label", "label"], childLabelProps: ["children"], disabledProps: ["disabled", "isDisabled"] },
      TextInput: { role: "textbox", nameProps: ["aria-label", "label"], valueProps: ["value", "defaultValue"], disabledProps: ["disabled", "isDisabled"] },
      Field: { wrapper: true, labelProps: ["label"] }
    },
    rules: {
      CDOM_2_4_4_AMBIGUOUS_LABEL: "warning"
    }
  };
}

async function readPackageJson(rootDir: string): Promise<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string>; peerDependencies?: Record<string, string> } | undefined> {
  try {
    return JSON.parse(await fs.readFile(path.join(rootDir, "package.json"), "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; peerDependencies?: Record<string, string> };
  } catch {
    return undefined;
  }
}

async function topLevelEntries(rootDir: string): Promise<Set<string>> {
  try {
    return new Set(await fs.readdir(rootDir));
  } catch {
    return new Set();
  }
}

async function containsMatchingFile(rootDir: string, pattern: RegExp, depth = 0): Promise<boolean> {
  if (depth > 3) return false;
  let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist" || entry.name === "build" || entry.name === ".next") continue;
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isFile() && pattern.test(entry.name)) return true;
    if (entry.isDirectory() && await containsMatchingFile(entryPath, pattern, depth + 1)) return true;
  }
  return false;
}

function hasAnyDependency(dependencies: Set<string>, names: string[]): boolean {
  return names.some((name) => dependencies.has(name));
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
