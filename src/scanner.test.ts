import * as assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { fingerprintFinding } from "./baseline.js";
import { scanPath, scanSource } from "./scanner.js";

test("flags web controls without accessible names", () => {
  const findings = scanSource("<button><XIcon /></button>", "Button.tsx");

  assert.equal(findings.some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), true);
});

test("accepts visible text and aria labels as accessible names", () => {
  assert.equal(scanSource("<button><span>Close</span></button>", "Button.tsx").some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), false);
  assert.equal(scanSource('<button aria-label="Close"><XIcon /></button>', "Button.tsx").some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), false);
  assert.equal(scanSource('<button aria-label={"Close"}><XIcon /></button>', "Button.tsx").some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), false);
  assert.equal(scanSource('<button>{"Close"}</button>', "Button.tsx").some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), false);
  assert.equal(scanSource('<button aria-labelledby="close-label"><XIcon /></button>', "Button.tsx").some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), false);
  assert.equal(scanSource('<button title="Close"><XIcon /></button>', "Button.tsx").some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), false);
});

test("ignores aria-hidden child text when computing accessible names", () => {
  const findings = scanSource('<button><span aria-hidden="true">x</span></button>', "Button.tsx");

  assert.equal(findings.some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), true);
});

test("TypeScript semantic analysis resolves constants and object spreads", () => {
  const source = `
    const label = "Close cart";
    const props = { "aria-label": label };
    export function Checkout() {
      return <button {...props}><XIcon /></button>;
    }
  `;

  assert.equal(scanSource(source, "Checkout.tsx").some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), false);
  assert.equal(scanSource(source, "Checkout.tsx", { semantic: "off" }).some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), true);
});

test("TypeScript semantic analysis resolves simple intrinsic tag aliases", () => {
  const source = `
    const Control = "button";
    export function Checkout() {
      return <Control aria-label="Close cart"><XIcon /></Control>;
    }
  `;

  assert.equal(scanSource(source, "Checkout.tsx").some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), false);
});

test("semantic off keeps unresolved dynamic expressions unknown", () => {
  const source = "export function Checkout({ label }) { return <button aria-label={label}><XIcon /></button>; }";

  assert.equal(scanSource(source, "Checkout.tsx").some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), true);
});

test("resolves aria-labelledby text by id", () => {
  const findings = scanSource('<span id="close-label">Close</span><button aria-labelledby="close-label"><XIcon /></button>', "Button.tsx");

  assert.equal(findings.some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), false);
});

test("uses design-system component mappings for interactive controls", () => {
  const options = {
    components: {
      IconButton: { role: "button" as const, nameProps: ["label"] }
    }
  };

  assert.equal(scanSource("<IconButton icon={<XIcon />} />", "Button.tsx", options).some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), true);
  assert.equal(scanSource('<IconButton label="Close cart" icon={<XIcon />} />', "Button.tsx", options).some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), false);
});

test("flags React Native touchables missing labels and roles", () => {
  const findings = scanSource("<Pressable><Icon /></Pressable>", "Button.tsx");

  assert.equal(findings.some((finding) => finding.ruleId === "CDOM_4_1_2_NATIVE_LABEL"), true);
  assert.equal(findings.some((finding) => finding.ruleId === "CDOM_4_1_2_NATIVE_ROLE"), true);
});

test("accepts labelled React Native touchables with roles", () => {
  const findings = scanSource('<Pressable accessibilityLabel="Close" accessibilityRole="button"><Icon /></Pressable>', "Button.tsx");

  assert.equal(findings.some((finding) => finding.ruleId === "CDOM_4_1_2_NATIVE_LABEL"), false);
  assert.equal(findings.some((finding) => finding.ruleId === "CDOM_4_1_2_NATIVE_ROLE"), false);
});

test("flags ambiguous labels", () => {
  const findings = scanSource("<button>Click here</button>", "Button.tsx");

  assert.equal(findings.some((finding) => finding.ruleId === "CDOM_2_4_4_AMBIGUOUS_LABEL"), true);
});

test("flags placeholder-only inputs and accepts real label signals", () => {
  assert.equal(scanSource('<input placeholder="Email" />', "Form.tsx").some((finding) => finding.ruleId === "CDOM_3_3_2_PLACEHOLDER_LABEL"), true);
  assert.equal(scanSource('<input aria-label="Email" placeholder="Email" />', "Form.tsx").some((finding) => finding.ruleId === "CDOM_3_3_2_PLACEHOLDER_LABEL"), false);
  assert.equal(scanSource('<label>Email<input placeholder="Email" /></label>', "Form.tsx").some((finding) => finding.ruleId === "CDOM_3_3_2_PLACEHOLDER_LABEL"), false);
  assert.equal(scanSource('<label htmlFor="email">Email</label><input id="email" placeholder="Email" />', "Form.tsx").some((finding) => finding.ruleId === "CDOM_3_3_2_PLACEHOLDER_LABEL"), false);
});

