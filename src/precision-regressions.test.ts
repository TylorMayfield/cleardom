import * as assert from "node:assert/strict";
import { test } from "node:test";
import { scanSource } from "./scanner.js";

const unnamed = "CDOM_4_1_2_UNNAMED_CONTROL";
const formLabel = "CDOM_4_1_2_FORM_LABEL";
const imageAlt = "CDOM_1_1_1_IMAGE_ALT";
const anchorHref = "CDOM_4_1_2_ANCHOR_HREF";

test("corpus regressions do not confuse local components with intrinsic controls", () => {
  const findings = scanSource('<Select name="framework" /><Button label="Choose a photo" />', "App.tsx", { componentPresets: ["react-native"] });
  assert.equal(findings.some((finding) => finding.ruleId === formLabel), false);
  assert.equal(findings.some((finding) => finding.ruleId === unnamed), false);
});

test("template comments cannot manufacture image findings", () => {
  for (const [file, source] of [
    ["Component.vue", '<template><!-- <img src="sponsor.png" /> --><p>Ready</p></template>'],
    ["Component.svelte", '<!-- <img src="sponsor.png" /> --><p>Ready</p>'],
    ["component.component.html", '<!-- <img src="sponsor.png" /> --><p>Ready</p>']
  ]) {
    assert.equal(scanSource(source, file).some((finding) => finding.ruleId === imageAlt), false, file);
  }
});

test("dynamic framework names remain visible but non-blocking until rendered", () => {
  const svelte = scanSource('<a href="/author"><img alt={author.username} /></a><button>{article.favoritesCount}</button>', "Article.svelte");
  const angular = scanSource('<a [routerLink]="breadcrumb.path">{{ breadcrumb.label }}</a>', "breadcrumb.component.html");
  const findings = [...svelte, ...angular].filter((finding) => finding.ruleId === unnamed || finding.ruleId === imageAlt);

  assert.equal(findings.length, 4);
  assert.equal(findings.every((finding) => finding.detectionMode === "needs-review" && finding.confidence === "medium" && finding.blocking === false && finding.evidenceState === "unresolved"), true);
  const angularDestination = angular.find((finding) => finding.ruleId === anchorHref);
  assert.equal(angularDestination?.detectionMode, "needs-review");
  assert.equal(angularDestination?.blocking, false);
});

test("controls proven absent from the accessibility tree do not require labels", () => {
  const sources = [
    '<input type="hidden" />',
    '<input type="checkbox" hidden />',
    '<input type="checkbox" style="display: none" />',
    '<style>.favorite-checkbox { display: none }</style><input class="favorite-checkbox" type="checkbox" />'
  ];
  for (const source of sources) assert.equal(scanSource(source, "Form.svelte").some((finding) => finding.ruleId === formLabel), false, source);
});

test("proven intrinsic failures remain automated and blocking", () => {
  const findings = scanSource('<button aria-label=""><span aria-hidden="true">x</span></button><input /><img alt="" /><a routerLink="">Receipt</a>', "App.tsx");
  for (const ruleId of [unnamed, formLabel, imageAlt, anchorHref]) {
    const finding = findings.find((candidate) => candidate.ruleId === ruleId);
    assert.ok(finding, ruleId);
    assert.equal(finding.detectionMode, "automated", ruleId);
    assert.equal(finding.confidence, "high", ruleId);
    assert.equal(finding.blocking, true, ruleId);
    assert.equal(finding.evidenceState, "proven-violation", ruleId);
  }
});

test("unresolved values never become trusted passes", () => {
  const findings = [
    ...scanSource('<button aria-label={label}><Icon /></button><img alt={description} />', "App.tsx", { semantic: "off" }),
    ...scanSource('<a [routerLink]="destination">Destination</a>', "app.component.html")
  ];
  const uncertain = findings.filter((finding) => [unnamed, imageAlt, anchorHref].includes(finding.ruleId));
  assert.equal(uncertain.length, 3);
  assert.equal(uncertain.every((finding) => finding.detectionMode === "needs-review" && finding.blocking === false), true);
});

test("misleading component props do not satisfy configured accessible names", () => {
  const findings = scanSource('<IconButton tooltip="Close" icon={<X />} />', "Button.tsx", {
    components: { IconButton: { role: "button", nameProps: ["label"] } }
  });
  assert.equal(findings.find((finding) => finding.ruleId === unnamed)?.detectionMode, "automated");
});

test("metamorphic formatting preserves classification and fingerprint", () => {
  const variants = [
    '<button id="save"><span aria-hidden="true">x</span></button>',
    '<button   id="save" ><span aria-hidden="true">x</span></button>',
    "<button id='save'><span aria-hidden='true'>x</span></button>"
  ];
  const findings = variants.map((source) => scanSource(source, "App.tsx").find((finding) => finding.ruleId === unnamed));
  assert.equal(findings.every(Boolean), true);
  assert.equal(new Set(findings.map((finding) => finding?.detectionMode)).size, 1);
  assert.equal(new Set(findings.map((finding) => finding?.fingerprint)).size, 1);
});

test("deterministic parser adversaries terminate and preserve proven failures", () => {
  const adversaries = [
    '<!-- unterminated <img src="x">',
    '<button>{condition ? <span>Label</span> : null}</button>',
    '<button>{`literal with <!-- and -->`}</button>',
    '<button>{fn({ nested: { value: label } })}</button>',
    '<button aria-label={condition ? "" : label}><Icon /></button>',
    '<Button as="button" tooltip="Save" />'
  ];
  for (const source of adversaries) {
    const first = scanSource(source, "Adversary.tsx", { semantic: "off" });
    const second = scanSource(source, "Adversary.tsx", { semantic: "off" });
    assert.deepEqual(first.map((finding) => [finding.ruleId, finding.detectionMode, finding.fingerprint]), second.map((finding) => [finding.ruleId, finding.detectionMode, finding.fingerprint]));
    assert.equal(first.every((finding) => finding.detectionMode !== "automated" || finding.evidenceState === "proven-violation"), true);
  }
});
