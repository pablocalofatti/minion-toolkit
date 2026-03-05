import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/orchestrator/session-store.js", () => ({
  getSession: vi.fn(),
}));

import { getSession } from "../../src/orchestrator/session-store.js";
import { minionResults } from "../../src/tools/minion-results.js";
import type {
  MinionSession,
  WorkerStatus,
  WorkerResult,
} from "../../src/types.js";

beforeEach(() => {
  vi.clearAllMocks();
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

function createResult(overrides: Partial<WorkerResult> = {}): WorkerResult {
  return {
    taskNumber: 1,
    taskTitle: "Test task",
    state: "completed",
    branch: "minion/task-1",
    filesChanged: ["src/auth.ts", "src/auth.test.ts"],
    duration: 15000,
    iterations: 5,
    error: null,
    ...overrides,
  };
}

function createSession(
  workers: WorkerStatus[],
  results: WorkerResult[],
  overrides: Partial<MinionSession> = {}
): MinionSession {
  const workerMap = new Map<number, WorkerStatus>();
  for (const w of workers) workerMap.set(w.taskNumber, w);

  const resultMap = new Map<number, WorkerResult>();
  for (const r of results) resultMap.set(r.taskNumber, r);

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
    results: resultMap,
    startedAt: Date.now() - 30000,
    abortController: new AbortController(),
    ...overrides,
  };
}

describe("minionResults", () => {
  it("should return 'Session not found' for invalid session ID", () => {
    vi.mocked(getSession).mockReturnValue(undefined);

    const result = minionResults({ session_id: "nonexistent" });

    expect(result).toBe("Session not found: nonexistent");
  });

  it("should return 'still in progress' when workers are not all done", () => {
    const workers = [
      createWorker({ taskNumber: 1, state: "completed" }),
      createWorker({ taskNumber: 2, state: "running" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers, []));

    const result = minionResults({ session_id: "session-xyz" });

    expect(result).toContain("still in progress");
    expect(result).toContain("minion_status()");
  });

  it("should show results table for each task", () => {
    const workers = [
      createWorker({ taskNumber: 1, state: "completed" }),
      createWorker({ taskNumber: 2, state: "failed" }),
    ];
    const results = [
      createResult({
        taskNumber: 1,
        taskTitle: "Add auth",
        state: "completed",
        branch: "minion/task-1",
        filesChanged: ["src/auth.ts"],
        duration: 10000,
        iterations: 3,
      }),
      createResult({
        taskNumber: 2,
        taskTitle: "Add logging",
        state: "failed",
        branch: "minion/task-2",
        filesChanged: [],
        duration: 5000,
        iterations: 2,
        error: "Build failed",
      }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers, results));

    const result = minionResults({ session_id: "session-xyz" });

    expect(result).toContain("Task 1: Add auth");
    expect(result).toContain("Status: SUCCESS");
    expect(result).toContain("Branch: minion/task-1");
    expect(result).toContain("10s");
    expect(result).toContain("3 iterations");
    expect(result).toContain("src/auth.ts");

    expect(result).toContain("Task 2: Add logging");
    expect(result).toContain("Status: FAILED");
    expect(result).toContain("Error: Build failed");
  });

  it("should show '(none detected)' when no files changed", () => {
    const workers = [createWorker({ taskNumber: 1, state: "completed" })];
    const results = [createResult({ taskNumber: 1, filesChanged: [] })];
    vi.mocked(getSession).mockReturnValue(createSession(workers, results));

    const result = minionResults({ session_id: "session-xyz" });

    expect(result).toContain("(none detected)");
  });

  it("should show success/failure counts", () => {
    const workers = [
      createWorker({ taskNumber: 1, state: "completed" }),
      createWorker({ taskNumber: 2, state: "completed" }),
      createWorker({ taskNumber: 3, state: "failed" }),
    ];
    const results = [
      createResult({ taskNumber: 1, state: "completed" }),
      createResult({ taskNumber: 2, state: "completed" }),
      createResult({ taskNumber: 3, state: "failed" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers, results));

    const result = minionResults({ session_id: "session-xyz" });

    expect(result).toContain("2 succeeded, 1 failed");
  });

  it("should list successful branches", () => {
    const workers = [
      createWorker({ taskNumber: 1, state: "completed" }),
      createWorker({ taskNumber: 2, state: "completed" }),
    ];
    const results = [
      createResult({ taskNumber: 1, branch: "minion/task-1", state: "completed" }),
      createResult({ taskNumber: 2, branch: "minion/task-2", state: "completed" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers, results));

    const result = minionResults({ session_id: "session-xyz" });

    expect(result).toContain("Successful branches:");
    expect(result).toContain("- minion/task-1");
    expect(result).toContain("- minion/task-2");
  });

  it("should suggest minion_create_prs when successful branches exist", () => {
    const workers = [createWorker({ taskNumber: 1, state: "completed" })];
    const results = [createResult({ taskNumber: 1, state: "completed" })];
    vi.mocked(getSession).mockReturnValue(createSession(workers, results));

    const result = minionResults({ session_id: "session-xyz" });

    expect(result).toContain('minion_create_prs("session-xyz")');
  });

  it("should show 'No successful branches' when all tasks failed", () => {
    const workers = [createWorker({ taskNumber: 1, state: "failed" })];
    const results = [createResult({ taskNumber: 1, state: "failed" })];
    vi.mocked(getSession).mockReturnValue(createSession(workers, results));

    const result = minionResults({ session_id: "session-xyz" });

    expect(result).toContain("No successful branches to create PRs for.");
  });

  it("should suggest minion_cleanup at the end", () => {
    const workers = [createWorker({ taskNumber: 1, state: "completed" })];
    const results = [createResult({ taskNumber: 1, state: "completed" })];
    vi.mocked(getSession).mockReturnValue(createSession(workers, results));

    const result = minionResults({ session_id: "session-xyz" });

    expect(result).toContain('minion_cleanup("session-xyz")');
  });

  it("should sort results by task number", () => {
    const workers = [
      createWorker({ taskNumber: 3, state: "completed" }),
      createWorker({ taskNumber: 1, state: "completed" }),
    ];
    const results = [
      createResult({ taskNumber: 3, taskTitle: "Third", state: "completed" }),
      createResult({ taskNumber: 1, taskTitle: "First", state: "completed" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers, results));

    const result = minionResults({ session_id: "session-xyz" });

    const firstIdx = result.indexOf("Task 1");
    const thirdIdx = result.indexOf("Task 3");
    expect(firstIdx).toBeLessThan(thirdIdx);
  });

  it("should treat cancelled state as done for allDone check", () => {
    const workers = [
      createWorker({ taskNumber: 1, state: "cancelled" }),
    ];
    const results = [
      createResult({ taskNumber: 1, state: "cancelled" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers, results));

    const result = minionResults({ session_id: "session-xyz" });

    // Should NOT contain "still in progress"
    expect(result).not.toContain("still in progress");
    expect(result).toContain("CANCELLED");
  });
});