test("flags form controls without accessible labels", () => {
  const findings = scanSource('<input name="email" /><select name="state"><option>Choose a state</option></select><textarea name="notes" />', "Form.tsx");

  assert.equal(findings.filter((finding) => finding.ruleId === "CDOM_4_1_2_FORM_LABEL").length, 3);
  assert.equal(scanSource('<label htmlFor="email">Email</label><input id="email" />', "Form.tsx").some((finding) => finding.ruleId === "CDOM_4_1_2_FORM_LABEL"), false);
  assert.equal(scanSource('<select aria-label="State" />', "Form.tsx").some((finding) => finding.ruleId === "CDOM_4_1_2_FORM_LABEL"), false);
});

test("flags document metadata issues when scanning full HTML", () => {
  const missingTitle = scanSource("<html><head></head><body /></html>", "index.html");
  const emptyTitle = scanSource('<html lang="en"><head><title></title></head><body /></html>', "index.html");

  assert.equal(missingTitle.filter((finding) => finding.ruleId === "CDOM_3_1_1_DOCUMENT_METADATA").length, 2);
  assert.equal(emptyTitle.filter((finding) => finding.ruleId === "CDOM_3_1_1_DOCUMENT_METADATA").length, 1);
  assert.equal(scanSource('<html lang="en"><head><title>App</title></head></html>', "index.html").some((finding) => finding.ruleId === "CDOM_3_1_1_DOCUMENT_METADATA"), false);
});

test("uses design-system component mappings for textbox labels", () => {
  const options = {
    components: {
      TextInput: { role: "textbox" as const, nameProps: ["label"] }
    }
  };

  assert.equal(scanSource('<TextInput placeholder="Email" />', "Form.tsx", options).some((finding) => finding.ruleId === "CDOM_3_3_2_PLACEHOLDER_LABEL"), true);
  assert.equal(scanSource('<TextInput label="Email" placeholder="Email" />', "Form.tsx", options).some((finding) => finding.ruleId === "CDOM_3_3_2_PLACEHOLDER_LABEL"), false);
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

  assert.equal(findings.some((finding) => finding.ruleId === "CDOM_1_1_1_IMAGE_ALT"), true);
  assert.equal(findings.some((finding) => finding.ruleId === "CDOM_4_1_2_ANCHOR_HREF"), true);
  assert.equal(findings.some((finding) => finding.ruleId === "CDOM_2_1_1_KEYBOARD"), true);
  assert.equal(findings.some((finding) => finding.ruleId === "CDOM_1_3_1_HEADING_ORDER"), true);
});

test("flags framework template click handlers without keyboard support", () => {
  assert.equal(scanSource('<template><div @click="open">Open</div></template>', "Component.vue").some((finding) => finding.ruleId === "CDOM_2_1_1_KEYBOARD"), true);
  assert.equal(scanSource('<div on:click={open}>Open</div>', "Component.svelte").some((finding) => finding.ruleId === "CDOM_2_1_1_KEYBOARD"), true);
  assert.equal(scanSource('<div (click)="open()">Open</div>', "component.component.html").some((finding) => finding.ruleId === "CDOM_2_1_1_KEYBOARD"), true);
  assert.equal(scanSource('<div @click="open" @keydown="open" tabindex="0">Open</div>', "Component.vue").some((finding) => finding.ruleId === "CDOM_2_1_1_KEYBOARD"), false);
});

test("scans Astro and MDX markup through source adapters", () => {
  assert.equal(scanSource("---\nconst label = 'x';\n---\n<button />", "Button.astro").some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), true);
  assert.equal(scanSource("# Docs\n\n<button />", "Button.mdx").some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), true);
});

test("supports disabling and overriding rules", () => {
  const disabled = scanSource("<button />", "Button.tsx", { rules: { CDOM_4_1_2_UNNAMED_CONTROL: "off" } });
  const overridden = scanSource("<button />", "Button.tsx", { rules: { CDOM_4_1_2_UNNAMED_CONTROL: "warning" } });
  const legacyDisabled = scanSource("<button />", "Button.tsx", { rules: { CDOM001: "off" } });

  assert.equal(disabled.some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), false);
  assert.equal(overridden.find((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL")?.severity, "warning");
  assert.equal(legacyDisabled.some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), false);
});

test("supports inline ignore comments with required reasons", () => {
  const suppressed = scanSource("{/* cleardom-ignore-next-line CDOM001 -- icon-only button is labelled at runtime */}\n<button />", "Button.tsx");
  const missingReason = scanSource("{/* cleardom-ignore-next-line CDOM001 */}\n<button />", "Button.tsx");

  assert.equal(suppressed.some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), false);
  assert.equal(missingReason.some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), true);
});

test("config suppressions require scoped metadata and report suppressed findings", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "cleardom-suppressions-"));
  await fs.writeFile(path.join(directory, "Button.tsx"), "<button />", "utf8");
  const configPath = path.join(directory, "cleardom.config.json");
  await fs.writeFile(configPath, JSON.stringify({
    suppressions: [{
      rule: "CDOM_4_1_2_UNNAMED_CONTROL",
      file: "Button.tsx",
      reason: "Third-party component is labelled after hydration.",
      expires: "2099-01-01",
      approvedBy: "@a11y"
    }]
  }), "utf8");

  const result = await scanPath(directory, { configPath });

  assert.equal(result.activeFindings.some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), false);
  assert.equal(result.suppressedFindings.some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), true);
  assert.equal(result.summary.suppressedFindings, 1);
});

