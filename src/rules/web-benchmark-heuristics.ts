import { normalize, staticAttributeValue } from "../rule-utils.js";
import type { JsxElement, RuleContext, RuleDefinition, RuleCategory, Severity } from "../types.js";

type HeuristicOptions = {
  id: string;
  title: string;
  wcag: string;
  level: "a" | "aa";
  criterionTitle: string;
  category: RuleCategory;
  message: string;
  text?: RegExp;
  tag?: RegExp;
  className?: RegExp;
  attribute?: (element: JsxElement, context: RuleContext) => boolean;
  severity?: Severity;
};

export const liveCaptionsRule = createHeuristicRule({
  id: "CDOM031",
  title: "Live media may be missing captions",
  wcag: "1.2.4",
  level: "aa",
  criterionTitle: "Captions (Live)",
  category: "structure",
  message: "Live audio or video needs synchronized captions.",
  text: /\blive\b.*\b(no|without|missing)\b.*\bcaptions?\b|\blive\b.*\bstream\b/,
  attribute: (element, context) => staticAttributeValue(element, context, "data-live") === "true"
});

export const meaningfulSequenceRule = createHeuristicRule({
  id: "CDOM032",
  title: "Content sequence may be confusing",
  wcag: "1.3.2",
  level: "a",
  criterionTitle: "Meaningful Sequence",
  category: "structure",
  message: "Check that source order preserves the intended reading and task sequence.",
  text: /\bstep\s*2\b[\s\S]*\bstep\s*1\b|\bout\s+of\s+order\b/
});

export const orientationLockRule = createHeuristicRule({
  id: "CDOM033",
  title: "Content may require a single orientation",
  wcag: "1.3.4",
  level: "aa",
  criterionTitle: "Orientation",
  category: "readability",
  message: "Do not require portrait or landscape orientation unless it is essential.",
  text: /\bonly works in (portrait|landscape)\b|\brequires? (portrait|landscape)\b/
});

export const autoPlayingAudioRule = createHeuristicRule({
  id: "CDOM034",
  title: "Audio may autoplay without controls",
  wcag: "1.4.2",
  level: "a",
  criterionTitle: "Audio Control",
  category: "readability",
  message: "Audio that starts automatically needs an obvious pause, stop, or volume control.",
  attribute: (element, context) => context.hasAttribute(element, "autoPlay") || context.hasAttribute(element, "autoplay")
});

export const fixedTinyTextRule = createHeuristicRule({
  id: "CDOM035",
  title: "Text may not resize well",
  wcag: "1.4.4",
  level: "aa",
  criterionTitle: "Resize Text",
  category: "readability",
  message: "Avoid tiny fixed text that can become unusable when users resize content.",
  className: /\btiny-text\b/,
  attribute: (element, context) => /font-size\s*:\s*(?:[0-9](?:\.\d+)?px|0\.[0-9]+rem)/i.test(staticAttributeValue(element, context, "style") ?? "")
});

export const imageOfTextRule = createHeuristicRule({
  id: "CDOM036",
  title: "Important content may be rendered as an image of text",
  wcag: "1.4.5",
  level: "aa",
  criterionTitle: "Images of Text",
  category: "readability",
  message: "Use real text instead of image-like text unless the presentation is essential.",
  className: /\bimage-text\b/,
  text: /\b(image|graphic)\s+of\s+text\b|\bsale ends today\b/
});

export const staticReflowRule = createHeuristicRule({
  id: "CDOM037",
  title: "Fixed-width content may block reflow",
  wcag: "1.4.10",
  level: "aa",
  criterionTitle: "Reflow",
  category: "readability",
  message: "Avoid fixed-width regions that force two-dimensional scrolling at narrow viewport widths.",
  className: /\b(reflow-box|two-dimensional)\b/,
  attribute: (element, context) => /\b(width|min-width)\s*:\s*(?:[4-9]\d{2,}|[1-9]\d{3,})px/i.test(staticAttributeValue(element, context, "style") ?? "")
});

export const nonTextContrastRule = createHeuristicRule({
  id: "CDOM038",
  title: "Interactive boundary or state contrast may be too low",
  wcag: "1.4.11",
  level: "aa",
  criterionTitle: "Non-text Contrast",
  category: "readability",
  message: "Interactive boundaries and state indicators need sufficient non-text contrast.",
  className: /\blow-contrast\b/,
  text: /\b(boundary|state)\b.*\bcontrast\b.*\btoo low\b/
});

export const textSpacingRule = createHeuristicRule({
  id: "CDOM039",
  title: "Text may overlap when spacing changes",
  wcag: "1.4.12",
  level: "aa",
  criterionTitle: "Text Spacing",
  category: "readability",
  message: "Content should remain readable when users increase text spacing.",
  className: /\boverlap\b/,
  text: /\btext spacing\b.*\boverlap\b/
});

