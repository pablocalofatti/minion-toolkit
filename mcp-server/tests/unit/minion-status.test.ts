import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/orchestrator/session-store.js", () => ({
  getSession: vi.fn(),
}));

import { getSession } from "../../src/orchestrator/session-store.js";
import { minionStatus } from "../../src/tools/minion-status.js";
import type { MinionSession, WorkerStatus } from "../../src/types.js";

beforeEach(() => {
  vi.clearAllMocks();
});

function createWorker(overrides: Partial<WorkerStatus> = {}): WorkerStatus {
  return {
    taskNumber: 1,
    taskTitle: "Test task",
    state: "queued",
    branch: "minion/task-1",
    worktreePath: "/project/.minion-worktrees/minion-task-1",
    iteration: 0,
    maxIterations: 10,
    startedAt: null,
    completedAt: null,
    error: null,
    ...overrides,
  };
}

function createSession(
  workers: WorkerStatus[],
  overrides: Partial<MinionSession> = {}
): MinionSession {
  const workerMap = new Map<number, WorkerStatus>();
  for (const w of workers) {
    workerMap.set(w.taskNumber, w);
  }

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
    startedAt: Date.now() - 5000,
    abortController: new AbortController(),
    ...overrides,
  };
}

describe("minionStatus", () => {
  it("should return 'Session not found' for invalid session ID", () => {
    vi.mocked(getSession).mockReturnValue(undefined);

    const result = minionStatus({ session_id: "nonexistent" });

    expect(result).toBe("Session not found: nonexistent");
  });

  it("should show correct state labels for each worker state", () => {
    const workers = [
      createWorker({ taskNumber: 1, taskTitle: "Queued task", state: "queued" }),
      createWorker({ taskNumber: 2, taskTitle: "Running task", state: "running", iteration: 3 }),
      createWorker({ taskNumber: 3, taskTitle: "Done task", state: "completed" }),
      createWorker({ taskNumber: 4, taskTitle: "Failed task", state: "failed" }),
      createWorker({ taskNumber: 5, taskTitle: "Cancelled task", state: "cancelled" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers));

    const result = minionStatus({ session_id: "session-xyz" });

    expect(result).toContain("[QUEUED] Task 1: Queued task");
    expect(result).toContain("[RUNNING] Task 2: Running task");
    expect(result).toContain("[DONE] Task 3: Done task");
    expect(result).toContain("[FAILED] Task 4: Failed task");
    expect(result).toContain("[CANCELLED] Task 5: Cancelled task");
  });

  it("should show iteration progress for running workers", () => {
    const workers = [
      createWorker({ taskNumber: 1, state: "running", iteration: 3, maxIterations: 10 }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers));

    const result = minionStatus({ session_id: "session-xyz" });

    expect(result).toContain("(iteration 3/10)");
  });

  it("should not show iteration for non-running workers", () => {
    const workers = [
      createWorker({ taskNumber: 1, state: "completed", iteration: 5, maxIterations: 10 }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers));

    const result = minionStatus({ session_id: "session-xyz" });

    expect(result).not.toContain("iteration");
  });

  it("should show elapsed time", () => {
    const workers = [
      createWorker({ taskNumber: 1, state: "running", iteration: 1 }),
    ];
    vi.mocked(getSession).mockReturnValue(
      createSession(workers, { startedAt: Date.now() - 10000 })
    );

    const result = minionStatus({ session_id: "session-xyz" });

    expect(result).toMatch(/\d+s elapsed/);
  });

  it("should show 'FINISHED' when all workers are done", () => {
    const workers = [
      createWorker({ taskNumber: 1, state: "completed" }),
      createWorker({ taskNumber: 2, state: "failed" }),
      createWorker({ taskNumber: 3, state: "cancelled" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers));

    const result = minionStatus({ session_id: "session-xyz" });

    expect(result).toContain("FINISHED");
    expect(result).toContain("minion_results");
  });

  it("should show 'IN PROGRESS' when workers are still running", () => {
    const workers = [
      createWorker({ taskNumber: 1, state: "completed" }),
      createWorker({ taskNumber: 2, state: "running", iteration: 1 }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers));

    const result = minionStatus({ session_id: "session-xyz" });

    expect(result).toContain("IN PROGRESS");
    expect(result).toContain("Poll again");
  });

  it("should show error messages for failed workers", () => {
    const workers = [
      createWorker({
        taskNumber: 1,
        state: "failed",
        error: "Timeout exceeded",
      }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers));

    const result = minionStatus({ session_id: "session-xyz" });

    expect(result).toContain("Timeout exceeded");
  });

  it("should show correct count summary", () => {
    const workers = [
      createWorker({ taskNumber: 1, state: "completed" }),
      createWorker({ taskNumber: 2, state: "completed" }),
      createWorker({ taskNumber: 3, state: "failed" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers));

    const result = minionStatus({ session_id: "session-xyz" });

    expect(result).toContain("2 completed");
    expect(result).toContain("1 failed");
  });

  it("should sort workers by task number", () => {
    const workers = [
      createWorker({ taskNumber: 3, taskTitle: "Third", state: "queued" }),
      createWorker({ taskNumber: 1, taskTitle: "First", state: "queued" }),
      createWorker({ taskNumber: 2, taskTitle: "Second", state: "queued" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers));

    const result = minionStatus({ session_id: "session-xyz" });

    const firstIdx = result.indexOf("Task 1");
    const secondIdx = result.indexOf("Task 2");
    const thirdIdx = result.indexOf("Task 3");
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });

  it("should show IN PROGRESS for queued workers", () => {
    const workers = [
      createWorker({ taskNumber: 1, state: "queued" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(workers));

    const result = minionStatus({ session_id: "session-xyz" });

    expect(result).toContain("IN PROGRESS");
  });
});
