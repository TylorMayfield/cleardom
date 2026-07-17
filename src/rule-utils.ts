import type { ComponentMapping, JsxElement, RuleContext } from "./types.js";

export type EvidenceResolution = "present" | "absent" | "unresolved";
export type AttributeEvidence = "non-empty" | "empty" | "missing" | "unresolved";

export const ambiguousLabels = new Set([
  "click here",
  "here",
  "more",
  "learn more",
  "submit",
  "next"
]);

export function isReactNativeTouchControl(tagName: string): boolean {
  return ["Pressable", "TouchableOpacity", "TouchableHighlight", "TouchableWithoutFeedback"].includes(tagName);
}

export function isNativeInteractive(tagName: string): boolean {
  return ["button", "a", "input", "select", "textarea"].includes(tagName.toLowerCase());
}

export function isFrameworkLink(element: JsxElement, context: RuleContext): boolean {
  const tag = element.tagName.split(".").at(-1) ?? element.tagName;
  if (tag !== "Link") return false;
  if (!["next/link", "gatsby", "@remix-run/react", "react-router", "react-router-dom"].includes(element.importSource ?? "")) return false;
  return context.hasAttribute(element, "href") || context.hasAttribute(element, "to");
}

export function hasClickHandler(element: JsxElement, context: RuleContext): boolean {
  return [
    "onClick",
    "@click",
    "v-on:click",
    "(click)",
    "on:click"
  ].some((name) => context.hasAttribute(element, name));
}

export function isWebInteractive(element: JsxElement, context: RuleContext): boolean {
  if (isDisabled(element, context)) return false;
  const tag = element.tagName;
  const role = elementRole(element, context);
  return ["button", "a"].includes(tag)
    || isFrameworkLink(element, context)
    || ["button", "link", "menuitem", "tab", "switch", "checkbox", "radio"].includes(role ?? "");
}

export function hasAccessibleName(element: JsxElement, context: RuleContext): boolean {
  return accessibleNameEvidence(element, context) === "present";
}

export function accessibleNameEvidence(element: JsxElement, context: RuleContext): EvidenceResolution {
  let unresolved = false;
  for (const prop of componentNameProps(element, context)) {
    const evidence = attributeEvidence(element, context, prop);
    if (evidence === "non-empty") return "present";
    if (evidence === "unresolved") unresolved = true;
  }

  for (const name of ["aria-label", "accessibilityLabel", "title"]) {
    const evidence = attributeEvidence(element, context, name);
    if (evidence === "non-empty") return "present";
    if (evidence === "unresolved") unresolved = true;
  }

  const labelledByEvidence = attributeEvidence(element, context, "aria-labelledby");
  if (labelledByEvidence === "unresolved") unresolved = true;
  if (labelledByEvidence === "non-empty") {
    const labelledBy = staticAttributeValue(element, context, "aria-labelledby") ?? "";
    const matches = labelledBy.split(/\s+/).map((id) => context.findById(id)).filter((match): match is JsxElement => Boolean(match));
    if (matches.length === 0) return "present";
    if (matches.some((match) => elementTextEvidence(match, context) === "present")) return "present";
    if (matches.some((match) => elementTextEvidence(match, context) === "unresolved")) unresolved = true;
  }

  for (const label of context.labelsFor(element)) {
    const evidence = elementTextEvidence(label, context);
    if (evidence === "present") return "present";
    if (evidence === "unresolved") unresolved = true;
  }

  const parent = context.parentOf(element);
  if (parent?.tagName === "label") {
    const evidence = elementTextEvidence(parent, context);
    if (evidence === "present") return "present";
    if (evidence === "unresolved") unresolved = true;
  }

  const content = elementTextEvidence(element, context);
  if (content === "present") return "present";
  if (content === "unresolved") unresolved = true;
  return unresolved ? "unresolved" : "absent";
}

