import * as path from "node:path";
import { parseJsx } from "./jsx-parser.js";
import type { JsxElement } from "./types.js";

export type SourceAdapterId = "jsx" | "html" | "vue" | "svelte" | "astro" | "angular" | "mdx";
export type SourceAdapterSupportTier = "full" | "template" | "content";

export type SourceAdapter = {
  id: SourceAdapterId;
  label: string;
  supportTier: SourceAdapterSupportTier;
  supportSummary: string;
  extensions: string[];
  parse: (source: string, filePath: string) => JsxElement[];
};

export const sourceAdapters: SourceAdapter[] = [
  {
    id: "jsx",
    label: "JSX/TSX",
    supportTier: "full",
    supportSummary: "Compiler-backed semantic analysis for JavaScript, TypeScript, JSX, TSX, React Native, and React-family JSX.",
    extensions: [".js", ".jsx", ".ts", ".tsx"],
    parse: (source) => parseJsx(source)
  },
  {
    id: "html",
    label: "HTML",
    supportTier: "template",
    supportSummary: "Static HTML parsing plus runtime checks when --runtime-url is configured.",
    extensions: [".html", ".htm"],
    parse: (source) => parseJsx(prepareHtmlLikeSource(source))
  },
  {
    id: "vue",
    label: "Vue",
    supportTier: "template",
    supportSummary: "Single-file component template extraction with common Vue binding and event aliases.",
    extensions: [".vue"],
    parse: (source) => parseJsx(prepareVueSource(source))
  },
  {
    id: "svelte",
    label: "Svelte",
    supportTier: "template",
    supportSummary: "Markup parsing with script stripping and common Svelte binding and event aliases.",
    extensions: [".svelte"],
    parse: (source) => parseJsx(prepareSvelteSource(source))
  },
  {
    id: "astro",
    label: "Astro",
    supportTier: "template",
    supportSummary: "Astro frontmatter stripping with static template parsing.",
    extensions: [".astro"],
    parse: (source) => parseJsx(prepareAstroSource(source))
  },
  {
    id: "angular",
    label: "Angular templates",
    supportTier: "template",
    supportSummary: "Angular component template parsing with property and event binding aliases.",
    extensions: [".component.html", ".ng.html"],
    parse: (source) => parseJsx(prepareAngularSource(source))
  },
  {
    id: "mdx",
    label: "MDX",
    supportTier: "content",
    supportSummary: "Authored markup parsing with imports and fenced code examples ignored.",
    extensions: [".mdx"],
    parse: (source) => parseJsx(prepareMdxSource(source))
  }
];

export const supportedExtensions = new Set(sourceAdapters.flatMap((adapter) => adapter.extensions));

export function adapterForFile(filePath: string): SourceAdapter | undefined {
  const normalized = normalizePath(filePath);
  return sourceAdapters.find((adapter) => adapter.extensions.some((extension) => normalized.endsWith(extension)));
}

export function parseSource(source: string, filePath: string): JsxElement[] {
  return (adapterForFile(filePath) ?? sourceAdapters[0]).parse(source, filePath);
}

function prepareHtmlLikeSource(source: string): string {
  return normalizeFrameworkAttributes(stripBlocks(source, ["script", "style"]));
}

function prepareVueSource(source: string): string {
  const template = extractSingleFileComponentBlock(source, "template");
  const templateSource = template
    ? preservePrefix(source, template.contentStart) + source.slice(template.contentStart, template.contentEnd)
    : stripBlocks(source, ["script", "style"]);

  return normalizeFrameworkAttributes(templateSource);
}

function prepareSvelteSource(source: string): string {
  return normalizeFrameworkAttributes(stripBlocks(source, ["script", "style"]));
}

function prepareAstroSource(source: string): string {
  return normalizeFrameworkAttributes(stripBlocks(stripAstroFrontmatter(source), ["script", "style"]));
}

function prepareAngularSource(source: string): string {
  return normalizeFrameworkAttributes(stripBlocks(source, ["script", "style"]));
}

function prepareMdxSource(source: string): string {
  const withoutCodeFences = stripMarkdownFences(source);
  const withoutModuleDeclarations = withoutCodeFences
    .split("\n")
    .map((line) => /^\s*(?:import|export)\s/.test(line) ? preserveLine(line) : line)
    .join("\n");

  return normalizeFrameworkAttributes(stripBlocks(withoutModuleDeclarations, ["script", "style"]));
}

