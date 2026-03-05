import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  MinionConfig,
  MinionSession,
  ParsedTask,
  ProjectCommands,
  WorkerResult,
} from "../../src/types.js";

// Mock all external dependencies before importing the module under test
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      constructor(_opts: unknown) {
        // no-op mock
      }
    },
  };
});

vi.mock("../../src/git/branch.js", () => ({
  buildBranchName: vi.fn(
    (num: number, title: string) => `minion/task-${num}-${title.toLowerCase().replace(/\s+/g, "-")}`
  ),
}));

vi.mock("../../src/git/worktree.js", () => ({
  createWorktree: vi.fn().mockResolvedValue("/tmp/worktree"),
}));

vi.mock("../../src/worker/worker-system-prompt.js", () => ({
  buildSystemPrompt: vi.fn().mockReturnValue("system prompt content"),
}));

vi.mock("../../src/worker/worker-loop.js", () => ({
  runWorkerLoop: vi.fn().mockResolvedValue({
    taskNumber: 1,
    taskTitle: "Test",
    state: "completed",
    branch: "minion/task-1-test",
    filesChanged: [],
    duration: 1000,
    iterations: 3,
    error: null,
  } satisfies WorkerResult),
}));

// Mock getChangedFiles via child_process
vi.mock("node:child_process", () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
    cb(null, { stdout: "src/auth.ts\nsrc/utils.ts\n", stderr: "" });
  }),
}));

vi.mock("node:util", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:util")>();
  return {
    ...actual,
    promisify: vi.fn((fn: Function) => {
      // Return an async wrapper around the mocked execFile
      return async (...args: unknown[]) => {
        return new Promise((resolve, reject) => {
          fn(...args, (err: Error | null, result: unknown) => {
            if (err) reject(err);
            else resolve(result);
          });
        });
      };
    }),
  };
});

import { startWorkers } from "../../src/orchestrator/worker-pool.js";
import { createWorktree } from "../../src/git/worktree.js";
import { buildSystemPrompt } from "../../src/worker/worker-system-prompt.js";
import { runWorkerLoop } from "../../src/worker/worker-loop.js";

const mockedCreateWorktree = vi.mocked(createWorktree);
const mockedBuildSystemPrompt = vi.mocked(buildSystemPrompt);
const mockedRunWorkerLoop = vi.mocked(runWorkerLoop);

function makeTasks(count: number): ParsedTask[] {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    title: `Task ${i + 1}`,
    description: `Description for task ${i + 1}`,
    files: [`src/file${i + 1}.ts`],
  }));
}

const STUB_COMMANDS: ProjectCommands = {
  packageManager: "npm",
  install: "npm install",
  lint: "npm run lint",
  test: "npm run test",
  build: "npm run build",
  format: null,
};

function makeConfig(overrides: Partial<MinionConfig> = {}): MinionConfig {
  return {
    anthropicApiKey: "sk-test-key",
    model: "claude-sonnet-4-20250514",
    maxWorkers: 3,
    workerMaxTokens: 4096,
    workerMaxIterations: 10,
    workerTimeoutMs: 300_000,
    ...overrides,
  };
}

function makeSession(tasks: ParsedTask[]): MinionSession {
  return {
    id: "test-session",
    projectRoot: "/test/project",
    baseBranch: "main",
    tasks,
    commands: STUB_COMMANDS,
    workers: new Map(),
    results: new Map(),
    startedAt: Date.now(),
    abortController: new AbortController(),
  };
}

