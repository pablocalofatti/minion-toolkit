import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "node:path";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  rm: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
}));

import { execFile } from "node:child_process";
import { rm, mkdir } from "node:fs/promises";
import {
  getWorktreePath,
  createWorktree,
  removeWorktree,
  removeAllWorktrees,
} from "../../src/git/worktree.js";

const execFileMock = vi.mocked(execFile);

function mockExecFileSuccess(): void {
  execFileMock.mockImplementation(
    (_cmd, _args, _opts, callback?) => {
      const cb = typeof _opts === "function" ? _opts : callback;
      if (cb) cb(null, { stdout: "", stderr: "" } as never);
      return undefined as never;
    }
  );
}

function mockExecFileFailureThenSuccess(): void {
  let callCount = 0;
  execFileMock.mockImplementation(
    (_cmd, _args, _opts, callback?) => {
      const cb = typeof _opts === "function" ? _opts : callback;
      callCount++;
      if (callCount === 1) {
        if (cb) cb(new Error("worktree remove failed") as never, { stdout: "", stderr: "" } as never);
      } else {
        if (cb) cb(null, { stdout: "", stderr: "" } as never);
      }
      return undefined as never;
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getWorktreePath", () => {
  it("should join project root with .minion-worktrees and sanitized branch", () => {
    const result = getWorktreePath("/project", "feat/my-feature");

    expect(result).toBe(join("/project", ".minion-worktrees", "feat-my-feature"));
  });

  it("should replace all slashes in branch name", () => {
    const result = getWorktreePath("/root", "a/b/c/d");

    expect(result).toBe(join("/root", ".minion-worktrees", "a-b-c-d"));
  });

  it("should handle branch names without slashes", () => {
    const result = getWorktreePath("/root", "main");

    expect(result).toBe(join("/root", ".minion-worktrees", "main"));
  });
});

describe("createWorktree", () => {
  it("should create .minion-worktrees directory with recursive option", async () => {
    mockExecFileSuccess();

    await createWorktree("/project", "feat/test", "main");

    expect(mkdir).toHaveBeenCalledWith(
      join("/project", ".minion-worktrees"),
      { recursive: true }
    );
  });

  it("should call git worktree add with correct arguments", async () => {
    mockExecFileSuccess();
    const expectedPath = join("/project", ".minion-worktrees", "feat-test");

    await createWorktree("/project", "feat/test", "main");

    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["worktree", "add", "-b", "feat/test", expectedPath, "main"],
      { cwd: "/project" },
      expect.any(Function)
    );
  });

  it("should return the worktree path", async () => {
    mockExecFileSuccess();

    const result = await createWorktree("/project", "feat/test", "main");

    expect(result).toBe(join("/project", ".minion-worktrees", "feat-test"));
  });
});

describe("removeWorktree", () => {
  it("should call git worktree remove with force flag", async () => {
    mockExecFileSuccess();
    const expectedPath = join("/project", ".minion-worktrees", "feat-test");

    await removeWorktree("/project", "feat/test");

    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["worktree", "remove", expectedPath, "--force"],
      { cwd: "/project" },
      expect.any(Function)
    );
  });

  it("should fall back to rm + prune when worktree remove fails", async () => {
    mockExecFileFailureThenSuccess();
    const expectedPath = join("/project", ".minion-worktrees", "feat-test");

    await removeWorktree("/project", "feat/test");

    expect(rm).toHaveBeenCalledWith(expectedPath, {
      recursive: true,
      force: true,
    });
    // Second execFile call should be git worktree prune
    expect(execFileMock).toHaveBeenCalledTimes(2);
  });
});

describe("removeAllWorktrees", () => {
  it("should remove directory and prune worktrees", async () => {
    mockExecFileSuccess();
    const expectedDir = join("/project", ".minion-worktrees");

    await removeAllWorktrees("/project");

    expect(rm).toHaveBeenCalledWith(expectedDir, {
      recursive: true,
      force: true,
    });
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["worktree", "prune"],
      { cwd: "/project" },
      expect.any(Function)
    );
  });

  it("should log error and resolve when cleanup fails with Error", async () => {
    vi.mocked(rm).mockRejectedValueOnce(new Error("rm failed"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(removeAllWorktrees("/project")).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("rm failed")
    );
    consoleSpy.mockRestore();
  });

  it("should log fallback message when cleanup fails with non-Error", async () => {
    vi.mocked(rm).mockRejectedValueOnce("string rejection");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(removeAllWorktrees("/project")).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unknown cleanup error")
    );
    consoleSpy.mockRestore();
  });
});
