import * as assert from "node:assert/strict";
import { test } from "node:test";
import { createScanProgressReporter } from "./progress.js";

test("redirected progress prints phase summaries without per-page noise", () => {
  let output = "";
  const reporter = createScanProgressReporter({ isTTY: false, write: (value) => { output += value; } });
  reporter.report({ phase: "runtime-start", pages: 2, viewports: 1 });
  reporter.report({ phase: "runtime-page", completed: 1, total: 2, route: "/", viewport: { name: "desktop", width: 1280, height: 900 } });
  reporter.report({ phase: "runtime-page", completed: 2, total: 2, route: "/settings", viewport: { name: "desktop", width: 1280, height: 900 } });

  assert.match(output, /Running rendered checks \(2 routes, 1 viewport, 2 page runs\)/);
  assert.doesNotMatch(output, /\[1\/2\]/);
  assert.match(output, /Rendered checks complete \(2 page runs\)/);
});

test("TTY progress updates one active page line in place", () => {
  let output = "";
  const reporter = createScanProgressReporter({ isTTY: true, write: (value) => { output += value; } });
  reporter.report({ phase: "runtime-page", completed: 1, total: 2, route: "/", viewport: { name: "mobile", width: 390, height: 844 } });
  reporter.report({ phase: "runtime-page", completed: 2, total: 2, route: "/settings", viewport: { name: "mobile", width: 390, height: 844 } });
  reporter.finish();

  assert.match(output, /\r\u001b\[2K  \[1\/2\] \/ · mobile/);
  assert.match(output, /\r\u001b\[2K  \[2\/2\] \/settings · mobile/);
  assert.match(output, /\r\u001b\[2K\n$/);
});
