import { promises as fs } from "node:fs";
import * as path from "node:path";
import { normalizeRuleId } from "./rules/index.js";
import { resolveStandardId } from "./standards.js";
import type { ComponentMapping, ComponentPreset, PrReviewConfig, ResolvedScanOptions, ResolvedSuppression, RuleOption, ScanConfig, ScanOptions, Severity, SuppressionConfig } from "./types.js";

const defaultOptions: ResolvedScanOptions = {
  include: [],
  exclude: [],
  rules: {},
  standard: "wcag22-aa",
  failOn: "none",
  format: "text",
  verbose: false,
  runtime: {
    routes: [],
    discoverRoutes: true,
    viewports: [{ name: "desktop", width: 1280, height: 900, deviceScaleFactor: 1 }],
    waitUntil: "networkidle0",
    timeoutMs: 30000,
    cookies: [],
    localStorage: {},
    headers: {},
    screenshot: true
  },
  semantic: "auto",
  componentPresets: [],
  components: {},
  suppressions: [],
  pr: {
    maxComments: 20,
    severityThreshold: "info",
    commentMode: "both",
    changedFilesOnly: false,
    baselinePolicy: "new",
    statusCheckName: "ClearDOM PR review",
    uploadSarif: false
  },
  packages: [],
  rootDir: process.cwd()
};

