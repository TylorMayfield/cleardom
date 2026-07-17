import * as assert from "node:assert/strict";
import { test } from "node:test";
import { extractRuleId, githubRequestAll, parseNextLink, publicGithubUrl, sanitizeGithubMarkdown, type GithubContext } from "./github.js";

const context: GithubContext = {
  token: "token",
  repository: "cleardom/cleardom",
  apiUrl: "https://api.github.test",
  serverUrl: "https://github.test",
  pullRequest: {
    number: 12,
    headSha: "head",
    baseSha: "base",
    baseRef: "main"
  }
};

test("extractRuleId supports current and legacy ClearDOM inline comment IDs", () => {
  assert.equal(
    extractRuleId("<!-- cleardom:inline -->\n**CDOM_4_1_2_UNNAMED_CONTROL: Interactive control has no accessible name**"),
    "CDOM_4_1_2_UNNAMED_CONTROL"
  );
  assert.equal(extractRuleId("**CDOM001: Legacy rule**"), "CDOM001");
  assert.equal(extractRuleId("No ClearDOM rule here"), "");
});

test("parseNextLink returns the GitHub pagination next URL", () => {
  const link = [
    '<https://api.github.test/repos/cleardom/cleardom/pulls/12/files?page=2>; rel="next"',
    '<https://api.github.test/repos/cleardom/cleardom/pulls/12/files?page=4>; rel="last"'
  ].join(", ");

  assert.equal(parseNextLink(link), "https://api.github.test/repos/cleardom/cleardom/pulls/12/files?page=2");
  assert.equal(parseNextLink('<https://api.github.test/repos/cleardom/cleardom/pulls/12/files?page=1>; rel="prev"'), undefined);
});

test("githubRequestAll follows every next page", async () => {
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];

  globalThis.fetch = async (input) => {
    const url = String(input);
    requested.push(url);

    if (url.endsWith("page=2")) {
      return jsonResponse([{ id: 2 }]);
    }

    return jsonResponse([{ id: 1 }], '<https://api.github.test/repos/cleardom/cleardom/pulls/12/comments?page=2>; rel="next"');
  };

  try {
    const items = await githubRequestAll<{ id: number }>(context, "/repos/cleardom/cleardom/pulls/12/comments?per_page=100");

    assert.deepEqual(items, [{ id: 1 }, { id: 2 }]);
    assert.deepEqual(requested, [
      "https://api.github.test/repos/cleardom/cleardom/pulls/12/comments?per_page=100",
      "https://api.github.test/repos/cleardom/cleardom/pulls/12/comments?page=2"
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub output escapes markup, strips controls, and redacts URL secrets", () => {
  const markdown = sanitizeGithubMarkdown("<script>alert(1)</script>\n| injected\u001b[31m");
  assert.doesNotMatch(markdown, /<script>|\u001b|\n/);
  assert.match(markdown, /\\<script\\>/);
  assert.match(markdown, /\\\| injected/);
  assert.equal(publicGithubUrl("https://user:secret@example.test/private?token=abc#fragment"), "https://example.test/private");
});

function jsonResponse(value: unknown, link?: string): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: link ? { "content-type": "application/json", link } : { "content-type": "application/json" }
  });
}
