export type Severity = "critical" | "warning" | "info";
export type Confidence = "high" | "medium" | "low";
export type Platform = "web" | "react-native-ios" | "react-native-android";
export type AttributeValueKind = "static" | "expression" | "boolean";
export type RuleCategory = "names-and-roles" | "forms" | "keyboard" | "readability" | "react-native" | "structure";
export type FailOn = "none" | "critical" | "warning" | "findings" | "regression";
export type OutputFormat = "text" | "json" | "sarif";
export type SemanticMode = "auto" | "off" | "required";
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
  category: RuleCategory;
  wcag: string[];
  standards: StandardReference[];
  platforms: Platform[];
  fixable: boolean;
  summary: string;
  guidance: string;
  examples: RuleExample[];
  check: RuleCheck;
};

export type RuleExample = {
  label: string;
  code: string;
};

export type StandardReference = {
  version: WcagVersion;
  criterion: string;
  level?: WcagLevel;
  title?: string;
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
  semantic?: SemanticMode;
  componentPresets?: ComponentPreset[];
  components?: Record<string, ComponentMapping>;
};

export type ComponentPreset = "radix" | "mui" | "react-aria" | "react-native" | "chakra" | "ant-design" | "headless-ui" | "mantine" | "react-bootstrap";

export type ComponentMapping = {
  role?: "button" | "link" | "textbox" | "checkbox" | "radio" | "switch" | "tab" | "menuitem" | "image";
  nameProps?: string[];
  labelProps?: string[];
  decorativeProps?: string[];
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
  semantic: SemanticMode;
  componentPresets: ComponentPreset[];
  components: Record<string, ComponentMapping>;
  configPath?: string;
  rootDir: string;
};

export type Finding = {
  ruleId: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  category: RuleCategory;
  file: string;
  line: number;
  column: number;
  excerpt: string;
  message: string;
  wcag: string[];
  standards: StandardReference[];
  platforms: Platform[];
  fingerprint: string;
  baselineStatus: "active" | "baseline";
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
  regressions: Finding[];
  summary: ScanSummary;
  scoreBreakdown: ScoreBreakdown;
  score: number;
  rules: RuleSummary[];
  standard: StandardDefinition;
  semanticAnalysis: SemanticAnalysisSummary;
  semanticDiagnostics: SemanticDiagnostic[];
  baseline?: BaselineFile;
};

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
};

export type RuleSummary = {
  id: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  category: RuleCategory;
  wcag: string[];
  standards: StandardReference[];
  platforms: Platform[];
  fixable: boolean;
  guidance: string;
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
