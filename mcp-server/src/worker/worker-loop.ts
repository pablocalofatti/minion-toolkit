import Anthropic from "@anthropic-ai/sdk";
import { MinionConfig, WorkerResult, WorkerStatus } from "../types.js";

const MS_PER_SECOND = 1000;
import {
  WORKER_TOOL_DEFINITIONS,
  executeWorkerTool,
} from "./worker-tools.js";

export async function runWorkerLoop(
  client: Anthropic,
  config: MinionConfig,
  systemPrompt: string,
  status: WorkerStatus,
  signal: AbortSignal
): Promise<WorkerResult> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content:
        "Begin working on your assigned task. Start by exploring the codebase to understand the context.",
    },
  ];

  const startTime = Date.now();
  const timeout = config.workerTimeoutMs;

  try {
    for (
      let iteration = 1;
      iteration <= config.workerMaxIterations;
      iteration++
    ) {
      if (signal.aborted) {
        return buildResult(status, "cancelled", startTime, iteration, null);
      }

      if (Date.now() - startTime > timeout) {
        return buildResult(
          status,
          "failed",
          startTime,
          iteration,
          `Worker timed out after ${Math.round(timeout / MS_PER_SECOND)}s`
        );
      }

      status.iteration = iteration;

      const response = await client.messages.create({
        model: config.model,
        max_tokens: config.workerMaxTokens,
        system: systemPrompt,
        messages,
        tools: WORKER_TOOL_DEFINITIONS,
      });

      // Collect tool uses from the response
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      // If no tool use, the worker is done
      if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
        const textContent = response.content
          .filter(
            (block): block is Anthropic.TextBlock => block.type === "text"
          )
          .map((block) => block.text)
          .join("\n");

        status.state = "completed";
        status.completedAt = Date.now();

        return buildResult(
          status,
          "completed",
          startTime,
          iteration,
          null,
          textContent
        );
      }

      // Add assistant message
      messages.push({ role: "assistant", content: response.content });

      // Execute all tool calls and collect results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        if (signal.aborted) {
          return buildResult(
            status,
            "cancelled",
            startTime,
            iteration,
            null
          );
        }

        let result: string;
        try {
          result = await executeWorkerTool(
            status.worktreePath,
            toolUse.name,
            toolUse.input as Record<string, string>
          );
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : "Unknown error";
          result = `Error: ${message}`;
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      // Send tool results back
      messages.push({ role: "user", content: toolResults });
    }

    // Hit iteration limit
    return buildResult(
      status,
      "failed",
      startTime,
      config.workerMaxIterations,
      `Hit iteration limit (${config.workerMaxIterations})`
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return buildResult(
      status,
      "failed",
      startTime,
      status.iteration,
      message
    );
  }
}

function buildResult(
  status: WorkerStatus,
  state: "completed" | "failed" | "cancelled",
  startTime: number,
  iterations: number,
  error: string | null,
  _summary?: string
): WorkerResult {
  status.state = state;
  status.completedAt = Date.now();
  if (error) status.error = error;

  return {
    taskNumber: status.taskNumber,
    taskTitle: status.taskTitle,
    state,
    branch: status.branch,
    filesChanged: [],
    duration: Date.now() - startTime,
    iterations,
    error,
  };
}