test("fingerprints semantic rule target and location instead of message text", () => {
  const first = fingerprintFinding({
    ruleId: "CDOM_4_1_2_UNNAMED_CONTROL",
    file: "Button.tsx",
    semanticLocation: "button:nth-1",
    target: "button[type=button]"
  });
  const second = fingerprintFinding({
    ruleId: "CDOM_4_1_2_UNNAMED_CONTROL",
    file: "Button.tsx",
    semanticLocation: "button:nth-1",
    target: "button[type=button]"
  });

  assert.equal(first, second);
});

test("flags personal information fields missing autocomplete purpose tokens", () => {
  const missing = scanSource('<label htmlFor="email">Email</label><input id="email" name="email" />', "Form.tsx");
  const present = scanSource('<label htmlFor="email">Email</label><input id="email" name="email" autocomplete="email" />', "Form.tsx");

  assert.equal(missing.some((finding) => finding.ruleId === "CDOM_1_3_5_AUTOCOMPLETE"), true);
  assert.equal(present.some((finding) => finding.ruleId === "CDOM_1_3_5_AUTOCOMPLETE"), false);
});

test("flags accessible names that omit visible labels", () => {
  const mismatch = scanSource('<button aria-label="Close dialog">Save</button>', "Button.tsx");
  const matching = scanSource('<button aria-label="Save changes">Save</button>', "Button.tsx");
  const mapped = scanSource('<IconButton label="Archive" aria-label="Delete" />', "Button.tsx", {
    components: {
      IconButton: { role: "button" as const, nameProps: ["aria-label"], labelProps: ["label"] }
    }
  });

  assert.equal(mismatch.some((finding) => finding.ruleId === "CDOM_2_5_3_LABEL_IN_NAME"), true);
  assert.equal(matching.some((finding) => finding.ruleId === "CDOM_2_5_3_LABEL_IN_NAME"), false);
  assert.equal(mapped.some((finding) => finding.ruleId === "CDOM_2_5_3_LABEL_IN_NAME"), true);
});

test("flags status-like messages without live-region semantics", () => {
  const missing = scanSource('<div className="toast success">Saved</div>', "Status.tsx");
  const present = scanSource('<div className="toast success" role="status">Saved</div>', "Status.tsx");

  assert.equal(missing.some((finding) => finding.ruleId === "CDOM_4_1_3_STATUS_LIVE_REGION"), true);
  assert.equal(present.some((finding) => finding.ruleId === "CDOM_4_1_3_STATUS_LIVE_REGION"), false);
});

test("flags media without obvious captions, descriptions, or transcripts", () => {
  const missing = scanSource('<video controls src="/demo.mp4" /><audio controls src="/podcast.mp3" />', "Media.tsx");
  const present = scanSource('<video controls><track kind="captions" src="/captions.vtt" /></video><audio controls aria-describedby="transcript" />', "Media.tsx");

  assert.equal(missing.filter((finding) => finding.ruleId === "CDOM_1_2_1_MEDIA_ALTERNATIVE").length, 2);
  assert.equal(present.some((finding) => finding.ruleId === "CDOM_1_2_1_MEDIA_ALTERNATIVE"), false);
});

test("flags focusable controls hidden from assistive technology", () => {
  const hiddenButton = scanSource('<div aria-hidden="true"><button>Close</button></div>', "Dialog.tsx");
  const decorativeIcon = scanSource('<span aria-hidden="true"><Icon /></span><button>Close</button>', "Dialog.tsx");

  assert.equal(hiddenButton.some((finding) => finding.ruleId === "CDOM_4_1_2_ARIA_HIDDEN_FOCUS"), true);
  assert.equal(decorativeIcon.some((finding) => finding.ruleId === "CDOM_4_1_2_ARIA_HIDDEN_FOCUS"), false);
});

test("flags duplicate id values", () => {
  const duplicate = scanSource('<label htmlFor="email">Email</label><input id="email" /><p id="email">Help</p>', "Form.tsx");
  const unique = scanSource('<label htmlFor="email">Email</label><input id="email" /><p id="email-help">Help</p>', "Form.tsx");

  assert.equal(duplicate.some((finding) => finding.ruleId === "CDOM_4_1_2_DUPLICATE_ID"), true);
  assert.equal(unique.some((finding) => finding.ruleId === "CDOM_4_1_2_DUPLICATE_ID"), false);
});

test("flags positive tabIndex values", () => {
  const positive = scanSource('<button tabIndex="3">Later</button><button tabIndex={2}>Sooner</button>', "Focus.tsx");
  const neutral = scanSource('<div role="button" tabIndex={0}>Open</div><button tabIndex="-1">Programmatic</button>', "Focus.tsx");

  assert.equal(positive.filter((finding) => finding.ruleId === "CDOM_2_4_3_POSITIVE_TABINDEX").length, 2);
  assert.equal(neutral.some((finding) => finding.ruleId === "CDOM_2_4_3_POSITIVE_TABINDEX"), false);
});

