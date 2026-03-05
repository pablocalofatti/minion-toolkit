import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { loadConfig } from "./config.js";
import { minionStart } from "./tools/minion-start.js";
import { minionStatus } from "./tools/minion-status.js";
import { minionResults } from "./tools/minion-results.js";
import { minionCreatePRs } from "./tools/minion-create-prs.js";
import { minionCleanup } from "./tools/minion-cleanup.js";

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
