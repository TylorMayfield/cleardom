import { createRequire } from "node:module";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { adapterForFile, parseSource } from "./source-adapters.js";
import type { JsxElement } from "./types.js";

export type FrameworkParseResult = {
  elements: JsxElement[];
  compiler?: string;
  diagnostic?: string;
};

const compilerPackages = {
  vue: "@vue/compiler-sfc",
  svelte: "svelte/compiler",
  astro: "@astrojs/compiler",
  angular: "@angular/compiler",
  mdx: "@mdx-js/mdx"
} as const;

export async function parseWithProjectFrameworkCompiler(source: string, file: string, rootDir: string, importSourceText = source): Promise<FrameworkParseResult> {
  const adapter = adapterForFile(file);
  const elements = parseSource(source, file, importSourceText);
  if (!adapter || !(adapter.id in compilerPackages)) return { elements };
  const packageName = compilerPackages[adapter.id as keyof typeof compilerPackages];
  const entry = resolveFromProject(packageName, rootDir);
  if (!entry) return { elements, diagnostic: `${adapter.label} project compiler was not installed; ClearDOM used the documented lightweight fallback.` };

  try {
    const compiler = await import(pathToFileURL(entry).href) as Record<string, unknown>;
    await validateAst(compiler, adapter.id, source, file);
    return { elements, compiler: packageName, diagnostic: `${adapter.label} syntax was parsed with ${packageName}; ClearDOM retained authored-source locations for rule evidence.` };
  } catch (error) {
    return { elements, diagnostic: `${adapter.label} project compiler could not parse ${path.basename(file)}; ClearDOM used the lightweight fallback. ${error instanceof Error ? error.message : String(error)}` };
  }
}

function resolveFromProject(packageName: string, rootDir: string): string | undefined {
  try {
    const require = createRequire(path.join(rootDir, "package.json"));
    return require.resolve(packageName);
  } catch {
    return undefined;
  }
}

async function validateAst(compiler: Record<string, unknown>, adapter: string, source: string, file: string): Promise<void> {
  const defaultExport = compiler.default && typeof compiler.default === "object" ? compiler.default as Record<string, unknown> : {};
  const compilerExport = (name: string) => compiler[name] ?? defaultExport[name];
  if (adapter === "vue") {
    const parse = compilerExport("parse") as ((source: string, options: { filename: string }) => { errors?: unknown[] }) | undefined;
    if (!parse) throw new Error("compiler parse() export is unavailable");
    const result = parse(source, { filename: file });
    if (result.errors?.length) throw new Error(String(result.errors[0]));
    return;
  }
  if (adapter === "svelte") {
    const parse = compilerExport("parse") as ((source: string, options?: { filename?: string }) => unknown) | undefined;
    if (!parse) throw new Error("compiler parse() export is unavailable");
    parse(source, { filename: file });
    return;
  }
  if (adapter === "astro") {
    const parse = compilerExport("parse") as ((source: string, options?: { position?: boolean }) => Promise<unknown>) | undefined;
    if (!parse) throw new Error("compiler parse() export is unavailable");
    await parse(source, { position: true });
    return;
  }
  if (adapter === "angular") {
    const parseTemplate = compilerExport("parseTemplate") as ((source: string, file: string, options?: { preserveWhitespaces?: boolean }) => { errors?: unknown[] }) | undefined;
    if (!parseTemplate) throw new Error("compiler parseTemplate() export is unavailable");
    const result = parseTemplate(source, file, { preserveWhitespaces: true });
    if (result.errors?.length) throw new Error(String(result.errors[0]));
    return;
  }
  const compile = compilerExport("compile") as ((source: string, options?: Record<string, unknown>) => Promise<unknown>) | undefined;
  if (!compile) throw new Error("compiler compile() export is unavailable");
  await compile(source, { outputFormat: "function-body", jsx: true });
}
