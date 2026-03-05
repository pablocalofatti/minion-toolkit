import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("../../src/orchestrator/task-parser.js", () => ({
  parseTasks: vi.fn(),
}));

vi.mock("../../src/orchestrator/command-detector.js", () => ({
  detectCommands: vi.fn(),
}));

vi.mock("../../src/orchestrator/session-store.js", () => ({
  createSession: vi.fn(),
}));

vi.mock("../../src/orchestrator/worker-pool.js", () => ({
  startWorkers: vi.fn(),
}));

import { execFile } from "node:child_process";
import { parseTasks } from "../../src/orchestrator/task-parser.js";
import { detectCommands } from "../../src/orchestrator/command-detector.js";
import { createSession } from "../../src/orchestrator/session-store.js";
import { startWorkers } from "../../src/orchestrator/worker-pool.js";
import { minionStart } from "../../src/tools/minion-start.js";
import type {
  MinionConfig,
  ParsedTask,
  ProjectCommands,
  MinionSession,
} from "../../src/types.js";

const execFileMock = vi.mocked(execFile);

const MOCK_CONFIG: MinionConfig = {
  anthropicApiKey: "test-key",
  model: "claude-sonnet-4-20250514",
  maxWorkers: 3,
  workerMaxTokens: 50000,
  workerMaxIterations: 10,
  workerTimeoutMs: 300000,
};

const MOCK_TASKS: ParsedTask[] = [
  { number: 1, title: "Add auth", description: "Implement auth", files: ["src/auth.ts"] },
  { number: 2, title: "Add logging", description: "Add logger", files: ["src/logger.ts"] },
];

const MOCK_COMMANDS: ProjectCommands = {
  packageManager: "npm",
  install: "npm install",
  lint: "npm run lint",
  test: "npm test",
  build: "npm run build",
  format: null,
};

function createMockSession(overrides: Partial<MinionSession> = {}): MinionSession {
  return {
    id: "session-abc123",
    projectRoot: "/project",
    baseBranch: "main",
    tasks: MOCK_TASKS,
    commands: MOCK_COMMANDS,
    workers: new Map(),
    results: new Map(),
    startedAt: Date.now(),
    abortController: new AbortController(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(parseTasks).mockReturnValue(MOCK_TASKS);
  vi.mocked(detectCommands).mockResolvedValue(MOCK_COMMANDS);
  vi.mocked(createSession).mockReturnValue(createMockSession());

  execFileMock.mockImplementation((_cmd, _args, _opts, callback?) => {
    const cb = typeof _opts === "function" ? _opts : callback;
    if (cb) cb(null, { stdout: "main\n", stderr: "" } as never);
    return undefined as never;
  });
});

describe("minionStart", () => {
  it("should parse tasks from the markdown input", async () => {
    const markdown = "1. Add auth\n2. Add logging";

    await minionStart({ tasks_markdown: markdown }, MOCK_CONFIG);

    expect(parseTasks).toHaveBeenCalledWith(markdown);
  });

  it("should detect project commands for the project root", async () => {
    await minionStart(
      { tasks_markdown: "1. Task", project_root: "/my-project" },
      MOCK_CONFIG
    );

    expect(detectCommands).toHaveBeenCalledWith("/my-project");
  });

  it("should get current branch as base branch", async () => {
    await minionStart({ tasks_markdown: "1. Task" }, MOCK_CONFIG);

    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      expect.objectContaining({ cwd: expect.any(String) }),
      expect.any(Function)
    );
  });

  it("should create a session with parsed data", async () => {
    await minionStart(
      { tasks_markdown: "1. Task", project_root: "/project" },
      MOCK_CONFIG
    );

    expect(createSession).toHaveBeenCalledWith(
      "/project",
      "main",
      MOCK_TASKS,
      MOCK_COMMANDS
    );
  });

  it("should start workers with session and config", async () => {
    const session = createMockSession();
    vi.mocked(createSession).mockReturnValue(session);

    await minionStart({ tasks_markdown: "1. Task" }, MOCK_CONFIG);

    expect(startWorkers).toHaveBeenCalledWith(session, MOCK_CONFIG);
  });

  it("should return formatted message with session ID", async () => {
    const result = await minionStart(
      { tasks_markdown: "1. Task", project_root: "/project" },
      MOCK_CONFIG
    );

    expect(result).toContain("Session started: session-abc123");
    expect(result).toContain("Base branch: main");
    expect(result).toContain("Package manager: npm");
    expect(result).toContain("Workers: 2 tasks, max 3 concurrent");
  });

  it("should list all tasks in the output", async () => {
    const result = await minionStart(
      { tasks_markdown: "1. Task" },
      MOCK_CONFIG
    );

    expect(result).toContain("1. Add auth");
    expect(result).toContain("2. Add logging");
  });

  it("should include status check instruction", async () => {
    const result = await minionStart(
      { tasks_markdown: "1. Task" },
      MOCK_CONFIG
    );

    expect(result).toContain('minion_status("session-abc123")');
  });

  it("should use process.cwd() when project_root is not provided", async () => {
    await minionStart({ tasks_markdown: "1. Task" }, MOCK_CONFIG);

    expect(detectCommands).toHaveBeenCalledWith(process.cwd());
  });
});
