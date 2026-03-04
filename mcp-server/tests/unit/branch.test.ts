import { describe, it, expect } from "vitest";
import { buildBranchName } from "../../src/git/branch.js";

describe("buildBranchName", () => {
  it("should produce a kebab-case branch name from a normal title", () => {
    const result = buildBranchName(1, "Add user authentication");
    expect(result).toBe("minion/task-1-add-user-authentication");
  });

  it("should lowercase the entire slug", () => {
    const result = buildBranchName(2, "Fix Login Page");
    expect(result).toBe("minion/task-2-fix-login-page");
  });

  it("should strip special characters", () => {
    const result = buildBranchName(3, "Fix bug #42 (urgent!)");
    expect(result).toBe("minion/task-3-fix-bug-42-urgent");
  });

  it("should strip unicode characters", () => {
    const result = buildBranchName(4, "Add émojis 🎉 and accénts");
    expect(result).toBe("minion/task-4-add-mojis-and-accnts");
  });

  it("should collapse multiple spaces into a single dash", () => {
    const result = buildBranchName(5, "too   many    spaces");
    expect(result).toBe("minion/task-5-too-many-spaces");
  });

  it("should collapse multiple dashes into a single dash", () => {
    const result = buildBranchName(6, "some---dashes---here");
    expect(result).toBe("minion/task-6-some-dashes-here");
  });

  it("should truncate the slug to 40 characters", () => {
    const longTitle =
      "this is a very long task title that should definitely be truncated";
    const result = buildBranchName(7, longTitle);
    const slug = result.replace("minion/task-7-", "");
    expect(slug.length).toBeLessThanOrEqual(40);
  });

  it("should remove a trailing dash after truncation", () => {
    // Craft a title where the 40th character of the slug is a dash.
    // "aaaaaaaaaa-bbbbbbbbbbbbbbbbbbbbbbbbbbbbb" is 40 chars, with dash at pos 10.
    // We need the cut at 40 to produce a trailing dash.
    // "abcdefghij-abcdefghij-abcdefghij-abcdef-x" → slug becomes
    // "abcdefghij-abcdefghij-abcdefghij-abcdef-" (40 chars) → trailing dash removed.
    const title = "abcdefghij abcdefghij abcdefghij abcdef xtra";
    const result = buildBranchName(8, title);
    expect(result).not.toMatch(/-$/);
    // The slug after prefix should not end with a dash
    const slug = result.replace("minion/task-8-", "");
    expect(slug).toBe("abcdefghij-abcdefghij-abcdefghij-abcdef");
  });

  it("should trim leading and trailing whitespace from the title", () => {
    const result = buildBranchName(9, "  padded title  ");
    expect(result).toBe("minion/task-9-padded-title");
  });

  it("should handle a title that becomes empty after sanitization", () => {
    const result = buildBranchName(10, "!@#$%^&*()");
    expect(result).toBe("minion/task-10-");
  });

  it("should handle a single-word title", () => {
    const result = buildBranchName(1, "refactor");
    expect(result).toBe("minion/task-1-refactor");
  });

  it("should handle mixed spaces and dashes", () => {
    const result = buildBranchName(2, "fix - the - bug");
    expect(result).toBe("minion/task-2-fix-the-bug");
  });

  it("should handle numeric-only titles", () => {
    const result = buildBranchName(3, "123 456");
    expect(result).toBe("minion/task-3-123-456");
  });

  it("should preserve digits mixed with text", () => {
    const result = buildBranchName(4, "step1 add step2 remove");
    expect(result).toBe("minion/task-4-step1-add-step2-remove");
  });
});
