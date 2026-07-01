import { staticAttributeValue } from "../rule-utils.js";
import type { JsxElement, RuleContext, RuleDefinition } from "../types.js";

const statusSignals = [
  "status",
  "toast",
  "notification",
  "alert",
  "error",
  "success",
  "loading",
  "saved",
  "updated",
  "submitted"
];

export const statusLiveRegionRule: RuleDefinition = {
  id: "CDOM014",
  title: "Status message is not exposed as a live region",
  severity: "warning",
  confidence: "medium",
  category: "structure",
  wcag: ["4.1.3"],
  standards: [
    { version: "wcag21", criterion: "4.1.3", level: "aa", title: "Status Messages" },
    { version: "wcag22", criterion: "4.1.3", level: "aa", title: "Status Messages" },
    { version: "wcag30", criterion: "status-messages", title: "Status changes are announced" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Status, toast, and update messages need live-region semantics when they change without moving focus.",
  guidance: "Use role=\"status\", role=\"alert\", role=\"log\", or aria-live=\"polite\"/\"assertive\" on dynamic status containers.",
  examples: [
    { label: "Status region", code: '<div role="status">Saved</div>' },
    { label: "Alert region", code: '<p role="alert">Payment failed</p>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => looksLikeStatusMessage(element, context))
      .filter((element) => !hasLiveRegionSemantics(element, context))
      .map((element) => context.createFinding(this, element, "Expose this status message with role=\"status\", role=\"alert\", or aria-live."));
  }
};

function looksLikeStatusMessage(element: JsxElement, context: RuleContext): boolean {
  const tag = element.tagName.toLowerCase();
  if (["input", "select", "textarea", "button", "a", "label", "option"].includes(tag)) return false;

  const className = staticAttributeValue(element, context, "className") ?? staticAttributeValue(element, context, "class") ?? "";
  const identity = [
    className,
    staticAttributeValue(element, context, "id"),
    staticAttributeValue(element, context, "data-testid"),
    staticAttributeValue(element, context, "data-test"),
    element.ownText
  ].filter(Boolean).join(" ").toLowerCase();

  return statusSignals.some((signal) => identity.includes(signal));
}

function hasLiveRegionSemantics(element: JsxElement, context: RuleContext): boolean {
  const role = staticAttributeValue(element, context, "role")?.toLowerCase();
  if (role === "status" || role === "alert" || role === "log") return true;
  const live = staticAttributeValue(element, context, "aria-live")?.toLowerCase();
  return live === "polite" || live === "assertive";
}
