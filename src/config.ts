import { promises as fs } from "node:fs";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import { normalizeRuleId } from "./rules/index.js";
import { resolveStandardId } from "./standards.js";
import type { ComponentMapping, ComponentPreset, Finding, NativeScanConfig, OwnershipConfig, PrReviewConfig, ResolvedOwnership, ResolvedScanOptions, ResolvedSuppression, RuleOption, RuntimeBrowserConfig, RuntimeCrawlConfig, ScanConfig, ScanOptions, Severity, SuppressionConfig, SuppressionPolicyConfig } from "./types.js";

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
    screenshot: true,
    browser: { mode: "auto", executablePath: "" },
    crawl: {
      enabled: false,
      maxDepth: 1,
      maxRoutes: 25,
      include: [],
      exclude: ["/logout", "/sign-out", "/signout", "/delete", "/destroy", "/remove"]
    },
    interactions: { presets: [], scripts: [] },
    stories: { enabled: false, baseUrl: "", include: [], exclude: [] }
  },
  semantic: "auto",
  componentPresets: [],
  components: {},
  suppressions: [],
  suppressionPolicy: {
    requireReason: true,
    requireExpires: true,
    requireApprovedBy: true
  },
  ownership: [],
  native: {
    enabled: false,
    platforms: ["ios"],
    runner: "local",
    appIds: {},
    devices: {},
    deepLinks: [],
    screens: [],
    maxDurationMinutes: 20
  },
  telemetry: {
    enabled: true
  },
  pr: {
    maxComments: 20,
    severityThreshold: "info",
    commentMode: "both",
    changedFilesOnly: true,
    baselinePolicy: "new",
    statusCheckName: "ClearDOM PR review",
    uploadSarif: false
  },
  packages: [],
  rootDir: process.cwd()
};

const configSchema = JSON.parse(readFileSync(fileURLToPath(new URL("../cleardom.schema.json", import.meta.url)), "utf8"));
const validateConfigSchema = new Ajv2020({ allErrors: true, strict: false }).compile(configSchema);

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
    Input: { importSource: "antd", role: "textbox", nameProps: ["aria-label", "label"], valueProps: ["value", "defaultValue"], disabledProps: ["disabled"] },
    TextArea: { importSource: "antd", role: "textbox", nameProps: ["aria-label", "label"], valueProps: ["value", "defaultValue"], disabledProps: ["disabled"] },
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
  const rootDir = configFile.exists ? path.dirname(configFile.path) : cwd;
  const componentPresets = options.componentPresets
    ?? config.componentPresets
    ?? await detectComponentPresets(rootDir);
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
    componentPresets,
    components: resolveComponentMappings(componentPresets, config.components, options.components),
    suppressionPolicy: resolveSuppressionPolicy(config.suppressionPolicy, options.suppressionPolicy),
    suppressions: normalizeSuppressions(
      [...(config.suppressions ?? []), ...(options.suppressions ?? [])],
      configFile.path,
      resolveSuppressionPolicy(config.suppressionPolicy, options.suppressionPolicy)
    ),
    ownership: normalizeOwnership([...(config.ownership ?? []), ...(options.ownership ?? [])]),
    native: resolveNativeConfig(config.native, options.native),
    telemetry: resolveTelemetryConfig(config.telemetry),
    pr: resolvePrConfig(config.pr, options.pr),
    packages: config.packages ?? [],
    configPath: options.configPath,
    rootDir
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
    screenshot: runtime.screenshot ?? defaultOptions.runtime.screenshot,
    browser: resolveRuntimeBrowser(runtime.browser),
    crawl: resolveRuntimeCrawl(runtime.crawl),
    interactions: {
      presets: runtime.interactions?.presets ?? defaultOptions.runtime.interactions.presets,
      scripts: runtime.interactions?.scripts ?? defaultOptions.runtime.interactions.scripts
    },
    stories: {
      enabled: runtime.stories?.enabled ?? defaultOptions.runtime.stories.enabled,
      baseUrl: runtime.stories?.baseUrl ?? defaultOptions.runtime.stories.baseUrl,
      include: runtime.stories?.include ?? defaultOptions.runtime.stories.include,
      exclude: runtime.stories?.exclude ?? defaultOptions.runtime.stories.exclude
    }
  };
}

