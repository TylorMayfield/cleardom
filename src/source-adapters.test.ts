import * as assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { parseWithProjectFrameworkCompiler } from "./framework-compilers.js";
import { adapterForFile, parseSource, sourceAdapters } from "./source-adapters.js";

test("source adapters expose documented support tiers", () => {
  assert.deepEqual(
    sourceAdapters.map((adapter) => [adapter.id, adapter.supportTier]),
    [
      ["jsx", "full"],
      ["html", "template"],
      ["vue", "template"],
      ["svelte", "template"],
      ["astro", "template"],
      ["angular", "template"],
      ["mdx", "content"]
    ]
  );
  assert.equal(sourceAdapters.every((adapter) => adapter.label && adapter.supportSummary), true);
});

test("template adapters invoke a project-installed framework compiler and retain authored locations", async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "cleardom-vue-compiler-"));
  const compilerRoot = path.join(root, "node_modules", "@vue", "compiler-sfc");
  await fs.mkdir(compilerRoot, { recursive: true });
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ type: "module" }), "utf8");
  await fs.writeFile(path.join(compilerRoot, "package.json"), JSON.stringify({ name: "@vue/compiler-sfc", type: "module", exports: "./index.js" }), "utf8");
  await fs.writeFile(path.join(compilerRoot, "index.js"), "export function parse(source) { return { descriptor: {}, errors: source.includes('invalid-compiler-case') ? ['invalid'] : [] }; }", "utf8");
  const file = path.join(root, "Button.vue");
  const parsed = await parseWithProjectFrameworkCompiler("<template>\n<button></button>\n</template>", file, root);
  assert.equal(parsed.compiler, "@vue/compiler-sfc");
  assert.equal(parsed.elements.find((element) => element.tagName === "button")?.line, 2);
  assert.match(parsed.diagnostic ?? "", /parsed with @vue\/compiler-sfc/);
});

test("JSX parser records component import sources for design-system mappings", () => {
  const elements = parseSource(`
import { IconButton as CloseButton } from "@mui/material";
import * as Dialog from "@radix-ui/react-dialog";

<CloseButton aria-label="Close" />
<Dialog.Close aria-label="Close dialog" />
`, "Checkout.tsx");

  assert.equal(elements.find((element) => element.tagName === "CloseButton")?.importSource, "@mui/material");
  assert.equal(elements.find((element) => element.tagName === "Dialog.Close")?.importSource, "@radix-ui/react-dialog");
});

test("Vue adapter parses template content and ignores script false positives", () => {
  const elements = parseSource(`
<script setup lang="ts">
const decorative = "<button></button>";
</script>

<template>
  <section>
    <button :aria-label="'Close cart'">
      <span aria-hidden="true">x</span>
    </button>
    <template #actions>
      <div @click="openPanel">Open panel</div>
    </template>
  </section>
</template>
`, "Checkout.vue");

  const buttons = elements.filter((element) => element.tagName === "button");
  const clickable = elements.find((element) => element.tagName === "div");

  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].attributes.some((attribute) => attribute.name === "aria-label"), true);
  assert.equal(clickable?.attributes.some((attribute) => attribute.name === "onClick"), true);
});

test("template adapters preserve design-system component import origins", () => {
  const fixtures = [
    { file: "Checkout.vue", source: '<script setup>import { IconButton as CloseButton } from "@acme/ui";</script><template><close-button /></template>', tag: "close-button" },
    { file: "Checkout.svelte", source: '<script>import CloseButton from "@acme/ui";</script><CloseButton />', tag: "CloseButton" },
    { file: "Checkout.astro", source: '---\nimport { CloseButton } from "@acme/ui";\n---\n<CloseButton />', tag: "CloseButton" },
    { file: "Checkout.mdx", source: 'import { CloseButton } from "@acme/ui";\n\n<CloseButton />', tag: "CloseButton" }
  ];

  for (const fixture of fixtures) {
    const element = parseSource(fixture.source, fixture.file).find((candidate) => candidate.tagName === fixture.tag);
    assert.equal(element?.importSource, "@acme/ui", `${fixture.file} should retain its component import source`);
  }
});

test("Svelte adapter strips module code and normalizes actions", () => {
  const elements = parseSource(`
<script lang="ts">
  const markup = "<img src='/bad.png'>";
</script>

{#if ready}
  <button aria-label="Close">
    <span aria-hidden="true">x</span>
  </button>
  <div on:click={openPanel}>Open panel</div>
{/if}
`, "Checkout.svelte");

  assert.equal(elements.filter((element) => element.tagName === "img").length, 0);
  assert.equal(elements.filter((element) => element.tagName === "button").length, 1);
  assert.equal(elements.find((element) => element.tagName === "div")?.attributes[0]?.name, "onClick");
});

test("Angular adapter maps property and event bindings to rule-friendly aliases", () => {
  assert.equal(adapterForFile("checkout.component.html")?.id, "angular");
  const elements = parseSource(`
<main>
  <button [attr.aria-label]="'Close cart'"></button>
  <div (click)="openPanel()" [tabindex]="0" (keydown)="handleKey($event)">Open panel</div>
</main>
`, "checkout.component.html");

  const button = elements.find((element) => element.tagName === "button");
  const div = elements.find((element) => element.tagName === "div");

  assert.equal(button?.attributes.some((attribute) => attribute.name === "aria-label"), true);
  assert.deepEqual(div?.attributes.map((attribute) => attribute.name), ["onClick", "tabindex", "onKeyDown"]);
});

test("Angular adapter accepts adjacent component imports for design-system provenance", () => {
  const elements = parseSource(
    '<acme-icon-button aria-label="Close"></acme-icon-button>',
    "checkout.component.html",
    'import { AcmeIconButton } from "@acme/ui";'
  );

  assert.equal(elements[0]?.importSource, "@acme/ui");
});

test("MDX adapter ignores imports and fenced examples while keeping authored markup", () => {
  const elements = parseSource(`
import { Button } from "./Button";

# Checkout

\`\`\`tsx
<button />
\`\`\`

<label for="email">Email</label>
<input id="email" name="email">
`, "Checkout.mdx");

  assert.equal(elements.filter((element) => element.tagName === "button").length, 0);
  assert.equal(elements.find((element) => element.tagName === "input")?.selfClosing, true);
  assert.equal(elements.find((element) => element.tagName === "label")?.attributes[0]?.name, "for");
});

test("Astro adapter preserves template line numbers after frontmatter", () => {
  const elements = parseSource(`---
const product = "Cart";
---

<main>
  <button />
</main>
`, "Checkout.astro");

  const button = elements.find((element) => element.tagName === "button");
  assert.equal(button?.line, 6);
});