test("flags grouped controls without legends", () => {
  const missing = scanSource('<fieldset><label><input type="radio" /> Economy</label></fieldset>', "Form.tsx");
  const present = scanSource('<fieldset><legend>Shipping speed</legend><label><input type="radio" /> Economy</label></fieldset>', "Form.tsx");

  assert.equal(missing.some((finding) => finding.ruleId === "CDOM_1_3_1_FIELDSET_LEGEND"), true);
  assert.equal(present.some((finding) => finding.ruleId === "CDOM_1_3_1_FIELDSET_LEGEND"), false);
});

test("flags invalid controls that are not connected to error text", () => {
  const missing = scanSource('<input aria-invalid="true" />', "Form.tsx");
  const present = scanSource('<input aria-invalid="true" aria-describedby="email-error" /><p id="email-error">Enter an email.</p>', "Form.tsx");

  assert.equal(missing.some((finding) => finding.ruleId === "CDOM_3_3_1_ERROR_DESCRIPTION"), true);
  assert.equal(present.some((finding) => finding.ruleId === "CDOM_3_3_1_ERROR_DESCRIPTION"), false);
});

test("flags pointer down activation without a cancellation path", () => {
  const risky = scanSource('<button onPointerDown={() => buyNow()}>Buy</button>', "Pointer.tsx");
  const safer = scanSource('<button onPointerDown={() => preview()} onPointerUp={() => commit()}>Drag</button>', "Pointer.tsx");

  assert.equal(risky.some((finding) => finding.ruleId === "CDOM_2_5_2_POINTER_CANCELLATION"), true);
  assert.equal(safer.some((finding) => finding.ruleId === "CDOM_2_5_2_POINTER_CANCELLATION"), false);
});

test("flags instructions that may rely on color alone", () => {
  const risky = scanSource("<p>Required fields are shown in red.</p>", "Instructions.tsx");
  const safer = scanSource("<p>Required fields are marked with an asterisk and red border.</p>", "Instructions.tsx");

  assert.equal(risky.some((finding) => finding.ruleId === "CDOM_1_4_1_USE_OF_COLOR"), true);
  assert.equal(safer.some((finding) => finding.ruleId === "CDOM_1_4_1_USE_OF_COLOR"), false);
});

test("flags instructions that may rely on sensory characteristics", () => {
  const risky = scanSource("<p>Press the round button on the right.</p>", "Instructions.tsx");
  const safer = scanSource("<p>Press Continue, the round button on the right.</p>", "Instructions.tsx");

  assert.equal(risky.some((finding) => finding.ruleId === "CDOM_1_3_3_SENSORY_INSTRUCTIONS"), true);
  assert.equal(safer.some((finding) => finding.ruleId === "CDOM_1_3_3_SENSORY_INSTRUCTIONS"), false);
});

test("flags foreign-language passages without lang", () => {
  const missing = scanSource("<p>Bonjour, votre reçu est prêt.</p>", "Language.tsx");
  const present = scanSource('<p><span lang="fr">Bonjour, votre reçu est prêt.</span></p>', "Language.tsx");
  const nonLatin = scanSource("<p>مرحبا بك</p><p>設定を保存しました</p>", "Language.tsx");
  const loanword = scanSource("<p>café</p>", "Language.tsx");

  assert.equal(missing.some((finding) => finding.ruleId === "CDOM_3_1_2_LANGUAGE_OF_PARTS"), true);
  assert.equal(present.some((finding) => finding.ruleId === "CDOM_3_1_2_LANGUAGE_OF_PARTS"), false);
  assert.equal(nonLatin.filter((finding) => finding.ruleId === "CDOM_3_1_2_LANGUAGE_OF_PARTS").length, 2);
  assert.equal(loanword.some((finding) => finding.ruleId === "CDOM_3_1_2_LANGUAGE_OF_PARTS"), false);
});

test("flags focus and input handlers that may change context", () => {
  const risky = scanSource('<input onFocus={() => window.location.assign("/help")} /><select onChange={() => submit()} />', "Context.tsx");
  const safer = scanSource('<input onFocus={() => showHelp()} /><select onChange={() => setCountry()} />', "Context.tsx");

  assert.equal(risky.filter((finding) => finding.ruleId === "CDOM_3_2_1_CONTEXT_CHANGE").length, 2);
  assert.equal(safer.some((finding) => finding.ruleId === "CDOM_3_2_1_CONTEXT_CHANGE"), false);
});

test("flags autoplay audio without immediate controls", () => {
  const risky = scanSource('<audio autoPlay src="/loop.mp3" />', "Media.tsx");
  const safer = scanSource('<audio autoPlay controls src="/loop.mp3" />', "Media.tsx");

  assert.equal(risky.some((finding) => finding.ruleId === "CDOM_1_4_2_AUDIO_CONTROL"), true);
  assert.equal(safer.some((finding) => finding.ruleId === "CDOM_1_4_2_AUDIO_CONTROL"), false);
});

