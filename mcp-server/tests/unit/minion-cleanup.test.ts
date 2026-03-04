import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("../../src/orchestrator/session-store.js", () => ({
  getSession: vi.fn(),
  deleteSession: vi.fn(),
}));

vi.mock("../../src/git/worktree.js", () => ({
  removeWorktree: vi.fn(),
  removeAllWorktrees: vi.fn(),
}));

import { execFile } from "node:child_process";
import { getSession, deleteSession } from "../../src/orchestrator/session-store.js";
import { removeWorktree, removeAllWorktrees } from "../../src/git/worktree.js";
import { minionCleanup } from "../../src/tools/minion-cleanup.js";
import type { MinionSession, WorkerStatus } from "../../src/types.js";

const execFileMock = vi.mocked(execFile);

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(removeWorktree).mockResolvedValue(undefined);
  vi.mocked(removeAllWorktrees).mockResolvedValue(undefined);

  execFileMock.mockImplementation((_cmd, _args, _opts, callback?) => {
    const cb = typeof _opts === "function" ? _opts : callback;
    if (cb) cb(null, { stdout: "", stderr: "" } as never);
    return undefined as never;
  });
});

function createWorker(overrides: Partial<WorkerStatus> = {}): WorkerStatus {
  return {
    taskNumber: 1,
    taskTitle: "Test task",
    state: "completed",
    branch: "minion/task-1",
    worktreePath: "/project/.minion-worktrees/minion-task-1",
    iteration: 5,
    maxIterations: 10,
    startedAt: Date.now() - 10000,
    completedAt: Date.now(),
    error: null,
    ...overrides,
  };
}

function createSession(
  workers: WorkerStatus[],
  overrides: Partial<MinionSession> = {}
): MinionSession {
  const workerMap = new Map<number, WorkerStatus>();
  for (const w of workers) workerMap.set(w.taskNumber, w);

  return {
    id: "session-xyz",
    projectRoot: "/project",
    baseBranch: "main",
    tasks: [],
    commands: {
      packageManager: "npm",
      install: "npm install",
      lint: null,
      test: null,
      build: null,
      format: null,
    },
    workers: workerMap,
    results: new Map(),
    startedAt: Date.now(),
    abortController: new AbortController(),
    ...overrides,
  };
}

