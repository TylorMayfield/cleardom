import type { RuleDefinition, RuleSummary, Severity } from "../types.js";
import { anchorHrefRule } from "./web-anchor-href.js";
import { ariaHiddenFocusRule } from "./web-aria-hidden-focus.js";
import { ambiguousLabelRule } from "./ambiguous-label.js";
import { autocompleteRule } from "./web-autocomplete.js";
import { contextChangeRule } from "./web-context-change.js";
import { documentMetadataRule } from "./web-document-metadata.js";
import { duplicateIdRule } from "./web-duplicate-id.js";
import { errorDescriptionRule } from "./web-error-description.js";
import { fieldsetLegendRule } from "./web-fieldset-legend.js";
import { formLabelRule } from "./web-form-label.js";
import { headingOrderRule } from "./heading-order.js";
import { imageAltRule } from "./web-image-alt.js";
import { keyboardRule } from "./web-keyboard.js";
import { languageOfPartsRule } from "./web-language-of-parts.js";
import { labelInNameRule } from "./web-label-in-name.js";
import { mediaAlternativeRule } from "./web-media-alternative.js";
import { nativeLabelRule } from "./native-label.js";
import { nativeRoleRule } from "./native-role.js";
import { placeholderLabelRule } from "./web-placeholder-label.js";
import { pointerCancellationRule } from "./web-pointer-cancellation.js";
import { positiveTabIndexRule } from "./web-positive-tabindex.js";
import { contrastRuntimeRule, focusVisibleRuntimeRule, reflowRuntimeRule, skipLinkRuntimeRule, targetSizeRuntimeRule } from "./runtime-rules.js";
import { sensoryInstructionsRule } from "./web-sensory-instructions.js";
import { statusLiveRegionRule } from "./web-status-live-region.js";
import { unnamedControlRule } from "./web-unnamed-control.js";
import { useOfColorRule } from "./web-use-of-color.js";

export const rules: RuleDefinition[] = [
  unnamedControlRule,
  nativeLabelRule,
  ambiguousLabelRule,
  placeholderLabelRule,
  imageAltRule,
  anchorHrefRule,
  keyboardRule,
  headingOrderRule,
  nativeRoleRule,
  formLabelRule,
  documentMetadataRule,
  autocompleteRule,
  labelInNameRule,
  statusLiveRegionRule,
  mediaAlternativeRule,
  ariaHiddenFocusRule,
  duplicateIdRule,
  positiveTabIndexRule,
  fieldsetLegendRule,
  errorDescriptionRule,
  pointerCancellationRule,
  useOfColorRule,
  sensoryInstructionsRule,
  languageOfPartsRule,
  contextChangeRule,
  contrastRuntimeRule,
  focusVisibleRuntimeRule,
  targetSizeRuntimeRule,
  reflowRuntimeRule,
  skipLinkRuntimeRule
];

export function findRule(ruleId: string): RuleDefinition | undefined {
  return rules.find((rule) => rule.id.toLowerCase() === ruleId.toLowerCase());
}

export function summarizeRule(rule: RuleDefinition, severity: Severity = rule.severity): RuleSummary {
  return {
    id: rule.id,
    title: rule.title,
    severity,
    confidence: rule.confidence,
    category: rule.category,
    wcag: rule.wcag,
    standards: rule.standards,
    platforms: rule.platforms,
    fixable: rule.fixable,
    guidance: rule.guidance,
    docsUrl: ruleDocsUrl(rule.id)
  };
}

export function ruleDocsUrl(ruleId: string): string {
  return `https://github.com/cleardom/cleardom#${ruleId.toLowerCase()}`;
}
