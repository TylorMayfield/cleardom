import type { RuleDefinition } from "../types.js";

export const pointerCancellationRule: RuleDefinition = {
  id: "CDOM021",
  title: "Pointer action may fire before cancellation is possible",
  severity: "warning",
  confidence: "medium",
  category: "keyboard",
  wcag: ["2.5.2"],
  standards: [
    { version: "wcag21", criterion: "2.5.2", level: "a", title: "Pointer Cancellation" },
    { version: "wcag22", criterion: "2.5.2", level: "a", title: "Pointer Cancellation" },
    { version: "wcag30", criterion: "input-cancellation", title: "Input can be cancelled before activation" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Actions bound to down/start events can trigger before users have a chance to cancel an accidental pointer action.",
  guidance: "Prefer click/up/end activation, or provide a clear cancellation/undo path when an action starts on pointer down.",
  examples: [
    { label: "Safer activation", code: '<button onClick={confirmPurchase}>Buy now</button>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => context.hasAttribute(element, "onMouseDown") || context.hasAttribute(element, "onPointerDown") || context.hasAttribute(element, "onTouchStart"))
      .filter((element) => !context.hasAttribute(element, "onMouseUp") && !context.hasAttribute(element, "onPointerUp") && !context.hasAttribute(element, "onTouchEnd"))
      .map((element) => context.createFinding(this, element, "Avoid activating important actions on pointer-down/start events without a cancellation path."));
  }
};