test("flags live captions and meaningful sequence risks", () => {
  const live = scanSource('<video data-live="true" controls src="/townhall.mp4" />', "Media.tsx");
  const captioned = scanSource('<video data-live="true" controls><track kind="captions" src="/live.vtt" /></video>', "Media.tsx");
  const sequence = scanSource("<p>Step 2: Pay. Step 1: Create account.</p>", "Steps.tsx");

  assert.equal(live.some((finding) => finding.ruleId === "CDOM_1_2_4_LIVE_CAPTIONS"), true);
  assert.equal(captioned.some((finding) => finding.ruleId === "CDOM_1_2_4_LIVE_CAPTIONS"), false);
  assert.equal(sequence.some((finding) => finding.ruleId === "CDOM_1_3_2_MEANINGFUL_SEQUENCE"), true);
});

test("flags orientation restrictions and single-character shortcut risks", () => {
  const orientation = scanSource("<p>This checkout only works in portrait orientation.</p>", "Instructions.tsx");
  const shortcut = scanSource('<div onKeyDown={(event) => { if (event.key === "s") submit(); }}>Editor</div>', "Shortcuts.tsx");
  const saferShortcut = scanSource('<div onKeyDown={(event) => { if (event.ctrlKey && event.key === "s") save(); }}>Editor</div>', "Shortcuts.tsx");

  assert.equal(orientation.some((finding) => finding.ruleId === "CDOM_1_3_4_ORIENTATION"), true);
  assert.equal(shortcut.some((finding) => finding.ruleId === "CDOM_2_1_4_CHARACTER_KEY_SHORTCUTS"), true);
  assert.equal(saferShortcut.some((finding) => finding.ruleId === "CDOM_2_1_4_CHARACTER_KEY_SHORTCUTS"), false);
});

test("flags resize, image-of-text, and non-text contrast risks", () => {
  const resize = scanSource('<p className="tiny-text">Fixed tiny text becomes unusable when zoomed.</p>', "Visual.tsx");
  const imageText = scanSource('<div className="image-text">SALE ENDS TODAY</div>', "Visual.tsx");
  const nonTextContrast = scanSource('<button className="low-contrast">Low contrast boundary</button>', "Visual.tsx");

  assert.equal(resize.some((finding) => finding.ruleId === "CDOM_1_4_4_RESIZE_TEXT"), true);
  assert.equal(imageText.some((finding) => finding.ruleId === "CDOM_1_4_5_IMAGES_OF_TEXT"), true);
  assert.equal(nonTextContrast.some((finding) => finding.ruleId === "CDOM_1_4_11_NON_TEXT_CONTRAST"), true);
});

test("flags time limits, moving content, and flashing content risks", () => {
  const timing = scanSource("<p>Session expires in 3 seconds.</p>", "Timing.tsx");
  const moving = scanSource('<p className="moving">Moving content starts automatically.</p>', "Motion.tsx");
  const flashing = scanSource('<p className="flashing">Rapid flashing region.</p>', "Flash.tsx");
  const pausable = scanSource('<section className="ticker"><button>Pause</button><p>Market ticker</p></section>', "Ticker.tsx");

  assert.equal(timing.some((finding) => finding.ruleId === "CDOM_2_2_1_TIMING_ADJUSTABLE"), true);
  assert.equal(moving.some((finding) => finding.ruleId === "CDOM_2_2_2_PAUSE_STOP_HIDE"), true);
  assert.equal(flashing.some((finding) => finding.ruleId === "CDOM_2_3_1_FLASHING_CONTENT"), true);
  assert.equal(pausable.some((finding) => finding.ruleId === "CDOM_2_2_2_PAUSE_STOP_HIDE"), false);
});

test("flags pointer gesture, motion actuation, and dragging risks", () => {
  const pointer = scanSource("<canvas>Path drawing widget has no single-pointer alternative.</canvas>", "Gestures.tsx");
  const motion = scanSource("<p>Shake the device to undo.</p>", "Gestures.tsx");
  const dragging = scanSource("<p>Drag cards into priority order.</p>", "Gestures.tsx");
  const draggingWithAlternative = scanSource("<p>Drag cards into priority order, or use the Move up button.</p><button>Move up</button>", "Gestures.tsx");

  assert.equal(pointer.some((finding) => finding.ruleId === "CDOM_2_5_1_POINTER_GESTURES"), true);
  assert.equal(motion.some((finding) => finding.ruleId === "CDOM_2_5_4_MOTION_ACTUATION"), true);
  assert.equal(dragging.some((finding) => finding.ruleId === "CDOM_2_5_7_DRAGGING_MOVEMENTS"), true);
  assert.equal(draggingWithAlternative.some((finding) => finding.ruleId === "CDOM_2_5_7_DRAGGING_MOVEMENTS"), false);
});

test("flags multiple ways and consistency risks", () => {
  const multipleWays = scanSource("<p>This page has only one path to support content.</p>", "Structure.tsx");
  const navigation = scanSource("<p>Navigation order changes from the header.</p>", "Structure.tsx");
  const identification = scanSource("<p>Buttons for the same action use different labels.</p>", "Structure.tsx");
  const help = scanSource("<p>Help text may be inconsistent across different form fields.</p>", "Structure.tsx");

  assert.equal(multipleWays.some((finding) => finding.ruleId === "CDOM_2_4_5_MULTIPLE_WAYS"), true);
  assert.equal(navigation.some((finding) => finding.ruleId === "CDOM_3_2_3_CONSISTENT_NAVIGATION"), true);
  assert.equal(identification.some((finding) => finding.ruleId === "CDOM_3_2_4_CONSISTENT_IDENTIFICATION"), true);
  assert.equal(help.some((finding) => finding.ruleId === "CDOM_3_2_6_CONSISTENT_HELP"), true);
});

