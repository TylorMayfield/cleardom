import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";
import type { JsxAttribute, JsxElement, ResolvedScanOptions, SemanticAnalysisSummary, SemanticDiagnostic } from "./types.js";

type MutableElement = JsxElement & {
  textParts: string[];
};

type StaticValue = string | boolean | StaticObject;

type StaticObject = {
  [key: string]: StaticValue;
};

export type SemanticProject = {
  elementsByFile: Map<string, JsxElement[]>;
  diagnostics: SemanticDiagnostic[];
  analysis: SemanticAnalysisSummary;
};

const semanticExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);

export function isSemanticSourceFile(filePath: string): boolean {
  return semanticExtensions.has(path.extname(filePath));
}

export function createSemanticProject(files: string[], options: ResolvedScanOptions): SemanticProject {
  const semanticFiles = files.filter(isSemanticSourceFile);
  const diagnostics: SemanticDiagnostic[] = [];
  const elementsByFile = new Map<string, JsxElement[]>();

  if (options.semantic === "required" && semanticFiles.length === 0) {
    throw new Error("Semantic analysis required but no JavaScript or TypeScript source files were available for TypeScript analysis.");
  }

  if (options.semantic === "off" || semanticFiles.length === 0) {
    return {
      elementsByFile,
      diagnostics,
      analysis: {
        mode: options.semantic,
        adapter: "lightweight",
        filesAnalyzed: 0,
        filesFallback: files.length
      }
    };
  }

  try {
    const config = readTsConfig(options.rootDir, semanticFiles);
    const program = ts.createProgram(semanticFiles, config.options);
    for (const sourceFile of program.getSourceFiles()) {
      if (!semanticFiles.includes(sourceFile.fileName)) continue;
      elementsByFile.set(sourceFile.fileName, parseSemanticSourceFile(sourceFile, program.getTypeChecker()));
    }

    const fallbackCount = files.length - elementsByFile.size;
    if (fallbackCount > 0) {
      diagnostics.push({
        message: `${fallbackCount} non-JavaScript/TypeScript source ${fallbackCount === 1 ? "file used" : "files used"} lightweight framework adapters.`,
        severity: "info",
        adapter: "lightweight"
      });
    }

    diagnostics.push(...ts.getPreEmitDiagnostics(program).filter(keepTypeScriptDiagnostic).slice(0, 25).map((diagnostic) => ({
      file: diagnostic.file?.fileName,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
      severity: "warning" as const,
      adapter: "typescript" as const
    })));

    return {
      elementsByFile,
      diagnostics,
      analysis: {
        mode: options.semantic,
        adapter: "typescript",
        filesAnalyzed: elementsByFile.size,
        filesFallback: fallbackCount
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.semantic === "required") {
      throw new Error(`Semantic analysis required but TypeScript analysis could not initialize: ${message}`);
    }
    return {
      elementsByFile,
      diagnostics: [{
        message: `TypeScript semantic analysis unavailable; using lightweight fallback. ${message}`,
        severity: "warning",
        adapter: "typescript"
      }],
      analysis: {
        mode: options.semantic,
        adapter: "lightweight",
        filesAnalyzed: 0,
        filesFallback: files.length
      }
    };
  }
}

function keepTypeScriptDiagnostic(diagnostic: ts.Diagnostic): boolean {
  return !new Set([
    6059,
    7026,
    17004,
    2875
  ]).has(diagnostic.code);
}

export function parseSemanticSource(source: string, file: string): JsxElement[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));
  return parseSemanticSourceFile(sourceFile);
}

function parseSemanticSourceFile(sourceFile: ts.SourceFile, checker?: ts.TypeChecker): JsxElement[] {
  const elements: MutableElement[] = [];
  const stack: MutableElement[] = [];
  const constants = collectConstants(sourceFile, checker);
  const importSources = collectImportSources(sourceFile);

  function visit(node: ts.Node): void {
    if (ts.isJsxElement(node)) {
      const element = createElement(node.openingElement.tagName, node.openingElement.attributes, node, node.openingElement, sourceFile, elements, stack, constants, importSources, checker);
      stack.push(element);
      for (const child of node.children) visit(child);
      stack.pop();
      return;
    }

    if (ts.isJsxSelfClosingElement(node)) {
      createElement(node.tagName, node.attributes, node, node, sourceFile, elements, stack, constants, importSources, checker);
      return;
    }

    if (ts.isJsxFragment(node)) {
      const element = createFragment(node, sourceFile, elements, stack);
      stack.push(element);
      for (const child of node.children) visit(child);
      stack.pop();
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  for (const element of elements) {
    element.ownText = normalizeText(element.textParts.join(" "));
    delete (element as Partial<MutableElement>).textParts;
  }

  return elements;
}

function collectImportSources(sourceFile: ts.SourceFile): Map<string, string> {
  const sources = new Map<string, string>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const moduleName = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (!clause) continue;

    if (clause.name) {
      sources.set(clause.name.text, moduleName);
    }

    const namedBindings = clause.namedBindings;
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        sources.set(element.name.text, moduleName);
      }
    }

    if (namedBindings && ts.isNamespaceImport(namedBindings)) {
      sources.set(namedBindings.name.text, moduleName);
    }
  }

  return sources;
}

