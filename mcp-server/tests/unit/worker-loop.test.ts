import { describe, it, expect, vi, beforeEach } from "vitest";
import { runWorkerLoop } from "../../src/worker/worker-loop.js";
import type { MinionConfig, WorkerStatus } from "../../src/types.js";
import type Anthropic from "@anthropic-ai/sdk";

vi.mock("../../src/worker/worker-tools.js", () => ({
  WORKER_TOOL_DEFINITIONS: [
    { name: "read_file", description: "mock", input_schema: { type: "object", properties: {}, required: [] } },
  ],
  executeWorkerTool: vi.fn(),
}));

import { executeWorkerTool } from "../../src/worker/worker-tools.js";

const mockedExecute = vi.mocked(executeWorkerTool);

function makeConfig(overrides: Partial<MinionConfig> = {}): MinionConfig {
  return {
    anthropicApiKey: "test-key",
    model: "claude-sonnet-4-20250514",
    maxWorkers: 3,
    workerMaxTokens: 4096,
    workerMaxIterations: 50,
    workerTimeoutMs: 300_000,
    ...overrides,
  };
}

function makeStatus(overrides: Partial<WorkerStatus> = {}): WorkerStatus {
  return {
    taskNumber: 1,
    taskTitle: "Test task",
    state: "running",
    branch: "minion/task-1-test",
    worktreePath: "/tmp/fake-worktree",
    iteration: 0,
    maxIterations: 50,
    startedAt: Date.now(),
    completedAt: null,
    error: null,
    ...overrides,
  };
}

function textBlock(text: string): Anthropic.TextBlock {
  return { type: "text", text };
}

function toolUseBlock(
  name: string,
  input: Record<string, string>,
  id = "tool_1"
): Anthropic.ToolUseBlock {
  return { type: "tool_use", id, name, input };
}

function makeClient(responses: Anthropic.Message[]) {
  const callQueue = [...responses];
  return {
    messages: {
      create: vi.fn(async () => {
        const next = callQueue.shift();
        if (!next) throw new Error("No more mock responses");
        return next;
      }),
    },
  } as unknown as Anthropic;
}

function endTurnResponse(text = "Done"): Anthropic.Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-20250514",
    content: [textBlock(text)],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

function toolUseResponse(
  tools: Anthropic.ToolUseBlock[]
): Anthropic.Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-20250514",
    content: [...tools],
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

