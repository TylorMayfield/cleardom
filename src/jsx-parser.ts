import type { JsxAttribute, JsxElement } from "./types.js";

type MutableElement = JsxElement & {
  textParts: string[];
};

const htmlVoidElements = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);

const rawTextElements = new Set(["script", "style"]);

export function parseJsx(source: string, importSourceText = source): JsxElement[] {
  const elements: MutableElement[] = [];
  const stack: MutableElement[] = [];
  const importSources = collectImportSources(importSourceText);
  let index = 0;

  while (index < source.length) {
    if (source.startsWith("<!--", index)) {
      index = skipUntil(source, index + 4, "-->");
      continue;
    }

    const char = source[index];
    if (char === "{") {
      const expressionEnd = readBalancedExpression(source, index);
      const expression = expressionText(source.slice(index + 1, expressionEnd - 1));
      appendText(stack, expression.text);
      if (expression.dynamic && stack.length > 0) stack[stack.length - 1].dynamicText = true;
      index = expressionEnd;
      continue;
    }

    if (char !== "<") {
      const next = source.indexOf("<", index);
      const end = next === -1 ? source.length : next;
      appendText(stack, source.slice(index, end));
      index = end;
      continue;
    }

    if (source.startsWith("</", index)) {
      const close = readClosingTag(source, index);
      popToMatchingTag(stack, close.tagName);
      index = close.end;
      continue;
    }

    if (!isElementStart(source, index)) {
      appendText(stack, "<");
      index += 1;
      continue;
    }

    const parsed = readOpeningElement(source, index);
    if (!parsed) {
      appendText(stack, "<");
      index += 1;
      continue;
    }

    const parent = stack[stack.length - 1];
    const position = lineAndColumn(source, index);
    const element: MutableElement = {
      id: elements.length,
      tagName: parsed.tagName,
      importSource: componentImportSource(importSources, parsed.tagName),
      attributes: parsed.attributes,
      parentId: parent?.id,
      childIds: [],
      ownText: "",
      textParts: [],
      selfClosing: parsed.selfClosing,
      start: index,
      end: parsed.end,
      line: position.line,
      column: position.column,
      excerpt: excerptAt(source, index)
    };

    elements.push(element);
    parent?.childIds.push(element.id);
    if (rawTextElements.has(element.tagName.toLowerCase()) && !element.selfClosing) {
      index = skipClosingRawTextElement(source, parsed.end, element.tagName);
      continue;
    }

    if (!element.selfClosing) {
      stack.push(element);
    }
    index = parsed.end;
  }

  for (const element of elements) {
    element.ownText = normalizeText(element.textParts.join(" "));
    delete (element as Partial<MutableElement>).textParts;
  }

  return elements;
}

function collectImportSources(source: string): Map<string, string> {
  const imports = new Map<string, string>();
  const importPattern = /(?:^|[;>\n])\s*import\s+(.+?)\s+from\s+["']([^"']+)["'];?/gm;
  let match: RegExpExecArray | null;

  while ((match = importPattern.exec(source)) !== null) {
    const specifier = match[1].trim();
    const sourceModule = match[2];
    const namedStart = specifier.indexOf("{");
    const namedEnd = specifier.lastIndexOf("}");
    const beforeNamed = namedStart === -1 ? specifier : specifier.slice(0, namedStart).replace(/,\s*$/, "").trim();

    if (beforeNamed && !beforeNamed.startsWith("*")) {
      imports.set(beforeNamed, sourceModule);
    }

    const namespace = specifier.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (namespace) {
      imports.set(namespace[1], sourceModule);
    }

    if (namedStart !== -1 && namedEnd !== -1 && namedEnd > namedStart) {
      const named = specifier.slice(namedStart + 1, namedEnd);
      for (const part of named.split(",")) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const alias = trimmed.match(/\bas\s+([A-Za-z_$][\w$]*)$/);
        imports.set(alias?.[1] ?? trimmed.split(/\s+/)[0], sourceModule);
      }
    }
  }

  return imports;
}

function componentImportName(tagName: string): string {
  return tagName.split(".")[0];
}

function componentImportSource(imports: Map<string, string>, tagName: string): string | undefined {
  const componentName = componentImportName(tagName);
  const exact = imports.get(componentName);
  if (exact) return exact;
  const normalized = componentName.replace(/[-_:]/g, "").toLowerCase();
  for (const [localName, source] of imports) {
    if (localName.replace(/[-_:]/g, "").toLowerCase() === normalized) return source;
  }
  return undefined;
}

function readOpeningElement(source: string, start: number): {
  tagName: string;
  attributes: JsxAttribute[];
  selfClosing: boolean;
  end: number;
} | undefined {
  let index = start + 1;
  let tagName = "Fragment";

  if (source[index] !== ">") {
    const tag = readTagName(source, index);
    if (!tag) return undefined;
    tagName = tag.value;
    index = tag.end;
  }

  const tagEnd = findTagEnd(source, index);
  if (tagEnd === -1) return undefined;

  const body = source.slice(index, tagEnd);
  const selfClosing = /\/\s*$/.test(body) || htmlVoidElements.has(tagName.toLowerCase());
  return {
    tagName,
    attributes: parseAttributes(body.replace(/\/\s*$/, "")),
    selfClosing,
    end: tagEnd + 1
  };
}

