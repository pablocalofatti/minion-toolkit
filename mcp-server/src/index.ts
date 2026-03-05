import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { loadConfig } from "./config.js";
import { minionStart } from "./tools/minion-start.js";
import { minionStatus } from "./tools/minion-status.js";
import { minionResults } from "./tools/minion-results.js";
import { minionCreatePRs } from "./tools/minion-create-prs.js";
import { minionCleanup } from "./tools/minion-cleanup.js";
import { parseTasks } from "./orchestrator/task-parser.js";
import { resolveDAG } from "./orchestrator/resolve-dag.js";
import type { InputTask } from "./orchestrator/resolve-dag.js";
import { estimateCost } from "./orchestrator/estimate-cost.js";
import type { TaskWave } from "./orchestrator/estimate-cost.js";
import { checkScope } from "./orchestrator/check-scope.js";
import type { TaskResult, ScopedTask } from "./orchestrator/check-scope.js";
import { integrationReport } from "./orchestrator/integration-report.js";
import type {
  ReportResult,
  ReportViolation,
} from "./orchestrator/integration-report.js";

const config = loadConfig();

const server = new McpServer({
  name: "minion-toolkit",
  version: "1.0.0",
});

// --- Tool: minion_start ---
server.registerTool(
  "minion_start",
  {
    title: "Start Minion Workers",
    description:
      "Parse a tasks markdown file and spawn parallel AI workers. " +
      "Each worker runs in an isolated git worktree with its own branch. " +
      "Returns a session ID to track progress.",
    inputSchema: z.object({
      tasks_markdown: z
        .string()
        .describe(
          "Markdown with ### Task N: headings describing each task. " +
            "Optionally include **Files:** lines to scope each task."
        ),
      project_root: z
        .string()
        .optional()
        .describe(
          "Absolute path to the project root. Defaults to the server's cwd."
        ),
    }),
  },
  async (args: { tasks_markdown: string; project_root?: string }) => {
    const result = await minionStart(
      { tasks_markdown: args.tasks_markdown, project_root: args.project_root },
      config
    );
    return { content: [{ type: "text" as const, text: result }] };
  }
);

// --- Tool: minion_status ---
server.registerTool(
  "minion_status",
  {
    title: "Check Minion Status",
    description:
      "Check the progress of all workers in a minion session. " +
      "Shows state, iteration count, and errors for each task.",
    inputSchema: z.object({
      session_id: z.string().describe("Session ID from minion_start"),
    }),
  },
  (args: { session_id: string }) => {
    const result = minionStatus({ session_id: args.session_id });
    return { content: [{ type: "text" as const, text: result }] };
  }
);

// --- Tool: minion_results ---
server.registerTool(
  "minion_results",
  {
    title: "Get Minion Results",
    description:
      "Get final results for a completed session: branches, files changed, " +
      "durations, and errors. Only available after all workers finish.",
    inputSchema: z.object({
      session_id: z.string().describe("Session ID from minion_start"),
    }),
  },
  (args: { session_id: string }) => {
    const result = minionResults({ session_id: args.session_id });
    return { content: [{ type: "text" as const, text: result }] };
  }
);

// --- Tool: minion_create_prs ---
server.registerTool(
  "minion_create_prs",
  {
    title: "Create Pull Requests",
    description:
      "Create GitHub pull requests for successful worker branches. " +
      "Requires `gh` CLI to be installed and authenticated.",
    inputSchema: z.object({
      session_id: z.string().describe("Session ID from minion_start"),
      task_numbers: z
        .array(z.number())
        .optional()
        .describe(
          "Specific task numbers to create PRs for. Default: all successful."
        ),
    }),
  },
  async (args: { session_id: string; task_numbers?: number[] }) => {
    const result = await minionCreatePRs({
      session_id: args.session_id,
      task_numbers: args.task_numbers,
    });
    return { content: [{ type: "text" as const, text: result }] };
  }
);

