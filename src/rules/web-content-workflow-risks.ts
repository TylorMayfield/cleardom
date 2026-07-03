import { isWebInteractive, normalize, staticAttributeValue } from "../rule-utils.js";
import type { JsxElement, RuleContext, RuleDefinition } from "../types.js";

export const liveCaptionsRule: RuleDefinition = {
  id: "CDOM_1_2_4_LIVE_CAPTIONS",
  title: "Live video may lack captions",
  severity: "warning",
  confidence: "low",
  category: "readability",
  wcag: ["1.2.4"],
  standards: [
    { version: "wcag20", criterion: "1.2.4", level: "aa", title: "Captions (Live)" },
    { version: "wcag21", criterion: "1.2.4", level: "aa", title: "Captions (Live)" },
    { version: "wcag22", criterion: "1.2.4", level: "aa", title: "Captions (Live)" },
    { version: "wcag30", criterion: "captions", title: "Synchronized media alternatives are available" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Live synchronized video needs captions for audio content.",
  guidance: "Provide live captions for livestreams, webinars, town halls, broadcasts, or meetings.",
  examples: [
    { label: "Captioned live video", code: '<video data-live="true" controls><track kind="captions" src="/live.vtt" /></video>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => element.tagName.toLowerCase() === "video" && isLiveMedia(element, context))
      .filter((element) => !hasCaptionTrack(element, context) && !captionCopyPattern.test(elementSignal(element, context)))
      .map((element) => context.createFinding(this, element, "Live video needs captions for audio content."));
  }
};

export const meaningfulSequenceRule: RuleDefinition = {
  id: "CDOM_1_3_2_MEANINGFUL_SEQUENCE",
  title: "Meaningful sequence may be incorrect",
  severity: "warning",
  confidence: "low",
  category: "structure",
  wcag: ["1.3.2"],
  standards: [
    { version: "wcag20", criterion: "1.3.2", level: "a", title: "Meaningful Sequence" },
    { version: "wcag21", criterion: "1.3.2", level: "a", title: "Meaningful Sequence" },
    { version: "wcag22", criterion: "1.3.2", level: "a", title: "Meaningful Sequence" },
    { version: "wcag30", criterion: "structured-content", title: "Content order preserves meaning" }
  ],
  platforms: ["web", "react-native-ios", "react-native-android"],
  fixable: false,
  summary: "Instructions, steps, and visual order should preserve the intended reading sequence.",
  guidance: "Keep DOM, reading, and visual order aligned when sequence changes meaning.",
  examples: [
    { label: "Ordered steps", code: "<ol><li>Create account</li><li>Pay</li></ol>" }
  ],
  check(context) {
    return context.elements
      .filter((element) => reversedStepPattern.test(ownTextOf(element)))
      .map((element) => context.createFinding(this, element, "Check that the DOM and reading order preserve the intended sequence."));
  }
};

export const resizeTextRule: RuleDefinition = {
  id: "CDOM_1_4_4_RESIZE_TEXT",
  title: "Text may not resize cleanly",
  severity: "warning",
  confidence: "low",
  category: "readability",
  wcag: ["1.4.4"],
  standards: [
    { version: "wcag20", criterion: "1.4.4", level: "aa", title: "Resize Text" },
    { version: "wcag21", criterion: "1.4.4", level: "aa", title: "Resize Text" },
    { version: "wcag22", criterion: "1.4.4", level: "aa", title: "Resize Text" },
    { version: "wcag30", criterion: "text-resize", title: "Text adapts to user settings" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Very small or fixed text can become unusable when users zoom or resize text.",
  guidance: "Use scalable text units and verify text can resize to 200 percent without clipping or loss of content.",
  examples: [
    { label: "Scalable text", code: '<p className="body-copy">Receipt details</p>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => tinyTextPattern.test(elementSignal(element, context)) || hasFixedTinyFontSize(element, context))
      .map((element) => context.createFinding(this, element, "Verify this text can resize to 200 percent without clipping or loss of content."));
  }
};

export const imagesOfTextRule: RuleDefinition = {
  id: "CDOM_1_4_5_IMAGES_OF_TEXT",
  title: "Image-like text may not be real text",
  severity: "warning",
  confidence: "low",
  category: "readability",
  wcag: ["1.4.5"],
  standards: [
    { version: "wcag20", criterion: "1.4.5", level: "aa", title: "Images of Text" },
    { version: "wcag21", criterion: "1.4.5", level: "aa", title: "Images of Text" },
    { version: "wcag22", criterion: "1.4.5", level: "aa", title: "Images of Text" },
    { version: "wcag30", criterion: "text-alternatives", title: "Text can be programmatically adapted" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Text presented as an image cannot adapt to user text, color, or spacing preferences.",
  guidance: "Use real text styled with CSS unless a specific presentation of text is essential.",
  examples: [
    { label: "Real text", code: '<strong className="promo">Sale ends today</strong>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => imageTextPattern.test(elementSignal(element, context)))
      .map((element) => context.createFinding(this, element, "Use real text instead of image-like text unless the visual presentation is essential."));
  }
};

export const nonTextContrastRule: RuleDefinition = {
  id: "CDOM_1_4_11_NON_TEXT_CONTRAST",
  title: "Non-text UI contrast may be too low",
  severity: "warning",
  confidence: "low",
  category: "readability",
  wcag: ["1.4.11"],
  standards: [
    { version: "wcag21", criterion: "1.4.11", level: "aa", title: "Non-text Contrast" },
    { version: "wcag22", criterion: "1.4.11", level: "aa", title: "Non-text Contrast" },
    { version: "wcag30", criterion: "visual-contrast", title: "Visual indicators have sufficient contrast" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Boundaries, icons, focus indicators, and control states need sufficient contrast.",
  guidance: "Verify graphical objects and control boundaries have at least 3:1 contrast against adjacent colors.",
  examples: [
    { label: "Visible boundary", code: '<button className="strong-border">Continue</button>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => isWebInteractive(element, context) || nonTextWidgetPattern.test(elementSignal(element, context)))
      .filter((element) => lowContrastPattern.test(elementSignal(element, context)))
      .map((element) => context.createFinding(this, element, "Verify this control boundary, icon, or state indicator has at least 3:1 contrast."));
  }
};

export const multipleWaysRule: RuleDefinition = {
  id: "CDOM_2_4_5_MULTIPLE_WAYS",
  title: "Content may only be reachable one way",
  severity: "warning",
  confidence: "low",
  category: "structure",
  wcag: ["2.4.5"],
  standards: [
    { version: "wcag20", criterion: "2.4.5", level: "aa", title: "Multiple Ways" },
    { version: "wcag21", criterion: "2.4.5", level: "aa", title: "Multiple Ways" },
    { version: "wcag22", criterion: "2.4.5", level: "aa", title: "Multiple Ways" },
    { version: "wcag30", criterion: "navigation", title: "Content can be found predictably" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Pages in a set should be findable through more than one mechanism.",
  guidance: "Provide alternatives such as navigation, search, sitemap links, related links, or index pages.",
  examples: [
    { label: "Multiple ways", code: '<nav><a href="/support">Support</a></nav><form role="search">...</form>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => singlePathPattern.test(ownTextOf(element)))
      .map((element) => context.createFinding(this, element, "Provide more than one way to locate this content when it belongs to a page set."));
  }
};

export const consistentNavigationRule: RuleDefinition = {
  id: "CDOM_3_2_3_CONSISTENT_NAVIGATION",
  title: "Navigation order may be inconsistent",
  severity: "warning",
  confidence: "low",
  category: "structure",
  wcag: ["3.2.3"],
  standards: [
    { version: "wcag20", criterion: "3.2.3", level: "aa", title: "Consistent Navigation" },
    { version: "wcag21", criterion: "3.2.3", level: "aa", title: "Consistent Navigation" },
    { version: "wcag22", criterion: "3.2.3", level: "aa", title: "Consistent Navigation" },
    { version: "wcag30", criterion: "consistent-navigation", title: "Repeated navigation is consistent" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Repeated navigation should appear in the same relative order across pages.",
  guidance: "Keep repeated navigation components in a consistent order unless the user initiates the change.",
  examples: [
    { label: "Stable navigation", code: '<nav><a href="/orders">Orders</a><a href="/support">Support</a></nav>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => inconsistentNavigationPattern.test(ownTextOf(element)))
      .map((element) => context.createFinding(this, element, "Keep repeated navigation in a consistent relative order across pages."));
  }
};

export const consistentIdentificationRule: RuleDefinition = {
  id: "CDOM_3_2_4_CONSISTENT_IDENTIFICATION",
  title: "Repeated components may not be identified consistently",
  severity: "warning",
  confidence: "low",
  category: "names-and-roles",
  wcag: ["3.2.4"],
  standards: [
    { version: "wcag20", criterion: "3.2.4", level: "aa", title: "Consistent Identification" },
    { version: "wcag21", criterion: "3.2.4", level: "aa", title: "Consistent Identification" },
    { version: "wcag22", criterion: "3.2.4", level: "aa", title: "Consistent Identification" },
    { version: "wcag30", criterion: "consistent-identification", title: "Repeated components are identified consistently" }
  ],
  platforms: ["web", "react-native-ios", "react-native-android"],
  fixable: false,
  summary: "Components with the same functionality should have consistent names and labels.",
  guidance: "Use consistent accessible names for repeated actions, icons, and controls that perform the same function.",
  examples: [
    { label: "Consistent buttons", code: "<button>Save</button><button>Save</button>" }
  ],
  check(context) {
    return context.elements
      .filter((element) => inconsistentIdentificationPattern.test(ownTextOf(element)))
      .map((element) => context.createFinding(this, element, "Use consistent names for repeated components that perform the same function."));
  }
};

export const consistentHelpRule: RuleDefinition = {
  id: "CDOM_3_2_6_CONSISTENT_HELP",
  title: "Help location may be inconsistent",
  severity: "warning",
  confidence: "low",
  category: "structure",
  wcag: ["3.2.6"],
  standards: [
    { version: "wcag22", criterion: "3.2.6", level: "a", title: "Consistent Help" },
    { version: "wcag30", criterion: "help", title: "Help is easy to locate" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Help mechanisms should appear in the same relative order across pages.",
  guidance: "Keep contact, self-help, and automated help mechanisms in a consistent order when repeated.",
  examples: [
    { label: "Stable help", code: '<footer><a href="/support">Help</a></footer>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => inconsistentHelpPattern.test(ownTextOf(element)))
      .map((element) => context.createFinding(this, element, "Keep repeated help mechanisms in a consistent relative order across pages."));
  }
};

export const errorPreventionRule: RuleDefinition = {
  id: "CDOM_3_3_4_ERROR_PREVENTION_LEGAL_FINANCIAL_DATA",
  title: "High-impact submission may lack review or reversal",
  severity: "warning",
  confidence: "low",
  category: "forms",
  wcag: ["3.3.4"],
  standards: [
    { version: "wcag20", criterion: "3.3.4", level: "aa", title: "Error Prevention (Legal, Financial, Data)" },
    { version: "wcag21", criterion: "3.3.4", level: "aa", title: "Error Prevention (Legal, Financial, Data)" },
    { version: "wcag22", criterion: "3.3.4", level: "aa", title: "Error Prevention (Legal, Financial, Data)" },
    { version: "wcag30", criterion: "error-prevention", title: "High-impact errors can be prevented or reversed" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Legal, financial, and data-changing submissions usually need confirmation, checking, or reversibility.",
  guidance: "Add review, confirmation, correction, or reversal steps for high-impact submissions.",
  examples: [
    { label: "Review step", code: '<button type="submit">Review transfer</button>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => highImpactActionPattern.test(elementSignal(element, context)))
      .filter((element) => missingPreventionPattern.test(ownTextOf(element)))
      .map((element) => context.createFinding(this, element, "Add a review, confirmation, correction, or reversal step for this high-impact action."));
  }
};

export const redundantEntryRule: RuleDefinition = {
  id: "CDOM_3_3_7_REDUNDANT_ENTRY",
  title: "Previously entered information may be requested again",
  severity: "warning",
  confidence: "low",
  category: "forms",
  wcag: ["3.3.7"],
  standards: [
    { version: "wcag22", criterion: "3.3.7", level: "a", title: "Redundant Entry" },
    { version: "wcag30", criterion: "redundant-entry", title: "Previously supplied information is reused" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Users should not need to re-enter the same information unless it is essential or automatically populated.",
  guidance: "Reuse, auto-populate, or make repeated entry optional when the information was already provided.",
  examples: [
    { label: "Reused information", code: '<input name="shippingAddress" autoComplete="shipping street-address" />' }
  ],
  check(context) {
    return context.elements
      .filter((element) => redundantEntryPattern.test(elementSignal(element, context)))
      .filter((element) => !redundantEntryMitigationPattern.test(elementSignal(element, context)))
      .map((element) => context.createFinding(this, element, "Avoid requiring users to re-enter information they already provided unless it is essential."));
  }
};

export const accessibleAuthenticationRule: RuleDefinition = {
  id: "CDOM_3_3_8_ACCESSIBLE_AUTHENTICATION",
  title: "Authentication may require a cognitive function test",
  severity: "warning",
  confidence: "low",
  category: "forms",
  wcag: ["3.3.8"],
  standards: [
    { version: "wcag22", criterion: "3.3.8", level: "aa", title: "Accessible Authentication (Minimum)" },
    { version: "wcag30", criterion: "authentication", title: "Authentication avoids cognitive tests" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Authentication should not require solving, memorizing, transcribing, or manipulating information without an accessible alternative.",
  guidance: "Support password managers, paste, WebAuthn, email magic links, or another non-cognitive-test alternative.",
  examples: [
    { label: "Passkey alternative", code: '<button type="button">Sign in with passkey</button>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => authenticationChallengePattern.test(elementSignal(element, context)))
      .filter((element) => !authenticationMitigationPattern.test(elementSignal(element, context)))
      .map((element) => context.createFinding(this, element, "Provide an authentication path that does not require a cognitive function test."));
  }
};

function ownTextOf(element: JsxElement): string {
  return normalize(element.ownText).toLowerCase();
}

function elementSignal(element: JsxElement, context: RuleContext): string {
  return [
    element.tagName,
    ownTextOf(element),
    staticAttributeValue(element, context, "className"),
    staticAttributeValue(element, context, "class"),
    staticAttributeValue(element, context, "id"),
    staticAttributeValue(element, context, "style"),
    staticAttributeValue(element, context, "aria-label"),
    staticAttributeValue(element, context, "name"),
    staticAttributeValue(element, context, "type")
  ].filter(Boolean).join(" ").toLowerCase();
}

function isLiveMedia(element: JsxElement, context: RuleContext): boolean {
  const signal = elementSignal(element, context);
  return context.hasAttribute(element, "data-live") || liveMediaPattern.test(signal);
}

function hasCaptionTrack(element: JsxElement, context: RuleContext): boolean {
  return element.childIds
    .map((id) => context.elements[id])
    .filter((child): child is JsxElement => Boolean(child))
    .some((child) => {
      if (child.tagName.toLowerCase() !== "track") return false;
      const kind = staticAttributeValue(child, context, "kind")?.toLowerCase();
      return kind === "captions" || kind === "subtitles";
    });
}

function hasFixedTinyFontSize(element: JsxElement, context: RuleContext): boolean {
  const style = staticAttributeValue(element, context, "style")?.toLowerCase();
  if (!style) return false;
  const match = style.match(/font-size\s*:\s*(\d+(?:\.\d+)?)(px|pt)/);
  if (!match) return false;
  const size = Number(match[1]);
  return match[2] === "px" ? size <= 10 : size <= 8;
}

const liveMediaPattern = /\b(live|livestream|streaming|broadcast|webinar|townhall|town hall|meeting)\b/;
const captionCopyPattern = /\b(caption|captions|subtitle|subtitles|cart)\b/;
const reversedStepPattern = /\bstep\s*2\b.{0,80}\bstep\s*1\b|\bsecond\b.{0,80}\bfirst\b/;
const tinyTextPattern = /\b(tiny[-_ ]?text|fixed[-_ ]?tiny|font-size\s*:\s*(?:[0-9]|10)(?:px|pt)|text[-_ ]?resize)\b/;
const imageTextPattern = /\b(image[-_ ]?text|text[-_ ]?image|sprite[-_ ]?text|sale ends today|promo[-_ ]?image)\b/;
const lowContrastPattern = /\b(low[-_ ]?contrast|faint|subtle[-_ ]?border|weak[-_ ]?outline|contrast\s*:\s*low)\b/;
const nonTextWidgetPattern = /\b(icon|boundary|border|outline|focus|control|button|checkbox|radio|switch|slider|graphical)\b/;
const singlePathPattern = /\b(only one|single)\s+(path|way|route|method)\b|\bno\s+(search|sitemap|site map|navigation|index)\b/;
const inconsistentNavigationPattern = /\b(navigation|nav|menu)\b.{0,80}\b(changes|different|inconsistent|reordered|varies)\b|\b(changes|different|inconsistent|reordered|varies)\b.{0,80}\b(navigation|nav|menu)\b/;
const inconsistentIdentificationPattern = /\b(same action|same function|repeated component|same component)\b.{0,80}\b(different labels?|inconsistent|different names?)\b|\b(different labels?|inconsistent|different names?)\b.{0,80}\b(same action|same function|repeated component|same component)\b/;
const inconsistentHelpPattern = /\b(help|support|contact)\b.{0,80}\b(inconsistent|different|changes|moves|varies)\b|\b(inconsistent|different|changes|moves|varies)\b.{0,80}\b(help|support|contact)\b/;
const highImpactActionPattern = /\b(financial|payment|purchase|transfer|legal|contract|delete|remove|submit|checkout|order|card|bank|data)\b/;
const missingPreventionPattern = /\b(no|without|lacks?|missing)\b.{0,40}\b(review|confirm|confirmation|reverse|reversal|undo|correct|correction)\b/;
const redundantEntryPattern = /\b(re[- ]?enter|retype|type again|enter again|same .* again|previously entered|confirm[-_ ]?password|confirm password)\b/;
const redundantEntryMitigationPattern = /\b(optional|auto[- ]?(fill|filled|populate|populated)|reuse|pre[- ]?fill|remembered)\b/;
const authenticationChallengePattern = /\b(solve|captcha|puzzle|memorize|remember|transcribe|copy)\b.{0,80}\b(sign in|log in|login|authenticate|authentication|password)\b|\b(sign in|log in|login|authenticate|authentication|password)\b.{0,80}\b(solve|captcha|puzzle|memorize|remember|transcribe|copy)\b/;
const authenticationMitigationPattern = /\b(passkey|webauthn|password manager|paste|magic link|email link|alternative|support)\b/;
