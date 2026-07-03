import { normalize, staticAttributeValue } from "../rule-utils.js";
import type { JsxElement, RuleContext, RuleDefinition } from "../types.js";

export const signLanguageRule: RuleDefinition = {
  id: "CDOM_1_2_6_SIGN_LANGUAGE",
  title: "Prerecorded media may lack sign language interpretation",
  severity: "warning",
  confidence: "low",
  category: "readability",
  wcag: ["1.2.6"],
  standards: [
    { version: "wcag20", criterion: "1.2.6", level: "aaa", title: "Sign Language (Prerecorded)" },
    { version: "wcag21", criterion: "1.2.6", level: "aaa", title: "Sign Language (Prerecorded)" },
    { version: "wcag22", criterion: "1.2.6", level: "aaa", title: "Sign Language (Prerecorded)" },
    { version: "wcag30", criterion: "sign-language", title: "Sign language interpretation is available" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Prerecorded synchronized media may need sign language interpretation for AAA support.",
  guidance: "Provide sign language interpretation for prerecorded audio content in synchronized media.",
  examples: [
    { label: "Sign language track", code: '<a href="/lesson-asl.mp4">Version with sign language</a>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => mediaSpeechPattern.test(signalOf(element, context)))
      .filter((element) => missingSignLanguagePattern.test(signalOf(element, context)) || !signLanguageMitigationPattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Provide sign language interpretation for prerecorded synchronized media."));
  }
};

export const extendedAudioDescriptionRule: RuleDefinition = {
  id: "CDOM_1_2_7_EXTENDED_AUDIO_DESCRIPTION",
  title: "Prerecorded video may lack extended audio description",
  severity: "warning",
  confidence: "low",
  category: "readability",
  wcag: ["1.2.7"],
  standards: [
    { version: "wcag20", criterion: "1.2.7", level: "aaa", title: "Extended Audio Description (Prerecorded)" },
    { version: "wcag21", criterion: "1.2.7", level: "aaa", title: "Extended Audio Description (Prerecorded)" },
    { version: "wcag22", criterion: "1.2.7", level: "aaa", title: "Extended Audio Description (Prerecorded)" },
    { version: "wcag30", criterion: "extended-audio-description", title: "Extended audio description is available" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Prerecorded video may require extended audio description when pauses are needed for visual details.",
  guidance: "Provide an extended audio description or an equivalent media alternative for complex visual information.",
  examples: [
    { label: "Extended description", code: '<a href="/tour-extended-description.mp4">Extended audio description</a>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => videoDescriptionPattern.test(signalOf(element, context)))
      .filter((element) => missingExtendedDescriptionPattern.test(signalOf(element, context)) || !extendedDescriptionMitigationPattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Provide extended audio description when visual details need additional time."));
  }
};

export const mediaAlternativeFullRule: RuleDefinition = {
  id: "CDOM_1_2_8_FULL_MEDIA_ALTERNATIVE",
  title: "Prerecorded media may lack a full media alternative",
  severity: "warning",
  confidence: "low",
  category: "readability",
  wcag: ["1.2.8"],
  standards: [
    { version: "wcag20", criterion: "1.2.8", level: "aaa", title: "Media Alternative (Prerecorded)" },
    { version: "wcag21", criterion: "1.2.8", level: "aaa", title: "Media Alternative (Prerecorded)" },
    { version: "wcag22", criterion: "1.2.8", level: "aaa", title: "Media Alternative (Prerecorded)" },
    { version: "wcag30", criterion: "media-alternative", title: "Full media alternatives are available" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Prerecorded synchronized media may need a full text or media alternative for AAA support.",
  guidance: "Provide a full transcript or media alternative that covers all audio and visual information.",
  examples: [
    { label: "Full alternative", code: '<a href="/webinar-transcript">Full text alternative</a>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => mediaSpeechPattern.test(signalOf(element, context)))
      .filter((element) => missingFullAlternativePattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Provide a full text or media alternative for prerecorded synchronized media."));
  }
};

export const liveAudioTranscriptRule: RuleDefinition = {
  id: "CDOM_1_2_9_LIVE_AUDIO_TRANSCRIPT",
  title: "Live audio may lack a text alternative",
  severity: "warning",
  confidence: "low",
  category: "readability",
  wcag: ["1.2.9"],
  standards: [
    { version: "wcag20", criterion: "1.2.9", level: "aaa", title: "Audio-only (Live)" },
    { version: "wcag21", criterion: "1.2.9", level: "aaa", title: "Audio-only (Live)" },
    { version: "wcag22", criterion: "1.2.9", level: "aaa", title: "Audio-only (Live)" },
    { version: "wcag30", criterion: "live-audio-alternative", title: "Live audio alternatives are available" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Live audio-only content may need an equivalent text alternative for AAA support.",
  guidance: "Provide live captions, live transcript, or another text alternative for live audio-only content.",
  examples: [
    { label: "Live transcript", code: '<a href="/live-transcript">Open live transcript</a>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => liveAudioPattern.test(signalOf(element, context)))
      .filter((element) => missingLiveAudioAlternativePattern.test(signalOf(element, context)) || !liveAudioMitigationPattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Provide a live transcript or text alternative for live audio-only content."));
  }
};

export const identifyPurposeRule: RuleDefinition = {
  id: "CDOM_1_3_6_IDENTIFY_PURPOSE",
  title: "Component purpose may not be programmatically identifiable",
  severity: "warning",
  confidence: "low",
  category: "names-and-roles",
  wcag: ["1.3.6"],
  standards: [
    { version: "wcag21", criterion: "1.3.6", level: "aaa", title: "Identify Purpose" },
    { version: "wcag22", criterion: "1.3.6", level: "aaa", title: "Identify Purpose" },
    { version: "wcag30", criterion: "purpose", title: "Purpose is programmatically identifiable" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Some components, icons, and regions need machine-identifiable purpose beyond a visible label.",
  guidance: "Use semantic HTML, known autocomplete tokens, landmarks, or consistent purpose metadata for reusable components.",
  examples: [
    { label: "Semantic purpose", code: '<nav aria-label="Primary navigation">...</nav>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => missingPurposePattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Expose the purpose of this component or region programmatically."));
  }
};

export const enhancedContrastRule: RuleDefinition = {
  id: "CDOM_1_4_6_ENHANCED_CONTRAST",
  title: "Text may not meet enhanced contrast",
  severity: "warning",
  confidence: "low",
  category: "readability",
  wcag: ["1.4.6"],
  standards: [
    { version: "wcag20", criterion: "1.4.6", level: "aaa", title: "Contrast (Enhanced)" },
    { version: "wcag21", criterion: "1.4.6", level: "aaa", title: "Contrast (Enhanced)" },
    { version: "wcag22", criterion: "1.4.6", level: "aaa", title: "Contrast (Enhanced)" },
    { version: "wcag30", criterion: "enhanced-contrast", title: "Enhanced visual contrast supports reading" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "AAA contrast has stricter thresholds than minimum text contrast.",
  guidance: "Verify body text reaches 7:1 contrast and large text reaches 4.5:1 where AAA support is required.",
  examples: [
    { label: "Enhanced contrast", code: '<p className="high-contrast">Readable text</p>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => enhancedContrastPattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Verify this text meets enhanced AAA contrast thresholds."));
  }
};

export const visualPresentationRule: RuleDefinition = {
  id: "CDOM_1_4_8_VISUAL_PRESENTATION",
  title: "Text presentation may not be adaptable",
  severity: "warning",
  confidence: "low",
  category: "readability",
  wcag: ["1.4.8"],
  standards: [
    { version: "wcag20", criterion: "1.4.8", level: "aaa", title: "Visual Presentation" },
    { version: "wcag21", criterion: "1.4.8", level: "aaa", title: "Visual Presentation" },
    { version: "wcag22", criterion: "1.4.8", level: "aaa", title: "Visual Presentation" },
    { version: "wcag30", criterion: "visual-presentation", title: "Text presentation is adaptable" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Blocks of text should support adaptable width, spacing, alignment, and foreground/background colors.",
  guidance: "Avoid long fixed-width justified text blocks and support user-controlled colors and spacing.",
  examples: [
    { label: "Readable paragraph", code: '<article className="measure-readable">...</article>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => visualPresentationPattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Review this text block for AAA visual presentation requirements."));
  }
};

export const imagesOfTextNoExceptionRule: RuleDefinition = {
  id: "CDOM_1_4_9_IMAGES_OF_TEXT_NO_EXCEPTION",
  title: "Image text may not have an AAA exception",
  severity: "warning",
  confidence: "low",
  category: "readability",
  wcag: ["1.4.9"],
  standards: [
    { version: "wcag20", criterion: "1.4.9", level: "aaa", title: "Images of Text (No Exception)" },
    { version: "wcag21", criterion: "1.4.9", level: "aaa", title: "Images of Text (No Exception)" },
    { version: "wcag22", criterion: "1.4.9", level: "aaa", title: "Images of Text (No Exception)" },
    { version: "wcag30", criterion: "text-alternatives", title: "Text can be programmatically adapted" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "AAA allows images of text only when the presentation is essential.",
  guidance: "Use real text instead of image text unless that exact presentation is essential.",
  examples: [
    { label: "Real heading", code: '<h2 className="brand-heading">Sale ends today</h2>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => imageTextNoExceptionPattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Use real text unless this image text presentation is essential."));
  }
};

export const backgroundAudioRule: RuleDefinition = {
  id: "CDOM_1_4_7_BACKGROUND_AUDIO",
  title: "Background audio may interfere with speech",
  severity: "warning",
  confidence: "low",
  category: "readability",
  wcag: ["1.4.7"],
  standards: [
    { version: "wcag20", criterion: "1.4.7", level: "aaa", title: "Low or No Background Audio" },
    { version: "wcag21", criterion: "1.4.7", level: "aaa", title: "Low or No Background Audio" },
    { version: "wcag22", criterion: "1.4.7", level: "aaa", title: "Low or No Background Audio" },
    { version: "wcag30", criterion: "audio-control", title: "Background audio does not obscure speech" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Speech content should not be obscured by background audio that cannot be reduced or disabled.",
  guidance: "Avoid background audio behind speech, or provide a way to turn it off or reduce it by at least 20 dB.",
  examples: [
    { label: "Separate music control", code: '<button type="button">Turn off background music</button>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => backgroundAudioPattern.test(signalOf(element, context)))
      .filter((element) => !audioMitigationPattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Provide a way to remove or substantially lower background audio behind speech."));
  }
};

export const interruptionControlRule: RuleDefinition = {
  id: "CDOM_2_2_4_INTERRUPTION_CONTROL",
  title: "Interruptions may not be postponable",
  severity: "warning",
  confidence: "low",
  category: "readability",
  wcag: ["2.2.4"],
  standards: [
    { version: "wcag20", criterion: "2.2.4", level: "aaa", title: "Interruptions" },
    { version: "wcag21", criterion: "2.2.4", level: "aaa", title: "Interruptions" },
    { version: "wcag22", criterion: "2.2.4", level: "aaa", title: "Interruptions" },
    { version: "wcag30", criterion: "interruptions", title: "Interruptions are controllable" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Interruptions should be postponable or suppressible unless they involve an emergency.",
  guidance: "Let users postpone, suppress, or control non-emergency alerts, popups, and timed interruptions.",
  examples: [
    { label: "Postpone alert", code: '<button type="button">Remind me later</button>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => interruptionPattern.test(signalOf(element, context)))
      .filter((element) => !interruptionMitigationPattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Let users postpone or suppress non-emergency interruptions."));
  }
};

export const reauthenticatingDataRule: RuleDefinition = {
  id: "CDOM_2_2_5_REAUTHENTICATING_DATA",
  title: "Re-authentication may lose user data",
  severity: "warning",
  confidence: "low",
  category: "forms",
  wcag: ["2.2.5"],
  standards: [
    { version: "wcag20", criterion: "2.2.5", level: "aaa", title: "Re-authenticating" },
    { version: "wcag21", criterion: "2.2.5", level: "aaa", title: "Re-authenticating" },
    { version: "wcag22", criterion: "2.2.5", level: "aaa", title: "Re-authenticating" },
    { version: "wcag30", criterion: "reauthentication", title: "Re-authentication preserves progress" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "When authenticated sessions expire, users should be able to continue without losing data.",
  guidance: "Save draft data and restore the user's activity after re-authentication.",
  examples: [
    { label: "Restored draft", code: "<p>Your draft was saved. Sign in again to continue.</p>" }
  ],
  check(context) {
    return context.elements
      .filter((element) => reauthPattern.test(signalOf(element, context)))
      .filter((element) => dataLossPattern.test(signalOf(element, context)) || !preserveDataPattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Preserve user data and activity across re-authentication."));
  }
};

export const timeoutWarningRule: RuleDefinition = {
  id: "CDOM_2_2_6_TIMEOUT_WARNING",
  title: "Timeout may not warn about data loss",
  severity: "warning",
  confidence: "low",
  category: "forms",
  wcag: ["2.2.6"],
  standards: [
    { version: "wcag21", criterion: "2.2.6", level: "aaa", title: "Timeouts" },
    { version: "wcag22", criterion: "2.2.6", level: "aaa", title: "Timeouts" },
    { version: "wcag30", criterion: "timeouts", title: "Timeouts are clearly communicated" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Users should be warned when inactivity could cause data loss.",
  guidance: "Warn users about timeout duration and data-loss risk before the timeout occurs.",
  examples: [
    { label: "Timeout warning", code: "<p>Your draft autosaves. You will be warned before the session expires.</p>" }
  ],
  check(context) {
    return context.elements
      .filter((element) => timeoutLossPattern.test(signalOf(element, context)))
      .filter((element) => !timeoutMitigationPattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Warn users about timeout duration and possible data loss."));
  }
};

export const keyboardNoExceptionRule: RuleDefinition = {
  id: "CDOM_2_1_3_KEYBOARD_NO_EXCEPTION",
  title: "Functionality may not be keyboard operable without exception",
  severity: "warning",
  confidence: "low",
  category: "keyboard",
  wcag: ["2.1.3"],
  standards: [
    { version: "wcag20", criterion: "2.1.3", level: "aaa", title: "Keyboard (No Exception)" },
    { version: "wcag21", criterion: "2.1.3", level: "aaa", title: "Keyboard (No Exception)" },
    { version: "wcag22", criterion: "2.1.3", level: "aaa", title: "Keyboard (No Exception)" },
    { version: "wcag30", criterion: "keyboard-access", title: "Functionality is keyboard operable" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "AAA keyboard access removes the essential-exception allowance from the base keyboard criterion.",
  guidance: "Provide keyboard operation for drawing, drag, canvas, and gesture-based features when AAA support is required.",
  examples: [
    { label: "Keyboard alternative", code: '<button type="button">Move item up</button>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => keyboardNoExceptionPattern.test(signalOf(element, context)))
      .filter((element) => missingKeyboardAlternativePattern.test(signalOf(element, context)) || !keyboardAlternativePattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Provide keyboard operation without relying on pointer-only exceptions."));
  }
};

export const noTimingRule: RuleDefinition = {
  id: "CDOM_2_2_3_NO_TIMING",
  title: "Task may depend on timing",
  severity: "warning",
  confidence: "low",
  category: "forms",
  wcag: ["2.2.3"],
  standards: [
    { version: "wcag20", criterion: "2.2.3", level: "aaa", title: "No Timing" },
    { version: "wcag21", criterion: "2.2.3", level: "aaa", title: "No Timing" },
    { version: "wcag22", criterion: "2.2.3", level: "aaa", title: "No Timing" },
    { version: "wcag30", criterion: "time-limits", title: "Tasks do not depend on timing" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "AAA support generally avoids time limits as an essential part of the task.",
  guidance: "Remove task time limits or provide an untimed version where AAA support is required.",
  examples: [
    { label: "Untimed task", code: "<p>This assessment has no time limit.</p>" }
  ],
  check(context) {
    return context.elements
      .filter((element) => noTimingRiskPattern.test(signalOf(element, context)))
      .filter((element) => !noTimingMitigationPattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Provide an untimed path for this task when AAA support is required."));
  }
};

export const threeFlashesRule: RuleDefinition = {
  id: "CDOM_2_3_2_THREE_FLASHES",
  title: "Flashing content may violate AAA no-flash guidance",
  severity: "critical",
  confidence: "low",
  category: "readability",
  wcag: ["2.3.2"],
  standards: [
    { version: "wcag20", criterion: "2.3.2", level: "aaa", title: "Three Flashes" },
    { version: "wcag21", criterion: "2.3.2", level: "aaa", title: "Three Flashes" },
    { version: "wcag22", criterion: "2.3.2", level: "aaa", title: "Three Flashes" },
    { version: "wcag30", criterion: "flashing", title: "Flashing content is avoided" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "AAA conformance avoids content that flashes more than three times in any one-second period.",
  guidance: "Remove flashing/strobing content or verify no content flashes more than three times per second.",
  examples: [
    { label: "No flashing", code: '<div className="steady-alert">Alert</div>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => aaaFlashPattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Avoid flashing content for AAA support."));
  }
};

export const animationFromInteractionsRule: RuleDefinition = {
  id: "CDOM_2_3_3_ANIMATION_FROM_INTERACTIONS",
  title: "Interaction-triggered animation may lack reduction controls",
  severity: "warning",
  confidence: "low",
  category: "readability",
  wcag: ["2.3.3"],
  standards: [
    { version: "wcag21", criterion: "2.3.3", level: "aaa", title: "Animation from Interactions" },
    { version: "wcag22", criterion: "2.3.3", level: "aaa", title: "Animation from Interactions" },
    { version: "wcag30", criterion: "motion-animation", title: "Motion animation is controllable" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Motion animation triggered by interaction should be disableable unless essential.",
  guidance: "Respect prefers-reduced-motion and provide a way to disable parallax, scroll, hover, or click animations.",
  examples: [
    { label: "Reduced motion", code: "@media (prefers-reduced-motion: reduce) { * { animation: none; } }" }
  ],
  check(context) {
    return context.elements
      .filter((element) => interactionAnimationPattern.test(signalOf(element, context)))
      .filter((element) => !reducedMotionPattern.test(context.source.toLowerCase()))
      .map((element) => context.createFinding(this, element, "Respect reduced-motion preferences for interaction-triggered animation."));
  }
};

export const locationIndicatorRule: RuleDefinition = {
  id: "CDOM_2_4_8_LOCATION_INDICATOR",
  title: "Current location may not be indicated",
  severity: "warning",
  confidence: "low",
  category: "structure",
  wcag: ["2.4.8"],
  standards: [
    { version: "wcag20", criterion: "2.4.8", level: "aaa", title: "Location" },
    { version: "wcag21", criterion: "2.4.8", level: "aaa", title: "Location" },
    { version: "wcag22", criterion: "2.4.8", level: "aaa", title: "Location" },
    { version: "wcag30", criterion: "wayfinding", title: "Current location is identifiable" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Users benefit from breadcrumbs, current-page indicators, or other wayfinding cues.",
  guidance: "Provide breadcrumbs or mark the current page/step with aria-current or equivalent text.",
  examples: [
    { label: "Current page", code: '<a href="/billing" aria-current="page">Billing</a>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => missingLocationPattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Provide a breadcrumb, current-page indicator, or current-step cue."));
  }
};

export const sectionHeadingsRule: RuleDefinition = {
  id: "CDOM_2_4_10_SECTION_HEADINGS",
  title: "Long content may need section headings",
  severity: "warning",
  confidence: "low",
  category: "structure",
  wcag: ["2.4.10"],
  standards: [
    { version: "wcag20", criterion: "2.4.10", level: "aaa", title: "Section Headings" },
    { version: "wcag21", criterion: "2.4.10", level: "aaa", title: "Section Headings" },
    { version: "wcag22", criterion: "2.4.10", level: "aaa", title: "Section Headings" },
    { version: "wcag30", criterion: "section-headings", title: "Sections are clearly labelled" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Section headings help users understand and navigate long content.",
  guidance: "Use headings to organize long forms, articles, settings pages, and repeated content groups.",
  examples: [
    { label: "Section heading", code: "<section><h2>Payment details</h2><p>...</p></section>" }
  ],
  check(context) {
    return context.elements
      .filter((element) => missingSectionHeadingPattern.test(signalOf(element, context)) || longSectionWithoutHeading(element, context))
      .map((element) => context.createFinding(this, element, "Add headings for content sections when headings would clarify structure."));
  }
};

export const unusualWordsRule: RuleDefinition = {
  id: "CDOM_3_1_3_UNUSUAL_WORDS",
  title: "Unusual words or jargon may be unexplained",
  severity: "warning",
  confidence: "low",
  category: "readability",
  wcag: ["3.1.3"],
  standards: [
    { version: "wcag20", criterion: "3.1.3", level: "aaa", title: "Unusual Words" },
    { version: "wcag21", criterion: "3.1.3", level: "aaa", title: "Unusual Words" },
    { version: "wcag22", criterion: "3.1.3", level: "aaa", title: "Unusual Words" },
    { version: "wcag30", criterion: "plain-language", title: "Unusual words are explained" }
  ],
  platforms: ["web", "react-native-ios", "react-native-android"],
  fixable: false,
  summary: "Unusual words, idioms, or domain-specific jargon may need definitions.",
  guidance: "Define unusual words, idioms, and specialized terms inline or through glossary/help text.",
  examples: [
    { label: "Defined term", code: "<p>Escrow, a neutral holding account, protects both parties.</p>" }
  ],
  check(context) {
    return context.elements
      .filter((element) => unusualWordsPattern.test(signalOf(element, context)))
      .filter((element) => !definitionPattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Explain unusual words, idioms, or specialized jargon."));
  }
};

export const abbreviationsRule: RuleDefinition = {
  id: "CDOM_3_1_4_ABBREVIATIONS",
  title: "Abbreviations may be unexplained",
  severity: "warning",
  confidence: "low",
  category: "readability",
  wcag: ["3.1.4"],
  standards: [
    { version: "wcag20", criterion: "3.1.4", level: "aaa", title: "Abbreviations" },
    { version: "wcag21", criterion: "3.1.4", level: "aaa", title: "Abbreviations" },
    { version: "wcag22", criterion: "3.1.4", level: "aaa", title: "Abbreviations" },
    { version: "wcag30", criterion: "abbreviations", title: "Abbreviations are explained" }
  ],
  platforms: ["web", "react-native-ios", "react-native-android"],
  fixable: false,
  summary: "Abbreviations should be expanded or explained when their meaning may be unclear.",
  guidance: "Use abbr title text, inline expansion, or glossary text for uncommon abbreviations.",
  examples: [
    { label: "Expanded abbreviation", code: '<abbr title="Annual Percentage Rate">APR</abbr>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => abbreviationPattern.test(signalOf(element, context)))
      .filter((element) => element.tagName.toLowerCase() !== "abbr" && !context.hasAttribute(element, "title") && !definitionPattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Expand or explain abbreviations that may be unclear."));
  }
};

export const focusObscuredEnhancedRule: RuleDefinition = {
  id: "CDOM_2_4_12_FOCUS_OBSCURED_ENHANCED",
  title: "Focused control may be partially obscured",
  severity: "warning",
  confidence: "low",
  category: "keyboard",
  wcag: ["2.4.12"],
  standards: [
    { version: "wcag22", criterion: "2.4.12", level: "aaa", title: "Focus Not Obscured (Enhanced)" },
    { version: "wcag30", criterion: "focus-visible", title: "Focused content remains fully visible" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "AAA focus visibility requires focused components not be obscured by author-created content.",
  guidance: "Ensure sticky headers, overlays, and floating panels do not cover any part of the focused component.",
  examples: [
    { label: "Unobscured focus", code: '<button className="above-overlay">Continue</button>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => focusObscuredEnhancedPattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Ensure the focused component is not obscured at all."));
  }
};

export const focusAppearanceRule: RuleDefinition = {
  id: "CDOM_2_4_13_FOCUS_APPEARANCE",
  title: "Focus indicator may not meet appearance requirements",
  severity: "warning",
  confidence: "low",
  category: "keyboard",
  wcag: ["2.4.13"],
  standards: [
    { version: "wcag22", criterion: "2.4.13", level: "aaa", title: "Focus Appearance" },
    { version: "wcag30", criterion: "focus-appearance", title: "Focus appearance is perceivable" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "AAA focus indicators have minimum size and contrast expectations.",
  guidance: "Verify focus indicators are large enough and have sufficient contrast against adjacent colors.",
  examples: [
    { label: "Visible focus", code: "button:focus-visible { outline: 3px solid #005fcc; outline-offset: 2px; }" }
  ],
  check(context) {
    return context.elements
      .filter((element) => focusAppearancePattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Verify focus indicator size and contrast for AAA focus appearance."));
  }
};

export const targetSizeEnhancedRule: RuleDefinition = {
  id: "CDOM_2_5_5_TARGET_SIZE_ENHANCED",
  title: "Interactive target may be smaller than enhanced target size",
  severity: "warning",
  confidence: "low",
  category: "keyboard",
  wcag: ["2.5.5"],
  standards: [
    { version: "wcag21", criterion: "2.5.5", level: "aaa", title: "Target Size (Enhanced)" },
    { version: "wcag22", criterion: "2.5.5", level: "aaa", title: "Target Size (Enhanced)" },
    { version: "wcag30", criterion: "target-size", title: "Targets are large enough to activate" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "AAA target size has a larger 44 by 44 CSS pixel expectation.",
  guidance: "Make pointer targets at least 44 by 44 CSS pixels unless a listed exception applies.",
  examples: [
    { label: "Large target", code: '<button className="target-large">Next</button>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => enhancedTargetPattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Verify this target is at least 44 by 44 CSS pixels for AAA support."));
  }
};

export const concurrentInputRule: RuleDefinition = {
  id: "CDOM_2_5_6_CONCURRENT_INPUT",
  title: "Input may restrict available modalities",
  severity: "warning",
  confidence: "low",
  category: "keyboard",
  wcag: ["2.5.6"],
  standards: [
    { version: "wcag21", criterion: "2.5.6", level: "aaa", title: "Concurrent Input Mechanisms" },
    { version: "wcag22", criterion: "2.5.6", level: "aaa", title: "Concurrent Input Mechanisms" },
    { version: "wcag30", criterion: "input-modalities", title: "Input modalities remain available" }
  ],
  platforms: ["web", "react-native-ios", "react-native-android"],
  fixable: false,
  summary: "Content should not restrict available input modalities unless essential or required for security/settings.",
  guidance: "Do not force users to disable keyboard, touch, pointer, switch, or assistive input modalities.",
  examples: [
    { label: "No forced modality", code: "<p>You can use keyboard, touch, pointer, or switch input.</p>" }
  ],
  check(context) {
    return context.elements
      .filter((element) => restrictedInputPattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Do not restrict available input mechanisms unless essential."));
  }
};

export const helpAvailabilityRule: RuleDefinition = {
  id: "CDOM_3_3_5_HELP_AVAILABLE",
  title: "Form help may be unavailable",
  severity: "warning",
  confidence: "low",
  category: "forms",
  wcag: ["3.3.5"],
  standards: [
    { version: "wcag20", criterion: "3.3.5", level: "aaa", title: "Help" },
    { version: "wcag21", criterion: "3.3.5", level: "aaa", title: "Help" },
    { version: "wcag22", criterion: "3.3.5", level: "aaa", title: "Help" },
    { version: "wcag30", criterion: "help", title: "Help is available" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Contextual help should be available for forms and complex tasks.",
  guidance: "Provide help text, support links, contact options, or contextual instructions for complex forms.",
  examples: [
    { label: "Help link", code: '<a href="/support/billing">Get help with billing</a>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => missingHelpPattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Provide help for complex forms or tasks."));
  }
};

export const allErrorPreventionRule: RuleDefinition = {
  id: "CDOM_3_3_6_ERROR_PREVENTION_ALL",
  title: "Submission may lack general error prevention",
  severity: "warning",
  confidence: "low",
  category: "forms",
  wcag: ["3.3.6"],
  standards: [
    { version: "wcag20", criterion: "3.3.6", level: "aaa", title: "Error Prevention (All)" },
    { version: "wcag21", criterion: "3.3.6", level: "aaa", title: "Error Prevention (All)" },
    { version: "wcag22", criterion: "3.3.6", level: "aaa", title: "Error Prevention (All)" },
    { version: "wcag30", criterion: "error-prevention", title: "Errors can be prevented or reversed" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Submissions should be reversible, checked, or confirmed beyond only legal/financial/data cases.",
  guidance: "Add confirmation, review, undo, or correction opportunities for user submissions.",
  examples: [
    { label: "Confirm submit", code: '<button type="submit">Review and submit</button>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => generalSubmissionRiskPattern.test(signalOf(element, context)))
      .filter((element) => negativeReviewPattern.test(signalOf(element, context)) || !reviewMitigationPattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Provide review, confirmation, correction, or undo for submissions."));
  }
};

export const enhancedAuthenticationRule: RuleDefinition = {
  id: "CDOM_3_3_9_ACCESSIBLE_AUTHENTICATION_ENHANCED",
  title: "Authentication may require object recognition or personal content",
  severity: "warning",
  confidence: "low",
  category: "forms",
  wcag: ["3.3.9"],
  standards: [
    { version: "wcag22", criterion: "3.3.9", level: "aaa", title: "Accessible Authentication (Enhanced)" },
    { version: "wcag30", criterion: "authentication", title: "Authentication avoids cognitive tests" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Enhanced authentication avoids object recognition and personal-content identification tests.",
  guidance: "Provide an authentication option that does not require recognizing objects or identifying user-provided images, audio, or personal content.",
  examples: [
    { label: "Non-cognitive option", code: '<button type="button">Sign in with passkey</button>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => enhancedAuthenticationPattern.test(signalOf(element, context)))
      .filter((element) => !authAlternativePattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Provide an authentication path without object recognition or personal-content identification."));
  }
};

export const readingLevelRule: RuleDefinition = {
  id: "CDOM_3_1_5_READING_LEVEL",
  title: "Text may exceed lower secondary reading level",
  severity: "warning",
  confidence: "low",
  category: "readability",
  wcag: ["3.1.5"],
  standards: [
    { version: "wcag20", criterion: "3.1.5", level: "aaa", title: "Reading Level" },
    { version: "wcag21", criterion: "3.1.5", level: "aaa", title: "Reading Level" },
    { version: "wcag22", criterion: "3.1.5", level: "aaa", title: "Reading Level" },
    { version: "wcag30", criterion: "plain-language", title: "Text is understandable" }
  ],
  platforms: ["web", "react-native-ios", "react-native-android"],
  fixable: false,
  summary: "Complex text may need a simpler version or supplemental explanation for AAA support.",
  guidance: "Provide plain-language summaries or supplemental content when text requires advanced reading ability.",
  examples: [
    { label: "Plain summary", code: "<p>Summary: this fee is charged once per year.</p>" }
  ],
  check(context) {
    return context.elements
      .filter((element) => readingLevelPattern.test(signalOf(element, context)))
      .filter((element) => !plainLanguageMitigationPattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Provide a plain-language summary or supplemental explanation for complex text."));
  }
};

export const pronunciationRule: RuleDefinition = {
  id: "CDOM_3_1_6_PRONUNCIATION",
  title: "Pronunciation-dependent words may be unexplained",
  severity: "warning",
  confidence: "low",
  category: "readability",
  wcag: ["3.1.6"],
  standards: [
    { version: "wcag20", criterion: "3.1.6", level: "aaa", title: "Pronunciation" },
    { version: "wcag21", criterion: "3.1.6", level: "aaa", title: "Pronunciation" },
    { version: "wcag22", criterion: "3.1.6", level: "aaa", title: "Pronunciation" },
    { version: "wcag30", criterion: "pronunciation", title: "Pronunciation is available when needed" }
  ],
  platforms: ["web", "react-native-ios", "react-native-android"],
  fixable: false,
  summary: "Words whose meaning depends on pronunciation may need pronunciation guidance.",
  guidance: "Provide pronunciation, phonetic spelling, audio, or glossary help when pronunciation is necessary to understand meaning.",
  examples: [
    { label: "Pronunciation hint", code: "<p>Read (pronounced reed) means to interpret text.</p>" }
  ],
  check(context) {
    return context.elements
      .filter((element) => pronunciationRiskPattern.test(signalOf(element, context)))
      .filter((element) => !pronunciationMitigationPattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Provide pronunciation guidance when meaning depends on pronunciation."));
  }
};

export const changeOnRequestRule: RuleDefinition = {
  id: "CDOM_3_2_5_CHANGE_ON_REQUEST",
  title: "Context change may occur without explicit request",
  severity: "warning",
  confidence: "low",
  category: "forms",
  wcag: ["3.2.5"],
  standards: [
    { version: "wcag20", criterion: "3.2.5", level: "aaa", title: "Change on Request" },
    { version: "wcag21", criterion: "3.2.5", level: "aaa", title: "Change on Request" },
    { version: "wcag22", criterion: "3.2.5", level: "aaa", title: "Change on Request" },
    { version: "wcag30", criterion: "predictable-changes", title: "Changes of context are user initiated" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Changes of context should happen only on user request or with a way to turn them off.",
  guidance: "Require an explicit button or user request before navigating, submitting, opening new windows, or changing context.",
  examples: [
    { label: "Explicit request", code: '<select name="country">...</select><button>Apply</button>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => changeWithoutRequestPattern.test(signalOf(element, context)))
      .filter((element) => missingExplicitRequestPattern.test(signalOf(element, context)) || !explicitRequestMitigationPattern.test(signalOf(element, context)))
      .map((element) => context.createFinding(this, element, "Make context changes occur only after an explicit user request."));
  }
};

function textOf(element: JsxElement): string {
  return normalize(element.ownText).toLowerCase();
}

function signalOf(element: JsxElement, context: RuleContext): string {
  return [
    element.tagName,
    textOf(element),
    context.elementText(element),
    staticAttributeValue(element, context, "className"),
    staticAttributeValue(element, context, "class"),
    staticAttributeValue(element, context, "id"),
    staticAttributeValue(element, context, "style"),
    staticAttributeValue(element, context, "aria-label"),
    staticAttributeValue(element, context, "name"),
    staticAttributeValue(element, context, "role"),
    staticAttributeValue(element, context, "type")
  ].filter(Boolean).join(" ").toLowerCase();
}

function longSectionWithoutHeading(element: JsxElement, context: RuleContext): boolean {
  const tag = element.tagName.toLowerCase();
  if (tag !== "section" && tag !== "article" && tag !== "main" && tag !== "form") return false;
  const text = normalize(context.elementText(element));
  if (text.length < 360) return false;
  return !element.childIds
    .map((id) => context.elements[id])
    .filter((child): child is JsxElement => Boolean(child))
    .some((child) => /^h[1-6]$/i.test(child.tagName) || staticAttributeValue(child, context, "role") === "heading");
}

const backgroundAudioPattern = /\b(background|ambient|music bed|soundtrack)\b.{0,50}\b(audio|music|sound|voice|speech|narration)\b|\b(audio|music|sound|voice|speech|narration)\b.{0,50}\b(background|ambient|music bed|soundtrack)\b/;
const mediaSpeechPattern = /\b(video|media|recording|webinar|lecture|lesson|presentation|training|speech|narration|prerecorded|pre-recorded)\b/;
const missingSignLanguagePattern = /\b(no|without|missing|lacks?)\b.{0,50}\b(sign language|asl|bsl|interpreter|interpretation)\b/;
const signLanguageMitigationPattern = /\b(sign language|asl|bsl|interpreter|interpretation)\b/;
const videoDescriptionPattern = /\b(video|tour|demo|walkthrough|presentation|training)\b.{0,80}\b(visual|description|audio description|extended)\b|\b(visual|description|audio description|extended)\b.{0,80}\b(video|tour|demo|walkthrough|presentation|training)\b/;
const missingExtendedDescriptionPattern = /\b(no|without|missing|lacks?)\b.{0,50}\b(extended audio description|extended description|audio description)\b/;
const extendedDescriptionMitigationPattern = /\b(extended audio description|extended description|audio description|full media alternative)\b/;
const missingFullAlternativePattern = /\b(no|without|missing|lacks?)\b.{0,60}\b(full text alternative|full transcript|media alternative|complete transcript)\b/;
const liveAudioPattern = /\b(live|livestream|streaming|broadcast)\b.{0,50}\b(audio|radio|podcast|voice|speech)\b|\b(audio-only live|live audio-only)\b/;
const liveAudioMitigationPattern = /\b(live transcript|transcript|caption|captions|text alternative)\b/;
const missingLiveAudioAlternativePattern = /\b(no|without|missing|lacks?)\b.{0,50}\b(live transcript|transcript|caption|captions|text alternative)\b/;
const missingPurposePattern = /\b(no|without|missing|lacks?)\b.{0,50}\b(programmatic purpose|semantic purpose|identify purpose|purpose metadata|machine readable purpose)\b/;
const enhancedContrastPattern = /\b(enhanced contrast|aaa contrast|7:1|7 to 1|low contrast aaa|fails aaa contrast)\b/;
const visualPresentationPattern = /\b(visual presentation|fixed width text|justified text|long line length|cannot change colors|user cannot adjust spacing)\b/;
const imageTextNoExceptionPattern = /\b(image text|image-of-text|images of text|text rendered as image|no exception)\b/;
const audioMitigationPattern = /\b(turn off|disable|mute|volume|reduce|lower|20\s?db|no background|separate track)\b/;
const interruptionPattern = /\b(interrupt|interruption|popup|pop-up|modal|alert|notification)\b.{0,60}\b(automatic|auto|every|timed|appears|opens|interrupts)\b|\b(automatic|auto|every|timed)\b.{0,60}\b(interrupt|popup|modal|alert|notification)\b/;
const interruptionMitigationPattern = /\b(postpone|suppress|turn off|disable|pause|remind me later|dismiss|emergency)\b/;
const reauthPattern = /\b(session|login|sign in|authentication|reauth|re-auth)\b.{0,80}\b(expire|timeout|again|lost|lose|cleared|reset)\b/;
const preserveDataPattern = /\b(save|saved|restore|restored|resume|draft|continue|preserve|autosave|auto-save)\b/;
const dataLossPattern = /\b(lost|lose|cleared|reset|discarded|unsaved)\b/;
const timeoutLossPattern = /\b(timeout|time out|session expires?|inactivity)\b.{0,80}\b(data|draft|progress|work|changes|loss|lost|lose|cleared)\b/;
const timeoutMitigationPattern = /\b(warn|warning|save|autosave|restore|extend|continue|duration|preserve)\b/;
const keyboardNoExceptionPattern = /\b(pointer-only|mouse-only|drag-only|touch-only|canvas drawing|freehand|keyboard exception|not keyboard operable)\b/;
const keyboardAlternativePattern = /\b(keyboard|button|shortcut|arrow key|tab|alternative)\b/;
const missingKeyboardAlternativePattern = /\b(no|without|missing|lacks?|not)\b.{0,40}\b(keyboard|button|shortcut|arrow key|tab|alternative)\b/;
const noTimingRiskPattern = /\b(timed task|time limit|must finish|complete within|limited time|countdown)\b/;
const noTimingMitigationPattern = /\b(no time limit|untimed|unlimited time|pause|extend|disable)\b/;
const aaaFlashPattern = /\b(flash|flashing|strobe|strobing|blink|blinking)\b/;
const interactionAnimationPattern = /\b(parallax|scroll animation|animated on scroll|motion on scroll|hover animation|click animation|interaction animation|onhover|onmouseenter|onscroll)\b/;
const reducedMotionPattern = /\bprefers-reduced-motion|reduce motion|motion setting|disable animation\b/;
const missingLocationPattern = /\b(no|missing|without|lacks?)\b.{0,40}\b(breadcrumb|current page|current step|you are here|location indicator|aria-current)\b/;
const missingSectionHeadingPattern = /\b(no|missing|without|lacks?)\b.{0,40}\b(section heading|headings?|subheadings?)\b/;
const focusObscuredEnhancedPattern = /\b(partially obscured focus|focus partially covered|sticky header covers focus|overlay covers part)\b/;
const focusAppearancePattern = /\b(focus appearance|thin focus|low contrast focus|focus indicator too small|focus outline too subtle)\b/;
const enhancedTargetPattern = /\b(target size enhanced|44\s?(?:x|by)\s?44|small aaa target|target smaller than 44|tiny target)\b/;
const restrictedInputPattern = /\b(disable|blocks?|forces?|requires?)\b.{0,40}\b(keyboard|touch|pointer|mouse|switch input|voice input|input modality)\b/;
const unusualWordsPattern = /\b(jargon|idiom|technical term|domain term|legalese|unusual word|specialized term|escrow|novation|subrogation|idempotent)\b/;
const definitionPattern = /\b(means|meaning|defined as|definition|stands for|short for|also known as|glossary|for example|that is)\b/;
const abbreviationPattern = /\b(apr|ssn|dob|mfa|otp|api|sla|kpi|hipaa|gdpr)\b/;
const missingHelpPattern = /\b(no|missing|without|lacks?)\b.{0,40}\b(help|support|contact|instructions?|guidance)\b/;
const generalSubmissionRiskPattern = /\b(submit|submission|send|publish|post|save changes|delete|remove|apply changes|finalize)\b.{0,80}\b(no|without|missing|lacks?|irreversible|cannot undo)\b|\b(no|without|missing|lacks?|irreversible|cannot undo)\b.{0,80}\b(submit|submission|send|publish|post|save changes|delete|remove|apply changes|finalize)\b/;
const reviewMitigationPattern = /\b(review|confirm|confirmation|undo|reversible|correct|correction|edit|preview|check)\b/;
const negativeReviewPattern = /\b(no|without|missing|lacks?|cannot)\b.{0,40}\b(review|confirm|confirmation|undo|reversible|correct|correction|edit|preview|check)\b/;
const enhancedAuthenticationPattern = /\b(auth|login|log in|sign in|password)\b.{0,100}\b(identify|recognize|select|choose)\b.{0,40}\b(object|image|picture|photo|face|song|audio|personal content)\b|\b(identify|recognize|select|choose)\b.{0,40}\b(object|image|picture|photo|face|song|audio|personal content)\b.{0,100}\b(auth|login|log in|sign in|password)\b/;
const authAlternativePattern = /\b(passkey|webauthn|password manager|magic link|email link|alternative|support|non-cognitive)\b/;
const readingLevelPattern = /\b(reading level|advanced reading|complex legal|complex medical|lower secondary|plain language|hard to read)\b/;
const plainLanguageMitigationPattern = /\b(summary|plain language|simplified|easy read|supplemental|explanation)\b/;
const pronunciationRiskPattern = /\b(pronunciation|pronounce|homograph|heteronym|read vs read|lead vs lead|wind vs wind)\b/;
const pronunciationMitigationPattern = /\b(pronounced|phonetic|audio|sounds like|pronunciation guide)\b/;
const changeWithoutRequestPattern = /\b(on change|on select|on focus|automatically navigates?|auto submit|changes context|opens new window)\b/;
const explicitRequestMitigationPattern = /\b(apply button|submit button|confirm|explicit request|user request|turn off|disable)\b/;
const missingExplicitRequestPattern = /\b(no|without|missing|lacks?)\b.{0,40}\b(explicit request|user request|apply button|submit button|confirm)\b/;