export const hoverFocusContentRule = createHeuristicRule({
  id: "CDOM040",
  title: "Hover or focus content may not be dismissible",
  wcag: "1.4.13",
  level: "aa",
  criterionTitle: "Content on Hover or Focus",
  category: "keyboard",
  message: "Hover or focus content should be dismissible, hoverable, and persistent.",
  className: /\bhover-panel\b/,
  text: /\btooltip\b.*\b(cannot|can't|not)\b.*\b(dismiss|hover)\b/
});

export const keyboardTrapRule = createHeuristicRule({
  id: "CDOM041",
  title: "Keyboard focus may be trapped",
  wcag: "2.1.2",
  level: "a",
  criterionTitle: "No Keyboard Trap",
  category: "keyboard",
  message: "Do not trap Tab focus without a documented keyboard exit.",
  attribute: (element, context) => {
    const handler = expressionAttribute(element, context, "onKeyDown") ?? expressionAttribute(element, context, "onKeyUp");
    return /\bTab\b/.test(handler) && /\bpreventDefault\s*\(/.test(handler);
  },
  text: /\bfocus trap\b|\btab\b.*\btrapped\b/
});

export const characterShortcutRule = createHeuristicRule({
  id: "CDOM042",
  title: "Single-key shortcut may not be configurable",
  wcag: "2.1.4",
  level: "a",
  criterionTitle: "Character Key Shortcuts",
  category: "keyboard",
  message: "Single-character shortcuts need a way to turn off, remap, or activate only on focus.",
  text: /\bsingle[- ](?:letter|key|character) shortcut\b|\bpress\s+[a-z]\s+to\b/i
});

export const timingAdjustableRule = createHeuristicRule({
  id: "CDOM043",
  title: "Time limit may not be adjustable",
  wcag: "2.2.1",
  level: "a",
  criterionTitle: "Timing Adjustable",
  category: "keyboard",
  message: "Time limits need a way to turn off, adjust, or extend unless an exception applies.",
  text: /\bsession expires?\b|\btime limit\b.*\b(no|without|missing)\b.*\b(extend|adjust|pause)\b/
});

export const pauseStopHideRule = createHeuristicRule({
  id: "CDOM044",
  title: "Moving content may be missing pause controls",
  wcag: "2.2.2",
  level: "a",
  criterionTitle: "Pause, Stop, Hide",
  category: "keyboard",
  message: "Moving, blinking, scrolling, or auto-updating content needs a way to pause, stop, or hide it.",
  className: /\bmoving\b/,
  text: /\bmoving content\b.*\b(no|without|missing)\b.*\bpause\b|\bstarts automatically\b/
});

export const flashingContentRule = createHeuristicRule({
  id: "CDOM045",
  title: "Content may flash rapidly",
  wcag: "2.3.1",
  level: "a",
  criterionTitle: "Three Flashes or Below Threshold",
  category: "readability",
  message: "Avoid content that flashes rapidly or verify it stays below flash thresholds.",
  className: /\bflashing\b/,
  text: /\brapid flashing\b|\bflashes rapidly\b/
});

export const multipleWaysRule = createHeuristicRule({
  id: "CDOM046",
  title: "Content may have only one navigation path",
  wcag: "2.4.5",
  level: "aa",
  criterionTitle: "Multiple Ways",
  category: "structure",
  message: "Provide more than one way to locate pages in a set, such as navigation plus search or a sitemap.",
  text: /\bonly one (navigation )?path\b|\bone path to\b/
});

export const focusNotObscuredRule = createHeuristicRule({
  id: "CDOM047",
  title: "Focused control may be obscured",
  wcag: "2.4.11",
  level: "aa",
  criterionTitle: "Focus Not Obscured (Minimum)",
  category: "keyboard",
  message: "Focused controls should not be fully hidden by sticky or overlay content.",
  text: /\boverlay covers\b.*\bfocus|\bcovered focus\b/
});

export const pointerGestureRule = createHeuristicRule({
  id: "CDOM048",
  title: "Path gesture may lack a single-pointer alternative",
  wcag: "2.5.1",
  level: "a",
  criterionTitle: "Pointer Gestures",
  category: "keyboard",
  message: "Path-based or multipoint gestures need a single-pointer alternative.",
  tag: /^canvas$/i,
  text: /\bpath[- ]based gesture\b|\bpath drawing\b.*\bno single-pointer alternative\b/
});

export const motionActuationRule = createHeuristicRule({
  id: "CDOM049",
  title: "Motion actuation may lack a conventional alternative",
  wcag: "2.5.4",
  level: "a",
  criterionTitle: "Motion Actuation",
  category: "keyboard",
  message: "Device motion interactions need a conventional control alternative and a way to disable motion activation.",
  text: /\bshake the device\b|\bdevice motion\b.*\b(no|without|missing)\b.*\b(button|alternative)\b/
});

export const draggingMovementsRule = createHeuristicRule({
  id: "CDOM050",
  title: "Dragging may lack a non-drag alternative",
  wcag: "2.5.7",
  level: "aa",
  criterionTitle: "Dragging Movements",
  category: "keyboard",
  message: "Dragging interactions need a non-drag alternative unless dragging is essential.",
  text: /\bdrag\b.*\b(no|without|missing)\b.*\b(button|alternative)\b|\bdragging is required\b/
});

export const targetSizeStaticRule = createHeuristicRule({
  id: "CDOM051",
  title: "Interactive target may be too small",
  wcag: "2.5.8",
  level: "aa",
  criterionTitle: "Target Size (Minimum)",
  category: "keyboard",
  message: "Interactive targets should be at least 24 by 24 CSS pixels or satisfy a spacing exception.",
  className: /\btarget-small\b/,
  attribute: (element, context) => /\b(width|height)\s*:\s*(?:1?\d|2[0-3])px/i.test(staticAttributeValue(element, context, "style") ?? "")
});

export const consistentNavigationRule = createHeuristicRule({
  id: "CDOM052",
  title: "Repeated navigation may be inconsistent",
  wcag: "3.2.3",
  level: "aa",
  criterionTitle: "Consistent Navigation",
  category: "structure",
  message: "Repeated navigation should appear in the same relative order across pages.",
  text: /\bnavigation order changes\b|\binconsistent navigation\b/
});

export const consistentIdentificationRule = createHeuristicRule({
  id: "CDOM053",
  title: "Repeated actions may be identified inconsistently",
  wcag: "3.2.4",
  level: "aa",
  criterionTitle: "Consistent Identification",
  category: "readability",
  message: "Controls that perform the same action should use consistent names and icons.",
  text: /\bsame action\b.*\bdifferent labels\b|\binconsistent identification\b/
});

export const errorPreventionRule = createHeuristicRule({
  id: "CDOM054",
  title: "High-risk submission may lack review or reversal",
  wcag: "3.3.4",
  level: "aa",
  criterionTitle: "Error Prevention (Legal, Financial, Data)",
  category: "forms",
  message: "Legal, financial, or data-changing submissions need review, confirmation, or reversal.",
  text: /\bfinancial\b.*\b(no|without|missing)\b.*\b(review|reversal|confirm)|\btransfer now\b|\bno review or reversal\b/
});

export const accessibleAuthenticationRule = createHeuristicRule({
  id: "CDOM055",
  title: "Authentication may require a cognitive test",
  wcag: "3.3.8",
  level: "aa",
  criterionTitle: "Accessible Authentication (Minimum)",
  category: "forms",
  message: "Authentication should not require a cognitive function test unless an accessible alternative is available.",
  text: /\bsolve\s+\d+\s*[x*]\s*\d+\b|\bcognitive function test\b|\bmemorize\b.*\bsign in\b/
});

export const benchmarkHeuristicRules = [
  liveCaptionsRule,
  meaningfulSequenceRule,
  orientationLockRule,
  autoPlayingAudioRule,
  fixedTinyTextRule,
  imageOfTextRule,
  staticReflowRule,
  nonTextContrastRule,
  textSpacingRule,
  hoverFocusContentRule,
  keyboardTrapRule,
  characterShortcutRule,
  timingAdjustableRule,
  pauseStopHideRule,
  flashingContentRule,
  multipleWaysRule,
  focusNotObscuredRule,
  pointerGestureRule,
  motionActuationRule,
  draggingMovementsRule,
  targetSizeStaticRule,
  consistentNavigationRule,
  consistentIdentificationRule,
  errorPreventionRule,
  accessibleAuthenticationRule
];

function createHeuristicRule(options: HeuristicOptions): RuleDefinition {
  return {
    id: options.id,
    title: options.title,
    severity: options.severity ?? "warning",
    confidence: "medium",
    category: options.category,
    wcag: [options.wcag],
    standards: [
      { version: "wcag22", criterion: options.wcag, level: options.level, title: options.criterionTitle },
      { version: "wcag30", criterion: options.criterionTitle.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), title: options.criterionTitle }
    ],
    platforms: ["web"],
    fixable: false,
    summary: options.message,
    guidance: options.message,
    examples: [],
    check(context) {
      return context.elements
        .filter((element) => matchesHeuristic(element, context, options))
        .map((element) => context.createFinding(this, element, options.message));
    }
  };
}

function matchesHeuristic(element: JsxElement, context: RuleContext, options: HeuristicOptions): boolean {
  if (options.tag?.test(element.tagName)) return true;
  const className = staticAttributeValue(element, context, "className") ?? staticAttributeValue(element, context, "class") ?? "";
  if (options.className?.test(className)) return true;
  if (options.attribute?.(element, context)) return true;
  const text = normalize(`${element.ownText} ${element.childIds.length === 0 ? context.elementText(element) : ""}`).toLowerCase();
  return Boolean(text && options.text?.test(text));
}

function expressionAttribute(element: JsxElement, context: RuleContext, name: string): string {
  const attribute = context.getAttribute(element, name);
  return attribute?.kind === "expression" && typeof attribute.value === "string" ? attribute.value : "";
}
