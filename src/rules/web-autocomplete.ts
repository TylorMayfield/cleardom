import { staticAttributeValue, visibleLabel } from "../rule-utils.js";
import type { JsxElement, RuleContext, RuleDefinition } from "../types.js";

const purposeTokens: Array<{ token: string; signals: string[] }> = [
  { token: "name", signals: ["full name", "name"] },
  { token: "given-name", signals: ["first name", "given name"] },
  { token: "family-name", signals: ["last name", "surname", "family name"] },
  { token: "email", signals: ["email", "e-mail"] },
  { token: "tel", signals: ["phone", "telephone", "mobile"] },
  { token: "street-address", signals: ["address", "street"] },
  { token: "postal-code", signals: ["zip", "postal"] },
  { token: "country", signals: ["country"] },
  { token: "username", signals: ["username", "user name"] },
  { token: "current-password", signals: ["password"] }
];

export const autocompleteRule: RuleDefinition = {
  id: "CDOM012",
  title: "Personal information input is missing autocomplete",
  severity: "warning",
  confidence: "medium",
  category: "forms",
  wcag: ["1.3.5"],
  standards: [
    { version: "wcag21", criterion: "1.3.5", level: "aa", title: "Identify Input Purpose" },
    { version: "wcag22", criterion: "1.3.5", level: "aa", title: "Identify Input Purpose" },
    { version: "wcag30", criterion: "input-purpose", title: "Input purpose is available programmatically" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Fields that collect common personal information should expose their purpose with autocomplete tokens.",
  guidance: "Add the appropriate autocomplete token, such as email, name, given-name, family-name, tel, street-address, postal-code, username, or current-password.",
  examples: [
    { label: "Email purpose", code: '<label htmlFor="email">Email</label><input id="email" name="email" autocomplete="email" />' },
    { label: "Name purpose", code: '<label htmlFor="firstName">First name</label><input id="firstName" name="firstName" autocomplete="given-name" />' }
  ],
  check(context) {
    return context.elements
      .filter((element) => isAutocompleteCandidate(element, context))
      .flatMap((element) => {
        const expected = expectedAutocompleteToken(element, context);
        if (!expected || hasAutocompleteToken(element, context, expected)) return [];
        return [context.createFinding(this, element, `Add autocomplete="${expected}" or another valid purpose token for this personal information field.`)];
      });
  }
};

function isAutocompleteCandidate(element: JsxElement, context: RuleContext): boolean {
  const tag = element.tagName.toLowerCase();
  if (tag !== "input" && tag !== "select" && tag !== "textarea") return false;
  const type = staticAttributeValue(element, context, "type")?.toLowerCase() ?? "text";
  return !["hidden", "button", "submit", "reset", "checkbox", "radio", "file"].includes(type);
}

function expectedAutocompleteToken(element: JsxElement, context: RuleContext): string | undefined {
  const text = [
    staticAttributeValue(element, context, "name"),
    staticAttributeValue(element, context, "id"),
    staticAttributeValue(element, context, "placeholder"),
    staticAttributeValue(element, context, "type"),
    visibleLabel(element, context)
  ].filter(Boolean).join(" ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

  return purposeTokens.find(({ signals }) => signals.some((signal) => text.includes(signal)))?.token;
}

function hasAutocompleteToken(element: JsxElement, context: RuleContext, expected: string): boolean {
  const autocomplete = staticAttributeValue(element, context, "autocomplete")?.toLowerCase();
  if (!autocomplete) return false;
  const tokens = autocomplete.split(/\s+/);
  return tokens.includes(expected) || tokens.includes("on");
}