const componentPresetMappings: Record<ComponentPreset, Record<string, ComponentMapping>> = {
  radix: {
    Button: { importSource: ["@radix-ui/themes", "@radix-ui/react-slot"], role: "button", asProp: "asChild", nameProps: ["aria-label"], childLabelProps: ["children"], disabledProps: ["disabled"] },
    IconButton: { importSource: "@radix-ui/themes", role: "button", nameProps: ["aria-label", "label"], disabledProps: ["disabled"] },
    Toggle: { importSource: "@radix-ui/react-toggle", role: "button", nameProps: ["aria-label", "label"], valueProps: ["value"], disabledProps: ["disabled"] },
    Checkbox: { importSource: ["@radix-ui/react-checkbox", "@radix-ui/themes"], role: "checkbox", nameProps: ["aria-label", "label"], valueProps: ["value"], disabledProps: ["disabled"] },
    RadioGroupItem: { importSource: "@radix-ui/react-radio-group", role: "radio", nameProps: ["aria-label", "label"], valueProps: ["value"], disabledProps: ["disabled"] },
    Switch: { importSource: ["@radix-ui/react-switch", "@radix-ui/themes"], role: "switch", nameProps: ["aria-label", "label"], disabledProps: ["disabled"] },
    TabsTrigger: { importSource: "@radix-ui/react-tabs", role: "tab", nameProps: ["aria-label", "label"], valueProps: ["value"], childLabelProps: ["children"], disabledProps: ["disabled"] }
  },
  mui: {
    Button: { importSource: "@mui/material", role: "button", asProp: "component", nameProps: ["aria-label"], childLabelProps: ["children"], disabledProps: ["disabled"] },
    IconButton: { importSource: "@mui/material", role: "button", asProp: "component", nameProps: ["aria-label", "title", "label"], disabledProps: ["disabled"] },
    TextField: { importSource: "@mui/material", role: "textbox", nameProps: ["label", "aria-label"], valueProps: ["value", "defaultValue"], disabledProps: ["disabled"] },
    FormControl: { importSource: "@mui/material", wrapper: true, labelProps: ["label"] },
    Checkbox: { importSource: "@mui/material", role: "checkbox", nameProps: ["aria-label", "label"], valueProps: ["value"], disabledProps: ["disabled"] },
    Radio: { importSource: "@mui/material", role: "radio", nameProps: ["aria-label", "label"], valueProps: ["value"], disabledProps: ["disabled"] },
    Switch: { importSource: "@mui/material", role: "switch", nameProps: ["aria-label", "label"], disabledProps: ["disabled"] },
    Link: { importSource: "@mui/material", role: "link", asProp: "component", nameProps: ["aria-label"], childLabelProps: ["children"] }
  },
  "react-aria": {
    Button: { importSource: "react-aria-components", role: "button", nameProps: ["aria-label"], childLabelProps: ["children"], disabledProps: ["isDisabled"] },
    Link: { importSource: "react-aria-components", role: "link", nameProps: ["aria-label"], childLabelProps: ["children"] },
    TextField: { importSource: "react-aria-components", role: "textbox", nameProps: ["label", "aria-label"], valueProps: ["value", "defaultValue"], disabledProps: ["isDisabled"] },
    Checkbox: { importSource: "react-aria-components", role: "checkbox", nameProps: ["aria-label", "label"], childLabelProps: ["children"], valueProps: ["value"], disabledProps: ["isDisabled"] },
    Radio: { importSource: "react-aria-components", role: "radio", nameProps: ["aria-label", "label"], childLabelProps: ["children"], valueProps: ["value"], disabledProps: ["isDisabled"] },
    Switch: { importSource: "react-aria-components", role: "switch", nameProps: ["aria-label", "label"], childLabelProps: ["children"], disabledProps: ["isDisabled"] },
    Tab: { importSource: "react-aria-components", role: "tab", nameProps: ["aria-label", "label"], childLabelProps: ["children"], disabledProps: ["isDisabled"] }
  },
  "react-native": {
    Pressable: { importSource: "react-native", role: "button", roleProps: ["accessibilityRole"], nameProps: ["accessibilityLabel", "aria-label", "label"], disabledProps: ["disabled"] },
    TouchableOpacity: { importSource: "react-native", role: "button", roleProps: ["accessibilityRole"], nameProps: ["accessibilityLabel", "aria-label", "label"], disabledProps: ["disabled"] },
    TouchableHighlight: { importSource: "react-native", role: "button", roleProps: ["accessibilityRole"], nameProps: ["accessibilityLabel", "aria-label", "label"], disabledProps: ["disabled"] },
    TouchableWithoutFeedback: { importSource: "react-native", role: "button", roleProps: ["accessibilityRole"], nameProps: ["accessibilityLabel", "aria-label", "label"], disabledProps: ["disabled"] },
    TextInput: { importSource: "react-native", role: "textbox", nameProps: ["accessibilityLabel", "aria-label", "label"], valueProps: ["value", "defaultValue"], disabledProps: ["editable"] },
    Image: { importSource: "react-native", role: "image", nameProps: ["accessibilityLabel", "alt"] }
  },
  chakra: {
    Button: { importSource: "@chakra-ui/react", role: "button", asProp: "as", nameProps: ["aria-label"], childLabelProps: ["children"], disabledProps: ["disabled", "isDisabled"] },
    IconButton: { importSource: "@chakra-ui/react", role: "button", asProp: "as", nameProps: ["aria-label", "label"], disabledProps: ["disabled", "isDisabled"] },
    FormControl: { importSource: "@chakra-ui/react", wrapper: true, labelProps: ["label"] },
    Input: { importSource: "@chakra-ui/react", role: "textbox", asProp: "as", nameProps: ["aria-label", "label"], valueProps: ["value", "defaultValue"], disabledProps: ["disabled", "isDisabled"] },
    Textarea: { importSource: "@chakra-ui/react", role: "textbox", asProp: "as", nameProps: ["aria-label", "label"], valueProps: ["value", "defaultValue"], disabledProps: ["disabled", "isDisabled"] },
    Link: { importSource: "@chakra-ui/react", role: "link", asProp: "as", nameProps: ["aria-label"], childLabelProps: ["children"] },
    Switch: { importSource: "@chakra-ui/react", role: "switch", nameProps: ["aria-label", "label"], disabledProps: ["disabled", "isDisabled"] },
    Checkbox: { importSource: "@chakra-ui/react", role: "checkbox", nameProps: ["aria-label", "label"], childLabelProps: ["children"], valueProps: ["value"], disabledProps: ["disabled", "isDisabled"] }
  },
  "ant-design": {
    Button: { importSource: "antd", role: "button", nameProps: ["aria-label"], childLabelProps: ["children"], disabledProps: ["disabled"] },
    Input: { importSource: "antd", role: "textbox", nameProps: ["aria-label", "placeholder", "label"], valueProps: ["value", "defaultValue"], disabledProps: ["disabled"] },
    TextArea: { importSource: "antd", role: "textbox", nameProps: ["aria-label", "placeholder", "label"], valueProps: ["value", "defaultValue"], disabledProps: ["disabled"] },
    Checkbox: { importSource: "antd", role: "checkbox", nameProps: ["aria-label", "label"], childLabelProps: ["children"], valueProps: ["value"], disabledProps: ["disabled"] },
    Radio: { importSource: "antd", role: "radio", nameProps: ["aria-label", "label"], childLabelProps: ["children"], valueProps: ["value"], disabledProps: ["disabled"] },
    Switch: { importSource: "antd", role: "switch", nameProps: ["aria-label", "label"], disabledProps: ["disabled"] }
  },
  "headless-ui": {
    Button: { importSource: "@headlessui/react", role: "button", asProp: "as", nameProps: ["aria-label"], childLabelProps: ["children"], disabledProps: ["disabled"] },
    Switch: { importSource: "@headlessui/react", role: "switch", asProp: "as", nameProps: ["aria-label", "label"], childLabelProps: ["children"], disabledProps: ["disabled"] },
    Tab: { importSource: "@headlessui/react", role: "tab", asProp: "as", nameProps: ["aria-label", "label"], childLabelProps: ["children"], disabledProps: ["disabled"] },
    MenuButton: { importSource: "@headlessui/react", role: "button", asProp: "as", nameProps: ["aria-label"], childLabelProps: ["children"], disabledProps: ["disabled"] }
  },
  mantine: {
    Button: { importSource: "@mantine/core", role: "button", asProp: "component", nameProps: ["aria-label"], childLabelProps: ["children"], disabledProps: ["disabled"] },
    ActionIcon: { importSource: "@mantine/core", role: "button", asProp: "component", nameProps: ["aria-label", "label", "title"], disabledProps: ["disabled"] },
    TextInput: { importSource: "@mantine/core", role: "textbox", nameProps: ["label", "aria-label"], valueProps: ["value", "defaultValue"], disabledProps: ["disabled"] },
    Textarea: { importSource: "@mantine/core", role: "textbox", nameProps: ["label", "aria-label"], valueProps: ["value", "defaultValue"], disabledProps: ["disabled"] },
    Checkbox: { importSource: "@mantine/core", role: "checkbox", nameProps: ["label", "aria-label"], valueProps: ["value"], disabledProps: ["disabled"] },
    Switch: { importSource: "@mantine/core", role: "switch", nameProps: ["label", "aria-label"], disabledProps: ["disabled"] }
  },
  "react-bootstrap": {
    Button: { importSource: "react-bootstrap", role: "button", asProp: "as", nameProps: ["aria-label"], childLabelProps: ["children"], disabledProps: ["disabled"] },
    FormControl: { importSource: "react-bootstrap", role: "textbox", asProp: "as", nameProps: ["aria-label", "label"], valueProps: ["value", "defaultValue"], disabledProps: ["disabled"] },
    FormGroup: { importSource: "react-bootstrap", wrapper: true, labelProps: ["label"] },
    FormCheck: { importSource: "react-bootstrap", role: "checkbox", nameProps: ["aria-label", "label"], childLabelProps: ["children"], valueProps: ["value"], disabledProps: ["disabled"] },
    NavLink: { importSource: "react-bootstrap", role: "link", asProp: "as", nameProps: ["aria-label"], childLabelProps: ["children"], disabledProps: ["disabled"] }
  }
};