test("flags high-impact error prevention, redundant entry, and authentication risks", () => {
  const highImpact = scanSource("<p>Financial transfer has no review or reversal step.</p>", "Forms.tsx");
  const redundant = scanSource("<p>Please re-enter your password for verification.</p>", "Forms.tsx");
  const authentication = scanSource("<p>Solve 19 x 7 to sign in.</p>", "Forms.tsx");
  const withReview = scanSource("<p>Financial transfer includes a review and reversal step.</p>", "Forms.tsx");

  assert.equal(highImpact.some((finding) => finding.ruleId === "CDOM_3_3_4_ERROR_PREVENTION_LEGAL_FINANCIAL_DATA"), true);
  assert.equal(redundant.some((finding) => finding.ruleId === "CDOM_3_3_7_REDUNDANT_ENTRY"), true);
  assert.equal(authentication.some((finding) => finding.ruleId === "CDOM_3_3_8_ACCESSIBLE_AUTHENTICATION"), true);
  assert.equal(withReview.some((finding) => finding.ruleId === "CDOM_3_3_4_ERROR_PREVENTION_LEGAL_FINANCIAL_DATA"), false);
});

test("flags AAA audio, interruption, re-authentication, and timeout review risks", () => {
  const options = { standard: "wcag22-aaa" as const };
  const audio = scanSource("<p>Background music plays under speech narration.</p>", "AAA.tsx", options);
  const interruption = scanSource("<p>Automatic popup interrupts the workflow every minute.</p>", "AAA.tsx", options);
  const reauth = scanSource("<p>Your session expired and your draft was lost. Sign in again.</p>", "AAA.tsx", options);
  const timeout = scanSource("<p>Inactivity timeout may lose unsaved changes.</p>", "AAA.tsx", options);

  assert.equal(audio.some((finding) => finding.ruleId === "CDOM_1_4_7_BACKGROUND_AUDIO"), true);
  assert.equal(interruption.some((finding) => finding.ruleId === "CDOM_2_2_4_INTERRUPTION_CONTROL"), true);
  assert.equal(reauth.some((finding) => finding.ruleId === "CDOM_2_2_5_REAUTHENTICATING_DATA"), true);
  assert.equal(timeout.some((finding) => finding.ruleId === "CDOM_2_2_6_TIMEOUT_WARNING"), true);
});

test("flags AAA media alternative, purpose, and visual presentation review risks", () => {
  const options = { standard: "wcag22-aaa" as const };
  const signLanguage = scanSource("<p>Training video has no sign language interpretation.</p>", "AAA.tsx", options);
  const extendedDescription = scanSource("<p>Tour video has no extended audio description.</p>", "AAA.tsx", options);
  const mediaAlternative = scanSource("<p>Recorded webinar has no full transcript or media alternative.</p>", "AAA.tsx", options);
  const liveAudio = scanSource("<p>Live audio broadcast starts without transcript.</p>", "AAA.tsx", options);
  const purpose = scanSource("<p>Icon button has no programmatic purpose metadata.</p>", "AAA.tsx", options);
  const contrast = scanSource("<p>Body copy fails AAA contrast at 7:1.</p>", "AAA.tsx", options);
  const presentation = scanSource("<p>Long fixed width text cannot change colors or spacing.</p>", "AAA.tsx", options);
  const imageText = scanSource("<p>Image text banner has no exception.</p>", "AAA.tsx", options);

  assert.equal(signLanguage.some((finding) => finding.ruleId === "CDOM_1_2_6_SIGN_LANGUAGE"), true);
  assert.equal(extendedDescription.some((finding) => finding.ruleId === "CDOM_1_2_7_EXTENDED_AUDIO_DESCRIPTION"), true);
  assert.equal(mediaAlternative.some((finding) => finding.ruleId === "CDOM_1_2_8_FULL_MEDIA_ALTERNATIVE"), true);
  assert.equal(liveAudio.some((finding) => finding.ruleId === "CDOM_1_2_9_LIVE_AUDIO_TRANSCRIPT"), true);
  assert.equal(purpose.some((finding) => finding.ruleId === "CDOM_1_3_6_IDENTIFY_PURPOSE"), true);
  assert.equal(contrast.some((finding) => finding.ruleId === "CDOM_1_4_6_ENHANCED_CONTRAST"), true);
  assert.equal(presentation.some((finding) => finding.ruleId === "CDOM_1_4_8_VISUAL_PRESENTATION"), true);
  assert.equal(imageText.some((finding) => finding.ruleId === "CDOM_1_4_9_IMAGES_OF_TEXT_NO_EXCEPTION"), true);
});

