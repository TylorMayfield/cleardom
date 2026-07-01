import { promises as fs } from "node:fs";
import * as path from "node:path";
import { resolveStandardId } from "./standards.js";
import type { ComponentMapping, ComponentPreset, ResolvedScanOptions, RuleOption, ScanConfig, ScanOptions } from "./types.js";

const defaultOptions: ResolvedScanOptions = {
  include: [],
  exclude: [],
  rules: {},
  standard: "wcag22-aa",
  failOn: "none",
  format: "text",
  verbose: false,
  componentPresets: [],
  components: {},
  rootDir: process.cwd()
};

const componentPresetMappings: Record<ComponentPreset, Record<string, ComponentMapping>> = {
  radix: {
    Button: { role: "button", nameProps: ["aria-label"], labelProps: ["children"] },
    IconButton: { role: "button", nameProps: ["aria-label", "label"] },
    Toggle: { role: "button", nameProps: ["aria-label", "label"] },
    Checkbox: { role: "checkbox", nameProps: ["aria-label", "label"] },
    RadioGroupItem: { role: "radio", nameProps: ["aria-label", "label"] },
    Switch: { role: "switch", nameProps: ["aria-label", "label"] },
    TabsTrigger: { role: "tab", nameProps: ["aria-label", "label"] }
  },
  mui: {
    Button: { role: "button", nameProps: ["aria-label"], labelProps: ["children"] },
    IconButton: { role: "button", nameProps: ["aria-label", "title", "label"] },
    TextField: { role: "textbox", nameProps: ["label", "aria-label"] },
    Checkbox: { role: "checkbox", nameProps: ["aria-label", "label"] },
    Radio: { role: "radio", nameProps: ["aria-label", "label"] },
    Switch: { role: "switch", nameProps: ["aria-label", "label"] },
    Link: { role: "link", nameProps: ["aria-label"], labelProps: ["children"] }
  },
  "react-aria": {
    Button: { role: "button", nameProps: ["aria-label"], labelProps: ["children"] },
    Link: { role: "link", nameProps: ["aria-label"], labelProps: ["children"] },
    TextField: { role: "textbox", nameProps: ["label", "aria-label"] },
    Checkbox: { role: "checkbox", nameProps: ["children", "aria-label", "label"] },
    Radio: { role: "radio", nameProps: ["children", "aria-label", "label"] },
    Switch: { role: "switch", nameProps: ["children", "aria-label", "label"] },
    Tab: { role: "tab", nameProps: ["children", "aria-label", "label"] }
  },
  "react-native": {
    Pressable: { role: "button", nameProps: ["accessibilityLabel", "aria-label", "label"] },
    TouchableOpacity: { role: "button", nameProps: ["accessibilityLabel", "aria-label", "label"] },
    TouchableHighlight: { role: "button", nameProps: ["accessibilityLabel", "aria-label", "label"] },
    TouchableWithoutFeedback: { role: "button", nameProps: ["accessibilityLabel", "aria-label", "label"] },
    TextInput: { role: "textbox", nameProps: ["accessibilityLabel", "aria-label", "label"] },
    Image: { role: "image", nameProps: ["accessibilityLabel", "alt"] }
  }
};

export async function resolveScanOptions(options: ScanOptions = {}, cwd = process.cwd()): Promise<ResolvedScanOptions> {
  const configFile = resolveConfigPath(options.configPath, cwd);
  const config = await readConfig(configFile.path, Boolean(options.configPath));
  return {
    include: options.include ?? config.include ?? defaultOptions.include,
    exclude: options.exclude ?? config.exclude ?? defaultOptions.exclude,
    rules: { ...config.rules, ...options.rules },
    standard: resolveStandardId(options.standard ?? config.standard ?? defaultOptions.standard),
    failOn: options.failOn ?? config.failOn ?? defaultOptions.failOn,
    format: options.format ?? config.format ?? defaultOptions.format,
    baseline: options.baseline ?? config.baseline,
    verbose: options.verbose ?? config.verbose ?? defaultOptions.verbose,
    runtimeUrl: options.runtimeUrl ?? config.runtimeUrl,
    componentPresets: options.componentPresets ?? config.componentPresets ?? defaultOptions.componentPresets,
    components: resolveComponentMappings(options.componentPresets ?? config.componentPresets ?? [], config.components, options.components),
    configPath: options.configPath,
    rootDir: configFile.exists ? path.dirname(configFile.path) : cwd
  };
}

export function isRuleEnabled(ruleId: string, option: RuleOption | undefined): boolean {
  if (option === "off") return false;
  if (typeof option === "object" && option.enabled === false) return false;
  return Boolean(ruleId);
}

export function severityOverride(option: RuleOption | undefined): "critical" | "warning" | "info" | undefined {
  if (option === "critical" || option === "warning" || option === "info") return option;
  if (typeof option === "object") return option.severity;
  return undefined;
}

export function matchesAnyPattern(filePath: string, patterns: string[]): boolean {
  const normalized = normalizePath(filePath);
  return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
}

async function readConfig(resolved: string, explicit: boolean): Promise<ScanConfig> {
  try {
    const raw = await fs.readFile(resolved, "utf8");
    return JSON.parse(raw) as ScanConfig;
  } catch (error) {
    if (explicit || !isMissingFile(error)) {
      throw new Error(`Could not read ClearDOM config at ${resolved}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return {};
  }
}

function resolveConfigPath(configPath: string | undefined, cwd: string): { path: string; exists: boolean } {
  if (configPath) {
    return { path: path.resolve(cwd, configPath), exists: true };
  }
  return { path: path.join(cwd, "cleardom.config.json"), exists: false };
}

function globToRegExp(pattern: string): RegExp {
  const normalized = normalizePath(pattern);
  let output = "^";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === "*" && next === "*" && normalized[index + 2] === "/") {
      output += "(?:.*/)?";
      index += 2;
      continue;
    }

    if (char === "*" && next === "*") {
      output += ".*";
      index += 1;
      continue;
    }

    if (char === "*") {
      output += "[^/]*";
      continue;
    }

    if (char === "?") {
      output += "[^/]";
      continue;
    }

    if (char === "{") {
      const end = normalized.indexOf("}", index + 1);
      if (end !== -1) {
        output += `(${normalized.slice(index + 1, end).split(",").map(escapeRegExp).join("|")})`;
        index = end;
        continue;
      }
    }

    output += escapeRegExp(char);
  }

  return new RegExp(`${output}$`);
}

function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export function resolveComponentMappings(
  presets: ComponentPreset[],
  configComponents: Record<string, ComponentMapping> = {},
  optionComponents: Record<string, ComponentMapping> = {}
): Record<string, ComponentMapping> {
  const presetComponents = presets.reduce<Record<string, ComponentMapping>>((merged, preset) => {
    if (!componentPresetMappings[preset]) {
      throw new Error(`Unknown component preset ${preset}. Known presets: ${Object.keys(componentPresetMappings).join(", ")}`);
    }
    return { ...merged, ...componentPresetMappings[preset] };
  }, {});

  return { ...presetComponents, ...configComponents, ...optionComponents };
}