export async function resolveScanOptions(options: ScanOptions = {}, cwd = process.cwd()): Promise<ResolvedScanOptions> {
  const configFile = resolveConfigPath(options.configPath, cwd);
  const config = await readConfig(configFile.path, Boolean(options.configPath));
  return {
    include: options.include ?? config.include ?? defaultOptions.include,
    exclude: options.exclude ?? config.exclude ?? defaultOptions.exclude,
    rules: normalizeRuleOptions({ ...config.rules, ...options.rules }),
    standard: resolveStandardId(options.standard ?? config.standard ?? defaultOptions.standard),
    failOn: options.failOn ?? config.failOn ?? defaultOptions.failOn,
    format: options.format ?? config.format ?? defaultOptions.format,
    baseline: options.baseline ?? config.baseline,
    verbose: options.verbose ?? config.verbose ?? defaultOptions.verbose,
    runtimeUrl: options.runtimeUrl ?? config.runtimeUrl,
    runtime: resolveRuntimeConfig(config, options),
    semantic: options.semantic ?? config.semantic ?? defaultOptions.semantic,
    componentPresets: options.componentPresets ?? config.componentPresets ?? defaultOptions.componentPresets,
    components: resolveComponentMappings(options.componentPresets ?? config.componentPresets ?? [], config.components, options.components),
    suppressions: normalizeSuppressions([...(config.suppressions ?? []), ...(options.suppressions ?? [])], configFile.path),
    pr: resolvePrConfig(config.pr, options.pr),
    packages: config.packages ?? [],
    configPath: options.configPath,
    rootDir: configFile.exists ? path.dirname(configFile.path) : cwd
  };
}

