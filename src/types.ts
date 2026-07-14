export type Severity = "critical" | "warning" | "info";
export type Confidence = "high" | "medium" | "low";
export type DetectionMode = "automated" | "needs-review" | "manual-guidance";
export type FindingImpact = "blocking" | "serious" | "moderate" | "minor";
export type FindingSource = "static" | "semantic" | "runtime" | "native-runtime";
export type FixKind = "safe-auto-fix" | "guided-fix" | "manual-review";
export type Platform = "web" | "react-native-ios" | "react-native-android";
export type AttributeValueKind = "static" | "expression" | "boolean";
export type RuleCategory = "names-and-roles" | "forms" | "keyboard" | "readability" | "react-native" | "structure";
export type FailOn = "none" | "critical" | "warning" | "findings" | "regression";
export type OutputFormat = "text" | "json" | "sarif" | "html";
export type SemanticMode = "auto" | "off" | "required";
export type PrCommentMode = "off" | "summary" | "inline" | "both";
export type PrBaselinePolicy = "new" | "all";
export type SemanticAdapterId = "typescript" | "lightweight";
export type WcagVersion = "wcag10" | "wcag20" | "wcag21" | "wcag22" | "wcag30";
export type WcagLevel = "a" | "aa" | "aaa";
export type StandardId =
  | "wcag10"
  | "wcag20-a"
  | "wcag20-aa"
  | "wcag20-aaa"
  | "wcag21-a"
  | "wcag21-aa"
  | "wcag21-aaa"
  | "wcag22-a"
  | "wcag22-aa"
  | "wcag22-aaa"
  | "wcag30-draft";
export type StandardStatus = "recommendation" | "draft";

export type JsxAttribute = {
  name: string;
  kind: AttributeValueKind;
  value: string | true;
};

export type JsxElement = {
  id: number;
  tagName: string;
  importSource?: string;
  attributes: JsxAttribute[];
  parentId?: number;
  childIds: number[];
  ownText: string;
  selfClosing: boolean;
  start: number;
  end: number;
  line: number;
  column: number;
  excerpt: string;
};

export type StaticValue = string | boolean | StaticObject | "unknown";

export type StaticObject = {
  [key: string]: StaticValue;
};

export type SourceLocation = {
  file: string;
  line: number;
  column: number;
};

export type SemanticAttribute = {
  rawName: string;
  name: string;
  staticValue?: StaticValue;
  expression?: string;
  confidence: Confidence;
  location: SourceLocation;
};

export type SemanticElement = {
  id: number;
  tagName: string;
  resolvedRole?: string;
  framework: "react" | "react-native" | "html" | "vue" | "svelte" | "astro" | "angular" | "mdx" | "unknown";
  componentOrigin?: string;
  attributes: SemanticAttribute[];
  childIds: number[];
  parentId?: number;
  location: SourceLocation;
};

export type SemanticFile = {
  file: string;
  elements: SemanticElement[];
  diagnostics: SemanticDiagnostic[];
};

export type SemanticProject = {
  files: SemanticFile[];
  diagnostics: SemanticDiagnostic[];
  analysis: SemanticAnalysisSummary;
};

export type CompilerAdapter = {
  createProject: (rootDir: string, options: ResolvedScanOptions) => Promise<SemanticProject> | SemanticProject;
  parseFile: (filePath: string) => Promise<SemanticFile> | SemanticFile;
  resolveElement: (element: SemanticElement) => SemanticElement;
  evaluateExpression: (expression: string) => StaticValue;
  mapGeneratedLocation: (location: SourceLocation) => SourceLocation;
};

export type RuleDefinition = {
  id: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  detectionMode?: DetectionMode;
  impact?: FindingImpact;
  confidenceReason?: string;
  source?: FindingSource;
  fixKind?: FixKind;
  category: RuleCategory;
  wcag: string[];
  standards: StandardReference[];
  platforms: Platform[];
  fixable: boolean;
  summary: string;
  guidance: string;
  examples: RuleExample[];
  remediation?: RuleRemediation;
  check: RuleCheck;
};

export type RuleExample = {
  label: string;
  code: string;
};

export type RuleRemediation = {
  before?: string;
  after?: string;
  safeAutofix?: string;
  manualVerification?: string;
};

export type StandardReference = {
  version: WcagVersion;
  criterion: string;
  level?: WcagLevel;
  title?: string;
};

