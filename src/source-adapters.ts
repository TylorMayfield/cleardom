import * as path from "node:path";
import { parseJsx } from "./jsx-parser.js";
import type { JsxElement } from "./types.js";

export type SourceAdapterId = "jsx" | "html" | "vue" | "svelte" | "astro" | "angular" | "mdx";

export type SourceAdapter = {
  id: SourceAdapterId;
  extensions: string[];
  parse: (source: string, filePath: string) => JsxElement[];
};

export const sourceAdapters: SourceAdapter[] = [
  {
    id: "jsx",
    extensions: [".js", ".jsx", ".ts", ".tsx"],
    parse: (source) => parseJsx(source)
  },
  {
    id: "html",
    extensions: [".html", ".htm"],
    parse: (source) => parseJsx(source)
  },
  {
    id: "vue",
    extensions: [".vue"],
    parse: (source) => parseJsx(extractSingleFileComponentTemplate(source, "template") ?? source)
  },
  {
    id: "svelte",
    extensions: [".svelte"],
    parse: (source) => parseJsx(stripScriptAndStyle(source))
  },
  {
    id: "astro",
    extensions: [".astro"],
    parse: (source) => parseJsx(stripAstroFrontmatter(source))
  },
  {
    id: "angular",
    extensions: [".component.html", ".ng.html"],
    parse: (source) => parseJsx(source)
  },
  {
    id: "mdx",
    extensions: [".mdx"],
    parse: (source) => parseJsx(source)
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

function extractSingleFileComponentTemplate(source: string, tagName: string): string | undefined {
  const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i");
  return source.match(pattern)?.[1];
}

function stripScriptAndStyle(source: string): string {
  return source
    .replace(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style(?:\s[^>]*)?>[\s\S]*?<\/style>/gi, "");
}

function stripAstroFrontmatter(source: string): string {
  return source.replace(/^---[\s\S]*?---\s*/, "");
}

function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}
