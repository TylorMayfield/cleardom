import * as assert from "node:assert/strict";
import { test } from "node:test";
import { scanSource } from "./scanner.js";

test("flags web controls without accessible names", () => {
  const findings = scanSource("<button><XIcon /></button>", "Button.tsx");

  assert.equal(findings.some((finding) => finding.ruleId === "CDOM001"), true);
});

test("accepts visible text and aria labels as accessible names", () => {
  assert.equal(scanSource("<button><span>Close</span></button>", "Button.tsx").some((finding) => finding.ruleId === "CDOM001"), false);
  assert.equal(scanSource('<button aria-label="Close"><XIcon /></button>', "Button.tsx").some((finding) => finding.ruleId === "CDOM001"), false);
  assert.equal(scanSource('<button aria-label={"Close"}><XIcon /></button>', "Button.tsx").some((finding) => finding.ruleId === "CDOM001"), false);
  assert.equal(scanSource('<button>{"Close"}</button>', "Button.tsx").some((finding) => finding.ruleId === "CDOM001"), false);
  assert.equal(scanSource('<button aria-labelledby="close-label"><XIcon /></button>', "Button.tsx").some((finding) => finding.ruleId === "CDOM001"), false);
  assert.equal(scanSource('<button title="Close"><XIcon /></button>', "Button.tsx").some((finding) => finding.ruleId === "CDOM001"), false);
});

test("TypeScript semantic analysis resolves constants and object spreads", () => {
  const source = `
    const label = "Close cart";
    const props = { "aria-label": label };
    export function Checkout() {
      return <button {...props}><XIcon /></button>;
    }
  `;

  assert.equal(scanSource(source, "Checkout.tsx").some((finding) => finding.ruleId === "CDOM001"), false);
  assert.equal(scanSource(source, "Checkout.tsx", { semantic: "off" }).some((finding) => finding.ruleId === "CDOM001"), true);
});

test("TypeScript semantic analysis resolves simple intrinsic tag aliases", () => {
  const source = `
    const Control = "button";
    export function Checkout() {
      return <Control aria-label="Close cart"><XIcon /></Control>;
    }
  `;

  assert.equal(scanSource(source, "Checkout.tsx").some((finding) => finding.ruleId === "CDOM001"), false);
});

test("semantic off keeps unresolved dynamic expressions unknown", () => {
  const source = "export function Checkout({ label }) { return <button aria-label={label}><XIcon /></button>; }";

  assert.equal(scanSource(source, "Checkout.tsx").some((finding) => finding.ruleId === "CDOM001"), true);
});

test("resolves aria-labelledby text by id", () => {
  const findings = scanSource('<span id="close-label">Close</span><button aria-labelledby="close-label"><XIcon /></button>', "Button.tsx");

  assert.equal(findings.some((finding) => finding.ruleId === "CDOM001"), false);
});

test("uses design-system component mappings for interactive controls", () => {
  const options = {
    components: {
      IconButton: { role: "button" as const, nameProps: ["label"] }
    }
  };

  assert.equal(scanSource("<IconButton icon={<XIcon />} />", "Button.tsx", options).some((finding) => finding.ruleId === "CDOM001"), true);
  assert.equal(scanSource('<IconButton label="Close cart" icon={<XIcon />} />', "Button.tsx", options).some((finding) => finding.ruleId === "CDOM001"), false);
});

test("flags React Native touchables missing labels and roles", () => {
  const findings = scanSource("<Pressable><Icon /></Pressable>", "Button.tsx");

  assert.equal(findings.some((finding) => finding.ruleId === "CDOM002"), true);
  assert.equal(findings.some((finding) => finding.ruleId === "CDOM009"), true);
});

test("accepts labelled React Native touchables with roles", () => {
  const findings = scanSource('<Pressable accessibilityLabel="Close" accessibilityRole="button"><Icon /></Pressable>', "Button.tsx");

  assert.equal(findings.some((finding) => finding.ruleId === "CDOM002"), false);
  assert.equal(findings.some((finding) => finding.ruleId === "CDOM009"), false);
});

test("flags ambiguous labels", () => {
  const findings = scanSource("<button>Click here</button>", "Button.tsx");

  assert.equal(findings.some((finding) => finding.ruleId === "CDOM003"), true);
});