function componentImportName(tagName: string): string {
  return tagName.split(".")[0] ?? tagName;
}

function createElement(
  tagNode: ts.JsxTagNameExpression,
  attrsNode: ts.JsxAttributes,
  fullNode: ts.Node,
  startNode: ts.Node,
  sourceFile: ts.SourceFile,
  elements: MutableElement[],
  stack: MutableElement[],
  constants: Map<string, StaticValue>,
  importSources: Map<string, string>,
  checker: ts.TypeChecker | undefined
): MutableElement {
  const parent = stack[stack.length - 1];
  const position = sourceFile.getLineAndCharacterOfPosition(startNode.getStart(sourceFile));
  const element: MutableElement = {
    id: elements.length,
    tagName: resolvedTagName(tagNode, sourceFile, constants),
    importSource: importSources.get(componentImportName(tagNode.getText(sourceFile))),
    attributes: parseSemanticAttributes(attrsNode, sourceFile, constants, checker),
    parentId: parent?.id,
    childIds: [],
    ownText: "",
    textParts: [],
    selfClosing: ts.isJsxSelfClosingElement(fullNode),
    start: fullNode.getStart(sourceFile),
    end: fullNode.getEnd(),
    line: position.line + 1,
    column: position.character + 1,
    excerpt: excerptAt(sourceFile, startNode.getStart(sourceFile))
  };

  elements.push(element);
  parent?.childIds.push(element.id);
  appendDirectText(fullNode, sourceFile, element, constants, checker);
  return element;
}

function createFragment(node: ts.JsxFragment, sourceFile: ts.SourceFile, elements: MutableElement[], stack: MutableElement[]): MutableElement {
  const parent = stack[stack.length - 1];
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const element: MutableElement = {
    id: elements.length,
    tagName: "Fragment",
    attributes: [],
    parentId: parent?.id,
    childIds: [],
    ownText: "",
    textParts: [],
    selfClosing: false,
    start: node.getStart(sourceFile),
    end: node.getEnd(),
    line: position.line + 1,
    column: position.character + 1,
    excerpt: excerptAt(sourceFile, node.getStart(sourceFile))
  };
  elements.push(element);
  parent?.childIds.push(element.id);
  return element;
}

function parseSemanticAttributes(attrsNode: ts.JsxAttributes, sourceFile: ts.SourceFile, constants: Map<string, StaticValue>, checker: ts.TypeChecker | undefined): JsxAttribute[] {
  const attributes: JsxAttribute[] = [];

  for (const property of attrsNode.properties) {
    if (ts.isJsxAttribute(property)) {
      const name = property.name.getText(sourceFile);
      if (!property.initializer) {
        attributes.push({ name, kind: "boolean", value: true });
        continue;
      }
      const value = jsxAttributeValue(property.initializer, sourceFile, constants, checker);
      attributes.push(value === undefined
        ? { name, kind: "expression", value: property.initializer.getText(sourceFile) }
        : { name, kind: "static", value });
      continue;
    }

    if (ts.isJsxSpreadAttribute(property)) {
      const spread = evaluateExpression(property.expression, sourceFile, constants, checker);
      if (isStaticObject(spread)) {
        for (const [name, value] of Object.entries(spread)) {
          if (typeof value === "string") attributes.push({ name, kind: "static", value });
          if (typeof value === "boolean") attributes.push({ name, kind: "boolean", value: true });
        }
      }
    }
  }

  return attributes;
}