// --- Tool: minion_cleanup ---
server.registerTool(
  "minion_cleanup",
  {
    title: "Cleanup Minion Session",
    description:
      "Remove worktrees, cancel running workers, and delete session state. " +
      "Optionally delete the worker branches too.",
    inputSchema: z.object({
      session_id: z.string().describe("Session ID from minion_start"),
      remove_branches: z
        .boolean()
        .optional()
        .describe("Also delete worker branches. Default: false."),
    }),
  },
  async (args: { session_id: string; remove_branches?: boolean }) => {
    const result = await minionCleanup({
      session_id: args.session_id,
      remove_branches: args.remove_branches,
    });
    return { content: [{ type: "text" as const, text: result }] };
  }
);

// --- Tool: parse_tasks ---
server.registerTool(
  "parse_tasks",
  {
    title: "Parse Task Markdown",
    description:
      "Parse a tasks markdown file into structured task objects with " +
      "dependencies, file scope, and skip markers ([DONE]/[SKIP]).",
    inputSchema: z.object({
      markdown: z
        .string()
        .describe(
          "Markdown with ### Task N: headings. " +
            "Supports **Files:** and **Depends:** lines."
        ),
    }),
  },
  (args: { markdown: string }) => {
    const tasks = parseTasks(args.markdown);
    return { content: [{ type: "text" as const, text: JSON.stringify(tasks) }] };
  }
);

// --- Tool: resolve_dag ---
server.registerTool(
  "resolve_dag",
  {
    title: "Resolve Task DAG",
    description:
      "Compute execution waves from task dependencies using topological sort. " +
      "Returns waves (parallel groups), critical path, and cycle detection.",
    inputSchema: z.object({
      tasks: z.array(
        z.object({
          number: z.number(),
          title: z.string(),
          dependsOn: z.array(z.number()),
          skip: z.boolean(),
        })
      ),
    }),
  },
  (args: { tasks: InputTask[] }) => {
    const result = resolveDAG(args.tasks);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  }
);

// --- Tool: estimate_cost ---
server.registerTool(
  "estimate_cost",
  {
    title: "Estimate Session Cost",
    description:
      "Estimate API token cost for a set of task waves based on model pricing. " +
      "Returns per-task costs, orchestrator cost, and total.",
    inputSchema: z.object({
      waves: z.array(
        z.object({
          tasks: z.array(z.object({ description: z.string() })),
        })
      ),
      orchestrator_model: z
        .string()
        .describe("Model for orchestrator, e.g. claude-sonnet-4-6"),
      worker_model: z
        .string()
        .describe("Model for workers, e.g. claude-sonnet-4-6"),
    }),
  },
  (args: {
    waves: TaskWave[];
    orchestrator_model: string;
    worker_model: string;
  }) => {
    const result = estimateCost(
      args.waves,
      args.orchestrator_model,
      args.worker_model
    );
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  }
);

// --- Tool: check_scope ---
server.registerTool(
  "check_scope",
  {
    title: "Check File Scope",
    description:
      "Compare files changed by workers against declared file scope. " +
      "Returns violations (out-of-scope files) and clean count.",
    inputSchema: z.object({
      results: z.array(
        z.object({
          taskNumber: z.number(),
          taskTitle: z.string(),
          filesChanged: z.array(z.string()),
        })
      ),
      tasks: z.array(
        z.object({
          number: z.number(),
          files: z.array(z.string()),
        })
      ),
    }),
  },
  (args: { results: TaskResult[]; tasks: ScopedTask[] }) => {
    const result = checkScope(args.results, args.tasks);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  }
);

// --- Tool: integration_report ---
server.registerTool(
  "integration_report",
  {
    title: "Generate Integration Report",
    description:
      "Generate a markdown integration report from worker results " +
      "and scope violations. Returns markdown table and stats.",
    inputSchema: z.object({
      results: z.array(
        z.object({
          taskNumber: z.number(),
          taskTitle: z.string(),
          state: z.enum(["completed", "failed", "cancelled"]),
          branch: z.string(),
          filesChanged: z.array(z.string()),
        })
      ),
      violations: z.array(
        z.object({
          taskNumber: z.number(),
          taskTitle: z.string(),
          outOfScopeFiles: z.array(z.string()),
        })
      ),
    }),
  },
  (args: { results: ReportResult[]; violations: ReportViolation[] }) => {
    const result = integrationReport(args.results, args.violations);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  }
);

// --- Start server ---
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `Minion MCP server running (model: ${config.model}, max workers: ${config.maxWorkers})`
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