test("flags placeholder-only inputs and accepts real label signals", () => {
  assert.equal(scanSource('<input placeholder="Email" />', "Form.tsx").some((finding) => finding.ruleId === "CDOM004"), true);
  assert.equal(scanSource('<input aria-label="Email" placeholder="Email" />', "Form.tsx").some((finding) => finding.ruleId === "CDOM004"), false);
  assert.equal(scanSource('<label>Email<input placeholder="Email" /></label>', "Form.tsx").some((finding) => finding.ruleId === "CDOM004"), false);
  assert.equal(scanSource('<label htmlFor="email">Email</label><input id="email" placeholder="Email" />', "Form.tsx").some((finding) => finding.ruleId === "CDOM004"), false);
});

test("flags form controls without accessible labels", () => {
  const findings = scanSource('<input name="email" /><select name="state"><option>Choose a state</option></select><textarea name="notes" />', "Form.tsx");

  assert.equal(findings.filter((finding) => finding.ruleId === "CDOM010").length, 3);
  assert.equal(scanSource('<label htmlFor="email">Email</label><input id="email" />', "Form.tsx").some((finding) => finding.ruleId === "CDOM010"), false);
  assert.equal(scanSource('<select aria-label="State" />', "Form.tsx").some((finding) => finding.ruleId === "CDOM010"), false);
});

test("flags document metadata issues when scanning full HTML", () => {
  const missingTitle = scanSource("<html><head></head><body /></html>", "index.html");
  const emptyTitle = scanSource('<html lang="en"><head><title></title></head><body /></html>', "index.html");

  assert.equal(missingTitle.filter((finding) => finding.ruleId === "CDOM011").length, 2);
  assert.equal(emptyTitle.filter((finding) => finding.ruleId === "CDOM011").length, 1);
  assert.equal(scanSource('<html lang="en"><head><title>App</title></head></html>', "index.html").some((finding) => finding.ruleId === "CDOM011"), false);
});

test("uses design-system component mappings for textbox labels", () => {
  const options = {
    components: {
      TextInput: { role: "textbox" as const, nameProps: ["label"] }
    }
  };

  assert.equal(scanSource('<TextInput placeholder="Email" />', "Form.tsx", options).some((finding) => finding.ruleId === "CDOM004"), true);
  assert.equal(scanSource('<TextInput label="Email" placeholder="Email" />', "Form.tsx", options).some((finding) => finding.ruleId === "CDOM004"), false);
});

test("flags image alt, anchor href, keyboard, and heading order issues", () => {
  const source = `
    <main>
      <h2>Billing</h2>
      <h4>Details</h4>
      <img src="/chart.png" />
      <a>Receipt</a>
      <div onClick={() => open()}>Open</div>
    </main>
  `;
  const findings = scanSource(source, "Page.tsx");

  assert.equal(findings.some((finding) => finding.ruleId === "CDOM005"), true);
  assert.equal(findings.some((finding) => finding.ruleId === "CDOM006"), true);
  assert.equal(findings.some((finding) => finding.ruleId === "CDOM007"), true);
  assert.equal(findings.some((finding) => finding.ruleId === "CDOM008"), true);
});

test("flags framework template click handlers without keyboard support", () => {
  assert.equal(scanSource('<template><div @click="open">Open</div></template>', "Component.vue").some((finding) => finding.ruleId === "CDOM007"), true);
  assert.equal(scanSource('<div on:click={open}>Open</div>', "Component.svelte").some((finding) => finding.ruleId === "CDOM007"), true);
  assert.equal(scanSource('<div (click)="open()">Open</div>', "component.component.html").some((finding) => finding.ruleId === "CDOM007"), true);
  assert.equal(scanSource('<div @click="open" @keydown="open" tabindex="0">Open</div>', "Component.vue").some((finding) => finding.ruleId === "CDOM007"), false);
});

test("scans Astro and MDX markup through source adapters", () => {
  assert.equal(scanSource("---\nconst label = 'x';\n---\n<button />", "Button.astro").some((finding) => finding.ruleId === "CDOM001"), true);
  assert.equal(scanSource("# Docs\n\n<button />", "Button.mdx").some((finding) => finding.ruleId === "CDOM001"), true);
});