function jsxAttributeValue(node: ts.JsxAttributeValue, sourceFile: ts.SourceFile, constants: Map<string, StaticValue>, checker: ts.TypeChecker | undefined): string | undefined {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isJsxExpression(node) && node.expression) {
    const value = evaluateExpression(node.expression, sourceFile, constants, checker);
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

function appendDirectText(node: ts.Node, sourceFile: ts.SourceFile, element: MutableElement, constants: Map<string, StaticValue>, checker: ts.TypeChecker | undefined): void {
  if (!ts.isJsxElement(node) && !ts.isJsxFragment(node)) return;
  const children = node.children;
  for (const child of children) {
    if (ts.isJsxText(child)) {
      element.textParts.push(child.getText(sourceFile));
    } else if (ts.isJsxExpression(child) && child.expression) {
      const value = evaluateExpression(child.expression, sourceFile, constants, checker);
      if (typeof value === "string") element.textParts.push(value);
    }
  }
}

function collectConstants(sourceFile: ts.SourceFile, checker: ts.TypeChecker | undefined): Map<string, StaticValue> {
  const constants = new Map<string, StaticValue>();

  function visit(node: ts.Node): void {
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          const value = evaluateExpression(declaration.initializer, sourceFile, constants, checker);
          if (value !== undefined) constants.set(declaration.name.text, value);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return constants;
}

function evaluateExpression(node: ts.Expression, sourceFile: ts.SourceFile, constants: Map<string, StaticValue>, checker: ts.TypeChecker | undefined): StaticValue | undefined {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return node.text;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node) && node.templateSpans.length === 0) return node.head.text;
  if (ts.isParenthesizedExpression(node)) return evaluateExpression(node.expression, sourceFile, constants, checker);
  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)) return evaluateExpression(node.expression, sourceFile, constants, checker);
  if (ts.isIdentifier(node)) return constants.get(node.text) ?? resolveAliasedConstant(node, sourceFile, constants, checker);
  if (ts.isPropertyAccessExpression(node)) {
    const target = evaluateExpression(node.expression, sourceFile, constants, checker);
    return isStaticObject(target) ? target[node.name.text] : undefined;
  }
  if (ts.isElementAccessExpression(node) && node.argumentExpression) {
    const target = evaluateExpression(node.expression, sourceFile, constants, checker);
    const key = evaluateExpression(node.argumentExpression, sourceFile, constants, checker);
    return isStaticObject(target) && typeof key === "string" ? target[key] : undefined;
  }
  if (ts.isObjectLiteralExpression(node)) {
    const output: StaticObject = {};
    for (const property of node.properties) {
      if (ts.isPropertyAssignment(property)) {
        const name = propertyName(property.name, sourceFile);
        const value = evaluateExpression(property.initializer, sourceFile, constants, checker);
        if (name && value !== undefined) output[name] = value;
      }
      if (ts.isShorthandPropertyAssignment(property)) {
        const value = constants.get(property.name.text);
        if (value !== undefined) output[property.name.text] = value;
      }
      if (ts.isSpreadAssignment(property)) {
        const value = evaluateExpression(property.expression, sourceFile, constants, checker);
        if (isStaticObject(value)) Object.assign(output, value);
      }
    }
    return output;
  }
  return undefined;
}

function resolveAliasedConstant(node: ts.Identifier, sourceFile: ts.SourceFile, constants: Map<string, StaticValue>, checker: ts.TypeChecker | undefined): StaticValue | undefined {
  if (!checker) return undefined;
  const symbol = checker.getSymbolAtLocation(node);
  const aliased = symbol && (symbol.flags & ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(symbol) : symbol;
  const declaration = aliased?.valueDeclaration;
  if (!declaration) return undefined;
  if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
    const declarationSource = declaration.getSourceFile();
    const declarationConstants = declarationSource === sourceFile ? constants : collectConstants(declarationSource, checker);
    return evaluateExpression(declaration.initializer, declarationSource, declarationConstants, checker);
  }
  return undefined;
}

function resolvedTagName(tagNode: ts.JsxTagNameExpression, sourceFile: ts.SourceFile, constants: Map<string, StaticValue>): string {
  if (ts.isIdentifier(tagNode)) {
    const value = constants.get(tagNode.text);
    if (typeof value === "string") return value;
  }
  return tagNode.getText(sourceFile);
}

function readTsConfig(rootDir: string, files: string[]): { options: ts.CompilerOptions } {
  const configPath = ts.findConfigFile(rootDir, fs.existsSync, "tsconfig.json");
  if (!configPath) {
    return {
      options: {
        allowJs: true,
        checkJs: false,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        skipLibCheck: true,
        noEmit: true
      }
    };
  }

  const parsed = ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, path.dirname(configPath), {
    noEmit: true,
    allowJs: true,
    jsx: ts.JsxEmit.ReactJSX,
    skipLibCheck: true
  });
  return {
    options: {
      ...parsed.options,
      rootDir: undefined,
      noEmit: true,
      allowJs: true,
      jsx: ts.JsxEmit.ReactJSX,
      skipLibCheck: true
    }
  };
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (file.endsWith(".ts")) return ts.ScriptKind.TS;
  if (file.endsWith(".js")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TSX;
}

function propertyName(node: ts.PropertyName, sourceFile: ts.SourceFile): string | undefined {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return undefined;
}

function isStaticObject(value: StaticValue | undefined): value is StaticObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function excerptAt(sourceFile: ts.SourceFile, index: number): string {
  const source = sourceFile.text;
  const end = source.indexOf("\n", index);
  return source.slice(index, end === -1 ? source.length : end).trim();
}