test("flags AAA animation, location, and section heading review risks", () => {
  const options = { standard: "wcag22-aaa" as const };
  const animation = scanSource('<div className="parallax">Scroll animation moves the dashboard panels.</div>', "AAA.tsx", options);
  const location = scanSource("<p>No breadcrumb or current page indicator is shown.</p>", "AAA.tsx", options);
  const headings = scanSource("<p>This long form has no section headings for payment, shipping, and review.</p>", "AAA.tsx", options);

  assert.equal(animation.some((finding) => finding.ruleId === "CDOM_2_3_3_ANIMATION_FROM_INTERACTIONS"), true);
  assert.equal(location.some((finding) => finding.ruleId === "CDOM_2_4_8_LOCATION_INDICATOR"), true);
  assert.equal(headings.some((finding) => finding.ruleId === "CDOM_2_4_10_SECTION_HEADINGS"), true);
});

test("flags AAA keyboard, timing, focus, target, and input modality review risks", () => {
  const options = { standard: "wcag22-aaa" as const };
  const keyboard = scanSource("<p>Canvas drawing is pointer-only with no keyboard support.</p>", "AAA.tsx", options);
  const noTiming = scanSource("<p>Timed task must finish within 30 seconds.</p>", "AAA.tsx", options);
  const flashes = scanSource("<p>Strobing banner flashes repeatedly.</p>", "AAA.tsx", options);
  const obscured = scanSource("<p>Sticky header covers focus partially.</p>", "AAA.tsx", options);
  const appearance = scanSource("<p>Focus indicator too small and low contrast focus outline.</p>", "AAA.tsx", options);
  const target = scanSource("<p>Small AAA target is smaller than 44 by 44.</p>", "AAA.tsx", options);
  const input = scanSource("<p>This game disables keyboard input modality and requires touch.</p>", "AAA.tsx", options);

  assert.equal(keyboard.some((finding) => finding.ruleId === "CDOM_2_1_3_KEYBOARD_NO_EXCEPTION"), true);
  assert.equal(noTiming.some((finding) => finding.ruleId === "CDOM_2_2_3_NO_TIMING"), true);
  assert.equal(flashes.some((finding) => finding.ruleId === "CDOM_2_3_2_THREE_FLASHES"), true);
  assert.equal(obscured.some((finding) => finding.ruleId === "CDOM_2_4_12_FOCUS_OBSCURED_ENHANCED"), true);
  assert.equal(appearance.some((finding) => finding.ruleId === "CDOM_2_4_13_FOCUS_APPEARANCE"), true);
  assert.equal(target.some((finding) => finding.ruleId === "CDOM_2_5_5_TARGET_SIZE_ENHANCED"), true);
  assert.equal(input.some((finding) => finding.ruleId === "CDOM_2_5_6_CONCURRENT_INPUT"), true);
});

test("flags AAA language, help, error prevention, and enhanced authentication risks", () => {
  const options = { standard: "wcag22-aaa" as const };
  const unusual = scanSource("<p>This escrow workflow uses specialized term language.</p>", "AAA.tsx", options);
  const abbreviation = scanSource("<p>Enter your APR and SSN before continuing.</p>", "AAA.tsx", options);
  const help = scanSource("<p>This complex form has no help or support link.</p>", "AAA.tsx", options);
  const errorPrevention = scanSource("<p>Delete project cannot undo and has no review step.</p>", "AAA.tsx", options);
  const enhancedAuth = scanSource("<p>To sign in, identify the object in your personal photo.</p>", "AAA.tsx", options);

  assert.equal(unusual.some((finding) => finding.ruleId === "CDOM_3_1_3_UNUSUAL_WORDS"), true);
  assert.equal(abbreviation.some((finding) => finding.ruleId === "CDOM_3_1_4_ABBREVIATIONS"), true);
  assert.equal(help.some((finding) => finding.ruleId === "CDOM_3_3_5_HELP_AVAILABLE"), true);
  assert.equal(errorPrevention.some((finding) => finding.ruleId === "CDOM_3_3_6_ERROR_PREVENTION_ALL"), true);
  assert.equal(enhancedAuth.some((finding) => finding.ruleId === "CDOM_3_3_9_ACCESSIBLE_AUTHENTICATION_ENHANCED"), true);
});

test("flags AAA reading, pronunciation, and change-on-request review risks", () => {
  const options = { standard: "wcag22-aaa" as const };
  const reading = scanSource("<p>Complex legal text has an advanced reading level.</p>", "AAA.tsx", options);
  const pronunciation = scanSource("<p>Meaning depends on pronunciation of read vs read.</p>", "AAA.tsx", options);
  const change = scanSource("<select><option>Automatically navigates on change without explicit request.</option></select>", "AAA.tsx", options);

  assert.equal(reading.some((finding) => finding.ruleId === "CDOM_3_1_5_READING_LEVEL"), true);
  assert.equal(pronunciation.some((finding) => finding.ruleId === "CDOM_3_1_6_PRONUNCIATION"), true);
  assert.equal(change.some((finding) => finding.ruleId === "CDOM_3_2_5_CHANGE_ON_REQUEST"), true);
});

