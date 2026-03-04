import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
import { createPullRequest } from "../../src/git/pr.js";

const execFileMock = vi.mocked(execFile);

beforeEach(() => {
  vi.clearAllMocks();
});

const DEFAULT_OPTIONS = {
  projectRoot: "/project",
  branch: "feat/my-feature",
  baseBranch: "main",
  title: "feat: add feature",
  body: "PR body content",
};

function setupExecFileMock(prUrl: string): void {
  let callCount = 0;
  execFileMock.mockImplementation((_cmd, _args, _opts, callback?) => {
    const cb = typeof _opts === "function" ? _opts : callback;
    callCount++;
    if (callCount === 1) {
      // git push
      if (cb) cb(null, { stdout: "", stderr: "" } as never);
    } else {
      // gh pr create
      if (cb) cb(null, { stdout: prUrl + "\n", stderr: "" } as never);
    }
    return undefined as never;
  });
}

describe("createPullRequest", () => {
  it("should push the branch to origin first", async () => {
    setupExecFileMock("https://github.com/org/repo/pull/42");

    await createPullRequest(DEFAULT_OPTIONS);

    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["push", "-u", "origin", "feat/my-feature"],
      { cwd: "/project" },
      expect.any(Function)
    );
  });

  it("should create PR with gh CLI using correct arguments", async () => {
    setupExecFileMock("https://github.com/org/repo/pull/42");

    await createPullRequest(DEFAULT_OPTIONS);

    expect(execFileMock).toHaveBeenCalledWith(
      "gh",
      [
        "pr",
        "create",
        "--base",
        "main",
        "--head",
        "feat/my-feature",
        "--title",
        "feat: add feature",
        "--body",
        "PR body content",
      ],
      { cwd: "/project" },
      expect.any(Function)
    );
  });

  it("should return URL and parsed PR number", async () => {
    setupExecFileMock("https://github.com/org/repo/pull/42");

    const result = await createPullRequest(DEFAULT_OPTIONS);

    expect(result).toEqual({
      url: "https://github.com/org/repo/pull/42",
      number: 42,
    });
  });

  it("should trim whitespace from stdout URL", async () => {
    setupExecFileMock("https://github.com/org/repo/pull/7");

    const result = await createPullRequest(DEFAULT_OPTIONS);

    expect(result.url).toBe("https://github.com/org/repo/pull/7");
  });

  it("should propagate git push errors", async () => {
    execFileMock.mockImplementation((_cmd, _args, _opts, callback?) => {
      const cb = typeof _opts === "function" ? _opts : callback;
      if (cb) cb(new Error("push rejected") as never, { stdout: "", stderr: "" } as never);
      return undefined as never;
    });

    await expect(createPullRequest(DEFAULT_OPTIONS)).rejects.toThrow(
      "push rejected"
    );
  });

  it("should propagate gh CLI errors", async () => {
    let callCount = 0;
    execFileMock.mockImplementation((_cmd, _args, _opts, callback?) => {
      const cb = typeof _opts === "function" ? _opts : callback;
      callCount++;
      if (callCount === 1) {
        if (cb) cb(null, { stdout: "", stderr: "" } as never);
      } else {
        if (cb) cb(new Error("gh: not logged in") as never, { stdout: "", stderr: "" } as never);
      }
      return undefined as never;
    });

    await expect(createPullRequest(DEFAULT_OPTIONS)).rejects.toThrow(
      "gh: not logged in"
    );
  });

  it("should return 0 for PR number when URL has no trailing number", async () => {
    setupExecFileMock("https://github.com/org/repo/pull/");

    const result = await createPullRequest(DEFAULT_OPTIONS);

    // URL "...pull/" → split("/").pop() = "" (falsy) → ternary returns 0
    expect(result.number).toBe(0);
  });
});
