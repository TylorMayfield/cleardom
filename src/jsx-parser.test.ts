import * as assert from "node:assert/strict";
import { test } from "node:test";
import { parseJsx } from "./jsx-parser.js";

test("parses nested elements and recursive text", () => {
  const elements = parseJsx("<button><span>Save</span></button>");

  assert.equal(elements.length, 2);
  assert.equal(elements[0].tagName, "button");
  assert.deepEqual(elements[0].childIds, [1]);
  assert.equal(elements[1].ownText, "Save");
});

test("parses self-closing elements and static attributes", () => {
  const elements = parseJsx('<img alt="Receipt" src="/receipt.png" />');

  assert.equal(elements[0].selfClosing, true);
  assert.deepEqual(elements[0].attributes.map((attribute) => [attribute.name, attribute.kind, attribute.value]), [
    ["alt", "static", "Receipt"],
    ["src", "static", "/receipt.png"]
  ]);
});

test("parses fragments, expression attributes, and comments", () => {
  const elements = parseJsx("<><button aria-label={label}>{icon}</button><!-- ignored --></>");

  assert.equal(elements[0].tagName, "Fragment");
  assert.equal(elements[1].tagName, "button");
  assert.deepEqual(elements[1].attributes[0], { name: "aria-label", kind: "expression", value: "label" });
  assert.equal(elements.some((element) => element.tagName === "ignored"), false);
});

test("tracks multiline line and column", () => {
  const elements = parseJsx("const view = (\n  <div>\n    <button />\n  </div>\n);");

  const button = elements.find((element) => element.tagName === "button");
  assert.equal(button?.line, 3);
  assert.equal(button?.column, 5);
});