function resolveRuntimeConfig(config: ScanConfig, options: ScanOptions): ResolvedScanOptions["runtime"] {
  const runtimeUrl = options.runtimeUrl ?? config.runtimeUrl;
  const runtime = { ...(config.runtime ?? {}), ...(options.runtime ?? {}) };
  return {
    baseUrl: runtime.baseUrl ?? runtimeUrl,
    routes: normalizeRoutes(runtime.routes ?? defaultOptions.runtime.routes),
    discoverRoutes: runtime.discoverRoutes ?? defaultOptions.runtime.discoverRoutes,
    viewports: normalizeViewports(runtime.viewports ?? defaultOptions.runtime.viewports),
    auth: runtime.auth,
    setupScript: runtime.setupScript,
    waitUntil: runtime.waitUntil ?? defaultOptions.runtime.waitUntil,
    waitForSelector: runtime.waitForSelector,
    waitForTimeoutMs: runtime.waitForTimeoutMs,
    timeoutMs: runtime.timeoutMs ?? defaultOptions.runtime.timeoutMs,
    cookies: runtime.cookies ?? defaultOptions.runtime.cookies,
    localStorage: runtime.localStorage ?? defaultOptions.runtime.localStorage,
    headers: runtime.headers ?? defaultOptions.runtime.headers,
    screenshot: runtime.screenshot ?? defaultOptions.runtime.screenshot
  };
}

function normalizeRoutes(routes: string[]): string[] {
  return [...new Set(routes.map((route) => route.trim()).filter(Boolean))];
}

function normalizeViewports(viewports: ResolvedScanOptions["runtime"]["viewports"]): ResolvedScanOptions["runtime"]["viewports"] {
  const normalized = viewports.length > 0 ? viewports : defaultOptions.runtime.viewports;
  return normalized.map((viewport, index) => ({
    ...viewport,
    name: viewport.name ?? `viewport-${index + 1}`,
    deviceScaleFactor: viewport.deviceScaleFactor ?? 1
  }));
}

function resolvePrConfig(config: PrReviewConfig | undefined, options: PrReviewConfig | undefined): Required<PrReviewConfig> {
  const merged = { ...defaultOptions.pr, ...config, ...options };
  return {
    maxComments: validMaxComments(merged.maxComments),
    severityThreshold: validSeverity(merged.severityThreshold, "pr.severityThreshold"),
    commentMode: validCommentMode(merged.commentMode),
    changedFilesOnly: Boolean(merged.changedFilesOnly),
    baselinePolicy: validBaselinePolicy(merged.baselinePolicy),
    statusCheckName: merged.statusCheckName?.trim() || defaultOptions.pr.statusCheckName,
    uploadSarif: Boolean(merged.uploadSarif)
  };
}

function validMaxComments(value: number | undefined): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  throw new Error("pr.maxComments must be a non-negative integer.");
}

function validSeverity(value: Severity | undefined, name: string): Severity {
  if (value === "critical" || value === "warning" || value === "info") return value;
  throw new Error(`${name} must be one of: critical, warning, info.`);
}

function validCommentMode(value: PrReviewConfig["commentMode"] | undefined): Required<PrReviewConfig>["commentMode"] {
  if (value === "off" || value === "summary" || value === "inline" || value === "both") return value;
  throw new Error("pr.commentMode must be one of: off, summary, inline, both.");
}

function validBaselinePolicy(value: PrReviewConfig["baselinePolicy"] | undefined): Required<PrReviewConfig>["baselinePolicy"] {
  if (value === "new" || value === "all") return value;
  throw new Error("pr.baselinePolicy must be one of: new, all.");
}

function normalizeRuleOptions(rules: Record<string, RuleOption> | undefined): Record<string, RuleOption> {
  return Object.fromEntries(Object.entries(rules ?? {}).map(([ruleId, option]) => [normalizeRuleId(ruleId), option]));
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

export function normalizeSuppressions(suppressions: SuppressionConfig[] | undefined, configPath: string): ResolvedSuppression[] {
  return (suppressions ?? []).map((suppression, index) => {
    const rules = [...(suppression.rule ? [suppression.rule] : []), ...(suppression.rules ?? [])].map(normalizeRuleId);
    const files = [...(suppression.file ? [suppression.file] : []), ...(suppression.files ?? [])];

    if (rules.length === 0) {
      throw new Error(`Invalid suppression ${index + 1} in ${configPath}: at least one rule or rules entry is required.`);
    }
    if (files.length === 0) {
      throw new Error(`Invalid suppression ${index + 1} in ${configPath}: at least one file or files entry is required.`);
    }
    if (!suppression.reason?.trim()) {
      throw new Error(`Invalid suppression ${index + 1} in ${configPath}: reason is required.`);
    }
    if (!suppression.expires?.trim()) {
      throw new Error(`Invalid suppression ${index + 1} in ${configPath}: expires is required.`);
    }
    if (Number.isNaN(Date.parse(suppression.expires))) {
      throw new Error(`Invalid suppression ${index + 1} in ${configPath}: expires must be a valid date.`);
    }

    return {
      rules,
      files,
      reason: suppression.reason.trim(),
      expires: suppression.expires,
      source: "config"
    };
  });
}

export function isSuppressionExpired(expires: string, now = new Date()): boolean {
  return Date.parse(expires) < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
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