test("supports disabling and overriding rules", () => {
  const disabled = scanSource("<button />", "Button.tsx", { rules: { CDOM001: "off" } });
  const overridden = scanSource("<button />", "Button.tsx", { rules: { CDOM001: "warning" } });

  assert.equal(disabled.some((finding) => finding.ruleId === "CDOM001"), false);
  assert.equal(overridden.find((finding) => finding.ruleId === "CDOM001")?.severity, "warning");
});

test("flags personal information fields missing autocomplete purpose tokens", () => {
  const missing = scanSource('<label htmlFor="email">Email</label><input id="email" name="email" />', "Form.tsx");
  const present = scanSource('<label htmlFor="email">Email</label><input id="email" name="email" autocomplete="email" />', "Form.tsx");

  assert.equal(missing.some((finding) => finding.ruleId === "CDOM012"), true);
  assert.equal(present.some((finding) => finding.ruleId === "CDOM012"), false);
});

test("flags accessible names that omit visible labels", () => {
  const mismatch = scanSource('<button aria-label="Close dialog">Save</button>', "Button.tsx");
  const matching = scanSource('<button aria-label="Save changes">Save</button>', "Button.tsx");
  const mapped = scanSource('<IconButton label="Archive" aria-label="Delete" />', "Button.tsx", {
    components: {
      IconButton: { role: "button" as const, nameProps: ["aria-label"], labelProps: ["label"] }
    }
  });

  assert.equal(mismatch.some((finding) => finding.ruleId === "CDOM013"), true);
  assert.equal(matching.some((finding) => finding.ruleId === "CDOM013"), false);
  assert.equal(mapped.some((finding) => finding.ruleId === "CDOM013"), true);
});

test("flags status-like messages without live-region semantics", () => {
  const missing = scanSource('<div className="toast success">Saved</div>', "Status.tsx");
  const present = scanSource('<div className="toast success" role="status">Saved</div>', "Status.tsx");

  assert.equal(missing.some((finding) => finding.ruleId === "CDOM014"), true);
  assert.equal(present.some((finding) => finding.ruleId === "CDOM014"), false);
});

test("flags media without obvious captions, descriptions, or transcripts", () => {
  const missing = scanSource('<video controls src="/demo.mp4" /><audio controls src="/podcast.mp3" />', "Media.tsx");
  const present = scanSource('<video controls><track kind="captions" src="/captions.vtt" /></video><audio controls aria-describedby="transcript" />', "Media.tsx");

  assert.equal(missing.filter((finding) => finding.ruleId === "CDOM015").length, 2);
  assert.equal(present.some((finding) => finding.ruleId === "CDOM015"), false);
});

test("flags focusable controls hidden from assistive technology", () => {
  const hiddenButton = scanSource('<div aria-hidden="true"><button>Close</button></div>', "Dialog.tsx");
  const decorativeIcon = scanSource('<span aria-hidden="true"><Icon /></span><button>Close</button>', "Dialog.tsx");

  assert.equal(hiddenButton.some((finding) => finding.ruleId === "CDOM016"), true);
  assert.equal(decorativeIcon.some((finding) => finding.ruleId === "CDOM016"), false);
});

test("flags duplicate id values", () => {
  const duplicate = scanSource('<label htmlFor="email">Email</label><input id="email" /><p id="email">Help</p>', "Form.tsx");
  const unique = scanSource('<label htmlFor="email">Email</label><input id="email" /><p id="email-help">Help</p>', "Form.tsx");

  assert.equal(duplicate.some((finding) => finding.ruleId === "CDOM017"), true);
  assert.equal(unique.some((finding) => finding.ruleId === "CDOM017"), false);
});

test("flags positive tabIndex values", () => {
  const positive = scanSource('<button tabIndex="3">Later</button><button tabIndex={2}>Sooner</button>', "Focus.tsx");
  const neutral = scanSource('<div role="button" tabIndex={0}>Open</div><button tabIndex="-1">Programmatic</button>', "Focus.tsx");

  assert.equal(positive.filter((finding) => finding.ruleId === "CDOM018").length, 2);
  assert.equal(neutral.some((finding) => finding.ruleId === "CDOM018"), false);
});

