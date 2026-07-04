import type { ComponentMapping, JsxElement, RuleContext } from "./types.js";

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
  const tag = element.tagName.toLowerCase();
  const role = elementRole(element, context);
  return ["button", "a"].includes(tag)
    || ["button", "link", "menuitem", "tab", "switch", "checkbox", "radio"].includes(role ?? "");
}

export function hasAccessibleName(element: JsxElement, context: RuleContext): boolean {
  return Boolean(accessibleName(element, context));
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

export function hasFormLabel(element: JsxElement, context: RuleContext): boolean {
  for (const prop of componentNameProps(element, context)) {
    const value = staticAttributeValue(element, context, prop);
    if (value?.trim()) return true;
  }

  if (staticAttributeValue(element, context, "aria-label")?.trim()) return true;

  const labelledBy = staticAttributeValue(element, context, "aria-labelledby");
  if (labelledBy?.trim()) {
    return labelledBy
      .split(/\s+/)
      .map((id) => context.findById(id))
      .some((match) => match && normalize(context.elementText(match)));
  }

  if (staticAttributeValue(element, context, "title")?.trim()) return true;
  if (context.labelsFor(element).some((label) => normalize(context.elementText(label)))) return true;
  if (componentWrapperLabels(element, context).some((label) => label.length > 0)) return true;

  const parent = context.parentOf(element);
  return parent?.tagName.toLowerCase() === "label" && normalize(context.elementText(parent)).length > 0;
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
  const mapping = context.options.components[element.tagName] ?? context.options.components[element.tagName.split(".").at(-1) ?? element.tagName];
  if (!mapping) return undefined;
  const sources = typeof mapping.importSource === "string" ? [mapping.importSource] : mapping.importSource;
  if (!sources || sources.length === 0) return mapping;
  if (!element.importSource) return mapping;
  return element.importSource && sources.includes(element.importSource) ? mapping : undefined;
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
  return undefined;
}
