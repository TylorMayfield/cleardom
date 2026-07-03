import { normalize, staticAttributeValue } from "../rule-utils.js";
import type { JsxElement, RuleContext, RuleDefinition } from "../types.js";

export const audioControlRule: RuleDefinition = {
  id: "CDOM_1_4_2_AUDIO_CONTROL",
  title: "Autoplaying audio may lack a pause or stop control",
  severity: "warning",
  confidence: "medium",
  category: "readability",
  wcag: ["1.4.2"],
  standards: [
    { version: "wcag20", criterion: "1.4.2", level: "a", title: "Audio Control" },
    { version: "wcag21", criterion: "1.4.2", level: "a", title: "Audio Control" },
    { version: "wcag22", criterion: "1.4.2", level: "a", title: "Audio Control" },
    { version: "wcag30", criterion: "sensory-characteristics", title: "Sensory output is controllable" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Audio that starts automatically can interfere with screen reader output and user focus.",
  guidance: "Avoid autoplay audio, or provide a visible pause/stop/mute control that is available immediately.",
  examples: [
    { label: "User-controlled audio", code: '<audio controls src="/intro.mp3" />' }
  ],
  check(context) {
    return context.elements
      .filter((element) => element.tagName.toLowerCase() === "audio")
      .filter((element) => context.hasAttribute(element, "autoPlay") || context.hasAttribute(element, "autoplay"))
      .filter((element) => !context.hasAttribute(element, "controls") && !hasNearbyControl(element, context))
      .map((element) => context.createFinding(this, element, "Avoid autoplaying audio without an immediate pause, stop, or mute control."));
  }
};

export const orientationRestrictionRule: RuleDefinition = {
  id: "CDOM_1_3_4_ORIENTATION",
  title: "Content appears to require one device orientation",
  severity: "warning",
  confidence: "low",
  category: "readability",
  wcag: ["1.3.4"],
  standards: [
    { version: "wcag21", criterion: "1.3.4", level: "aa", title: "Orientation" },
    { version: "wcag22", criterion: "1.3.4", level: "aa", title: "Orientation" },
    { version: "wcag30", criterion: "responsive-layout", title: "Layout adapts to user needs" }
  ],
  platforms: ["web", "react-native-ios", "react-native-android"],
  fixable: false,
  summary: "Tasks should not require portrait or landscape orientation unless that orientation is essential.",
  guidance: "Support both portrait and landscape layouts, or document why the orientation is essential.",
  examples: [
    { label: "Flexible wording", code: "<p>This checkout works in portrait and landscape orientation.</p>" }
  ],
  check(context) {
    return context.elements
      .filter((element) => orientationRestrictionPattern.test(textOf(element, context)))
      .map((element) => context.createFinding(this, element, "Do not require portrait or landscape orientation unless it is essential."));
  }
};

export const characterKeyShortcutRule: RuleDefinition = {
  id: "CDOM_2_1_4_CHARACTER_KEY_SHORTCUTS",
  title: "Single-character keyboard shortcut may not be adjustable",
  severity: "warning",
  confidence: "medium",
  category: "keyboard",
  wcag: ["2.1.4"],
  standards: [
    { version: "wcag21", criterion: "2.1.4", level: "a", title: "Character Key Shortcuts" },
    { version: "wcag22", criterion: "2.1.4", level: "a", title: "Character Key Shortcuts" },
    { version: "wcag30", criterion: "keyboard-shortcuts", title: "Keyboard shortcuts are controllable" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Single-key shortcuts need a way to turn off, remap, or require modifier keys.",
  guidance: "Require Ctrl/Alt/Meta, scope the shortcut to focused controls, or provide a setting to disable/remap it.",
  examples: [
    { label: "Modifier shortcut", code: 'if (event.ctrlKey && event.key === "s") save();' }
  ],
  check(context) {
    return context.elements
      .filter((element) => hasSingleCharacterShortcut(element, context) || shortcutCopyPattern.test(textOf(element, context)))
      .filter((element) => !hasPositiveShortcutMitigationText(element, context))
      .map((element) => context.createFinding(this, element, "Single-character shortcuts need an off, remap, or modifier-key option."));
  }
};

export const timingAdjustableRule: RuleDefinition = {
  id: "CDOM_2_2_1_TIMING_ADJUSTABLE",
  title: "Time limit may not be adjustable",
  severity: "warning",
  confidence: "low",
  category: "forms",
  wcag: ["2.2.1"],
  standards: [
    { version: "wcag20", criterion: "2.2.1", level: "a", title: "Timing Adjustable" },
    { version: "wcag21", criterion: "2.2.1", level: "a", title: "Timing Adjustable" },
    { version: "wcag22", criterion: "2.2.1", level: "a", title: "Timing Adjustable" },
    { version: "wcag30", criterion: "time-limits", title: "Time limits are controllable" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Time limits usually need a way to turn off, adjust, or extend the limit.",
  guidance: "Provide controls to extend, disable, or adjust session and task timers unless the time limit is essential.",
  examples: [
    { label: "Extend session", code: '<button type="button">Extend session</button>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => timingPattern.test(textOf(element, context)) || hasRiskyTimerHandler(element, context))
      .filter((element) => !timerMitigationPattern.test(textOf(element, context)))
      .map((element) => context.createFinding(this, element, "Provide a way to turn off, adjust, or extend this time limit."));
  }
};

export const pauseStopHideRule: RuleDefinition = {
  id: "CDOM_2_2_2_PAUSE_STOP_HIDE",
  title: "Moving or auto-updating content may lack pause controls",
  severity: "warning",
  confidence: "medium",
  category: "readability",
  wcag: ["2.2.2"],
  standards: [
    { version: "wcag20", criterion: "2.2.2", level: "a", title: "Pause, Stop, Hide" },
    { version: "wcag21", criterion: "2.2.2", level: "a", title: "Pause, Stop, Hide" },
    { version: "wcag22", criterion: "2.2.2", level: "a", title: "Pause, Stop, Hide" },
    { version: "wcag30", criterion: "moving-content", title: "Moving content is controllable" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Moving, blinking, scrolling, or auto-updating content needs a way to pause, stop, or hide it.",
  guidance: "Add pause/stop controls for carousels, marquees, tickers, loaders, and auto-updating regions.",
  examples: [
    { label: "Pausable ticker", code: '<section aria-label="News ticker"><button>Pause</button></section>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => element.tagName.toLowerCase() === "marquee" || movingContentPattern.test(elementSignal(element, context)))
      .filter((element) => !hasNearbyControl(element, context) && !pauseCopyPattern.test(textOf(element, context)))
      .map((element) => context.createFinding(this, element, "Add a visible pause, stop, or hide control for moving or auto-updating content."));
  }
};

export const flashingContentRule: RuleDefinition = {
  id: "CDOM_2_3_1_FLASHING_CONTENT",
  title: "Flashing content may exceed seizure thresholds",
  severity: "critical",
  confidence: "low",
  category: "readability",
  wcag: ["2.3.1"],
  standards: [
    { version: "wcag20", criterion: "2.3.1", level: "a", title: "Three Flashes or Below Threshold" },
    { version: "wcag21", criterion: "2.3.1", level: "a", title: "Three Flashes or Below Threshold" },
    { version: "wcag22", criterion: "2.3.1", level: "a", title: "Three Flashes or Below Threshold" },
    { version: "wcag30", criterion: "flashing", title: "Flashing content is safe" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Rapid flashing can trigger seizures and should be avoided or measured against thresholds.",
  guidance: "Remove rapid flashing/strobing effects or verify they stay below WCAG flash thresholds.",
  examples: [
    { label: "No flashing", code: '<div className="steady-alert">Alert</div>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => flashingPattern.test(elementSignal(element, context)))
      .map((element) => context.createFinding(this, element, "Avoid rapid flashing/strobing content or verify it stays below WCAG thresholds."));
  }
};

export const pointerGesturesRule: RuleDefinition = {
  id: "CDOM_2_5_1_POINTER_GESTURES",
  title: "Path or multipoint gesture may lack a simple pointer alternative",
  severity: "warning",
  confidence: "low",
  category: "keyboard",
  wcag: ["2.5.1"],
  standards: [
    { version: "wcag21", criterion: "2.5.1", level: "a", title: "Pointer Gestures" },
    { version: "wcag22", criterion: "2.5.1", level: "a", title: "Pointer Gestures" },
    { version: "wcag30", criterion: "pointer-gestures", title: "Pointer gestures have alternatives" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Path-based or multipoint gestures need a single-pointer alternative unless the gesture is essential.",
  guidance: "Provide buttons or simple click/tap controls for pinch, swipe, freehand path, or multi-touch gestures.",
  examples: [
    { label: "Button alternative", code: '<button type="button">Zoom in</button>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => pointerGesturePattern.test(elementSignal(element, context)))
      .filter((element) => !hasPositiveAlternativeText(element, context) && !hasNearbyControl(element, context))
      .map((element) => context.createFinding(this, element, "Provide a single-pointer alternative for path-based or multipoint gestures."));
  }
};

export const motionActuationRule: RuleDefinition = {
  id: "CDOM_2_5_4_MOTION_ACTUATION",
  title: "Device motion may be required without an alternative",
  severity: "warning",
  confidence: "low",
  category: "keyboard",
  wcag: ["2.5.4"],
  standards: [
    { version: "wcag21", criterion: "2.5.4", level: "a", title: "Motion Actuation" },
    { version: "wcag22", criterion: "2.5.4", level: "a", title: "Motion Actuation" },
    { version: "wcag30", criterion: "motion-actuation", title: "Motion input has alternatives" }
  ],
  platforms: ["web", "react-native-ios", "react-native-android"],
  fixable: false,
  summary: "Functionality triggered by shaking, tilting, or device motion needs a conventional input alternative.",
  guidance: "Provide buttons or controls for shake, tilt, rotate, or device-motion gestures, and allow motion activation to be disabled.",
  examples: [
    { label: "Button alternative", code: '<button type="button">Undo</button>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => motionActuationPattern.test(elementSignal(element, context)))
      .filter((element) => !hasPositiveAlternativeText(element, context) && !hasNearbyControl(element, context))
      .map((element) => context.createFinding(this, element, "Provide a conventional control alternative for device-motion activation."));
  }
};

export const draggingMovementsRule: RuleDefinition = {
  id: "CDOM_2_5_7_DRAGGING_MOVEMENTS",
  title: "Dragging movement may lack a non-drag alternative",
  severity: "warning",
  confidence: "medium",
  category: "keyboard",
  wcag: ["2.5.7"],
  standards: [
    { version: "wcag22", criterion: "2.5.7", level: "aa", title: "Dragging Movements" },
    { version: "wcag30", criterion: "dragging", title: "Dragging has alternatives" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Dragging interactions need a non-drag alternative unless dragging is essential.",
  guidance: "Provide buttons, menus, or keyboard controls to reorder, move, resize, or adjust items without dragging.",
  examples: [
    { label: "Move button", code: '<button type="button">Move item up</button>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => hasDragSignal(element, context))
      .filter((element) => !hasPositiveAlternativeText(element, context) && !hasNearbyControl(element, context))
      .map((element) => context.createFinding(this, element, "Provide a non-drag alternative for dragging interactions."));
  }
};

function textOf(element: JsxElement, context: RuleContext): string {
  return normalize(context.elementText(element)).toLowerCase();
}

function elementSignal(element: JsxElement, context: RuleContext): string {
  return [
    element.tagName,
    textOf(element, context),
    staticAttributeValue(element, context, "className"),
    staticAttributeValue(element, context, "class"),
    staticAttributeValue(element, context, "id"),
    staticAttributeValue(element, context, "style"),
    staticAttributeValue(element, context, "aria-label")
  ].filter(Boolean).join(" ").toLowerCase();
}

function hasNearbyControl(element: JsxElement, context: RuleContext): boolean {
  const parent = context.parentOf(element);
  const candidateIds = [element.id, ...(parent?.childIds ?? [])];
  return candidateIds
    .map((id) => context.elements[id])
    .filter((candidate): candidate is JsxElement => Boolean(candidate))
    .some((candidate) => {
      if (candidate.id === element.id) return false;
      const tag = candidate.tagName.toLowerCase();
      const text = textOf(candidate, context);
      return (tag === "button" || tag === "input") && /\b(pause|stop|mute|hide|extend|disable|alternative|move|undo|zoom|next|previous|up|down)\b/.test(text);
    });
}

function hasSingleCharacterShortcut(element: JsxElement, context: RuleContext): boolean {
  const handler = ["onKeyDown", "onKeyUp", "onKeyPress"].map((name) => context.getAttribute(element, name)).find(Boolean);
  if (typeof handler?.value !== "string") return false;
  const value = handler.value;
  if (/\b(ctrlKey|altKey|metaKey)\b/.test(value)) return false;
  return /\b(?:event|e)\.key\s*={2,3}\s*["'`][a-z0-9]["'`]/i.test(value)
    || /\bkey\s*:\s*["'`][a-z0-9]["'`]/i.test(value);
}

function hasRiskyTimerHandler(element: JsxElement, context: RuleContext): boolean {
  const signal = ["onLoad", "onMount", "useEffect", "onClick"].map((name) => context.getAttribute(element, name)?.value).join(" ");
  return typeof signal === "string" && /\b(setTimeout|setInterval)\s*\(/.test(signal) && /\b(logout|expire|submit|navigate|redirect|location)\b/i.test(signal);
}

function hasDragSignal(element: JsxElement, context: RuleContext): boolean {
  return context.hasAttribute(element, "draggable")
    || context.hasAttribute(element, "onDragStart")
    || context.hasAttribute(element, "onDrag")
    || draggingPattern.test(elementSignal(element, context));
}

function hasPositiveAlternativeText(element: JsxElement, context: RuleContext): boolean {
  const text = textOf(element, context);
  return !negativeAlternativePattern.test(text) && alternativePattern.test(text);
}

function hasPositiveShortcutMitigationText(element: JsxElement, context: RuleContext): boolean {
  const text = textOf(element, context);
  return !negativeShortcutMitigationPattern.test(text) && shortcutMitigationPattern.test(text);
}

const orientationRestrictionPattern = /\b(only|must|required|requires|locked|works)\b.{0,40}\b(portrait|landscape)\b|\b(portrait|landscape)\b.{0,40}\b(only|must|required|requires|locked)\b/;
const shortcutCopyPattern = /\bsingle[- ]?(key|character)\s+shortcut\b|\bpress (?:the )?(?:letter |key )?["']?[a-z0-9]["']?\b.*\b(shortcut|submit|save|open|close|delete|send)\b|\b(shortcut|submit|save|open|close|delete|send)\b.*\bpress (?:the )?(?:letter |key )?["']?[a-z0-9]["']?\b/i;
const shortcutMitigationPattern = /\b(disable|turn off|remap|modifier|ctrl|control|alt|option|meta|command)\b/;
const negativeShortcutMitigationPattern = /\b(no|without|lacks?|missing)\b.{0,32}\b(disable|turn off|remap|modifier|ctrl|control|alt|option|meta|command)\b/;
const timingPattern = /\b(session|task|form|checkout|page|timer|time limit)\b.*\b(expires?|timeout|times? out|seconds?|minutes?)\b|\b(expires?|timeout|times? out)\b.*\b(seconds?|minutes?)\b/;
const timerMitigationPattern = /\b(extend|disable|turn off|adjust|pause|more time|no time limit)\b/;
const movingContentPattern = /\b(marquee|ticker|carousel|auto[- ]?(advance|rotate|scroll|update)|moving|scrolling|blinking|animated)\b/;
const pauseCopyPattern = /\b(pause|stop|hide)\b/;
const flashingPattern = /\b(flash|flashing|strobe|strobing|blink|blinking|seizure)\b/;
const pointerGesturePattern = /\b(pinch|zoom gesture|two[- ]finger|multi[- ]touch|swipe|path|draw|drawing|freehand|canvas)\b/;
const motionActuationPattern = /\b(shake|tilt|rotate device|device motion|motion actuation|accelerometer|gyroscope)\b/;
const draggingPattern = /\b(drag|dragging|drop|sortable|reorder|resize handle|slider thumb)\b/;
const alternativePattern = /\b(alternative|button|keyboard|single[- ]pointer|non[- ]drag|without dragging|also use|or click|or tap)\b/;
const negativeAlternativePattern = /\b(no|without|lacks?|missing)\b.{0,24}\b(alternative|button|keyboard|single[- ]pointer|non[- ]drag)\b/;
