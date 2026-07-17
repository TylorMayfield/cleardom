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
import { audioControlRule, characterKeyShortcutRule, draggingMovementsRule, flashingContentRule, motionActuationRule, orientationRestrictionRule, pauseStopHideRule, pointerGesturesRule, timingAdjustableRule } from "./web-interaction-risks.js";
import { abbreviationsRule, allErrorPreventionRule, animationFromInteractionsRule, backgroundAudioRule, changeOnRequestRule, concurrentInputRule, enhancedAuthenticationRule, enhancedContrastRule, extendedAudioDescriptionRule, focusAppearanceRule, focusObscuredEnhancedRule, helpAvailabilityRule, identifyPurposeRule, imagesOfTextNoExceptionRule, interruptionControlRule, keyboardNoExceptionRule, liveAudioTranscriptRule, locationIndicatorRule, mediaAlternativeFullRule, noTimingRule, pronunciationRule, readingLevelRule, reauthenticatingDataRule, sectionHeadingsRule, signLanguageRule, targetSizeEnhancedRule, threeFlashesRule, timeoutWarningRule, unusualWordsRule, visualPresentationRule } from "./web-aaa-review-risks.js";
import { accessibleAuthenticationRule, consistentHelpRule, consistentIdentificationRule, consistentNavigationRule, errorPreventionRule, imagesOfTextRule, liveCaptionsRule, meaningfulSequenceRule, multipleWaysRule, nonTextContrastRule, redundantEntryRule, resizeTextRule } from "./web-content-workflow-risks.js";
import { keyboardRule } from "./web-keyboard.js";
import { languageOfPartsRule } from "./web-language-of-parts.js";
import { labelInNameRule } from "./web-label-in-name.js";
import { mediaAlternativeRule } from "./web-media-alternative.js";
import { nativeLabelRule } from "./native-label.js";
import { nativeRoleRule } from "./native-role.js";
import { placeholderLabelRule } from "./web-placeholder-label.js";
import { pointerCancellationRule } from "./web-pointer-cancellation.js";
import { positiveTabIndexRule } from "./web-positive-tabindex.js";
import { ariaReferenceRuntimeRule, ariaStateRuntimeRule, contrastRuntimeRule, focusObscuredRuntimeRule, focusVisibleRuntimeRule, hoverFocusContentRuntimeRule, invalidAriaRoleRuntimeRule, keyboardTrapRuntimeRule, reflowRuntimeRule, skipLinkRuntimeRule, targetSizeRuntimeRule, textSpacingRuntimeRule } from "./runtime-rules.js";
import { sensoryInstructionsRule } from "./web-sensory-instructions.js";
import { statusLiveRegionRule } from "./web-status-live-region.js";
import { unnamedControlRule } from "./web-unnamed-control.js";
import { useOfColorRule } from "./web-use-of-color.js";

const ruleCatalog: RuleDefinition[] = [
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
  audioControlRule,
  orientationRestrictionRule,
  liveCaptionsRule,
  signLanguageRule,
  extendedAudioDescriptionRule,
  mediaAlternativeFullRule,
  liveAudioTranscriptRule,
  meaningfulSequenceRule,
  identifyPurposeRule,
  resizeTextRule,
  imagesOfTextRule,
  enhancedContrastRule,
  nonTextContrastRule,
  backgroundAudioRule,
  visualPresentationRule,
  imagesOfTextNoExceptionRule,
  characterKeyShortcutRule,
  keyboardNoExceptionRule,
  timingAdjustableRule,
  pauseStopHideRule,
  noTimingRule,
  interruptionControlRule,
  reauthenticatingDataRule,
  timeoutWarningRule,
  flashingContentRule,
  threeFlashesRule,
  animationFromInteractionsRule,
  multipleWaysRule,
  locationIndicatorRule,
  sectionHeadingsRule,
  pointerGesturesRule,
  motionActuationRule,
  draggingMovementsRule,
  focusObscuredEnhancedRule,
  focusAppearanceRule,
  targetSizeEnhancedRule,
  concurrentInputRule,
  consistentNavigationRule,
  consistentIdentificationRule,
  consistentHelpRule,
  unusualWordsRule,
  abbreviationsRule,
  readingLevelRule,
  pronunciationRule,
  changeOnRequestRule,
  errorPreventionRule,
  helpAvailabilityRule,
  allErrorPreventionRule,
  redundantEntryRule,
  accessibleAuthenticationRule,
  enhancedAuthenticationRule,
  contrastRuntimeRule,
  focusVisibleRuntimeRule,
  targetSizeRuntimeRule,
  reflowRuntimeRule,
  skipLinkRuntimeRule,
  textSpacingRuntimeRule,
  hoverFocusContentRuntimeRule,
  keyboardTrapRuntimeRule,
  focusObscuredRuntimeRule,
  invalidAriaRoleRuntimeRule,
  ariaReferenceRuntimeRule,
  ariaStateRuntimeRule
];

const runtimeRuleIds = new Set([
  contrastRuntimeRule, focusVisibleRuntimeRule, targetSizeRuntimeRule, reflowRuntimeRule, skipLinkRuntimeRule, textSpacingRuntimeRule,
  hoverFocusContentRuntimeRule, keyboardTrapRuntimeRule, focusObscuredRuntimeRule, invalidAriaRoleRuntimeRule, ariaReferenceRuntimeRule, ariaStateRuntimeRule
].map((rule) => rule.id));

