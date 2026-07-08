import type { ComponentPreset, OutputFormat, PrBaselinePolicy, PrCommentMode, RuleOption, SemanticMode, Severity } from "./types.js";
import type { ReportFormat } from "./report.js";

export function parseFormat(value: string): OutputFormat {
  if (value === "text" || value === "json" || value === "sarif" || value === "html") return value;
  throw new Error("--format must be one of: text, json, sarif, html");
}

export function parseReportFormat(value: string): ReportFormat {
  if (value === "html" || value === "markdown" || value === "json") return value;
  throw new Error("--format must be one of: html, markdown, json");
}

export function parseSemanticMode(value: string): SemanticMode {
  if (value === "auto" || value === "off" || value === "required") return value;
  throw new Error("--semantic must be one of: auto, off, required");
}

export function parseSeverity(value: string): Severity {
  if (value === "critical" || value === "warning" || value === "info") return value;
  throw new Error("--severity-threshold must be one of: critical, warning, info");
}

export function parseCommentMode(value: string): PrCommentMode {
  if (value === "off" || value === "summary" || value === "inline" || value === "both") return value;
  throw new Error("--comment-mode must be one of: off, summary, inline, both");
}

export function parseBaselinePolicy(value: string): PrBaselinePolicy {
  if (value === "new" || value === "all") return value;
  throw new Error("--baseline-policy must be one of: new, all");
}

export function parseComponentPreset(value: string): ComponentPreset {
  if (value === "radix" || value === "mui" || value === "react-aria" || value === "react-native" || value === "chakra" || value === "ant-design" || value === "headless-ui" || value === "mantine" || value === "react-bootstrap") return value;
  throw new Error("--component-preset must be one of: radix, mui, react-aria, react-native, chakra, ant-design, headless-ui, mantine, react-bootstrap");
}

export function parseRuleOption(value: string): { id: string; option: RuleOption } {
  const [id, option] = value.split("=");
  if (!id || !option) {
    throw new Error("--rule must look like CDOM_4_1_2_UNNAMED_CONTROL=off or CDOM_4_1_2_UNNAMED_CONTROL=warning");
  }
  if (option === "off" || option === "critical" || option === "warning" || option === "info") {
    return { id, option };
  }
  throw new Error("--rule supports off, critical, warning, or info");
}

export function requireValue(values: string[], index: number, flag: string): string {
  const value = values[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}
