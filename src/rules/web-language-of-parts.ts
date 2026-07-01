import { normalize, staticAttributeValue } from "../rule-utils.js";
import type { JsxElement, RuleContext, RuleDefinition } from "../types.js";

export const languageOfPartsRule: RuleDefinition = {
  id: "CDOM029",
  title: "Foreign-language text is not marked with lang",
  severity: "warning",
  confidence: "medium",
  category: "structure",
  wcag: ["3.1.2"],
  standards: [
    { version: "wcag20", criterion: "3.1.2", level: "aa", title: "Language of Parts" },
    { version: "wcag21", criterion: "3.1.2", level: "aa", title: "Language of Parts" },
    { version: "wcag22", criterion: "3.1.2", level: "aa", title: "Language of Parts" },
    { version: "wcag30", criterion: "clear-language", title: "Language can be determined" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Assistive technologies need language changes marked so pronunciation and braille output can switch correctly.",
  guidance: "Wrap foreign-language passages in an element with an appropriate lang attribute, such as lang=\"fr\" or lang=\"es\".",
  examples: [
    { label: "Marked phrase", code: '<p>Receipt status: <span lang="fr">Votre reçu est prêt.</span></p>' }
  ],
  check(context) {
    return context.elements
      .filter((element) => looksLikeForeignLanguage(textOwnedByElement(element, context)))
      .filter((element) => !hasLanguageInAncestry(element, context))
      .map((element) => context.createFinding(this, element, "Mark the language change with a lang attribute on this text or a containing element."));
  }
};

function textOwnedByElement(element: JsxElement, context: RuleContext): string {
  if (element.ownText.trim()) return element.ownText;
  return element.childIds.length === 0 ? context.elementText(element) : "";
}

function looksLikeForeignLanguage(text: string): boolean {
  const value = normalize(text).toLowerCase();
  return /[àâçéèêëîïôûùüÿñ¿¡]/.test(value)
    || /\b(bonjour|merci|votre|reçu|prêt|hola|adiós|gracias|señor|señora)\b/.test(value);
}

function hasLanguageInAncestry(element: JsxElement, context: RuleContext): boolean {
  let current: JsxElement | undefined = element;
  while (current) {
    if (staticAttributeValue(current, context, "lang")?.trim() || staticAttributeValue(current, context, "xml:lang")?.trim()) {
      return true;
    }
    current = context.parentOf(current);
  }
  return false;
}