async function detectComponentPresets(rootDir: string): Promise<ComponentPreset[]> {
  const packageJson = await readPackageJson(rootDir);
  const dependencies = new Set(Object.keys({
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {}),
    ...(packageJson?.peerDependencies ?? {})
  }));
  const presets: ComponentPreset[] = [];

  if (hasAnyDependency(dependencies, ["@radix-ui/react-dialog", "@radix-ui/react-slot", "@radix-ui/themes"])) presets.push("radix");
  if (hasAnyDependency(dependencies, ["@mui/material", "@material-ui/core"])) presets.push("mui");
  if (hasAnyDependency(dependencies, ["react-aria", "react-aria-components", "@react-aria/button"])) presets.push("react-aria");
  if (hasAnyDependency(dependencies, ["react-native", "expo"])) presets.push("react-native");
  if (dependencies.has("@chakra-ui/react")) presets.push("chakra");
  if (dependencies.has("antd")) presets.push("ant-design");
  if (dependencies.has("@headlessui/react")) presets.push("headless-ui");
  if (dependencies.has("@mantine/core")) presets.push("mantine");
  if (dependencies.has("react-bootstrap")) presets.push("react-bootstrap");

  return presets;
}

async function readPackageJson(rootDir: string): Promise<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string>; peerDependencies?: Record<string, string> } | undefined> {
  try {
    return JSON.parse(await fs.readFile(path.join(rootDir, "package.json"), "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; peerDependencies?: Record<string, string> };
  } catch {
    return undefined;
  }
}

function hasAnyDependency(dependencies: Set<string>, names: string[]): boolean {
  return names.some((name) => dependencies.has(name));
}

function resolveRuntimeBrowser(browser: RuntimeBrowserConfig | undefined): ResolvedScanOptions["runtime"]["browser"] {
  const mode = browser?.mode ?? defaultOptions.runtime.browser.mode;
  if (mode !== "auto" && mode !== "system" && mode !== "managed") {
    throw new Error("runtime.browser.mode must be one of: auto, system, managed.");
  }
  return {
    mode,
    executablePath: browser?.executablePath ?? defaultOptions.runtime.browser.executablePath
  };
}

function resolveRuntimeCrawl(crawl: RuntimeCrawlConfig | undefined): ResolvedScanOptions["runtime"]["crawl"] {
  return {
    enabled: crawl?.enabled ?? defaultOptions.runtime.crawl.enabled,
    maxDepth: crawl?.maxDepth ?? defaultOptions.runtime.crawl.maxDepth,
    maxRoutes: crawl?.maxRoutes ?? defaultOptions.runtime.crawl.maxRoutes,
    include: crawl?.include ?? defaultOptions.runtime.crawl.include,
    exclude: crawl?.exclude ?? defaultOptions.runtime.crawl.exclude
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

function resolveSuppressionPolicy(config: SuppressionPolicyConfig | undefined, options: SuppressionPolicyConfig | undefined): Required<SuppressionPolicyConfig> {
  return {
    requireReason: options?.requireReason ?? config?.requireReason ?? defaultOptions.suppressionPolicy.requireReason,
    requireExpires: options?.requireExpires ?? config?.requireExpires ?? defaultOptions.suppressionPolicy.requireExpires,
    requireApprovedBy: options?.requireApprovedBy ?? config?.requireApprovedBy ?? defaultOptions.suppressionPolicy.requireApprovedBy
  };
}

export function normalizeSuppressions(
  suppressions: SuppressionConfig[] | undefined,
  configPath: string,
  policy: Required<SuppressionPolicyConfig> = defaultOptions.suppressionPolicy
): ResolvedSuppression[] {
  return (suppressions ?? []).map((suppression, index) => {
    const rules = [...(suppression.rule ? [suppression.rule] : []), ...(suppression.rules ?? [])].map(normalizeRuleId);
    const files = [...(suppression.file ? [suppression.file] : []), ...(suppression.files ?? [])];

    if (rules.length === 0) {
      throw new Error(`Invalid suppression ${index + 1} in ${configPath}: at least one rule or rules entry is required.`);
    }
    if (files.length === 0) {
      throw new Error(`Invalid suppression ${index + 1} in ${configPath}: at least one file or files entry is required.`);
    }
    if (policy.requireReason && !suppression.reason?.trim()) {
      throw new Error(`Invalid suppression ${index + 1} in ${configPath}: reason is required.`);
    }
    if (policy.requireExpires && !suppression.expires?.trim()) {
      throw new Error(`Invalid suppression ${index + 1} in ${configPath}: expires is required.`);
    }
    if (suppression.expires?.trim() && Number.isNaN(Date.parse(suppression.expires))) {
      throw new Error(`Invalid suppression ${index + 1} in ${configPath}: expires must be a valid date.`);
    }
    if (policy.requireApprovedBy && !suppression.approvedBy?.trim()) {
      throw new Error(`Invalid suppression ${index + 1} in ${configPath}: approvedBy is required.`);
    }

    return {
      rules,
      files,
      reason: suppression.reason?.trim() ?? "",
      expires: suppression.expires ?? "",
      approvedBy: suppression.approvedBy?.trim(),
      ticket: suppression.ticket?.trim(),
      owner: suppression.owner?.trim(),
      source: "config"
    };
  });
}

export function isSuppressionExpired(expires: string, now = new Date()): boolean {
  if (!expires) return false;
  return Date.parse(expires) < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function normalizeOwnership(ownership: OwnershipConfig[]): ResolvedOwnership[] {
  return ownership.map((entry) => ({
    files: entry.files,
    owner: entry.owner,
    reviewers: entry.reviewers ?? [],
    rules: (entry.rules ?? []).map(normalizeRuleId)
  }));
}

export function ownerForFinding(finding: Finding, options: ResolvedScanOptions): string | undefined {
  const relativeFile = normalizePath(path.relative(options.rootDir, finding.file));
  const normalizedFile = normalizePath(finding.file);
  const match = options.ownership.find((entry) => {
    if (entry.rules.length > 0 && !entry.rules.includes(finding.ruleId)) return false;
    return matchesAnyPattern(relativeFile, entry.files) || matchesAnyPattern(normalizedFile, entry.files);
  });
  return match?.owner;
}

function resolveNativeConfig(config: NativeScanConfig | undefined, options: NativeScanConfig | undefined): ResolvedScanOptions["native"] {
  const merged = { ...defaultOptions.native, ...config, ...options };
  if (merged.provider === "eas") {
    throw new Error("native.provider=eas was removed in config schema 1. Remove provider and use the local agent-device runner. Run `cleardom doctor .` for native setup guidance.");
  }
  const platforms = merged.platforms && merged.platforms.length > 0 ? [...new Set(merged.platforms)] : defaultOptions.native.platforms;
  const appIds = { ...(config?.appIds ?? {}), ...(options?.appIds ?? {}) };
  const legacyAppId = options?.appId ?? config?.appId;
  if (legacyAppId && platforms.length !== 1) {
    throw new Error("native.appId cannot be migrated when both platforms are configured. Replace it with native.appIds.ios and native.appIds.android.");
  }
  if (legacyAppId && platforms[0]) appIds[platforms[0]] ??= legacyAppId;
  return {
    enabled: Boolean(merged.enabled),
    platforms,
    runner: "local",
    appIds,
    devices: { ...(config?.devices ?? {}), ...(options?.devices ?? {}) },
    deepLinks: merged.deepLinks ?? [],
    screens: merged.screens ?? [],
    maxDurationMinutes: merged.maxDurationMinutes ?? defaultOptions.native.maxDurationMinutes
  };
}

function resolveTelemetryConfig(config: ScanConfig["telemetry"]): Required<NonNullable<ScanConfig["telemetry"]>> {
  const environment = process.env.CLEARDOM_TELEMETRY;
  if (environment !== undefined && environment !== "0" && environment !== "1") {
    throw new Error("CLEARDOM_TELEMETRY must be 0 or 1.");
  }
  return { enabled: environment === "1" || (environment === undefined && (config?.enabled ?? true)) };
}

async function readConfig(resolved: string, explicit: boolean): Promise<ScanConfig> {
  try {
    const raw = await fs.readFile(resolved, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    validateConfig(parsed, resolved);
    return parsed as ScanConfig;
  } catch (error) {
    if (explicit || !isMissingFile(error)) {
      throw new Error(`Could not read ClearDOM config at ${resolved}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return {};
  }
}

const configKeys = new Set([
  "$schema", "schemaVersion", "include", "exclude", "rules", "standard", "failOn", "format", "baseline", "verbose",
  "runtimeUrl", "runtime", "semantic", "componentPresets", "components", "suppressions", "suppressionPolicy", "ownership",
  "native", "telemetry", "pr", "packages"
]);

function validateConfig(value: unknown, file: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`ClearDOM config at ${file} must be a JSON object.`);
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== undefined && record.schemaVersion !== 1) {
    throw new Error(`Unsupported ClearDOM config schemaVersion ${String(record.schemaVersion)} at ${file}. ClearDOM 1.x supports schemaVersion 1.`);
  }
  const unknown = Object.keys(record).filter((key) => !configKeys.has(key));
  if (unknown.length > 0) throw new Error(`Unknown ClearDOM config ${unknown.length === 1 ? "key" : "keys"}: ${unknown.join(", ")}. See cleardom.schema.json.`);
  validateObjectKeys(record.native, "native", new Set(["enabled", "platforms", "runner", "appIds", "devices", "appId", "provider", "deepLinks", "screens", "maxDurationMinutes"]));
  const native = asRecord(record.native);
  validateObjectKeys(native?.appIds, "native.appIds", new Set(["ios", "android"]));
  validateObjectKeys(native?.devices, "native.devices", new Set(["ios", "android"]));
  validateObjectKeys(record.telemetry, "telemetry", new Set(["enabled"]));
  validateObjectKeys(record.runtime, "runtime", new Set(["baseUrl", "routes", "discoverRoutes", "viewports", "auth", "setupScript", "waitUntil", "waitForSelector", "waitForTimeoutMs", "timeoutMs", "cookies", "localStorage", "headers", "screenshot", "browser", "crawl", "interactions", "stories"]));
  const runtime = asRecord(record.runtime);
  validateObjectKeys(runtime?.browser, "runtime.browser", new Set(["mode", "executablePath"]));
  validateObjectKeys(runtime?.crawl, "runtime.crawl", new Set(["enabled", "maxDepth", "maxRoutes", "include", "exclude"]));
  validateObjectKeys(runtime?.interactions, "runtime.interactions", new Set(["presets", "scripts"]));
  validateObjectKeys(runtime?.stories, "runtime.stories", new Set(["enabled", "baseUrl", "include", "exclude"]));
  validateObjectKeys(runtime?.auth, "runtime.auth", new Set(["setupScript"]));
  validateArrayObjectKeys(runtime?.viewports, "runtime.viewports", new Set(["name", "width", "height", "deviceScaleFactor", "isMobile"]));
  validateArrayObjectKeys(runtime?.cookies, "runtime.cookies", new Set(["name", "value", "domain", "path", "url", "expires", "httpOnly", "secure", "sameSite"]));
  validateObjectKeys(record.suppressionPolicy, "suppressionPolicy", new Set(["requireReason", "requireExpires", "requireApprovedBy"]));
  validateObjectKeys(record.pr, "pr", new Set(["maxComments", "severityThreshold", "commentMode", "changedFilesOnly", "baselinePolicy", "statusCheckName", "uploadSarif"]));
  validateArrayObjectKeys(record.native && asRecord(record.native)?.screens, "native.screens", new Set(["name", "deepLink", "actions", "timeoutMs", "screenshot"]));
  for (const [screenIndex, screen] of (Array.isArray(asRecord(record.native)?.screens) ? asRecord(record.native)?.screens as unknown[] : []).entries()) {
    const actions = asRecord(screen)?.actions;
    validateNativeActions(actions, screenIndex);
  }
  validateArrayObjectKeys(record.suppressions, "suppressions", new Set(["rule", "rules", "file", "files", "reason", "expires", "approvedBy", "ticket", "owner"]));
  validateArrayObjectKeys(record.ownership, "ownership", new Set(["files", "owner", "reviewers", "rules"]));
  validateArrayObjectKeys(record.packages, "packages", new Set(["name", "path", "label", "include", "exclude", "rules", "standard", "failOn", "baseline", "semantic", "componentPresets", "components"]));
  validateRecordObjectKeys(record.components, "components", componentMappingKeys);
  validateRuleOptions(record.rules, "rules");
  for (const [packageIndex, packageConfig] of (Array.isArray(record.packages) ? record.packages : []).entries()) {
    const packageRecord = asRecord(packageConfig);
    validateRecordObjectKeys(packageRecord?.components, `packages[${packageIndex}].components`, componentMappingKeys);
    validateRuleOptions(packageRecord?.rules, `packages[${packageIndex}].rules`);
  }
  if (!validateConfigSchema(record)) {
    const details = (validateConfigSchema.errors ?? []).slice(0, 5).map((error: ErrorObject) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`).join("; ");
    throw new Error(`ClearDOM config does not match schemaVersion 1: ${details}. See cleardom.schema.json.`);
  }
}

const componentMappingKeys = new Set(["role", "importSource", "asProp", "roleProps", "valueProps", "nameProps", "labelProps", "childLabelProps", "disabledProps", "decorativeProps", "wrapper"]);

function validateObjectKeys(value: unknown, label: string, allowed: Set<string>): void {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be a JSON object.`);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`Unknown ClearDOM ${label} ${unknown.length === 1 ? "key" : "keys"}: ${unknown.join(", ")}.`);
}

function validateArrayObjectKeys(value: unknown, label: string, allowed: Set<string>): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) throw new Error(`${label} must be a JSON array.`);
  for (const [index, item] of value.entries()) validateObjectKeys(item, `${label}[${index}]`, allowed);
}

function validateRecordObjectKeys(value: unknown, label: string, allowed: Set<string>): void {
  if (value === undefined) return;
  const record = asRecord(value);
  if (!record) throw new Error(`${label} must be a JSON object.`);
  for (const [key, item] of Object.entries(record)) validateObjectKeys(item, `${label}.${key}`, allowed);
}

function validateRuleOptions(value: unknown, label: string): void {
  if (value === undefined) return;
  const record = asRecord(value);
  if (!record) throw new Error(`${label} must be a JSON object.`);
  for (const [key, option] of Object.entries(record)) {
    if (typeof option === "string") continue;
    validateObjectKeys(option, `${label}.${key}`, new Set(["enabled", "severity", "blocking"]));
  }
}

function validateNativeActions(value: unknown, screenIndex: number): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) throw new Error(`native.screens[${screenIndex}].actions must be a JSON array.`);
  const actionKeys = new Set(["press", "fill", "text", "swipe", "back", "waitFor", "timeoutMs", "assert"]);
  for (const [actionIndex, action] of value.entries()) {
    validateObjectKeys(action, `native.screens[${screenIndex}].actions[${actionIndex}]`, actionKeys);
    const keys = Object.keys(asRecord(action) ?? {}).filter((key) => ["press", "fill", "swipe", "back", "waitFor", "assert"].includes(key));
    if (keys.length !== 1) throw new Error(`native.screens[${screenIndex}].actions[${actionIndex}] must contain exactly one action.`);
    if (keys[0] === "fill" && typeof asRecord(action)?.text !== "string") throw new Error(`native.screens[${screenIndex}].actions[${actionIndex}].text is required for fill.`);
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
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