describe("minionCleanup", () => {
  it("should return 'Session not found' for invalid session ID", async () => {
    vi.mocked(getSession).mockReturnValue(undefined);

    const result = await minionCleanup({ session_id: "nonexistent" });

    expect(result).toBe("Session not found: nonexistent");
  });

  it("should abort running workers", async () => {
    const abortController = new AbortController();
    const abortSpy = vi.spyOn(abortController, "abort");
    const session = createSession(
      [createWorker({ taskNumber: 1, state: "running" })],
      { abortController }
    );
    vi.mocked(getSession).mockReturnValue(session);

    await minionCleanup({ session_id: "session-xyz" });

    expect(abortSpy).toHaveBeenCalled();
  });

  it("should remove worktrees for each worker with a worktreePath", async () => {
    const workers = [
      createWorker({ taskNumber: 1, branch: "minion/task-1", worktreePath: "/project/.minion-worktrees/minion-task-1" }),
      createWorker({ taskNumber: 2, branch: "minion/task-2", worktreePath: "/project/.minion-worktrees/minion-task-2" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers));

    await minionCleanup({ session_id: "session-xyz" });

    expect(removeWorktree).toHaveBeenCalledTimes(2);
    expect(removeWorktree).toHaveBeenCalledWith("/project", "minion/task-1");
    expect(removeWorktree).toHaveBeenCalledWith("/project", "minion/task-2");
  });

  it("should skip worktree removal for workers without worktreePath", async () => {
    const workers = [
      createWorker({ taskNumber: 1, worktreePath: "" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers));

    await minionCleanup({ session_id: "session-xyz" });

    expect(removeWorktree).not.toHaveBeenCalled();
  });

  it("should report worktree removal errors", async () => {
    const workers = [
      createWorker({ taskNumber: 1, branch: "minion/task-1" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers));
    vi.mocked(removeWorktree).mockRejectedValueOnce(new Error("Permission denied"));

    const result = await minionCleanup({ session_id: "session-xyz" });

    expect(result).toContain("Failed to remove minion/task-1: Permission denied");
  });

  it("should report non-Error worktree removal errors", async () => {
    const workers = [
      createWorker({ taskNumber: 1, branch: "minion/task-1" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers));
    vi.mocked(removeWorktree).mockRejectedValueOnce("string error");

    const result = await minionCleanup({ session_id: "session-xyz" });

    expect(result).toContain("Failed to remove minion/task-1: Unknown error");
  });

  it("should report orphaned worktree prune errors", async () => {
    vi.mocked(getSession).mockReturnValue(createSession([]));
    vi.mocked(removeAllWorktrees).mockRejectedValueOnce(
      new Error("Prune failed")
    );

    const result = await minionCleanup({ session_id: "session-xyz" });

    expect(result).toContain("Failed to prune orphaned worktrees: Prune failed");
  });

  it("should report non-Error orphaned worktree prune errors", async () => {
    vi.mocked(getSession).mockReturnValue(createSession([]));
    vi.mocked(removeAllWorktrees).mockRejectedValueOnce("string prune error");

    const result = await minionCleanup({ session_id: "session-xyz" });

    expect(result).toContain("Failed to prune orphaned worktrees: Unknown error");
  });

  it("should delete branches when remove_branches=true", async () => {
    const workers = [
      createWorker({ taskNumber: 1, branch: "minion/task-1" }),
      createWorker({ taskNumber: 2, branch: "minion/task-2" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers));

    await minionCleanup({
      session_id: "session-xyz",
      remove_branches: true,
    });

    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["branch", "-D", "minion/task-1"],
      { cwd: "/project" },
      expect.any(Function)
    );
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["branch", "-D", "minion/task-2"],
      { cwd: "/project" },
      expect.any(Function)
    );
  });

  it("should not delete branches when remove_branches is not set", async () => {
    const workers = [
      createWorker({ taskNumber: 1, branch: "minion/task-1" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers));

    await minionCleanup({ session_id: "session-xyz" });

    // execFile should not be called for branch deletion
    expect(execFileMock).not.toHaveBeenCalledWith(
      "git",
      ["branch", "-D", expect.any(String)],
      expect.anything(),
      expect.any(Function)
    );
  });

  it("should skip 'not found' branch errors silently", async () => {
    const workers = [
      createWorker({ taskNumber: 1, branch: "minion/task-1" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers));
    execFileMock.mockImplementation((_cmd, _args, _opts, callback?) => {
      const cb = typeof _opts === "function" ? _opts : callback;
      if (cb) cb(new Error("error: branch 'minion/task-1' not found") as never, { stdout: "", stderr: "" } as never);
      return undefined as never;
    });

    const result = await minionCleanup({
      session_id: "session-xyz",
      remove_branches: true,
    });

    expect(result).not.toContain("Failed to delete branch");
  });

  it("should report real branch deletion errors", async () => {
    const workers = [
      createWorker({ taskNumber: 1, branch: "minion/task-1" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers));
    execFileMock.mockImplementation((_cmd, _args, _opts, callback?) => {
      const cb = typeof _opts === "function" ? _opts : callback;
      if (cb) cb(new Error("fatal: unable to delete") as never, { stdout: "", stderr: "" } as never);
      return undefined as never;
    });

    const result = await minionCleanup({
      session_id: "session-xyz",
      remove_branches: true,
    });

    expect(result).toContain("Failed to delete branch minion/task-1: fatal: unable to delete");
  });

  it("should delete session from store", async () => {
    vi.mocked(getSession).mockReturnValue(createSession([]));

    await minionCleanup({ session_id: "session-xyz" });

    expect(deleteSession).toHaveBeenCalledWith("session-xyz");
  });

  it("should report cleaned worktrees in output", async () => {
    const workers = [
      createWorker({ taskNumber: 1, branch: "minion/task-1" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers));

    const result = await minionCleanup({ session_id: "session-xyz" });

    expect(result).toContain("Removed worktree: minion/task-1");
    expect(result).toContain("Cleaned:");
  });

  it("should report deleted branches in output", async () => {
    const workers = [
      createWorker({ taskNumber: 1, branch: "minion/task-1" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers));

    const result = await minionCleanup({
      session_id: "session-xyz",
      remove_branches: true,
    });

    expect(result).toContain("Deleted branch: minion/task-1");
  });

  it("should include session ID in success message", async () => {
    vi.mocked(getSession).mockReturnValue(createSession([]));

    const result = await minionCleanup({ session_id: "session-xyz" });

    expect(result).toContain("Session session-xyz cleaned up.");
  });

  it("should handle non-Error exceptions in branch deletion", async () => {
    const workers = [
      createWorker({ taskNumber: 1, branch: "minion/task-1" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers));
    execFileMock.mockImplementation((_cmd, _args, _opts, callback?) => {
      const cb = typeof _opts === "function" ? _opts : callback;
      if (cb) cb("string error" as never, { stdout: "", stderr: "" } as never);
      return undefined as never;
    });

    const result = await minionCleanup({
      session_id: "session-xyz",
      remove_branches: true,
    });

    expect(result).toContain("Failed to delete branch minion/task-1: Unknown error");
  });
});