function extractSingleFileComponentBlock(source: string, tagName: string): {
  contentStart: number;
  contentEnd: number;
} | undefined {
  const lowerSource = source.toLowerCase();
  const lowerTag = tagName.toLowerCase();
  let index = 0;

  while (index < source.length) {
    const openStart = lowerSource.indexOf(`<${lowerTag}`, index);
    if (openStart === -1) return undefined;

    const next = source[openStart + tagName.length + 1];
    if (next && !/[\s>/]/.test(next)) {
      index = openStart + 1;
      continue;
    }

    const openEnd = findTagEnd(source, openStart + tagName.length + 1);
    if (openEnd === -1) return undefined;

    const closeStart = lowerSource.indexOf(`</${lowerTag}>`, openEnd + 1);
    if (closeStart === -1) return undefined;

    return {
      contentStart: openEnd + 1,
      contentEnd: closeStart
    };
  }

  return undefined;
}

function stripBlocks(source: string, tagNames: string[]): string {
  let result = source;

  for (const tagName of tagNames) {
    result = stripBlock(result, tagName);
  }

  return result;
}

function stripBlock(source: string, tagName: string): string {
  const lowerSource = source.toLowerCase();
  const lowerTag = tagName.toLowerCase();
  let result = "";
  let index = 0;

  while (index < source.length) {
    const openStart = lowerSource.indexOf(`<${lowerTag}`, index);
    if (openStart === -1) {
      result += source.slice(index);
      break;
    }

    const next = source[openStart + tagName.length + 1];
    if (next && !/[\s>/]/.test(next)) {
      result += source.slice(index, openStart + 1);
      index = openStart + 1;
      continue;
    }

    const openEnd = findTagEnd(source, openStart + tagName.length + 1);
    if (openEnd === -1) {
      result += source.slice(index);
      break;
    }

    const closeToken = `</${lowerTag}>`;
    const closeStart = lowerSource.indexOf(closeToken, openEnd + 1);
    const closeEnd = closeStart === -1 ? openEnd + 1 : closeStart + closeToken.length;

    result += source.slice(index, openStart);
    result += preserveLine(source.slice(openStart, closeEnd));
    index = closeEnd;
  }

  return result;
}

function stripAstroFrontmatter(source: string): string {
  const match = source.match(/^---(?:\r?\n)[\s\S]*?(?:\r?\n)---[^\S\n]*(?:\r?\n)?/);
  if (!match) return source;
  return preserveLine(match[0]) + source.slice(match[0].length);
}

function stripMarkdownFences(source: string): string {
  return source.replace(/(^|\n)([ \t]*)(`{3,}|~{3,})[^\n]*(?:\n[\s\S]*?\n\2\3[ \t]*)/g, (match) => preserveLine(match));
}

function normalizeFrameworkAttributes(source: string): string {
  return source.replace(/\s((?::|v-bind:|\[attr\.|\[|bind:|class:|on:|@|\(|v-on:)[^\s=/>]+)(\]?|\))(?=\s*=|\s|\/?>)/g, (match, rawName: string, closing: string) => {
    const normalizedName = normalizeFrameworkAttributeName(`${rawName}${closing}`);
    return ` ${normalizedName}`;
  });
}

function normalizeFrameworkAttributeName(name: string): string {
  if (name.startsWith(":")) return name.slice(1);
  if (name.startsWith("v-bind:")) return name.slice("v-bind:".length);
  if (name.startsWith("bind:")) return name.slice("bind:".length);
  if (name.startsWith("[attr.") && name.endsWith("]")) return name.slice("[attr.".length, -1);
  if (name.startsWith("[") && name.endsWith("]")) return name.slice(1, -1);
  if (name.startsWith("(") && name.endsWith(")")) return normalizedEventName(name.slice(1, -1));
  if (name.startsWith("@")) return normalizedEventName(name.slice(1));
  if (name.startsWith("v-on:")) return normalizedEventName(name.slice("v-on:".length));
  if (name.startsWith("on:")) return normalizedEventName(name.slice("on:".length));
  return name;
}

function findTagEnd(source: string, start: number): number {
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

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char === ">") return index;
  }

  return -1;
}

function preservePrefix(source: string, end: number): string {
  return preserveLine(source.slice(0, end));
}

function preserveLine(source: string): string {
  return source.replace(/[^\n\r]/g, " ");
}

function normalizedEventName(value: string): string {
  const aliases: Record<string, string> = {
    click: "onClick",
    keydown: "onKeyDown",
    keyup: "onKeyUp",
    keypress: "onKeyPress"
  };

  return aliases[value.toLowerCase()] ?? `on${value ? `${value[0].toUpperCase()}${value.slice(1)}` : value}`;
}

function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}