export type WcagCriterion = {
  version: Exclude<WcagVersion, "wcag10" | "wcag30">;
  criterion: string;
  level: WcagLevel;
  title: string;
};

export type RuleCheck = (context: RuleContext) => Finding[];

export type RuleContext = {
  file: string;
  source: string;
  elements: JsxElement[];
  options: ResolvedScanOptions;
  createFinding: (rule: RuleDefinition, element: JsxElement, message: string) => Finding;
  getAttribute: (element: JsxElement, name: string) => JsxAttribute | undefined;
  hasAttribute: (element: JsxElement, name: string) => boolean;
  elementText: (element: JsxElement) => string;
  parentOf: (element: JsxElement) => JsxElement | undefined;
  findById: (id: string) => JsxElement | undefined;
  labelsFor: (element: JsxElement) => JsxElement[];
};

export type RuleOption = "off" | Severity | {
  enabled?: boolean;
  severity?: Severity;
};

export type ScanConfig = {
  include?: string[];
  exclude?: string[];
  rules?: Record<string, RuleOption>;
  standard?: StandardId | "latest" | "current";
  failOn?: FailOn;
  format?: OutputFormat;
  baseline?: string;
  verbose?: boolean;
  runtimeUrl?: string;
  runtime?: RuntimeScanConfig;
  semantic?: SemanticMode;
  componentPresets?: ComponentPreset[];
  components?: Record<string, ComponentMapping>;
  suppressions?: SuppressionConfig[];
  suppressionPolicy?: SuppressionPolicyConfig;
  ownership?: OwnershipConfig[];
  native?: NativeScanConfig;
  pr?: PrReviewConfig;
  packages?: PackageConfig[];
};

export type RuntimeScanConfig = {
  baseUrl?: string;
  routes?: string[];
  discoverRoutes?: boolean;
  viewports?: RuntimeViewport[];
  auth?: RuntimeAuthConfig;
  setupScript?: string;
  waitUntil?: RuntimeWaitUntil;
  waitForSelector?: string;
  waitForTimeoutMs?: number;
  timeoutMs?: number;
  cookies?: RuntimeCookie[];
  localStorage?: Record<string, string>;
  headers?: Record<string, string>;
  screenshot?: boolean;
  browser?: RuntimeBrowserConfig;
  crawl?: RuntimeCrawlConfig;
  interactions?: RuntimeInteractionConfig;
  stories?: RuntimeStoriesConfig;
};

export type RuntimeBrowserConfig = {
  mode?: "auto" | "system" | "managed";
  executablePath?: string;
};

export type RuntimeCrawlConfig = {
  enabled?: boolean;
  maxDepth?: number;
  maxRoutes?: number;
  include?: string[];
  exclude?: string[];
};

export type RuntimeInteractionPreset = "menus" | "dialogs" | "accordions" | "forms" | "drawers";

export type RuntimeInteractionConfig = {
  presets?: RuntimeInteractionPreset[];
  scripts?: string[];
};

export type RuntimeStoriesConfig = {
  enabled?: boolean;
  baseUrl?: string;
  include?: string[];
  exclude?: string[];
};

export type RuntimeViewport = {
  name?: string;
  width: number;
  height: number;
  deviceScaleFactor?: number;
  isMobile?: boolean;
};

export type RuntimeAuthConfig = {
  setupScript?: string;
};

export type RuntimeWaitUntil = "load" | "domcontentloaded" | "networkidle0" | "networkidle2";

export type RuntimeCookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  url?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
};

export type PrReviewConfig = {
  maxComments?: number;
  severityThreshold?: Severity;
  commentMode?: PrCommentMode;
  changedFilesOnly?: boolean;
  baselinePolicy?: PrBaselinePolicy;
  statusCheckName?: string;
  uploadSarif?: boolean;
};

export type PackageConfig = {
  name: string;
  path: string;
  label?: string;
  include?: string[];
  exclude?: string[];
  rules?: Record<string, RuleOption>;
  standard?: StandardId | "latest" | "current";
  failOn?: FailOn;
  baseline?: string;
  semantic?: SemanticMode;
  componentPresets?: ComponentPreset[];
  components?: Record<string, ComponentMapping>;
};

export type SuppressionConfig = {
  rule?: string;
  rules?: string[];
  file?: string;
  files?: string[];
  reason: string;
  expires: string;
  approvedBy?: string;
  ticket?: string;
  owner?: string;
};

export type SuppressionPolicyConfig = {
  requireReason?: boolean;
  requireExpires?: boolean;
  requireApprovedBy?: boolean;
};

