import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/orchestrator/session-store.js", () => ({
  getSession: vi.fn(),
}));

vi.mock("../../src/git/pr.js", () => ({
  createPullRequest: vi.fn(),
}));

import { getSession } from "../../src/orchestrator/session-store.js";
import { createPullRequest } from "../../src/git/pr.js";
import { minionCreatePRs } from "../../src/tools/minion-create-prs.js";
import type {
  MinionSession,
  WorkerResult,
} from "../../src/types.js";

beforeEach(() => {
  vi.clearAllMocks();
});

function createResult(overrides: Partial<WorkerResult> = {}): WorkerResult {
  return {
    taskNumber: 1,
    taskTitle: "Test task",
    state: "completed",
    branch: "minion/task-1",
    filesChanged: ["src/auth.ts"],
    duration: 15000,
    iterations: 5,
    error: null,
    ...overrides,
  };
}

function createSession(
  results: WorkerResult[],
  overrides: Partial<MinionSession> = {}
): MinionSession {
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
    workers: new Map(),
    results: resultMap,
    startedAt: Date.now(),
    abortController: new AbortController(),
    ...overrides,
  };
}

describe("minionCreatePRs", () => {
  it("should return 'Session not found' for invalid session ID", async () => {
    vi.mocked(getSession).mockReturnValue(undefined);

    const result = await minionCreatePRs({ session_id: "nonexistent" });

    expect(result).toBe("Session not found: nonexistent");
  });

  it("should return 'No completed tasks' when none succeeded", async () => {
    const results = [
      createResult({ taskNumber: 1, state: "failed" }),
      createResult({ taskNumber: 2, state: "cancelled" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(results));

    const result = await minionCreatePRs({ session_id: "session-xyz" });

    expect(result).toBe("No completed tasks to create PRs for.");
  });

  it("should create PRs for completed tasks", async () => {
    const results = [
      createResult({ taskNumber: 1, taskTitle: "Add auth", state: "completed", branch: "minion/task-1" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(results));
    vi.mocked(createPullRequest).mockResolvedValue({
      url: "https://github.com/org/repo/pull/1",
      number: 1,
    });

    await minionCreatePRs({ session_id: "session-xyz" });

    expect(createPullRequest).toHaveBeenCalledWith({
      projectRoot: "/project",
      branch: "minion/task-1",
      baseBranch: "main",
      title: "feat: Add auth",
      body: expect.stringContaining("Task 1: Add auth"),
    });
  });

  it("should return PR URLs on success", async () => {
    const results = [
      createResult({ taskNumber: 1, state: "completed" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(results));
    vi.mocked(createPullRequest).mockResolvedValue({
      url: "https://github.com/org/repo/pull/42",
      number: 42,
    });

    const result = await minionCreatePRs({ session_id: "session-xyz" });

    expect(result).toContain("Pull Requests:");
    expect(result).toContain("Task 1: https://github.com/org/repo/pull/42");
  });

  it("should filter by task_numbers when provided", async () => {
    const results = [
      createResult({ taskNumber: 1, state: "completed", branch: "minion/task-1" }),
      createResult({ taskNumber: 2, state: "completed", branch: "minion/task-2" }),
      createResult({ taskNumber: 3, state: "completed", branch: "minion/task-3" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(results));
    vi.mocked(createPullRequest).mockResolvedValue({
      url: "https://github.com/org/repo/pull/1",
      number: 1,
    });

    await minionCreatePRs({
      session_id: "session-xyz",
      task_numbers: [1, 3],
    });

    expect(createPullRequest).toHaveBeenCalledTimes(2);
    expect(createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ branch: "minion/task-1" })
    );
    expect(createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ branch: "minion/task-3" })
    );
  });

  it("should handle PR creation failures gracefully", async () => {
    const results = [
      createResult({ taskNumber: 1, state: "completed" }),
      createResult({ taskNumber: 2, state: "completed" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(results));
    vi.mocked(createPullRequest)
      .mockResolvedValueOnce({
        url: "https://github.com/org/repo/pull/1",
        number: 1,
      })
      .mockRejectedValueOnce(new Error("gh: permission denied"));

    const result = await minionCreatePRs({ session_id: "session-xyz" });

    expect(result).toContain("Task 1: https://github.com/org/repo/pull/1");
    expect(result).toContain("Task 2: FAILED — gh: permission denied");
  });

  it("should handle non-Error exceptions in PR creation", async () => {
    const results = [
      createResult({ taskNumber: 1, state: "completed" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(results));
    vi.mocked(createPullRequest).mockRejectedValueOnce("string error");

    const result = await minionCreatePRs({ session_id: "session-xyz" });

    expect(result).toContain("Task 1: FAILED — Unknown error");
  });

  it("should include PR body with task details and files changed", async () => {
    const results = [
      createResult({
        taskNumber: 1,
        taskTitle: "Add auth",
        state: "completed",
        filesChanged: ["src/auth.ts", "src/auth.test.ts"],
        duration: 20000,
        iterations: 4,
      }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(results));
    vi.mocked(createPullRequest).mockResolvedValue({
      url: "https://github.com/org/repo/pull/1",
      number: 1,
    });

    await minionCreatePRs({ session_id: "session-xyz" });

    expect(createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("`src/auth.ts`"),
      })
    );
    expect(createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("20s"),
      })
    );
  });

  it("should show '(none detected)' in PR body when no files changed", async () => {
    const results = [
      createResult({
        taskNumber: 1,
        state: "completed",
        filesChanged: [],
      }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(results));
    vi.mocked(createPullRequest).mockResolvedValue({
      url: "https://github.com/org/repo/pull/1",
      number: 1,
    });

    await minionCreatePRs({ session_id: "session-xyz" });

    expect(createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("(none detected)"),
      })
    );
  });

  it("should sort results by task number before creating PRs", async () => {
    const results = [
      createResult({ taskNumber: 3, state: "completed", branch: "minion/task-3" }),
      createResult({ taskNumber: 1, state: "completed", branch: "minion/task-1" }),
    ];
    vi.mocked(getSession).mockReturnValue(createSession(results));
    vi.mocked(createPullRequest).mockResolvedValue({
      url: "https://github.com/org/repo/pull/1",
      number: 1,
    });

    await minionCreatePRs({ session_id: "session-xyz" });

    const calls = vi.mocked(createPullRequest).mock.calls;
    expect(calls[0][0].branch).toBe("minion/task-1");
    expect(calls[1][0].branch).toBe("minion/task-3");
  });
});