describe("runWorkerLoop", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedExecute.mockReset();
  });

  it("should complete when model returns end_turn with no tool_use", async () => {
    const client = makeClient([endTurnResponse("All done!")]);
    const status = makeStatus();

    const result = await runWorkerLoop(
      client,
      makeConfig(),
      "system prompt",
      status,
      new AbortController().signal
    );

    expect(result.state).toBe("completed");
    expect(result.error).toBeNull();
    expect(result.taskNumber).toBe(1);
    expect(result.taskTitle).toBe("Test task");
  });

  it("should execute tools and send results back to model", async () => {
    mockedExecute.mockResolvedValueOnce("file contents here");

    const client = makeClient([
      toolUseResponse([
        toolUseBlock("read_file", { path: "src/index.ts" }),
      ]),
      endTurnResponse("Done after reading file"),
    ]);
    const status = makeStatus();

    const result = await runWorkerLoop(
      client,
      makeConfig(),
      "system prompt",
      status,
      new AbortController().signal
    );

    expect(result.state).toBe("completed");
    expect(mockedExecute).toHaveBeenCalledWith(
      "/tmp/fake-worktree",
      "read_file",
      { path: "src/index.ts" }
    );

    // Verify the client was called twice (tool_use + end_turn)
    expect(client.messages.create).toHaveBeenCalledTimes(2);
  });

  it("should return 'failed' when hitting iteration limit", async () => {
    mockedExecute.mockResolvedValue("result");

    // Return tool_use on every call so we never end
    const infiniteClient = {
      messages: {
        create: vi.fn(async () =>
          toolUseResponse([toolUseBlock("read_file", { path: "x.ts" })])
        ),
      },
    } as unknown as Anthropic;

    const config = makeConfig({ workerMaxIterations: 3 });
    const status = makeStatus();

    const result = await runWorkerLoop(
      infiniteClient,
      config,
      "system prompt",
      status,
      new AbortController().signal
    );

    expect(result.state).toBe("failed");
    expect(result.error).toContain("Hit iteration limit (3)");
    expect(result.iterations).toBe(3);
  });

  it("should return 'cancelled' when signal is aborted before first iteration", async () => {
    const controller = new AbortController();
    controller.abort();

    const client = makeClient([endTurnResponse()]);
    const status = makeStatus();

    const result = await runWorkerLoop(
      client,
      makeConfig(),
      "system prompt",
      status,
      controller.signal
    );

    expect(result.state).toBe("cancelled");
  });

  it("should return 'cancelled' when signal is aborted during tool execution", async () => {
    const controller = new AbortController();

    mockedExecute.mockImplementation(async () => {
      controller.abort();
      return "result";
    });

    const client = makeClient([
      toolUseResponse([
        toolUseBlock("read_file", { path: "a.ts" }, "tool_a"),
        toolUseBlock("read_file", { path: "b.ts" }, "tool_b"),
      ]),
      endTurnResponse(),
    ]);
    const status = makeStatus();

    const result = await runWorkerLoop(
      client,
      makeConfig(),
      "system prompt",
      status,
      controller.signal
    );

    expect(result.state).toBe("cancelled");
  });

  it("should return 'failed' on timeout", async () => {
    mockedExecute.mockResolvedValue("ok");

    // Return tool_use so the loop continues to iteration 2 where timeout fires
    const client = {
      messages: {
        create: vi.fn(async () => {
          // Advance time past the timeout on each API call
          vi.advanceTimersByTime(120_000);
          return toolUseResponse([toolUseBlock("read_file", { path: "x.ts" })]);
        }),
      },
    } as unknown as Anthropic;

    vi.useFakeTimers();
    const status = makeStatus();
    const config = makeConfig({ workerTimeoutMs: 60_000 });

    const result = await runWorkerLoop(
      client,
      config,
      "system prompt",
      status,
      new AbortController().signal
    );

    vi.useRealTimers();

    expect(result.state).toBe("failed");
    expect(result.error).toContain("timed out");
  });

  it("should return 'failed' on API error", async () => {
    const client = {
      messages: {
        create: vi.fn(async () => {
          throw new Error("API rate limit exceeded");
        }),
      },
    } as unknown as Anthropic;

    const status = makeStatus();

    const result = await runWorkerLoop(
      client,
      makeConfig(),
      "system prompt",
      status,
      new AbortController().signal
    );

    expect(result.state).toBe("failed");
    expect(result.error).toBe("API rate limit exceeded");
  });

  it("should update status.iteration during loop", async () => {
    mockedExecute.mockResolvedValue("ok");

    const client = makeClient([
      toolUseResponse([toolUseBlock("read_file", { path: "a.ts" })]),
      toolUseResponse([toolUseBlock("read_file", { path: "b.ts" })]),
      endTurnResponse("Done"),
    ]);
    const status = makeStatus();

    await runWorkerLoop(
      client,
      makeConfig(),
      "system prompt",
      status,
      new AbortController().signal
    );

    // The last iteration set should be 3 (the one that got end_turn)
    expect(status.iteration).toBe(3);
  });

  it("should set status.state and completedAt on completion", async () => {
    const client = makeClient([endTurnResponse("Finished")]);
    const status = makeStatus();

    await runWorkerLoop(
      client,
      makeConfig(),
      "system prompt",
      status,
      new AbortController().signal
    );

    expect(status.state).toBe("completed");
    expect(status.completedAt).toBeTypeOf("number");
    expect(status.completedAt).toBeGreaterThan(0);
  });

  it("should handle multiple tool_use blocks in one response", async () => {
    mockedExecute
      .mockResolvedValueOnce("content of a.ts")
      .mockResolvedValueOnce("content of b.ts")
      .mockResolvedValueOnce("content of c.ts");

    const client = makeClient([
      toolUseResponse([
        toolUseBlock("read_file", { path: "a.ts" }, "tool_a"),
        toolUseBlock("write_file", { path: "b.ts" }, "tool_b"),
        toolUseBlock("read_file", { path: "c.ts" }, "tool_c"),
      ]),
      endTurnResponse("All three files processed"),
    ]);
    const status = makeStatus();

    const result = await runWorkerLoop(
      client,
      makeConfig(),
      "system prompt",
      status,
      new AbortController().signal
    );

    expect(result.state).toBe("completed");
    expect(mockedExecute).toHaveBeenCalledTimes(3);
  });

  it("should handle executeWorkerTool throwing an error gracefully", async () => {
    mockedExecute.mockRejectedValueOnce(new Error("Permission denied"));

    const client = makeClient([
      toolUseResponse([toolUseBlock("read_file", { path: "secret.txt" })]),
      endTurnResponse("Handled error"),
    ]);
    const status = makeStatus();

    const result = await runWorkerLoop(
      client,
      makeConfig(),
      "system prompt",
      status,
      new AbortController().signal
    );

    expect(result.state).toBe("completed");
    // The second API call should have received the error result
    const secondCallArgs = (client.messages.create as ReturnType<typeof vi.fn>)
      .mock.calls[1][0];
    const userMessage = secondCallArgs.messages[secondCallArgs.messages.length - 1];
    expect(userMessage.content[0].content).toContain("Error: Permission denied");
  });

  it("should set status.error on failure", async () => {
    const client = {
      messages: {
        create: vi.fn(async () => {
          throw new Error("Network error");
        }),
      },
    } as unknown as Anthropic;

    const status = makeStatus();

    await runWorkerLoop(
      client,
      makeConfig(),
      "system prompt",
      status,
      new AbortController().signal
    );

    expect(status.state).toBe("failed");
    expect(status.error).toBe("Network error");
  });

  it("should handle non-Error throw from executeWorkerTool", async () => {
    mockedExecute.mockRejectedValueOnce("string error from tool");

    const client = makeClient([
      toolUseResponse([toolUseBlock("read_file", { path: "x.ts" })]),
      endTurnResponse("Handled it"),
    ]);
    const status = makeStatus();

    const result = await runWorkerLoop(
      client,
      makeConfig(),
      "system prompt",
      status,
      new AbortController().signal
    );

    expect(result.state).toBe("completed");
    // The second API call should have received "Error: Unknown error"
    const secondCallArgs = (client.messages.create as ReturnType<typeof vi.fn>)
      .mock.calls[1][0];
    const userMessage = secondCallArgs.messages[secondCallArgs.messages.length - 1];
    expect(userMessage.content[0].content).toContain("Error: Unknown error");
  });

  it("should handle non-Error throw from API client", async () => {
    const client = {
      messages: {
        create: vi.fn(async () => {
          throw "raw string API error";
        }),
      },
    } as unknown as Anthropic;

    const status = makeStatus();

    const result = await runWorkerLoop(
      client,
      makeConfig(),
      "system prompt",
      status,
      new AbortController().signal
    );

    expect(result.state).toBe("failed");
    expect(result.error).toBe("Unknown error");
  });
});