export type OwnershipConfig = {
  files: string[];
  owner: string;
  reviewers?: string[];
  rules?: string[];
};

export type NativeScanConfig = {
  enabled?: boolean;
  platforms?: Array<"ios" | "android">;
  provider?: "eas";
  appId?: string;
  deepLinks?: string[];
  screens?: NativeScreenConfig[];
  maxDurationMinutes?: number;
};

export type NativeScreenConfig = {
  name: string;
  deepLink?: string;
  actions?: NativeScreenAction[];
};

export type NativeScreenAction = {
  press?: string;
  fill?: string;
  text?: string;
};

export type ComponentPreset = "radix" | "mui" | "react-aria" | "react-native" | "chakra" | "ant-design" | "headless-ui" | "mantine" | "react-bootstrap";

export type ComponentMapping = {
  role?: "button" | "link" | "textbox" | "checkbox" | "radio" | "switch" | "tab" | "menuitem" | "image";
  importSource?: string | string[];
  asProp?: string;
  roleProps?: string[];
  valueProps?: string[];
  nameProps?: string[];
  labelProps?: string[];
  childLabelProps?: string[];
  disabledProps?: string[];
  decorativeProps?: string[];
  wrapper?: boolean;
};

export type ScanOptions = ScanConfig & {
  configPath?: string;
};

export type ResolvedScanOptions = {
  include: string[];
  exclude: string[];
  rules: Record<string, RuleOption>;
  standard: StandardId;
  failOn: FailOn;
  format: OutputFormat;
  baseline?: string;
  verbose: boolean;
  runtimeUrl?: string;
  runtime: ResolvedRuntimeScanConfig;
  semantic: SemanticMode;
  componentPresets: ComponentPreset[];
  components: Record<string, ComponentMapping>;
  suppressions: ResolvedSuppression[];
  suppressionPolicy: Required<SuppressionPolicyConfig>;
  ownership: ResolvedOwnership[];
  native: Required<NativeScanConfig>;
  pr: Required<PrReviewConfig>;
  packages: PackageConfig[];
  configPath?: string;
  rootDir: string;
};

export type ResolvedRuntimeScanConfig = {
  baseUrl?: string;
  routes: string[];
  discoverRoutes: boolean;
  viewports: RuntimeViewport[];
  auth?: RuntimeAuthConfig;
  setupScript?: string;
  waitUntil: RuntimeWaitUntil;
  waitForSelector?: string;
  waitForTimeoutMs?: number;
  timeoutMs: number;
  cookies: RuntimeCookie[];
  localStorage: Record<string, string>;
  headers: Record<string, string>;
  screenshot: boolean;
  browser: Required<RuntimeBrowserConfig>;
  crawl: Required<RuntimeCrawlConfig>;
  interactions: Required<RuntimeInteractionConfig>;
  stories: Required<RuntimeStoriesConfig>;
};

export type ResolvedSuppression = {
  rules: string[];
  files: string[];
  reason: string;
  expires: string;
  approvedBy?: string;
  ticket?: string;
  owner?: string;
  source: "config";
};

export type ResolvedOwnership = {
  files: string[];
  owner: string;
  reviewers: string[];
  rules: string[];
};

export type Finding = {
  ruleId: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  impact: FindingImpact;
  confidenceReason: string;
  detectionMode: DetectionMode;
  source: FindingSource;
  fixKind: FixKind;
  category: RuleCategory;
  file: string;
  line: number;
  column: number;
  excerpt: string;
  message: string;
  wcag: string[];
  standards: StandardReference[];
  platforms: Platform[];
  target: string;
  semanticLocation: string;
  fingerprint: string;
  baselineStatus: "active" | "baseline";
  owner?: string;
  runtime?: RuntimeFindingEvidence;
  native?: NativeFindingEvidence;
};

export type RuntimeFindingEvidence = {
  url: string;
  route: string;
  viewport: RuntimeViewport;
  selector: string;
  screenshot?: string;
  evidence?: RuntimeEvidence;
};

export type RuntimeEvidence = {
  pageScreenshot?: string;
  elementScreenshot?: string;
  highlightedScreenshot?: string;
  domSnippet?: string;
  route: string;
  viewport: RuntimeViewport;
  interactionStep?: string;
  timestamp: string;
};

export type NativeFindingEvidence = {
  platform: "ios" | "android";
  screen?: string;
  deepLink?: string;
  accessibilityTree?: string;
  element?: {
    label?: string;
    role?: string;
    state?: string;
  };
  screenshot?: string;
};