test("flags grouped controls without legends", () => {
  const missing = scanSource('<fieldset><label><input type="radio" /> Economy</label></fieldset>', "Form.tsx");
  const present = scanSource('<fieldset><legend>Shipping speed</legend><label><input type="radio" /> Economy</label></fieldset>', "Form.tsx");

  assert.equal(missing.some((finding) => finding.ruleId === "CDOM019"), true);
  assert.equal(present.some((finding) => finding.ruleId === "CDOM019"), false);
});

test("flags invalid controls that are not connected to error text", () => {
  const missing = scanSource('<input aria-invalid="true" />', "Form.tsx");
  const present = scanSource('<input aria-invalid="true" aria-describedby="email-error" /><p id="email-error">Enter an email.</p>', "Form.tsx");

  assert.equal(missing.some((finding) => finding.ruleId === "CDOM020"), true);
  assert.equal(present.some((finding) => finding.ruleId === "CDOM020"), false);
});

test("flags pointer down activation without a cancellation path", () => {
  const risky = scanSource('<button onPointerDown={() => buyNow()}>Buy</button>', "Pointer.tsx");
  const safer = scanSource('<button onPointerDown={() => preview()} onPointerUp={() => commit()}>Drag</button>', "Pointer.tsx");

  assert.equal(risky.some((finding) => finding.ruleId === "CDOM021"), true);
  assert.equal(safer.some((finding) => finding.ruleId === "CDOM021"), false);
});

test("flags instructions that may rely on color alone", () => {
  const risky = scanSource("<p>Required fields are shown in red.</p>", "Instructions.tsx");
  const safer = scanSource("<p>Required fields are marked with an asterisk and red border.</p>", "Instructions.tsx");

  assert.equal(risky.some((finding) => finding.ruleId === "CDOM027"), true);
  assert.equal(safer.some((finding) => finding.ruleId === "CDOM027"), false);
});

test("flags instructions that may rely on sensory characteristics", () => {
  const risky = scanSource("<p>Press the round button on the right.</p>", "Instructions.tsx");
  const safer = scanSource("<p>Press Continue, the round button on the right.</p>", "Instructions.tsx");

  assert.equal(risky.some((finding) => finding.ruleId === "CDOM028"), true);
  assert.equal(safer.some((finding) => finding.ruleId === "CDOM028"), false);
});

test("flags foreign-language passages without lang", () => {
  const missing = scanSource("<p>Bonjour, votre reçu est prêt.</p>", "Language.tsx");
  const present = scanSource('<p><span lang="fr">Bonjour, votre reçu est prêt.</span></p>', "Language.tsx");
  const nonLatin = scanSource("<p>مرحبا بك</p><p>設定を保存しました</p>", "Language.tsx");
  const loanword = scanSource("<p>café</p>", "Language.tsx");

  assert.equal(missing.some((finding) => finding.ruleId === "CDOM029"), true);
  assert.equal(present.some((finding) => finding.ruleId === "CDOM029"), false);
  assert.equal(nonLatin.filter((finding) => finding.ruleId === "CDOM029").length, 2);
  assert.equal(loanword.some((finding) => finding.ruleId === "CDOM029"), false);
});

test("flags focus and input handlers that may change context", () => {
  const risky = scanSource('<input onFocus={() => window.location.assign("/help")} /><select onChange={() => submit()} />', "Context.tsx");
  const safer = scanSource('<input onFocus={() => showHelp()} /><select onChange={() => setCountry()} />', "Context.tsx");

  assert.equal(risky.filter((finding) => finding.ruleId === "CDOM030").length, 2);
  assert.equal(safer.some((finding) => finding.ruleId === "CDOM030"), false);
});

test("uses component presets for common design-system controls", () => {
  const findings = scanSource('<IconButton icon={<CloseIcon />} /><TextField placeholder="Email" />', "DesignSystem.tsx", {
    componentPresets: ["mui"]
  });

  assert.equal(findings.some((finding) => finding.ruleId === "CDOM001"), true);
  assert.equal(findings.some((finding) => finding.ruleId === "CDOM004"), true);
});