export const rules: RuleDefinition[] = ruleCatalog.map((rule) => Object.freeze({
  ...rule,
  detectionMode: rule.detectionMode ?? (rule.confidence === "high" ? "automated" : rule.confidence === "medium" ? "needs-review" : "manual-guidance"),
  impact: rule.impact ?? (rule.severity === "critical" ? "serious" : rule.severity === "warning" ? "moderate" : "minor"),
  confidenceReason: rule.confidenceReason ?? (rule.confidence === "high"
    ? "The rule requires direct static or rendered evidence before reporting."
    : rule.confidence === "medium"
      ? "The evidence identifies a likely risk whose user impact depends on product context."
      : "The criterion requires human judgment or assistive-technology testing."),
  source: rule.source ?? (runtimeRuleIds.has(rule.id) ? "runtime" : "semantic"),
  fixKind: rule.fixKind ?? (rule.fixable && rule.confidence === "high" ? "safe-auto-fix" : rule.confidence === "low" ? "manual-review" : "guided-fix")
}));

export const legacyRuleAliases: Record<string, string> = {
  CDOM001: "CDOM_4_1_2_UNNAMED_CONTROL",
  CDOM002: "CDOM_4_1_2_NATIVE_LABEL",
  CDOM003: "CDOM_2_4_4_AMBIGUOUS_LABEL",
  CDOM004: "CDOM_3_3_2_PLACEHOLDER_LABEL",
  CDOM005: "CDOM_1_1_1_IMAGE_ALT",
  CDOM006: "CDOM_4_1_2_ANCHOR_HREF",
  CDOM007: "CDOM_2_1_1_KEYBOARD",
  CDOM008: "CDOM_1_3_1_HEADING_ORDER",
  CDOM009: "CDOM_4_1_2_NATIVE_ROLE",
  CDOM010: "CDOM_4_1_2_FORM_LABEL",
  CDOM011: "CDOM_3_1_1_DOCUMENT_METADATA",
  CDOM012: "CDOM_1_3_5_AUTOCOMPLETE",
  CDOM013: "CDOM_2_5_3_LABEL_IN_NAME",
  CDOM014: "CDOM_4_1_3_STATUS_LIVE_REGION",
  CDOM015: "CDOM_1_2_1_MEDIA_ALTERNATIVE",
  CDOM016: "CDOM_4_1_2_ARIA_HIDDEN_FOCUS",
  CDOM017: "CDOM_4_1_2_DUPLICATE_ID",
  CDOM018: "CDOM_2_4_3_POSITIVE_TABINDEX",
  CDOM019: "CDOM_1_3_1_FIELDSET_LEGEND",
  CDOM020: "CDOM_3_3_1_ERROR_DESCRIPTION",
  CDOM021: "CDOM_2_5_2_POINTER_CANCELLATION",
  CDOM022: "CDOM_1_4_3_CONTRAST",
  CDOM023: "CDOM_2_4_7_FOCUS_VISIBLE",
  CDOM024: "CDOM_2_5_8_TARGET_SIZE",
  CDOM025: "CDOM_1_4_10_REFLOW",
  CDOM026: "CDOM_2_4_1_SKIP_LINK",
  CDOM027: "CDOM_1_4_1_USE_OF_COLOR",
  CDOM028: "CDOM_1_3_3_SENSORY_INSTRUCTIONS",
  CDOM029: "CDOM_3_1_2_LANGUAGE_OF_PARTS",
  CDOM030: "CDOM_3_2_1_CONTEXT_CHANGE",
  CDOM031: "CDOM_1_4_12_TEXT_SPACING",
  CDOM032: "CDOM_1_4_13_HOVER_FOCUS_CONTENT",
  CDOM033: "CDOM_2_1_2_KEYBOARD_TRAP",
  CDOM034: "CDOM_2_4_11_FOCUS_OBSCURED"
};

export function normalizeRuleId(ruleId: string): string {
  const alias = legacyRuleAliases[ruleId.toUpperCase()];
  return alias ?? ruleId;
}

export function findRule(ruleId: string): RuleDefinition | undefined {
  const normalized = normalizeRuleId(ruleId);
  return rules.find((rule) => rule.id.toLowerCase() === normalized.toLowerCase());
}

export function summarizeRule(rule: RuleDefinition, severity: Severity = rule.severity): RuleSummary {
  return {
    id: rule.id,
    title: rule.title,
    severity,
    confidence: rule.confidence,
    detectionMode: rule.detectionMode ?? (rule.confidence === "high" ? "automated" : rule.confidence === "medium" ? "needs-review" : "manual-guidance"),
    category: rule.category,
    wcag: rule.wcag,
    standards: rule.standards,
    platforms: rule.platforms,
    fixable: rule.fixable,
    guidance: rule.guidance,
    remediation: rule.remediation ?? defaultRemediation(rule),
    docsUrl: ruleDocsUrl(rule.id)
  };
}

export function ruleDocsUrl(ruleId: string): string {
  return `https://github.com/cleardom/cleardom#${ruleId.toLowerCase()}`;
}

function defaultRemediation(rule: RuleDefinition): RuleSummary["remediation"] {
  const before = rule.examples[0]?.code;
  const after = rule.examples[1]?.code ?? rule.examples[0]?.code;
  return {
    before,
    after,
    safeAutofix: rule.fixable ? "Some instances may be safely autofixable when ClearDOM can preserve the accessibility intent mechanically." : undefined,
    manualVerification: rule.detectionMode === "manual-guidance" || rule.confidence === "low"
      ? "Confirm the user-facing behavior manually because this rule depends on product context."
      : "Re-run ClearDOM and verify the component still behaves correctly for keyboard and assistive-technology users."
  };
}