test("uses component presets for common design-system controls", () => {
  const findings = scanSource('<IconButton icon={<CloseIcon />} /><TextField placeholder="Email" />', "DesignSystem.tsx", {
    componentPresets: ["mui"]
  });

  assert.equal(findings.some((finding) => finding.ruleId === "CDOM_4_1_2_UNNAMED_CONTROL"), true);
  assert.equal(findings.some((finding) => finding.ruleId === "CDOM_3_3_2_PLACEHOLDER_LABEL"), true);
});

test("component mappings honor import source, polymorphic props, disabled props, value props, and wrappers", () => {
  const options = {
    components: {
      Button: { importSource: "@acme/ui", role: "button" as const, asProp: "component", childLabelProps: ["children"], disabledProps: ["isDisabled"] },
      SearchField: { importSource: "@acme/ui", role: "textbox" as const, nameProps: ["label"], valueProps: ["value"] },
      Field: { importSource: "@acme/ui", wrapper: true, labelProps: ["label"] }
    }
  };

  const mapped = scanSource(`
    import { Button, SearchField, Field } from "@acme/ui";
    import { Button as OtherButton } from "@other/ui";
    <Button component="a">Receipt</Button>
    <Button isDisabled><Icon /></Button>
    <Field label="Email"><SearchField placeholder="Email" /></Field>
    <SearchField value="query" placeholder="Search" />
    <OtherButton><Icon /></OtherButton>
  `, "DesignSystem.tsx", options);

  assert.equal(mapped.some((finding) => finding.excerpt.includes("<Button component=\"a\"")), false);
  assert.equal(mapped.some((finding) => finding.excerpt.includes("<Button isDisabled")), false);
  assert.equal(mapped.some((finding) => finding.excerpt.includes("<Field label=\"Email\"")), false);
  assert.equal(mapped.some((finding) => finding.excerpt.includes("<SearchField value=\"query\"")), false);
  assert.equal(mapped.some((finding) => finding.excerpt.includes("OtherButton")), false);
});

const presetFixtures: Array<{ preset: import("./types.js").ComponentPreset; source: string; missingExcerpt: string; acceptedExcerpt: string }> = [
  {
    preset: "radix",
    source: 'import { IconButton } from "@radix-ui/themes";\n<IconButton><X /></IconButton>\n<IconButton aria-label="Close"><X /></IconButton>',
    missingExcerpt: "<IconButton><X",
    acceptedExcerpt: 'aria-label="Close"'
  },
  {
    preset: "mui",
    source: 'import { IconButton, TextField } from "@mui/material";\n<IconButton><X /></IconButton>\n<TextField label="Email" placeholder="Email" />',
    missingExcerpt: "<IconButton><X",
    acceptedExcerpt: 'label="Email"'
  },
  {
    preset: "react-aria",
    source: 'import { Button, TextField } from "react-aria-components";\n<Button><X /></Button>\n<TextField label="Email" placeholder="Email" />',
    missingExcerpt: "<Button><X",
    acceptedExcerpt: 'label="Email"'
  },
  {
    preset: "react-native",
    source: 'import { Pressable } from "react-native";\n<Pressable><Icon /></Pressable>\n<Pressable accessibilityRole="button" accessibilityLabel="Close"><Icon /></Pressable>',
    missingExcerpt: "<Pressable><Icon",
    acceptedExcerpt: 'accessibilityLabel="Close"'
  },
  {
    preset: "chakra",
    source: 'import { IconButton, Input } from "@chakra-ui/react";\n<IconButton icon={<X />} />\n<Input aria-label="Email" placeholder="Email" autocomplete="email" />',
    missingExcerpt: "<IconButton",
    acceptedExcerpt: 'aria-label="Email"'
  },
  {
    preset: "ant-design",
    source: 'import { Button, Input } from "antd";\n<Button icon={<X />} />\n<Input aria-label="Email" placeholder="Email" autocomplete="email" />',
    missingExcerpt: "<Button",
    acceptedExcerpt: 'aria-label="Email"'
  },
  {
    preset: "headless-ui",
    source: 'import { Button, Switch } from "@headlessui/react";\n<Button><X /></Button>\n<Switch aria-label="Notifications" />',
    missingExcerpt: "<Button><X",
    acceptedExcerpt: 'aria-label="Notifications"'
  },
  {
    preset: "mantine",
    source: 'import { ActionIcon, TextInput } from "@mantine/core";\n<ActionIcon><X /></ActionIcon>\n<TextInput label="Email" placeholder="Email" />',
    missingExcerpt: "<ActionIcon><X",
    acceptedExcerpt: 'label="Email"'
  },
  {
    preset: "react-bootstrap",
    source: 'import { Button, FormControl } from "react-bootstrap";\n<Button><X /></Button>\n<FormControl aria-label="Email" placeholder="Email" />',
    missingExcerpt: "<Button><X",
    acceptedExcerpt: 'aria-label="Email"'
  }
];

for (const fixture of presetFixtures) {
  test(`component preset maps realistic ${fixture.preset} snippets`, () => {
    const findings = scanSource(fixture.source, "Preset.tsx", {
      componentPresets: [fixture.preset]
    });

    assert.equal(findings.some((finding) => finding.excerpt.includes(fixture.missingExcerpt)), true);
    assert.equal(findings.some((finding) => finding.excerpt.includes(fixture.acceptedExcerpt)), false);
  });
}