function readClosingTag(source: string, start: number): { tagName: string; end: number } {
  let index = start + 2;
  if (source[index] === ">") {
    return { tagName: "Fragment", end: index + 1 };
  }

  const tag = readTagName(source, index);
  index = tag?.end ?? index;
  const end = source.indexOf(">", index);
  return {
    tagName: tag?.value ?? "",
    end: end === -1 ? source.length : end + 1
  };
}

function parseAttributes(source: string): JsxAttribute[] {
  const attributes: JsxAttribute[] = [];
  let index = 0;

  while (index < source.length) {
    index = skipWhitespace(source, index);
    if (index >= source.length) break;

    const nameStart = index;
    while (index < source.length && /[\w:$@.[\]()*#-]/.test(source[index])) {
      index += 1;
    }

    const name = source.slice(nameStart, index);
    if (!name) {
      index += 1;
      continue;
    }

    index = skipWhitespace(source, index);
    if (source[index] !== "=") {
      attributes.push({ name, kind: "boolean", value: true });
      continue;
    }

    index = skipWhitespace(source, index + 1);
    const quote = source[index];
    if (quote === "\"" || quote === "'") {
      const valueStart = index + 1;
      const valueEnd = source.indexOf(quote, valueStart);
      const end = valueEnd === -1 ? source.length : valueEnd;
      attributes.push({ name, kind: "static", value: source.slice(valueStart, end) });
      index = valueEnd === -1 ? source.length : valueEnd + 1;
      continue;
    }

    if (quote === "{") {
      const expressionEnd = readBalancedExpression(source, index);
      attributes.push({ name, kind: "expression", value: source.slice(index + 1, expressionEnd - 1).trim() });
      index = expressionEnd;
      continue;
    }

    const valueStart = index;
    while (index < source.length && !/\s/.test(source[index])) {
      index += 1;
    }
    attributes.push({ name, kind: "static", value: source.slice(valueStart, index) });
  }

  return attributes;
}

function findTagEnd(source: string, start: number): number {
  let quote: string | undefined;
  let expressionDepth = 0;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    const previous = source[index - 1];

    if (quote) {
      if (char === quote && previous !== "\\") {
        quote = undefined;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char === "{") {
      expressionDepth += 1;
      continue;
    }

    if (char === "}") {
      expressionDepth = Math.max(0, expressionDepth - 1);
      continue;
    }

    if (char === ">" && expressionDepth === 0) {
      return index;
    }
  }

  return -1;
}

function readBalancedExpression(source: string, start: number): number {
  let depth = 0;
  let quote: string | undefined;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    const previous = source[index - 1];

    if (quote) {
      if (char === quote && previous !== "\\") {
        quote = undefined;
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }

  return source.length;
}

function readTagName(source: string, start: number): { value: string; end: number } | undefined {
  let index = start;
  while (index < source.length && /[\w.:-]/.test(source[index])) {
    index += 1;
  }

  if (index === start) return undefined;
  return { value: source.slice(start, index), end: index };
}

function isElementStart(source: string, index: number): boolean {
  const next = source[index + 1];
  return next === ">" || /[A-Za-z]/.test(next ?? "");
}

function popToMatchingTag(stack: MutableElement[], tagName: string): void {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index].tagName === tagName) {
      stack.length = index;
      return;
    }
  }
}

function appendText(stack: MutableElement[], text: string): void {
  const current = stack[stack.length - 1];
  if (current) {
    current.textParts.push(text);
  }
}

function skipWhitespace(source: string, index: number): number {
  while (index < source.length && /\s/.test(source[index])) {
    index += 1;
  }
  return index;
}

function skipUntil(source: string, start: number, token: string): number {
  const index = source.indexOf(token, start);
  return index === -1 ? source.length : index + token.length;
}

function skipClosingRawTextElement(source: string, start: number, tagName: string): number {
  const lowerSource = source.toLowerCase();
  const token = `</${tagName.toLowerCase()}`;
  const closeStart = lowerSource.indexOf(token, start);
  if (closeStart === -1) return source.length;
  const closeEnd = source.indexOf(">", closeStart + token.length);
  return closeEnd === -1 ? source.length : closeEnd + 1;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function expressionText(value: string): { text: string; dynamic: boolean } {
  const trimmed = value.trim();
  const literal = trimmed.match(/^["'`]([^"'`{}]+)["'`]$/);
  if (literal) return { text: literal[1], dynamic: false };
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return { text: trimmed, dynamic: false };
  return { text: "", dynamic: trimmed.length > 0 && !/^\/\*/.test(trimmed) };
}

function lineAndColumn(source: string, index: number): { line: number; column: number } {
  const prefix = source.slice(0, index);
  const lines = prefix.split("\n");
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1
  };
}

function excerptAt(source: string, index: number): string {
  const end = source.indexOf("\n", index);
  return source.slice(index, end === -1 ? source.length : end).trim();
}
