import * as assert from "node:assert/strict";
import { test } from "node:test";
import { parseSource, sourceAdapters } from "./source-adapters.js";

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