export type SuppressedFinding = Finding & {
  suppression: SuppressionMatch;
};

export type SuppressionMatch = {
  kind: "inline" | "config";
  reason: string;
  expires?: string;
  approvedBy?: string;
  ticket?: string;
  owner?: string;
  scope: string;
};

export type SemanticDiagnostic = {
  file?: string;
  message: string;
  severity: "info" | "warning" | "error";
  adapter: SemanticAdapterId;
};

export type SemanticAnalysisSummary = {
  mode: SemanticMode;
  adapter: SemanticAdapterId;
  filesAnalyzed: number;
  filesFallback: number;
};

export type ScanResult = {
  checkedFiles: number;
  findings: Finding[];
  activeFindings: Finding[];
  baselineFindings: Finding[];
  suppressedFindings: SuppressedFinding[];
  regressions: Finding[];
  summary: ScanSummary;
  scoreBreakdown: ScoreBreakdown;
  score: number;
  rules: RuleSummary[];
  standard: StandardDefinition;
  semanticAnalysis: SemanticAnalysisSummary;
  semanticDiagnostics: SemanticDiagnostic[];
  runtimeDiagnostics: RuntimeDiagnostic[];
  runtimePages: RuntimePageResult[];
  outcome: ScanOutcome;
  timings?: { totalMs: number; sourceMs: number; runtimeMs: number };
  baseline?: BaselineFile;
};

export type ScanOutcome = {
  source: {
    requestedFiles: number;
    completedFiles: number;
    semanticFiles: number;
    fallbackFiles: number;
  };
  runtime: {
    requested: boolean;
    attemptedPages: number;
    completedPages: number;
    failedPages: number;
  };
  native: {
    requested: boolean;
    capturedStates: number;
    findings: number;
  };
  findings: {
    automated: number;
    needsReview: number;
    manualGuidance: number;
    safeAutoFix: number;
    guidedFix: number;
    manualReview: number;
    suppressed: number;
    baselined: number;
    regressions: number;
  };
};

export type RuntimeDiagnostic = {
  url?: string;
  route?: string;
  viewport?: string;
  stage: "discover-routes" | "setup" | "navigation" | "collector" | "screenshot" | "browser" | "interaction" | "native";
  message: string;
  severity: "info" | "warning" | "error";
};

export type RuntimePageResult = {
  url: string;
  route: string;
  viewport: RuntimeViewport;
  status?: number;
  findings: number;
};

export type ScanProgress =
  | { phase: "source"; files: number }
  | { phase: "runtime-discovery" }
  | { phase: "runtime-browser" }
  | { phase: "runtime-start"; pages: number; viewports: number }
  | { phase: "runtime-page"; completed: number; total: number; route: string; viewport: RuntimeViewport };

export type ComparisonResult = {
  base: ScanResult;
  head: ScanResult;
  newFindings: Finding[];
  fixedFindings: Finding[];
  unchangedFindings: Finding[];
  summary: ComparisonSummary;
};

export type ComparisonSummary = {
  newFindings: number;
  fixedFindings: number;
  unchangedFindings: number;
  headActiveFindings: number;
  baseActiveFindings: number;
};

export type ScanSummary = {
  totalFindings: number;
  activeFindings: number;
  baselineFindings: number;
  suppressedFindings: number;
  regressions: number;
  critical: number;
  warning: number;
  info: number;
};

export type ScoreBreakdown = {
  semanticClarity: number;
  keyboardFocus: number;
  readability: number;
  touchAccessibility: number;
  standardsCoverage: number;
};

export type BaselineFile = {
  version: 1;
  generatedAt: string;
  standard: StandardId;
  findings: BaselineFinding[];
};

export type BaselineFinding = {
  fingerprint: string;
  ruleId: string;
  file: string;
  message: string;
  target?: string;
  semanticLocation?: string;
};

export type RuleSummary = {
  id: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  detectionMode: DetectionMode;
  category: RuleCategory;
  wcag: string[];
  standards: StandardReference[];
  platforms: Platform[];
  fixable: boolean;
  guidance: string;
  remediation?: RuleRemediation;
  docsUrl: string;
};

export type StandardDefinition = {
  id: StandardId;
  label: string;
  version: WcagVersion;
  status: StandardStatus;
  level?: WcagLevel;
  recommended: boolean;
  note: string;
};
