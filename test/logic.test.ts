import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  branchName,
  extractFiles,
  median,
  parseIssueUrl,
  parseRepo,
  searchTerms,
  setupExcerpt,
} from "../src/logic.ts";

describe("parseRepo", () => {
  it("accepts owner/name and a GitHub URL", () => {
    assert.deepEqual(parseRepo("mcp-use/mcp-use"), {
      owner: "mcp-use",
      repo: "mcp-use",
    });
    assert.deepEqual(parseRepo("https://github.com/CodewithJha/first-pr-mcp.git"), {
      owner: "CodewithJha",
      repo: "first-pr-mcp",
    });
  });

  it("rejects a bare name", () => {
    assert.throws(() => parseRepo("mcp-use"), /owner\/name/);
  });
});

describe("parseIssueUrl", () => {
  it("reads the issue number", () => {
    assert.deepEqual(
      parseIssueUrl("https://github.com/octocat/Hello-World/issues/42"),
      { owner: "octocat", repo: "Hello-World", number: 42 },
    );
  });

  it("refuses a pull request URL", () => {
    assert.throws(
      () => parseIssueUrl("https://github.com/octocat/Hello-World/pull/7"),
      /pull request/,
    );
  });
});

describe("branch and issue text", () => {
  it("slugs a branch name", () => {
    assert.equal(
      branchName(12, "Fix the README typo!"),
      "first-pr/12-fix-the-readme-typo",
    );
  });

  it("pulls file paths out of an issue and ignores urls", () => {
    const files = extractFiles(
      "See `src/app.ts` and README.md. Docs: https://example.com/guide/install.md",
    );
    assert.deepEqual(files, ["src/app.ts", "README.md"]);
  });

  it("drops stopwords from search terms", () => {
    assert.deepEqual(searchTerms("Please update the parser timeout"), [
      "parser",
      "timeout",
      "update",
    ]);
  });

  it("keeps the setup section and stops at the next heading", () => {
    const excerpt = setupExcerpt(
      "# Hi\n\n## Installation\n\nnpm install\n\n## License\n\nMIT\n",
    );
    assert.ok(excerpt?.includes("npm install"));
    assert.equal(excerpt?.includes("MIT"), false);
  });

  it("does not return a code fence cut in half", () => {
    const excerpt = setupExcerpt(
      "## Installation\n\nintro\n```\n" + "x".repeat(600),
    );
    assert.equal(excerpt?.includes("```"), false);
    assert.ok(excerpt?.includes("intro"));
  });

  it("returns the middle of an even sample", () => {
    assert.equal(median([1, 100, 3, 4]), 4);
    assert.equal(median([]), null);
  });
});