export function accessibleName(element: JsxElement, context: RuleContext): string {
  for (const prop of componentNameProps(element, context)) {
    const value = staticAttributeValue(element, context, prop);
    if (value?.trim()) return normalize(value);
  }

  const ariaLabel = staticAttributeValue(element, context, "aria-label");
  if (ariaLabel?.trim()) return normalize(ariaLabel);

  const accessibilityLabel = staticAttributeValue(element, context, "accessibilityLabel");
  if (accessibilityLabel?.trim()) return normalize(accessibilityLabel);

  const labelledBy = staticAttributeValue(element, context, "aria-labelledby");
  if (labelledBy?.trim()) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => context.findById(id))
      .filter((match): match is JsxElement => Boolean(match))
      .map((match) => context.elementText(match))
      .join(" ");
    if (normalize(text)) return normalize(text);
    return "labelledby";
  }

  const title = staticAttributeValue(element, context, "title");
  if (title?.trim()) return normalize(title);

  const explicitLabels = context.labelsFor(element).map((label) => context.elementText(label)).join(" ");
  if (normalize(explicitLabels)) return normalize(explicitLabels);

  const parent = context.parentOf(element);
  if (parent?.tagName.toLowerCase() === "label" && normalize(context.elementText(parent))) {
    return normalize(context.elementText(parent));
  }

  return normalize(context.elementText(element));
}

export function visibleLabel(element: JsxElement, context: RuleContext): string {
  for (const prop of componentVisibleLabelProps(element, context)) {
    const value = staticAttributeValue(element, context, prop);
    if (value?.trim()) return normalize(value);
  }

  const explicitLabels = context.labelsFor(element).map((label) => context.elementText(label)).join(" ");
  if (normalize(explicitLabels)) return normalize(explicitLabels);

  const parent = context.parentOf(element);
  if (parent?.tagName.toLowerCase() === "label" && normalize(context.elementText(parent))) {
    return normalize(context.elementText(parent));
  }

  return normalize(context.elementText(element));
}

export function elementRole(element: JsxElement, context: RuleContext): string | undefined {
  const mapping = componentMapping(element, context);
  const configured = mapping?.role;
  for (const prop of mapping?.roleProps ?? []) {
    const role = staticAttributeValue(element, context, prop)?.toLowerCase();
    if (role) return role;
  }
  const polymorphic = staticAttributeValue(element, context, mapping?.asProp ?? "as")?.toLowerCase();
  if (polymorphic === "button") return "button";
  if (polymorphic === "a") return "link";
  if (polymorphic === "input" || polymorphic === "textarea") return "textbox";
  return configured
    ?? staticAttributeValue(element, context, "accessibilityRole")?.toLowerCase()
    ?? staticAttributeValue(element, context, "role")?.toLowerCase();
}

export function staticAttributeValue(element: JsxElement, context: RuleContext, name: string): string | undefined {
  const attribute = attributeWithAliases(element, context, name);
  if (!attribute || typeof attribute.value !== "string") return undefined;
  if (attribute.kind === "static") return attribute.value;
  if (attribute.kind === "expression") return expressionStaticValue(attribute.value);
  return undefined;
}

export function attributeEvidence(element: JsxElement, context: RuleContext, name: string): AttributeEvidence {
  const attribute = attributeWithAliases(element, context, name);
  if (!attribute) return "missing";
  if (attribute.kind === "boolean") return "empty";
  const value = staticAttributeValue(element, context, name);
  if (value === undefined) return "unresolved";
  return value.trim() ? "non-empty" : "empty";
}

export function hasFormLabel(element: JsxElement, context: RuleContext): boolean {
  return formLabelEvidence(element, context) === "present";
}