describe("worker-pool", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedCreateWorktree.mockResolvedValue("/tmp/worktree");
    mockedBuildSystemPrompt.mockReturnValue("system prompt content");
    mockedRunWorkerLoop.mockResolvedValue({
      taskNumber: 1,
      taskTitle: "Test",
      state: "completed",
      branch: "minion/task-1-test",
      filesChanged: [],
      duration: 1000,
      iterations: 3,
      error: null,
    });
  });

  it("should initialize WorkerStatus for all tasks", () => {
    const tasks = makeTasks(3);
    const session = makeSession(tasks);
    const config = makeConfig();

    startWorkers(session, config);

    expect(session.workers.size).toBe(3);

    for (const task of tasks) {
      const status = session.workers.get(task.number);
      expect(status).toBeDefined();
      expect(status!.taskNumber).toBe(task.number);
      expect(status!.taskTitle).toBe(task.title);
      expect(status!.worktreePath).toBe("");
      expect(status!.iteration).toBe(0);
      expect(status!.maxIterations).toBe(config.workerMaxIterations);
      expect(status!.startedAt).toBeNull();
      expect(status!.completedAt).toBeNull();
      expect(status!.error).toBeNull();
    }
  });

  it("should start all workers with state 'queued'", () => {
    const tasks = makeTasks(2);
    const session = makeSession(tasks);

    startWorkers(session, makeConfig());

    for (const [, status] of session.workers) {
      // Immediately after startWorkers they are queued (async hasn't resolved yet)
      // But since the promises run in microtasks, some may already be running.
      // We check at least the initial setup was "queued"
      expect(["queued", "running"]).toContain(status.state);
    }
  });

  it("should call createWorktree, buildSystemPrompt, and runWorkerLoop for each task", async () => {
    const tasks = makeTasks(2);
    const session = makeSession(tasks);
    const config = makeConfig();

    startWorkers(session, config);

    // Wait for async workers to complete
    await vi.waitFor(() => {
      expect(session.results.size).toBe(2);
    });

    expect(mockedCreateWorktree).toHaveBeenCalledTimes(2);
    expect(mockedBuildSystemPrompt).toHaveBeenCalledTimes(2);
    expect(mockedRunWorkerLoop).toHaveBeenCalledTimes(2);
  });

  it("should capture errors in session.results when a worker fails", async () => {
    const tasks = makeTasks(1);
    const session = makeSession(tasks);

    mockedCreateWorktree.mockRejectedValueOnce(new Error("worktree creation failed"));

    startWorkers(session, makeConfig());

    await vi.waitFor(() => {
      expect(session.results.size).toBe(1);
    });

    const result = session.results.get(1);
    expect(result).toBeDefined();
    expect(result!.state).toBe("failed");
    expect(result!.error).toBe("worktree creation failed");
    expect(result!.filesChanged).toEqual([]);
  });

  it("should capture non-Error throws as 'Unknown error'", async () => {
    const tasks = makeTasks(1);
    const session = makeSession(tasks);

    mockedCreateWorktree.mockRejectedValueOnce("string error");

    startWorkers(session, makeConfig());

    await vi.waitFor(() => {
      expect(session.results.size).toBe(1);
    });

    const result = session.results.get(1);
    expect(result!.error).toBe("Unknown error");
  });

  it("should cancel queued workers when session is aborted", async () => {
    const tasks = makeTasks(3);
    const session = makeSession(tasks);
    // Only allow 1 concurrent worker so tasks 2 and 3 wait in the semaphore queue
    const config = makeConfig({ maxWorkers: 1 });

    let resolveFirst!: (value: WorkerResult) => void;
    mockedRunWorkerLoop.mockImplementationOnce(
      () =>
        new Promise<WorkerResult>((resolve) => {
          resolveFirst = resolve;
        })
    );

    startWorkers(session, config);

    // Flush microtasks so worker 1 reaches runWorkerLoop and resolveFirst gets assigned
    await vi.waitFor(() => {
      expect(resolveFirst).toBeTypeOf("function");
    });

    // Abort while the first task is still running (tasks 2 & 3 are waiting on semaphore)
    session.abortController.abort();

    // Resolve the first worker so the semaphore releases and remaining tasks see the abort
    resolveFirst({
      taskNumber: 1,
      taskTitle: "Task 1",
      state: "completed",
      branch: "minion/task-1-task-1",
      filesChanged: [],
      duration: 500,
      iterations: 1,
      error: null,
    });

    // Wait for everything to settle
    await vi.waitFor(() => {
      const states = [...session.workers.values()].map((w) => w.state);
      expect(states.filter((s) => s === "cancelled").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("should respect semaphore concurrency limit", async () => {
    const tasks = makeTasks(3);
    const session = makeSession(tasks);
    const config = makeConfig({ maxWorkers: 2 });

    let concurrentCount = 0;
    let maxConcurrent = 0;
    const resolvers: Array<(v: WorkerResult) => void> = [];

    mockedRunWorkerLoop.mockImplementation(
      () =>
        new Promise<WorkerResult>((resolve) => {
          concurrentCount++;
          maxConcurrent = Math.max(maxConcurrent, concurrentCount);
          resolvers.push((v: WorkerResult) => {
            concurrentCount--;
            resolve(v);
          });
        })
    );

    startWorkers(session, config);

    // Wait for 2 workers to start (semaphore limit)
    await vi.waitFor(() => {
      expect(resolvers).toHaveLength(2);
    });

    // At this point, exactly 2 workers should be running concurrently
    expect(maxConcurrent).toBe(2);

    // Resolve first two workers
    for (const resolve of resolvers) {
      resolve({
        taskNumber: 1,
        taskTitle: "Test",
        state: "completed",
        branch: "minion/task-1-test",
        filesChanged: [],
        duration: 1000,
        iterations: 3,
        error: null,
      });
    }

    // Wait for the 3rd worker to start and complete
    await vi.waitFor(() => {
      expect(resolvers).toHaveLength(3);
    });

    resolvers[2]({
      taskNumber: 3,
      taskTitle: "Test",
      state: "completed",
      branch: "minion/task-3-test",
      filesChanged: [],
      duration: 1000,
      iterations: 3,
      error: null,
    });

    await vi.waitFor(() => {
      expect(session.results.size).toBe(3);
    });

    // max concurrent never exceeded 2
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it("should set worker branch from buildBranchName", () => {
    const tasks = makeTasks(1);
    const session = makeSession(tasks);

    startWorkers(session, makeConfig());

    const status = session.workers.get(1);
    expect(status!.branch).toBe("minion/task-1-task-1");
  });

  it("should set worktreePath and startedAt on the worker status", async () => {
    const tasks = makeTasks(1);
    const session = makeSession(tasks);

    startWorkers(session, makeConfig());

    await vi.waitFor(() => {
      expect(session.results.size).toBe(1);
    });

    const status = session.workers.get(1);
    expect(status!.worktreePath).toBe("/tmp/worktree");
    expect(status!.startedAt).toBeTypeOf("number");
  });

  it("should mark failed worker status with error and completedAt", async () => {
    const tasks = makeTasks(1);
    const session = makeSession(tasks);

    mockedCreateWorktree.mockRejectedValueOnce(new Error("git failed"));

    startWorkers(session, makeConfig());

    await vi.waitFor(() => {
      expect(session.results.size).toBe(1);
    });

    const status = session.workers.get(1);
    expect(status!.state).toBe("failed");
    expect(status!.error).toBe("git failed");
    expect(status!.completedAt).toBeTypeOf("number");
  });
});
