import * as assert from "node:assert/strict";
import * as http from "node:http";
import { existsSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { resolveScanOptions } from "./config.js";
import { auditRuntimeUrl } from "./runtime.js";

const chromePath = process.env.CHROME_PATH
  ?? process.env.PUPPETEER_EXECUTABLE_PATH
  ?? (existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome") ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined);

test("runtime interaction checks flag high-confidence rendered failures", { skip: chromePath === undefined }, async () => {
  const server = await startServer(positiveRuntimeFixture);
  try {
    const options = await resolveScanOptions({
      rules: {
        CDOM_1_4_3_CONTRAST: "off",
        CDOM_2_4_7_FOCUS_VISIBLE: "off",
        CDOM_2_5_8_TARGET_SIZE: "off",
        CDOM_1_4_10_REFLOW: "off",
        CDOM_2_4_1_SKIP_LINK: "off"
      }
    });
    const findings = await auditRuntimeUrl(server.url, options, chromePath);
    const ruleIds = new Set(findings.map((finding) => finding.ruleId));

    assert.equal(ruleIds.has("CDOM_1_4_12_TEXT_SPACING"), true);
    assert.equal(ruleIds.has("CDOM_1_4_13_HOVER_FOCUS_CONTENT"), true);
    assert.equal(ruleIds.has("CDOM_2_1_2_KEYBOARD_TRAP"), true);
    assert.equal(ruleIds.has("CDOM_2_4_11_FOCUS_OBSCURED"), true);
  } finally {
    await server.close();
  }
});

test("runtime interaction checks avoid accessible controls and layouts", { skip: chromePath === undefined }, async () => {
  const server = await startServer(negativeRuntimeFixture);
  try {
    const ruleIds = await runtimeRuleIds(server.url);

    assert.equal(ruleIds.has("CDOM_1_4_12_TEXT_SPACING"), false);
    assert.equal(ruleIds.has("CDOM_1_4_13_HOVER_FOCUS_CONTENT"), false);
    assert.equal(ruleIds.has("CDOM_2_1_2_KEYBOARD_TRAP"), false);
    assert.equal(ruleIds.has("CDOM_2_4_11_FOCUS_OBSCURED"), false);
  } finally {
    await server.close();
  }
});

test("runtime false-positive cases ignore benign suspicious patterns", { skip: chromePath === undefined }, async () => {
  const server = await startServer(falsePositiveRuntimeFixture);
  try {
    const ruleIds = await runtimeRuleIds(server.url);

    assert.equal(ruleIds.has("CDOM_1_4_12_TEXT_SPACING"), false);
    assert.equal(ruleIds.has("CDOM_1_4_13_HOVER_FOCUS_CONTENT"), false);
    assert.equal(ruleIds.has("CDOM_2_1_2_KEYBOARD_TRAP"), false);
    assert.equal(ruleIds.has("CDOM_2_4_11_FOCUS_OBSCURED"), false);
  } finally {
    await server.close();
  }
});

test("runtime edge cases catch alternating keyboard traps", { skip: chromePath === undefined }, async () => {
  const server = await startServer(alternatingTrapFixture);
  try {
    const ruleIds = await runtimeRuleIds(server.url);

    assert.equal(ruleIds.has("CDOM_2_1_2_KEYBOARD_TRAP"), true);
  } finally {
    await server.close();
  }
});

test("runtime edge cases ignore modal focus containment", { skip: chromePath === undefined }, async () => {
  const server = await startServer(modalFocusContainmentFixture);
  try {
    const ruleIds = await runtimeRuleIds(server.url);

    assert.equal(ruleIds.has("CDOM_2_1_2_KEYBOARD_TRAP"), false);
  } finally {
    await server.close();
  }
});

test("runtime edge cases ignore pre-existing overlap during text spacing checks", { skip: chromePath === undefined }, async () => {
  const server = await startServer(preExistingOverlapFixture);
  try {
    const ruleIds = await runtimeRuleIds(server.url);

    assert.equal(ruleIds.has("CDOM_1_4_12_TEXT_SPACING"), false);
  } finally {
    await server.close();
  }
});

test("runtime edge cases distinguish full focus coverage from partial coverage", { skip: chromePath === undefined }, async () => {
  const full = await startServer(fullFocusCoverageFixture);
  try {
    const ruleIds = await runtimeRuleIds(full.url);

    assert.equal(ruleIds.has("CDOM_2_4_11_FOCUS_OBSCURED"), true);
  } finally {
    await full.close();
  }

  const partial = await startServer(partialFocusCoverageFixture);
  try {
    const ruleIds = await runtimeRuleIds(partial.url);

    assert.equal(ruleIds.has("CDOM_2_4_11_FOCUS_OBSCURED"), false);
  } finally {
    await partial.close();
  }
});

async function runtimeRuleIds(url: string): Promise<Set<string>> {
  const options = await resolveScanOptions({
    rules: {
      CDOM_1_4_3_CONTRAST: "off",
      CDOM_2_4_7_FOCUS_VISIBLE: "off",
      CDOM_2_5_8_TARGET_SIZE: "off",
      CDOM_1_4_10_REFLOW: "off",
      CDOM_2_4_1_SKIP_LINK: "off"
    }
  });
  const findings = await auditRuntimeUrl(url, options, chromePath);
  return new Set(findings.map((finding) => finding.ruleId));
}

async function startServer(body: string): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((_: http.IncomingMessage, response: http.ServerResponse) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(body);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const info = address as AddressInfo;
  return {
    url: `http://127.0.0.1:${info.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  };
}

const baseStyles = `
  body { font-family: Arial, sans-serif; color: #111; background: #fff; }
  a:focus, button:focus, [tabindex]:focus { outline: 3px solid #111; }
  button, a, [tabindex] { min-width: 32px; min-height: 32px; }
  .skip-link { position: absolute; left: -999px; top: 8px; }
  .skip-link:focus { left: 8px; background: #111; color: #fff; }
`;

const positiveRuntimeFixture = `<!doctype html>
<html lang="en">
  <head>
    <title>Runtime failures</title>
    <style>
      ${baseStyles}
      .clip { width: 180px; height: 22px; overflow: hidden; }
      .hover-area { position: relative; margin: 24px 0; }
      .hover-details { display: none; position: absolute; top: 36px; left: 0; padding: 8px; background: #fff; border: 1px solid #111; }
      .hover-trigger:hover + .hover-details,
      .hover-trigger:focus + .hover-details { display: block; }
      .trap { margin: 24px 0; padding: 12px; border: 1px solid #444; }
      .covered { position: relative; width: 160px; height: 48px; margin-top: 24px; }
      .covered button { position: absolute; left: 0; top: 0; width: 140px; height: 36px; }
      .cover { position: absolute; left: 0; top: 0; width: 140px; height: 36px; z-index: 2; background: #fff; border: 1px solid #888; }
    </style>
  </head>
  <body>
    <a class="skip-link" href="#content">Skip to content</a>
    <main id="content">
      <button>Before</button>
      <p class="clip">Increasing text spacing clips this sentence inside a fixed-height box.</p>
      <div class="hover-area">
        <button class="hover-trigger">Hover details</button>
        <div class="hover-details">Additional content cannot be dismissed with Escape.</div>
      </div>
      <section class="trap" tabindex="0">
        <button>Trap start</button>
        <button>Trap end</button>
      </section>
      <button>After trap</button>
      <div class="covered">
        <button>Covered focus</button>
        <div class="cover">Covering overlay</div>
      </div>
    </main>
    <script>
      const trap = document.querySelector(".trap");
      trap.addEventListener("keydown", (event) => {
        if (event.key === "Tab") {
          event.preventDefault();
          trap.querySelector("button").focus();
        }
      });
    </script>
  </body>
</html>`;

const negativeRuntimeFixture = `<!doctype html>
<html lang="en">
  <head>
    <title>Runtime passing controls</title>
    <style>
      ${baseStyles}
      p { max-width: 36rem; }
      .tooltip-wrap { position: relative; margin: 24px 0; }
      .tooltip { display: none; position: absolute; top: 36px; left: 0; padding: 8px; background: #fff; border: 1px solid #111; }
      .tooltip-wrap.open .tooltip { display: block; }
      .dialog { display: block; border: 1px solid #444; padding: 12px; max-width: 220px; }
      .partly-covered { position: relative; margin-top: 24px; }
      .partial-cover { position: absolute; left: 0; top: 0; width: 20px; height: 20px; background: #fff; border: 1px solid #888; }
    </style>
  </head>
  <body>
    <a class="skip-link" href="#content">Skip to content</a>
    <main id="content">
      <button>Before</button>
      <p>Text spacing can grow here because the paragraph wraps and the page can reflow naturally.</p>
      <div class="tooltip-wrap">
        <button>Helpful details</button>
        <div class="tooltip">This content stays visible while hovered through its parent wrapper.</div>
      </div>
      <div role="dialog" aria-modal="true" class="dialog">
        <button>Modal action</button>
        <button>Close</button>
      </div>
      <button>After modal</button>
      <div class="partly-covered">
        <button>Partly visible focus</button>
        <span class="partial-cover"></span>
      </div>
    </main>
    <script>
      const wrap = document.querySelector(".tooltip-wrap");
      const trigger = wrap.querySelector("button");
      trigger.addEventListener("mouseenter", () => wrap.classList.add("open"));
      trigger.addEventListener("focus", () => wrap.classList.add("open"));
      wrap.addEventListener("mouseenter", () => wrap.classList.add("open"));
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") wrap.classList.remove("open");
      });
    </script>
  </body>
</html>`;

const falsePositiveRuntimeFixture = `<!doctype html>
<html lang="en">
  <head>
    <title>Runtime false positives</title>
    <style>
      ${baseStyles}
      .wide-scroller { width: 260px; overflow-x: auto; border: 1px solid #777; }
      .wide-scroller p { width: 520px; margin: 0; }
      .described { margin: 24px 0; }
      .persistent-help { display: inline-block; margin-left: 8px; padding: 6px; border: 1px solid #555; }
      .hidden-template { display: none; position: absolute; top: 40px; left: 0; }
      .icon-button { position: relative; width: 96px; height: 44px; padding-left: 28px; }
      .icon-button span { position: absolute; left: 6px; top: 6px; width: 24px; height: 24px; background: #fff; border: 1px solid #111; }
      .spacious { max-width: 28rem; line-height: 1.7; }
      .natural-flow { margin-top: 24px; }
    </style>
  </head>
  <body>
    <a class="skip-link" href="#content">Skip to content</a>
    <main id="content">
      <button>Before</button>
      <section class="described">
        <button aria-describedby="help">Described action</button>
        <span id="help" class="persistent-help">This help is already visible and does not appear transiently.</span>
      </section>
      <section class="natural-flow">
        <button data-tooltip="internal-template-only">Template backed action</button>
        <span class="hidden-template">Hidden tooltip template is not rendered content.</span>
      </section>
      <section class="wide-scroller">
        <p>This intentionally wide code-like line sits in a scrollable region, so user-controlled text spacing should not be treated as clipped content loss.</p>
      </section>
      <p class="spacious">This paragraph already has generous spacing and can wrap naturally without clipping or overlapping when spacing preferences increase.</p>
      <button class="icon-button"><span aria-hidden="true"></span>Icon child</button>
      <button>After</button>
    </main>
  </body>
</html>`;

const alternatingTrapFixture = `<!doctype html>
<html lang="en">
  <head>
    <title>Alternating trap</title>
    <style>${baseStyles}</style>
  </head>
  <body>
    <a class="skip-link" href="#content">Skip to content</a>
    <main id="content">
      <button>Before</button>
      <section class="trap" tabindex="0">
        <button>First trapped control</button>
        <button>Second trapped control</button>
      </section>
      <button>Should be reachable</button>
    </main>
    <script>
      const trap = document.querySelector(".trap");
      const buttons = [...trap.querySelectorAll("button")];
      trap.addEventListener("keydown", (event) => {
        if (event.key === "Tab") {
          event.preventDefault();
          const index = buttons.indexOf(document.activeElement);
          buttons[(index + 1) % buttons.length].focus();
        }
      });
    </script>
  </body>
</html>`;

const modalFocusContainmentFixture = `<!doctype html>
<html lang="en">
  <head>
    <title>Modal containment</title>
    <style>${baseStyles}</style>
  </head>
  <body>
    <a class="skip-link" href="#content">Skip to content</a>
    <main id="content">
      <button>Before</button>
      <div role="dialog" aria-modal="true" class="modal">
        <button>First modal action</button>
        <button>Second modal action</button>
      </div>
      <button>After modal</button>
    </main>
    <script>
      const modal = document.querySelector(".modal");
      const buttons = [...modal.querySelectorAll("button")];
      modal.addEventListener("keydown", (event) => {
        if (event.key === "Tab") {
          event.preventDefault();
          const index = buttons.indexOf(document.activeElement);
          buttons[(index + 1) % buttons.length].focus();
        }
      });
    </script>
  </body>
</html>`;

const preExistingOverlapFixture = `<!doctype html>
<html lang="en">
  <head>
    <title>Pre-existing overlap</title>
    <style>
      ${baseStyles}
      .stack { position: relative; min-height: 90px; }
      .stack p { position: absolute; left: 0; top: 0; max-width: 20rem; background: #fff; }
      .stack p + p { top: 0; }
    </style>
  </head>
  <body>
    <a class="skip-link" href="#content">Skip to content</a>
    <main id="content">
      <button>Before</button>
      <div class="stack">
        <p>This text already overlaps before any spacing is applied.</p>
        <p>This second text is intentionally in the same place from page load.</p>
      </div>
      <button>After</button>
    </main>
  </body>
</html>`;

const fullFocusCoverageFixture = `<!doctype html>
<html lang="en">
  <head>
    <title>Full focus coverage</title>
    <style>
      ${baseStyles}
      .covered { position: relative; width: 180px; height: 52px; }
      .covered button { position: absolute; left: 0; top: 0; width: 150px; height: 36px; }
      .cover { position: absolute; left: 0; top: 0; width: 150px; height: 36px; z-index: 2; background: #fff; }
    </style>
  </head>
  <body>
    <a class="skip-link" href="#content">Skip to content</a>
    <main id="content">
      <button>Before</button>
      <div class="covered">
        <button>Covered</button>
        <span class="cover"></span>
      </div>
    </main>
  </body>
</html>`;

const partialFocusCoverageFixture = `<!doctype html>
<html lang="en">
  <head>
    <title>Partial focus coverage</title>
    <style>
      ${baseStyles}
      .covered { position: relative; width: 180px; height: 52px; }
      .covered button { position: absolute; left: 0; top: 0; width: 150px; height: 36px; }
      .cover { position: absolute; left: 0; top: 0; width: 40px; height: 36px; z-index: 2; background: #fff; }
    </style>
  </head>
  <body>
    <a class="skip-link" href="#content">Skip to content</a>
    <main id="content">
      <button>Before</button>
      <div class="covered">
        <button>Partly covered</button>
        <span class="cover"></span>
      </div>
    </main>
  </body>
</html>`;