export function formLabelEvidence(element: JsxElement, context: RuleContext): EvidenceResolution {
  let unresolved = false;
  for (const prop of componentFormLabelProps(element, context)) {
    const evidence = attributeEvidence(element, context, prop);
    if (evidence === "non-empty") return "present";
    if (evidence === "unresolved") unresolved = true;
  }

  const ariaLabel = attributeEvidence(element, context, "aria-label");
  if (ariaLabel === "non-empty") return "present";
  if (ariaLabel === "unresolved") unresolved = true;

  const labelledByEvidence = attributeEvidence(element, context, "aria-labelledby");
  if (labelledByEvidence === "unresolved") unresolved = true;
  const labelledBy = staticAttributeValue(element, context, "aria-labelledby");
  if (labelledBy?.trim()) {
    const matches = labelledBy
      .split(/\s+/)
      .map((id) => context.findById(id))
      .filter((match): match is JsxElement => Boolean(match));
    if (matches.some((match) => elementTextEvidence(match, context) === "present")) return "present";
    if (matches.length === 0 || matches.some((match) => elementTextEvidence(match, context) === "unresolved")) unresolved = true;
  }

  const title = attributeEvidence(element, context, "title");
  if (title === "non-empty") return "present";
  if (title === "unresolved") unresolved = true;
  for (const label of context.labelsFor(element)) {
    const evidence = elementTextEvidence(label, context);
    if (evidence === "present") return "present";
    if (evidence === "unresolved") unresolved = true;
  }
  if (componentWrapperLabels(element, context).some((label) => label.length > 0)) return "present";

  const parent = context.parentOf(element);
  if (parent?.tagName === "label") {
    const evidence = elementTextEvidence(parent, context);
    if (evidence === "present") return "present";
    if (evidence === "unresolved") unresolved = true;
  }
  return unresolved ? "unresolved" : "absent";
}

export function isIntrinsicElement(element: JsxElement, ...names: string[]): boolean {
  return names.includes(element.tagName);
}

export function isProvenHidden(element: JsxElement, context: RuleContext): boolean {
  if (context.hasAttribute(element, "hidden") || context.hasAttribute(element, "inert")) return true;
  if (staticAttributeValue(element, context, "aria-hidden") === "true") return true;
  if (element.tagName === "input" && staticAttributeValue(element, context, "type")?.toLowerCase() === "hidden") return true;
  const style = staticAttributeValue(element, context, "style") ?? "";
  if (/(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\s*(?:;|$)/i.test(style)) return true;
  const className = staticAttributeValue(element, context, "class") ?? staticAttributeValue(element, context, "className");
  if (!className) return false;
  return className.split(/\s+/).filter(Boolean).some((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rule = new RegExp(`\\.${escaped}\\s*\\{[^}]*?(?:display\\s*:\\s*none|visibility\\s*:\\s*hidden)`, "i");
    return rule.test(context.source);
  });
}

function elementTextEvidence(element: JsxElement, context: RuleContext): EvidenceResolution {
  if (staticAttributeValue(element, context, "aria-hidden") === "true") return "absent";
  if (normalize(element.ownText)) return "present";
  let unresolved = Boolean(element.dynamicText);
  for (const childId of element.childIds) {
    const child = context.elements[childId];
    if (!child) continue;
    if (child.tagName === "img") {
      const alt = attributeEvidence(child, context, "alt");
      if (alt === "non-empty") return "present";
      if (alt === "unresolved") unresolved = true;
      continue;
    }
    const childEvidence = elementTextEvidence(child, context);
    if (childEvidence === "present") return "present";
    if (childEvidence === "unresolved") unresolved = true;
  }
  return unresolved ? "unresolved" : "absent";
}

export function isDisabled(element: JsxElement, context: RuleContext): boolean {
  if (context.hasAttribute(element, "disabled")) return true;
  if (staticAttributeValue(element, context, "aria-disabled") === "true") return true;
  if (staticAttributeValue(element, context, "accessibilityState")?.includes("disabled")) return true;

  const mapping = componentMapping(element, context);
  return (mapping?.disabledProps ?? []).some((prop) => {
    if (context.hasAttribute(element, prop)) return true;
    return staticAttributeValue(element, context, prop) === "true";
  });
}

export function hasKeyboardSupport(element: JsxElement, context: RuleContext): boolean {
  return context.hasAttribute(element, "onKeyDown")
    || context.hasAttribute(element, "onKeyUp")
    || context.hasAttribute(element, "onKeyPress")
    || context.hasAttribute(element, "@keydown")
    || context.hasAttribute(element, "v-on:keydown")
    || context.hasAttribute(element, "(keydown)")
    || context.hasAttribute(element, "on:keydown");
}

export function hasTabStop(element: JsxElement, context: RuleContext): boolean {
  return context.hasAttribute(element, "tabIndex") || context.hasAttribute(element, "tabindex") || context.hasAttribute(element, "[tabindex]");
}

export function isAriaHidden(element: JsxElement, context: RuleContext): boolean {
  return staticAttributeValue(element, context, "aria-hidden") === "true";
}

export function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function componentNameProps(element: JsxElement, context: RuleContext): string[] {
  const mapping = componentMapping(element, context);
  return [
    ...(mapping?.nameProps ?? []),
    ...(mapping?.valueProps ?? []),
    ...(mapping?.labelProps ?? []),
    ...(mapping?.childLabelProps ?? [])
  ];
}

function componentFormLabelProps(element: JsxElement, context: RuleContext): string[] {
  return componentNameProps(element, context).filter((prop) => !/placeholder/i.test(prop));
}

function componentVisibleLabelProps(element: JsxElement, context: RuleContext): string[] {
  const mapping = componentMapping(element, context);
  return [...(mapping?.labelProps ?? []), ...(mapping?.childLabelProps ?? [])];
}

function componentWrapperLabels(element: JsxElement, context: RuleContext): string[] {
  const labels: string[] = [];
  let current = context.parentOf(element);

  while (current) {
    const mapping = componentMapping(current, context);
    if (mapping?.wrapper) {
      for (const prop of [...(mapping.labelProps ?? []), ...(mapping.childLabelProps ?? []), ...(mapping.nameProps ?? [])]) {
        const value = staticAttributeValue(current, context, prop);
        if (value?.trim()) labels.push(normalize(value));
      }
      const text = normalize(context.elementText(current));
      if (text) labels.push(text);
    }
    current = context.parentOf(current);
  }

  return labels;
}

function componentMapping(element: JsxElement, context: RuleContext): ComponentMapping | undefined {
  const componentName = element.tagName.split(".").at(-1) ?? element.tagName;
  const normalizedName = normalizeComponentName(componentName);
  const mapping = context.options.components[element.tagName]
    ?? context.options.components[componentName]
    ?? Object.entries(context.options.components).find(([name]) => normalizeComponentName(name) === normalizedName)?.[1];
  if (!mapping) return undefined;
  const sources = typeof mapping.importSource === "string" ? [mapping.importSource] : mapping.importSource;
  if (!sources || sources.length === 0) return mapping;
  if (!element.importSource) return mapping;
  return element.importSource && sources.includes(element.importSource) ? mapping : undefined;
}

function normalizeComponentName(value: string): string {
  return value.replace(/[-_:]/g, "").toLowerCase();
}

function attributeWithAliases(element: JsxElement, context: RuleContext, name: string) {
  return context.getAttribute(element, name)
    ?? context.getAttribute(element, `attr.${name}`)
    ?? context.getAttribute(element, `:${name}`)
    ?? context.getAttribute(element, `v-bind:${name}`)
    ?? context.getAttribute(element, `[${name}]`)
    ?? context.getAttribute(element, `[attr.${name}]`);
}

function expressionStaticValue(value: string): string | undefined {
  const trimmed = value.trim();
  const literal = trimmed.match(/^["'`]([^"'`{}]+)["'`]$/);
  if (literal) return literal[1];
  const conditional = trimmed.match(/^[\w$.()[\]\s?!:=&|+-]+?\?\s*(["'`])([^"'`{}]+)\1\s*:\s*(["'`])([^"'`{}]+)\3$/);
  if (conditional && conditional[2].trim() && conditional[4].trim()) {
    return `${conditional[2]} ${conditional[4]}`;
  }
  return undefined;
}
